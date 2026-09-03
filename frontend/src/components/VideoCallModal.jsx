import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { socket } from '../services/socket';
import { useAuth } from '../context/useAuth';

// STUN discovers public IP; TURN relays media when STUN fails (symmetric NAT, cellular, firewalls)
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

export default function VideoCallModal({
  isOpen,
  roomId,
  roomName,
  isIncomingCall,
  incomingCaller,
  incomingOffer,
  onCloseCall,
  callerSocketId
}) {
  const { user } = useAuth();

  const [callState, setCallState] = useState('idle'); // 'idle' | 'calling' | 'incoming' | 'connected'
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharerName, setScreenSharerName] = useState(null);
  const [peerStatus, setPeerStatus] = useState('Connecting...');
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
    // Audio is routed through the hidden <audio> element during calls
    const target = remoteAudioRef.current || remoteVideoRef.current;
    if (!target || typeof target.setSinkId !== 'function') {
      setPeerStatus('Speaker toggle not supported on this device');
      return;
    }
    try {
      if (isSpeakerOn) {
        await target.setSinkId(''); // '' = default/earpiece routing
        setIsSpeakerOn(false);
      } else {
        // 'speaker' deviceId routes to the loudspeaker on most mobile browsers
        await target.setSinkId('speaker');
        setIsSpeakerOn(true);
      }
    } catch (err) {
      // Fallback: try the default sink and just report the toggle state
      try {
        await target.setSinkId(isSpeakerOn ? '' : 'default');
        setIsSpeakerOn(!isSpeakerOn);
      } catch {
        setPeerStatus('Speaker toggle not supported on this device');
      }
    }
  };

  // Full-screen focused participant ('local' | 'remote' | null)
  const [focusedParticipant, setFocusedParticipant] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const iceCheckingTimerRef = useRef(null);
  // Store target peer socket ID for direct signaling (not room-broadcast)
  const targetSocketIdRef = useRef(null);

  // Dev-only logging — stripped from production builds (import.meta.env.DEV is
  // statically replaced by Vite, so the branch is tree-shaken)
  const log = (tag, ...args) => {
    if (import.meta.env.DEV) console.log(`[Video ${tag}]`, ...args);
  };

  // Create & initialize WebRTC peer connection
  const createPeerConnection = () => {
    const ICE_SERVERS = getIceServers();
    if (import.meta.env.DEV) console.log('ICE_SERVERS =', ICE_SERVERS);
    log('PC', 'Creating RTCPeerConnection with STUN+TURN ICE servers');
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ICE Candidate — route to specific peer socket, not whole room
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

        socket.emit('ice_candidate', { toRoom: roomId, toSocketId: targetSocketIdRef.current, candidate: event.candidate });
      } else {
        log('ICE Candidate Emitted', 'All local candidates gathered (null candidate)');
      }
    };

    // ── 1. connectionState ────────────────────────────────────────────────
    // Reflects overall P2P connection health
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      log('connectionState', '→', s);
      if (s === 'connected') {
        setCallState('connected');
        setPeerStatus('Video Call Active');
      } else if (s === 'failed') {
        log('connectionState', 'FAILED — check TURN server');
        setPeerStatus('Call failed — no relay available');
        handleEndCall();
      } else if (s === 'disconnected') {
        setPeerStatus('Connection interrupted...');
      }
    };

    // ── 2. iceConnectionState ────────────────────────────────────────────
    // Tracks ICE (NAT traversal) connectivity check progress
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      log('iceConnectionState', '→', s);
      
      if (s === 'checking') {
        // Set a timer to fail/restart if stuck in checking
        iceCheckingTimerRef.current = setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            log('iceConnectionState', 'STUCK IN CHECKING for 12s — triggering ICE restart');
            pc.restartIce();
          }
        }, 12000);
      } else {
        clearTimeout(iceCheckingTimerRef.current);
        iceCheckingTimerRef.current = null;
      }

      if (s === 'failed') {
        log('iceConnectionState', 'FAILED — triggering ICE restart');
        pc.restartIce();
      }
    };

    // ── 3. iceGatheringState ─────────────────────────────────────────────
    // Tracks progress of local ICE candidate collection
    // new → gathering → complete
    pc.onicegatheringstatechange = () => {
      const s = pc.iceGatheringState;
      log('iceGatheringState', '→', s);
      if (s === 'complete') {
        log('iceGatheringState', 'Gathering complete. All local ICE candidates sent.');
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
    // EVENT: Remote Track Received + Remote Stream Attached + Video/Audio
    // ─────────────────────────────────────────────────────────────────
    pc.ontrack = (event) => {
      console.group('%c[Video] 📥 Remote Track Received', 'color:#22c55e;font-weight:bold');
      console.log('  track.kind     :', event.track.kind);
      console.log('  track.id       :', event.track.id);
      console.log('  track.enabled  :', event.track.enabled);
      console.log('  track.muted    :', event.track.muted);
      console.log('  stream count   :', event.streams.length);
      console.groupEnd();

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];

        // EVENT: Remote Stream Attached
        console.group('%c[Video] 🔗 Remote Stream Attached', 'color:#22c55e;font-weight:bold');
        console.log('  stream.id      :', remoteStream.id);
        console.log('  video tracks   :', remoteStream.getVideoTracks().length);
        console.log('  audio tracks   :', remoteStream.getAudioTracks().length);
        console.groupEnd();

        // Video → <video> element (picture)
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play()
            .then(() => {
              console.log('%c[Video] 📹 Video Playback Started — remote video is live', 'color:#a855f7;font-weight:bold');
            })
            .catch(e => {
              console.warn('%c[Video] ⚠️ Video Playback Blocked by autoplay policy:', 'color:#ef4444;font-weight:bold', e.message);
            });
        }

        // Audio → dedicated hidden <audio> element (like VoiceCallModal).
        // A <video> element's audio output is unreliable across devices and
        // is often blocked by autoplay policy, so we route remote audio
        // through an <audio> element instead — this is exactly why the
        // voice call plays audio but the video call was silent.
        if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play()
            .then(() => {
              console.log('%c[Video] 🔊 Remote Audio Playback Started', 'color:#a855f7;font-weight:bold');
            })
            .catch((err) => {
              console.warn('%c[Video] ⚠️ Audio Playback Blocked by browser autoplay policy:', 'color:#ef4444;font-weight:bold', err.message);
            });
        }
      }
    };

    peerConnectionRef.current = pc;
    window.pc = pc; // Exposed for debugging
    return pc;
  };

  // Process queued ICE candidates after setRemoteDescription
  const processQueuedIceCandidates = async (pc) => {
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC Video Error] Failed to add queued ICE candidate:', err);
      }
    }
  };

  // Helper to format friendly media error messages
  const formatMediaError = (err) => {
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'HTTPS Required: Browser blocks Camera/Mic on HTTP IP address.';
    }
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Camera/Microphone permission denied in browser/OS settings.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No camera or microphone found on this device.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera or Microphone is currently in use by another app.';
    }
    return err.message || 'Camera/Microphone access denied';
  };

  // Start Video Call (Caller Flow)
  const startCall = async () => {
    try {
      setCallState('calling');
      setPeerStatus('Initiating video call...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(!window.isSecureContext ? 'HTTPS is required to access Camera/Microphone on non-localhost IP.' : 'Camera/Microphone API not supported.');
      }

      log('Call', 'Requesting camera + microphone via getUserMedia...');
      // 🔊 Echo fix: explicit audio constraints so the browser ALWAYS applies
      // acoustic echo cancellation (AEC), noise suppression & auto gain.
      // Without these the mic picks up the speaker → echo + repeated words.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      log('Call', 'Media granted. Tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`));
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => {
        log('addTrack', `Adding local ${track.kind} track: ${track.label}`);
        pc.addTrack(track, stream);
      });

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Offer Created
      // ─────────────────────────────────────────────────────────────────
      const offer = await pc.createOffer();
      console.group('%c[Video] 📤 Offer Created', 'color:#3b82f6;font-weight:bold');
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

      socket.emit('video_call_user', { toRoom: roomId, toSocketId: null, offer, caller: user });
    } catch (err) {
      console.error('[WebRTC Error] Could not access camera/microphone:', err);
      setPeerStatus(formatMediaError(err));
    }
  };

  // Accept Incoming Video Call (Callee Flow)
  const acceptCall = async () => {
    try {
      setCallState('connecting');
      setPeerStatus('Connecting video feed...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(!window.isSecureContext ? 'HTTPS is required to access Camera/Microphone on non-localhost IP.' : 'Camera/Microphone API not supported.');
      }

      log('Accept', 'Accepting video call from socket:', targetSocketIdRef.current);
      // 🔊 Echo fix: same explicit AEC/NS/AGC constraints as the caller
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      log('Accept', 'Media granted. Tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`));
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => {
        log('addTrack', `Adding local ${track.kind} track: ${track.label}`);
        pc.addTrack(track, stream);
      });

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Offer Received
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Video] 📥 Offer Received', 'color:#6366f1;font-weight:bold');
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
      console.group('%c[Video] 📤 Answer Created', 'color:#3b82f6;font-weight:bold');
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

      socket.emit('video_call_answer', { toRoom: roomId, toSocketId: targetSocketIdRef.current, answer });

      setCallState('connected');
      setPeerStatus('Video Call Active');
    } catch (err) {
      console.error('[WebRTC Error] Could not accept video call:', err);
      setPeerStatus(formatMediaError(err));
    }
  };

  // Toggle Camera On/Off
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newCameraState = !videoTrack.enabled;
        setIsCameraOff(newCameraState);
        socket.emit('toggle_camera', { toRoom: roomId, cameraOff: newCameraState, username: user?.username });
      }
    }
  };

  // Toggle Microphone Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Screen Sharing using Screen Capture API (getDisplayMedia)
  const toggleScreenShare = async () => {
    if (!peerConnectionRef.current) return;

    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in peer connection
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        setIsScreenSharing(true);
        setScreenSharerName(user?.username);
        socket.emit('screen_share_start', { toRoom: roomId, username: user?.username });

        // Handle user stopping screen share from browser native bar
        screenTrack.onended = () => {
          stopScreenShare();
        };
      } catch (err) {
        console.error('[Screen Capture Error] Could not start screen sharing:', err);
      }
    } else {
      await stopScreenShare();
    }
  };

  // Stop Screen Share & Restore Camera Stream
  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current && peerConnectionRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      const senders = peerConnectionRef.current.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender && cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    setIsScreenSharing(false);
    setScreenSharerName(null);
    socket.emit('screen_share_stop', { toRoom: roomId, username: user?.username });
  };

  // End Video Call & Clean Up
  const handleEndCall = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
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
    socket.emit('end_video_call', { toRoom: roomId });
    setCallState('idle');
    setIsCameraOff(false);
    setIsMuted(false);
    setIsScreenSharing(false);
    setFocusedParticipant(null);
    onCloseCall();
  };

  useEffect(() => {
    if (!isOpen) return;

    if (isIncomingCall) {
      setCallState('incoming');
      setPeerStatus(`Incoming video call from ${incomingCaller?.username || 'Room Member'}`);
      // KEY FIX: Set target socket ID immediately from prop so signaling works even if
      // the incoming event fired before modal mounted
      if (callerSocketId) {
        targetSocketIdRef.current = callerSocketId;
      }
    } else {
      startCall();
    }

    // Signaling socket event listeners
    const handleVideoCallIncoming = ({ caller, fromSocket }) => {
      log('Incoming', 'Video call from socket:', fromSocket, 'user:', caller?.username);
      targetSocketIdRef.current = fromSocket;
    };

    const handleVideoCallAnswered = async ({ answer, fromSocket }) => {
      const pc = peerConnectionRef.current;
      if (fromSocket) {
        targetSocketIdRef.current = fromSocket;
      }

      // ─────────────────────────────────────────────────────────────────
      // EVENT: Answer Received
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Video] 📥 Answer Received', 'color:#6366f1;font-weight:bold');
      console.log('  answer.type    :', answer?.type);
      console.log('  signalingState :', pc?.signalingState);
      console.log('  sdp (excerpt)  :', answer?.sdp?.substring(0, 120) + '...');
      console.groupEnd();

      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log('Answer Received', 'Remote description set. signalingState:', pc.signalingState);
        await processQueuedIceCandidates(pc);
        setCallState('connected');
        setPeerStatus('Video Call Active');
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      const pc = peerConnectionRef.current;

      // ─────────────────────────────────────────────────────────────────
      // EVENT: ICE Candidate Received
      // ─────────────────────────────────────────────────────────────────
      console.group('%c[Video] 📥 ICE Candidate Received', 'color:#f59e0b;font-weight:bold');
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
          log('ICE Candidate Received', 'Failed:', err.message);
        }
      } else {
        log('ICE Candidate Received', 'Queuing — remote desc not set yet');
        iceCandidateQueueRef.current.push(candidate);
      }
    };

    const handleScreenShareStarted = ({ username }) => {
      setScreenSharerName(username);
    };

    const handleScreenShareStopped = () => {
      setScreenSharerName(null);
    };

    const handleVideoCallEnded = () => {
      handleEndCall();
    };

    socket.on('video_call_incoming', handleVideoCallIncoming);
    socket.on('video_call_answered', handleVideoCallAnswered);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('screen_share_started', handleScreenShareStarted);
    socket.on('screen_share_stopped', handleScreenShareStopped);
    socket.on('video_call_ended', handleVideoCallEnded);

    return () => {
      clearTimeout(iceCheckingTimerRef.current);
      handleEndCall();
      socket.off('video_call_incoming', handleVideoCallIncoming);
      socket.off('video_call_answered', handleVideoCallAnswered);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('screen_share_started', handleScreenShareStarted);
      socket.off('screen_share_stopped', handleScreenShareStopped);
      socket.off('video_call_ended', handleVideoCallEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 17, 23, 0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div className="modal-box video-call-modal-card" style={{ background: '#1D2129', border: '1px solid #313743', borderRadius: 16, width: '100%', maxWidth: focusedParticipant ? 960 : 720, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', transition: 'all 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #313743', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161921', flexWrap: 'wrap', gap: 8, minWidth: 0, minHeight: 52 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📹 #{roomName} Video Room</h3>
            <span style={{ fontSize: 11, color: '#22C55E', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{peerStatus}</span>
              {callState === 'connected' && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  ⏱ {formatDuration(callSeconds)}
                </span>
              )}
            </span>
          </div>
          {screenSharerName && (
            <div style={{ padding: '4px 10px', background: 'rgba(124, 58, 237, 0.2)', border: '1px solid #7C3AED', borderRadius: 6, fontSize: 11, color: '#8B5CF6', flexShrink: 0 }}>
              🖥️ {screenSharerName}
            </div>
          )}
          <button
            onClick={onCloseCall}
            aria-label="Close"
            title="Close Call Window"
            type="button"
            style={{
              width: 38,
              height: 38,
              minWidth: 38,
              minHeight: 38,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Video Grid Layout */}
        <div className={`video-call-grid ${focusedParticipant ? 'focused' : 'split'}`} style={{ gap: 12, padding: 16, background: '#0F1117', minHeight: 320 }}>
          {/* Local Video Stream Card */}
          {(!focusedParticipant || focusedParticipant === 'local') && (
            <div
              onClick={() => setFocusedParticipant((prev) => (prev === 'local' ? null : 'local'))}
              title="Click to toggle full-screen focus"
              style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#1D2129', aspectRatio: '16/9', cursor: 'pointer', border: '1px solid #313743' }}
            >
              {isCameraOff && !isScreenSharing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', gap: 8 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600 }}>
                    {user?.username?.substring(0, 2).toUpperCase() || 'YO'}
                  </div>
                  <span style={{ fontSize: 12 }}>Camera Off</span>
                </div>
              ) : (
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 11, color: '#fff' }}>
                {isScreenSharing ? 'Your Screen Share' : `You (${user?.username})`} {isMuted && '🔇'}
              </div>
            </div>
          )}

          {/* Remote Video Stream Card */}
          {(!focusedParticipant || focusedParticipant === 'remote') && (
            <div
              onClick={() => setFocusedParticipant((prev) => (prev === 'remote' ? null : 'remote'))}
              title="Click to toggle full-screen focus"
              style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#1D2129', aspectRatio: '16/9', cursor: 'pointer', border: '1px solid #313743' }}
            >
              {/* muted: audio is routed through the hidden <audio> element
                  below (more reliable than <video> element audio output) */}
              <video ref={remoteVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 11, color: '#fff' }}>
                {incomingCaller?.username || 'Peer Participant'}
              </div>
            </div>
          )}
        </div>

        {/* Hidden audio element — routes remote call audio (reliable playback) */}
        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

        {/* Call Controls Toolbar */}
        <div className="video-call-toolbar" style={{ padding: 16, borderTop: '1px solid #313743', display: 'flex', justifyContent: 'center', gap: 10, background: '#161921' }}>
          {callState === 'incoming' ? (
            <>
              <button className="btn-call-control" onClick={acceptCall} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#22C55E', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                📹 Accept Video Call
              </button>
              <button className="btn-call-control" onClick={handleEndCall} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                🔴 Decline
              </button>
            </>
          ) : (
            <>
              <button className="btn-call-control" onClick={toggleCamera} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #313743', background: isCameraOff ? 'rgba(239, 68, 68, 0.2)' : '#242930', color: isCameraOff ? '#EF4444' : '#fff', fontSize: 12, cursor: 'pointer' }}>
                {isCameraOff ? '📷 Camera Off' : '📷 Camera On'}
              </button>

              <button className="btn-call-control" onClick={toggleMute} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #313743', background: isMuted ? 'rgba(239, 68, 68, 0.2)' : '#242930', color: isMuted ? '#EF4444' : '#fff', fontSize: 12, cursor: 'pointer' }}>
                {isMuted ? '🎙️ Unmute' : '🎤 Mute'}
              </button>

              <button className="btn-call-control" onClick={toggleScreenShare} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #7C3AED', background: isScreenSharing ? '#7C3AED' : 'rgba(124, 58, 237, 0.2)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                {isScreenSharing ? '🖥️ Stop Share' : '🖥️ Share Screen'}
              </button>

              <button
                className="btn-call-control"
                onClick={toggleSpeaker}
                title="Toggle speaker / earpiece"
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #313743', background: isSpeakerOn ? 'rgba(34, 197, 94, 0.2)' : '#242930', color: isSpeakerOn ? '#22C55E' : '#fff', fontSize: 12, cursor: 'pointer' }}
              >
                {isSpeakerOn ? '🔊 Speaker' : '🎧 Earpiece'}
              </button>

              <button className="btn-call-control" onClick={handleEndCall} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🔴 End Call
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

VideoCallModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  roomId: PropTypes.string.isRequired,
  roomName: PropTypes.string.isRequired,
  isIncomingCall: PropTypes.bool,
  incomingCaller: PropTypes.object,
  incomingOffer: PropTypes.object,
  onCloseCall: PropTypes.func.isRequired
};
