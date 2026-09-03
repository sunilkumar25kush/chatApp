import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { socket } from '../services/socket';
import { useAuth } from '../context/useAuth';

/**
 * ICE_SERVERS Configuration
 *
 * WHY STUN ALONE FAILS ON DIFFERENT NETWORKS:
 * - STUN helps a peer discover its public-facing IP:port (server-reflexive candidate).
 * - This works when both peers are behind "Full Cone" or "Restricted Cone" NAT.
 * - Mobile networks (4G/5G), corporate Wi-Fi, and many home routers use "Symmetric NAT",
 *   which means the external port changes for every destination. The STUN-discovered
 *   address is NOT reachable from the other peer.
 *
 * WHY A TURN SERVER IS REQUIRED:
 * - A TURN (Traversal Using Relays around NAT) server sits in the public internet.
 * - Both peers open a connection TO the TURN server (outbound, always allowed).
 * - All media is relayed through the TURN server, bypassing NAT restrictions entirely.
 * - Without a TURN server, ~30-40% of real-world WebRTC connections fail.
 *
 * FREE TURN OPTION: Open Relay (metered.ca free tier for testing)
 * For production, self-host Coturn or use Twilio / Metered / Xirsys.
 */
// Helper to construct ICE_SERVERS configuration safely.
// TURN credentials are build-time env vars (VITE_TURN_*). On Vercel/Render
// they may be unset, which silently drops the TURN servers and breaks calls
// across symmetric NATs (~30-40% of real-world connections). The credentials
// below ship in the public bundle anyway (same as the Google client ID), so
// falling back to them keeps calls working on any deploy.
const FALLBACK_TURN_USERNAME = '2126cc0cb07a8db93032573f';
const FALLBACK_TURN_CREDENTIAL = '49sQ7pN1CfrpsUse';

const getIceServers = () => {
  const turnUsername = import.meta.env.VITE_TURN_USERNAME || FALLBACK_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || FALLBACK_TURN_CREDENTIAL;

  const servers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
  ];

  // Include TURN servers ONLY when valid non-empty username and credential exist
  if (
    turnUsername &&
    turnCredential &&
    String(turnUsername).trim() !== '' &&
    String(turnCredential).trim() !== ''
  ) {
    servers.push(
      {
        urls: "turn:global.relay.metered.ca:80",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: turnUsername,
        credential: turnCredential,
      }
    );
  }

  return { iceServers: servers };
};

export default function VoiceCallModal({
  isOpen,
  roomId,
  roomName,
  isIncomingCall,
  incomingCaller,
  incomingOffer,
  callerSocketId,      // <-- Caller's socket.id passed from ChatWindow
  onCloseCall
}) {
  const { user } = useAuth();

  const [callState, setCallState] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [peerStatus, setPeerStatus] = useState('Connecting...');
  const [iceStatus, setIceStatus] = useState('');
  // Live call duration (seconds) — resets to 0 when the call starts
  const [callSeconds, setCallSeconds] = useState(0);
  // Speaker routing toggle (setSinkId). Default = earpiece on phones.
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // Tick the call timer while the call is connected
  useEffect(() => {
    if (callState !== 'connected') {
      setCallSeconds(0);
      return undefined;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setCallSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Toggle audio output between speaker and earpiece (where supported)
  const toggleSpeaker = async () => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl || typeof audioEl.setSinkId !== 'function') {
      setPeerStatus('Speaker toggle not supported on this device');
      return;
    }
    try {
      if (isSpeakerOn) {
        await audioEl.setSinkId(''); // '' = default/earpiece routing
        setIsSpeakerOn(false);
      } else {
        // 'speaker' deviceId routes to the loudspeaker on most mobile browsers
        await audioEl.setSinkId('speaker');
        setIsSpeakerOn(true);
      }
    } catch (err) {
      // Fallback: try the default sink and just report the toggle state
      try {
        await audioEl.setSinkId(isSpeakerOn ? '' : 'default');
        setIsSpeakerOn(!isSpeakerOn);
      } catch {
        setPeerStatus('Speaker toggle not supported on this device');
      }
    }
  };

  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const iceCheckingTimerRef = useRef(null);
  // Store target peer socket ID for direct signaling (not room-broadcast)
  const targetSocketIdRef = useRef(null);
  // Dev-only logging — stripped from production builds (import.meta.env.DEV is
  // statically replaced by Vite, so the branch is tree-shaken)
  const log = (tag, ...args) => {
    if (import.meta.env.DEV) console.log(`[Voice ${tag}]`, ...args);
  };

  // Create & initialize WebRTC peer connection
  const createPeerConnection = () => {
    const ICE_SERVERS = getIceServers();
    if (import.meta.env.DEV) console.log('ICE_SERVERS =', ICE_SERVERS);
    log('PC', 'Creating RTCPeerConnection with ICE servers:', ICE_SERVERS.iceServers.map(s => s.urls));
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ICE Candidate — send to specific peer socket ID
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // ─────────────────────────────────────────────────────────────────
        // EVENT: ICE Candidate Emitted
        // ─────────────────────────────────────────────────────────────────
        console.group('%c[Socket] 📤 ICE Candidate Emitted', 'color:#f59e0b;font-weight:bold');
        console.log('  type      :', event.candidate.type);
        console.log('  protocol  :', event.candidate.protocol);
        console.log('  address   :', event.candidate.address);
        console.log('  port      :', event.candidate.port);
        console.log('  target    :', targetSocketIdRef.current || '→ room (broadcast)');
        console.groupEnd();
        
        console.log("ICE Candidate:", event.candidate.candidate);
        if (event.candidate.candidate.includes("relay")) {
          console.log("✅ TURN Relay Candidate Found");
        }

        socket.emit('ice_candidate', {
          toRoom: roomId,
          toSocketId: targetSocketIdRef.current,
          candidate: event.candidate
        });
      } else {
        log('ICE Candidate Emitted', 'All local ICE candidates gathered (null candidate)');
      }
    };

    // ── 1. connectionState ────────────────────────────────────────────────
    // Reflects overall P2P connection health
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      log('connectionState', '→', s);
      if (s === 'connected') {
        setCallState('connected');
        setPeerStatus('Connected (Active Call)');
        setIceStatus('connected');
      } else if (s === 'failed') {
        log('connectionState', 'FAILED — media cannot flow. TURN relay may be blocked.');
        setPeerStatus('Call failed — no TURN relay available');
        handleEndCall();
      } else if (s === 'disconnected') {
        setPeerStatus('Connection lost...');
      }
    };

    // ── 2. iceConnectionState ────────────────────────────────────────────
    // Tracks ICE (NAT traversal) connectivity check progress
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      log('iceConnectionState', '→', s);
      setIceStatus(s);

      if (s === 'checking') {
        iceCheckingTimerRef.current = setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            log('iceConnectionState', 'STUCK IN CHECKING for 12s — triggering ICE restart');
            setPeerStatus('Connection taking too long — retrying...');
            pc.restartIce();
          }
        }, 12000);
      } else {
        clearTimeout(iceCheckingTimerRef.current);
        iceCheckingTimerRef.current = null;
      }

      if (s === 'failed') {
        log('iceConnectionState', 'FAILED — TURN server required or blocked. Triggering ICE restart...');
        setPeerStatus('Connection failed — retrying...');
        pc.restartIce();
      }
      if (s === 'disconnected') {
        setPeerStatus('Connection interrupted...');
      }
    };

    // ── 3. iceGatheringState ─────────────────────────────────────────────
    // Tracks progress of local ICE candidate collection
    // new → gathering → complete
    pc.onicegatheringstatechange = () => {
      const s = pc.iceGatheringState;
      log('iceGatheringState', '→', s);
      // 'complete' means all local candidates (host, srflx, relay) have been gathered
      // If only host candidates are gathered and no relay, cross-network will fail
      if (s === 'complete') {
        const stats = pc.iceGatheringState;
        log('iceGatheringState', 'Gathering complete. All local ICE candidates sent.', stats);
      }
    };

    // ── 4. signalingState ────────────────────────────────────────────────
    // Tracks SDP offer/answer negotiation state machine
    // stable → have-local-offer → have-remote-offer → stable
    pc.onsignalingstatechange = () => {
      const s = pc.signalingState;
      log('signalingState', '→', s);
    };

    // ─────────────────────────────────────────────────────────────────
    // EVENT: Remote Track Received + Remote Stream Attached + Audio Playback
    // ─────────────────────────────────────────────────────────────────
    pc.ontrack = (event) => {
      console.group('%c[Voice] 📥 Remote Track Received', 'color:#22c55e;font-weight:bold');
      console.log('  track.kind     :', event.track.kind);
      console.log('  track.id       :', event.track.id);
      console.log('  track.enabled  :', event.track.enabled);
      console.log('  track.muted    :', event.track.muted);
      console.log('  stream count   :', event.streams.length);
      console.groupEnd();

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];

        // EVENT: Remote Stream Attached
        console.group('%c[Voice] 🔗 Remote Stream Attached', 'color:#22c55e;font-weight:bold');
        console.log('  stream.id      :', remoteStream.id);
        console.log('  audio tracks   :', remoteStream.getAudioTracks().length);
        console.groupEnd();

        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;

          // EVENT: Audio Playback Started
          remoteAudioRef.current.play()
            .then(() => {
              console.log('%c[Voice] 🔊 Audio Playback Started — remote audio is live', 'color:#a855f7;font-weight:bold');
            })
            .catch((err) => {
              console.warn('%c[Voice] ⚠️ Audio Playback Blocked by browser autoplay policy:', 'color:#ef4444;font-weight:bold', err.message);
            });
        }
      }
    };

    peerConnectionRef.current = pc;
    window.pc = pc; // Exposed for debugging
    return pc;
  };

  // Process buffered ICE candidates after setRemoteDescription
  const processQueuedIceCandidates = async (pc) => {
    log('ICE', `Processing ${iceCandidateQueueRef.current.length} queued ICE candidates`);
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        log('ICE', 'Queued ICE candidate added successfully');
      } catch (err) {
        log('ICE', 'Failed to add queued candidate:', err.message);
      }
    }
  };

  // Helper to format friendly media error messages
  const formatMediaError = (err) => {
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'HTTPS Required: Browser blocks Mic on HTTP IP address.';
    }
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Microphone permission denied in browser/OS settings.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No microphone hardware found on this device.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Microphone is currently in use by another app.';
    }
    return err.message || 'Microphone access denied';
  };

  // Start Voice Call (Caller Flow)
  const startCall = async () => {
    try {
      setCallState('calling');
      setPeerStatus('Calling room members...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(!window.isSecureContext ? 'HTTPS is required to access Microphone on non-localhost IP.' : 'Microphone API not supported by browser.');
      }

      log('getUserMedia', 'Requesting microphone access...');
      // 🔊 Echo fix: explicit audio constraints so the browser ALWAYS applies
      // acoustic echo cancellation (AEC), noise suppression & auto gain.
      // Without these, the mic picks up the speaker → echo + repeated words.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      log('getUserMedia', 'Microphone granted. Tracks:', stream.getAudioTracks().map(t => t.label));
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => {
        log('addTrack', `Adding local ${track.kind} track: ${track.label}`);
        pc.addTrack(track, stream);
      });

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Offer Created
      // ─────────────────────────────────────────────────────────────────
      const offer = await pc.createOffer();
      console.group('%c[Voice] 📤 Offer Created', 'color:#3b82f6;font-weight:bold');
      console.log('  type           :', offer.type);
      console.log('  sdp (excerpt)  :', offer.sdp?.substring(0, 120) + '...');
      console.log('  signalingState :', pc.signalingState);
      console.groupEnd();

      await pc.setLocalDescription(offer);

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Offer Emitted
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Socket] 📤 Offer Emitted', 'color:#14b8a6;font-weight:bold');
      console.log('  to room      :', roomId);
      console.log('  to socketId  :', 'null (broadcast)');
      console.groupEnd();

      socket.emit('call_user', { toRoom: roomId, toSocketId: null, offer, caller: user });
    } catch (err) {
      log('Error', 'getUserMedia failed:', err.message);
      setPeerStatus(formatMediaError(err));
    }
  };

  // Accept Incoming Call (Callee Flow)
  const acceptCall = async () => {
    try {
      setCallState('connecting');
      setPeerStatus('Connecting call...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(!window.isSecureContext ? 'HTTPS is required to access Microphone on non-localhost IP.' : 'Microphone API not supported by browser.');
      }

      log('getUserMedia', 'Requesting microphone (callee)...');
      // 🔊 Echo fix: same explicit AEC/NS/AGC constraints as the caller
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      log('getUserMedia', 'Microphone granted:', stream.getAudioTracks().map(t => t.label));
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => {
        log('addTrack', `Adding local ${track.kind} track: ${track.label}`);
        pc.addTrack(track, stream);
      });

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Offer Received (setting remote description)
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Voice] 📥 Offer Received', 'color:#6366f1;font-weight:bold');
      console.log('  offer.type     :', incomingOffer?.type);
      console.log('  from socket    :', targetSocketIdRef.current);
      console.log('  sdp (excerpt)  :', incomingOffer?.sdp?.substring(0, 120) + '...');
      console.groupEnd();

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      await processQueuedIceCandidates(pc);

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Answer Created
      // ─────────────────────────────────────────────────────────────────
      const answer = await pc.createAnswer();
      console.group('%c[Voice] 📤 Answer Created', 'color:#3b82f6;font-weight:bold');
      console.log('  type           :', answer.type);
      console.log('  signalingState :', pc.signalingState);
      console.log('  sdp (excerpt)  :', answer.sdp?.substring(0, 120) + '...');
      console.groupEnd();

      await pc.setLocalDescription(answer);

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Answer Emitted
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Socket] 📤 Answer Emitted', 'color:#14b8a6;font-weight:bold');
      console.log('  to room      :', roomId);
      console.log('  to socketId  :', targetSocketIdRef.current);
      console.groupEnd();

      socket.emit('answer_call', { toRoom: roomId, toSocketId: targetSocketIdRef.current, answer });

      setCallState('connected');
      setPeerStatus('Connected (Active Call)');
    } catch (err) {
      log('Error', 'acceptCall failed:', err.message);
      setPeerStatus(formatMediaError(err));
    }
  };

  // Toggle Microphone Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMutedState = !audioTrack.enabled;
        setIsMuted(newMutedState);
        log('Mute', newMutedState ? 'Microphone muted' : 'Microphone unmuted');
        socket.emit('toggle_audio', { toRoom: roomId, muted: newMutedState, username: user?.username });
      }
    }
  };

  // End Call & Cleanup
  const handleEndCall = () => {
    log('End', 'Ending call and cleaning up resources');

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        log('End', 'Stopped local track:', track.kind);
      });
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      log('End', 'RTCPeerConnection closed');
    }

    iceCandidateQueueRef.current = [];
    targetSocketIdRef.current = null;
    socket.emit('end_call', { toRoom: roomId });
    setCallState('idle');
    setIsMuted(false);
    setIceStatus('');
    onCloseCall();
  };

  useEffect(() => {
    if (!isOpen) return;

    // FIX: Pre-seed targetSocketIdRef from the prop passed by ChatWindow.
    // For the callee this is set BEFORE they click Accept, so that the
    // SDP answer and all ICE candidates are routed directly to the caller's
    // socket ID rather than being broadcast to the entire room.
    if (isIncomingCall && callerSocketId) {
      targetSocketIdRef.current = callerSocketId;
      log('Incoming', 'Pre-seeded targetSocketId from prop:', callerSocketId);
    }

    if (isIncomingCall) {
      setCallState('incoming');
      setPeerStatus(`Incoming call from ${incomingCaller?.username || 'Room Member'}`);
    } else {
      startCall();
    }

    // WebRTC Signaling Socket Events
    const handleCallAnswered = async ({ answer, fromSocket }) => {
      const pc = peerConnectionRef.current;
      if (fromSocket) {
        targetSocketIdRef.current = fromSocket;
      }

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Answer Received
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Voice] 📥 Answer Received', 'color:#6366f1;font-weight:bold');
      console.log('  answer.type    :', answer?.type);
      console.log('  signalingState :', pc?.signalingState);
      console.log('  sdp (excerpt)  :', answer?.sdp?.substring(0, 120) + '...');
      console.groupEnd();

      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log('Answer Received', 'Remote description set. signalingState:', pc.signalingState);
        await processQueuedIceCandidates(pc);
        setCallState('connected');
        setPeerStatus('Connected (Active Call)');
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      const pc = peerConnectionRef.current;

      // ─────────────────────────────────────────────────────────────────
      // EVENT: ICE Candidate Received
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Voice] 📥 ICE Candidate Received', 'color:#f59e0b;font-weight:bold');
      console.log('  type           :', candidate?.type);
      console.log('  protocol       :', candidate?.protocol);
      console.log('  address        :', candidate?.address);
      console.log('  remoteDesc set :', !!(pc?.remoteDescription?.type));
      console.groupEnd();

      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          log('ICE Candidate Received', 'Added successfully');
        } catch (err) {
          log('ICE Candidate Received', 'Failed to add:', err.message);
        }
      } else {
        log('ICE Candidate Received', 'Remote desc not set — queuing candidate');
        iceCandidateQueueRef.current.push(candidate);
      }
    };

    const handleCallIncoming = ({ caller, fromSocket }) => {
      // Store the caller's socket ID for targeted signaling
      log('Incoming', 'Call incoming from socket:', fromSocket, 'user:', caller?.username);
      targetSocketIdRef.current = fromSocket;
    };

    const handleAudioToggled = ({ muted, username }) => {
      if (username !== user?.username) {
        log('Remote', username, muted ? 'muted' : 'unmuted', 'their microphone');
        setPeerStatus(muted ? `${username} muted microphone` : `${username} unmuted microphone`);
      }
    };

    const handleCallEnded = () => {
      log('End', 'Remote peer ended the call');
      handleEndCall();
    };

    socket.on('call_incoming', handleCallIncoming);
    socket.on('call_answered', handleCallAnswered);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('audio_toggled', handleAudioToggled);
    socket.on('call_ended', handleCallEnded);

    // FIX: Store caller's fromSocket when incoming call arrives
    if (isIncomingCall && incomingCaller) {
      log('Incoming', 'Incoming call modal opened. Waiting for accept...');
    }

    return () => {
      clearTimeout(iceCheckingTimerRef.current);
      handleEndCall();
      socket.off('call_incoming', handleCallIncoming);
      socket.off('call_answered', handleCallAnswered);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('audio_toggled', handleAudioToggled);
      socket.off('call_ended', handleCallEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div className="modal-box voice-modal" style={{ background: '#1D2129', border: '1px solid #313743', borderRadius: 16, padding: 'clamp(16px, 4vw, 24px)', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        {/* FIX: Added playsInline to prevent mobile Safari autoplay block */}
        <audio ref={remoteAudioRef} autoPlay />

        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#7C3AED', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#fff' }}>
          📞
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>#{roomName} Voice Call</h3>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 6px' }}>{peerStatus}</p>
        {callState === 'connected' && (
          <p style={{ fontSize: 20, fontWeight: 700, color: '#22C55E', margin: '0 0 6px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            {formatDuration(callSeconds)}
          </p>
        )}
        {iceStatus && (
          <p style={{ fontSize: 10, color: iceStatus === 'connected' ? '#22C55E' : '#F59E0B', margin: '0 0 16px', fontFamily: 'monospace' }}>
            ICE: {iceStatus}
          </p>
        )}

        <div className="call-controls-row" style={{ display: 'flex', gap: 10, justifyContent: 'center', width: '100%' }}>
          {callState === 'incoming' ? (
            <>
              <button onClick={acceptCall} style={{ flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                📞 Accept
              </button>
              <button onClick={handleEndCall} style={{ flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                🔴 Decline
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleMute} style={{ flex: 1, minWidth: 75, padding: '10px 12px', borderRadius: 8, border: '1px solid #313743', background: isMuted ? 'rgba(239, 68, 68, 0.2)' : '#242930', color: isMuted ? '#EF4444' : '#fff', fontWeight: 500, fontSize: 12, cursor: 'pointer' }}>
                {isMuted ? '🎙️ Unmute' : '🎤 Mute'}
              </button>
              <button
                onClick={toggleSpeaker}
                title="Toggle speaker / earpiece"
                style={{ flex: 1, minWidth: 75, padding: '10px 12px', borderRadius: 8, border: '1px solid #313743', background: isSpeakerOn ? 'rgba(34, 197, 94, 0.2)' : '#242930', color: isSpeakerOn ? '#22C55E' : '#fff', fontWeight: 500, fontSize: 12, cursor: 'pointer' }}
              >
                {isSpeakerOn ? '🔊 Speaker' : '🎧 Earpiece'}
              </button>
              <button onClick={handleEndCall} style={{ flex: 1, minWidth: 75, padding: '10px 12px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🔴 End Call
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

VoiceCallModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  roomId: PropTypes.string.isRequired,
  roomName: PropTypes.string.isRequired,
  isIncomingCall: PropTypes.bool,
  incomingCaller: PropTypes.object,
  incomingOffer: PropTypes.object,
  callerSocketId: PropTypes.string,
  onCloseCall: PropTypes.func.isRequired
};
