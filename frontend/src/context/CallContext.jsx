import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { socket } from '../services/socket';
import { useAuth } from './useAuth';
import api from '../services/api';
import livekitMediaService from '../services/livekitMediaService';
import { Track } from 'livekit-client';

const CallContext = createContext(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

// ── Web Audio Tone Generator (Zero-latency sound synthesis) ────────────────
const playSoundEffect = (type) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'ringback') {
      // Gentle outgoing double-beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      gain1.gain.setValueAtTime(0.04, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);

      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.frequency.setValueAtTime(480, ctx.currentTime);
          gain2.gain.setValueAtTime(0.04, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.3);
        } catch {
          /* noop */
        }
      }, 150);
    } else if (type === 'incoming') {
      // Pleasant marimba chime
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.06, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
      });
    } else if (type === 'end') {
      // Gentle descending two-tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    /* AudioContext not allowed before user gesture or unavailable */
  }
};

export function CallProvider({ children }) {
  const { user } = useAuth();

  // Call States: 'idle' | 'calling' | 'incoming' | 'connected' | 'reconnecting' | 'ended'
  const [callState, setCallState] = useState('idle');
  const [outgoingState, setOutgoingState] = useState('idle'); // 'calling' | 'ringing' | 'accepted' | 'declined' | 'busy' | 'unavailable'
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionQuality, setConnectionQuality] = useState('good'); // 'excellent' | 'good' | 'poor' | 'lost'
  const [currentCall, setCurrentCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callEndReason, setCallEndReason] = useState(null);

  // In-Call Notifications (integrated with existing NotificationToast)
  const [callNotifications, setCallNotifications] = useState([]);

  // Local media controls & camera switching
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeScreenShare, setActiveScreenShare] = useState(null);
  const [isScreenShareSupported, setIsScreenShareSupported] = useState(false);
  const [permissionWarning, setPermissionWarning] = useState(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState('user');

  // Participants & active speaker
  const [localTracks, setLocalTracks] = useState({ audioTrack: null, videoTrack: null });
  const [remoteParticipants, setRemoteParticipants] = useState(new Map());
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  // UI modal view state
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);

  // Timers
  const outgoingRingTimerRef = useRef(null);
  const ringbackIntervalRef = useRef(null);
  const incomingIntervalRef = useRef(null);

  // Refs for stable access in callbacks
  const currentCallRef = useRef(currentCall);
  currentCallRef.current = currentCall;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isCameraOffRef = useRef(isCameraOff);
  isCameraOffRef.current = isCameraOff;
  const peerConnectionsRef = useRef(new Map());

  // ── Add Toast Notification ──────────────────────────────────────────────
  const addCallNotification = useCallback((title, message, type = 'default') => {
    const id = 'call_toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    setCallNotifications((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setCallNotifications((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissCallNotification = useCallback((id) => {
    setCallNotifications((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Detect Device Capabilities ──────────────────────────────────────────
  useEffect(() => {
    setIsScreenShareSupported(livekitMediaService.constructor.isScreenShareSupported());
  }, []);

  const refreshCameraDevices = useCallback(async () => {
    try {
      const cameras = await livekitMediaService.getAvailableCameras();
      const isMobileDevice =
        typeof window !== 'undefined' &&
        (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768);
      setHasMultipleCameras(cameras.length > 1 || isMobileDevice);
    } catch {
      setHasMultipleCameras(false);
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
  }, [refreshCameraDevices]);

  // ── Call Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState !== 'connected') {
      setCallDurationSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setCallDurationSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [callState]);

  // ── Helper: Format Duration ─────────────────────────────────────────────
  const formatDuration = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Stop Ringback & Incoming Audio Loops ─────────────────────────────────
  const stopAudioIntervals = useCallback(() => {
    if (ringbackIntervalRef.current) {
      clearInterval(ringbackIntervalRef.current);
      ringbackIntervalRef.current = null;
    }
    if (incomingIntervalRef.current) {
      clearInterval(incomingIntervalRef.current);
      incomingIntervalRef.current = null;
    }
    if (outgoingRingTimerRef.current) {
      clearTimeout(outgoingRingTimerRef.current);
      outgoingRingTimerRef.current = null;
    }
  }, []);

  // ── Remote Participants Helper ──────────────────────────────────────────
  const updateRemoteParticipant = useCallback((participant, track = null, isRemoved = false) => {
    const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
    const identity = participant.identity || participant.sid;

    // Never add local user to remote participants list
    if (myId && identity && String(identity) === String(myId)) {
      return;
    }

    setRemoteParticipants((prev) => {
      const next = new Map(prev);

      if (isRemoved) {
        const id1 = String(participant.identity || '');
        const id2 = String(participant.sid || '');
        const id3 = String(participant.user?._id || participant.user?.id || participant.userId || '');
        for (const [key, val] of prev.entries()) {
          const strKey = String(key);
          const valIdentity = String(val?.identity || '');
          const valSid = String(val?.sid || '');
          const valUser = String(val?.user?._id || val?.user?.id || val?.user || '');
          if (
            (id1 && (strKey === id1 || valIdentity === id1)) ||
            (id2 && (strKey === id2 || valSid === id2)) ||
            (id3 && (strKey === id3 || valIdentity === id3 || valUser === id3))
          ) {
            next.delete(key);
          }
        }
        return next;
      }

      const existing = next.get(identity) || {
        identity,
        name: participant.name || 'Participant',
        avatar: '',
        audioTrack: null,
        videoTrack: null,
        isAudioMuted: false,
        isVideoMuted: false,
        isSpeaking: participant.isSpeaking || false,
      };

      try {
        if (participant.metadata) {
          const meta = JSON.parse(participant.metadata);
          if (meta.avatar) existing.avatar = meta.avatar;
        }
      } catch {
        /* noop */
      }

      if (track) {
        if (track.kind === Track.Kind.Video) {
          existing.videoTrack = track;
        } else if (track.kind === Track.Kind.Audio) {
          existing.audioTrack = track;
        }
      }

      next.set(identity, existing);
      return next;
    });
  }, [user]);

  // ── Leave Call & Cleanup ────────────────────────────────────────────────
  const leaveCall = useCallback(
    (reason = 'You left the call') => {
      stopAudioIntervals();
      playSoundEffect('end');

      const call = currentCallRef.current;
      if (call) {
        socket.emit('call:leave', {
          callId: call.callId,
          roomId: call.roomId,
        });
      }

      livekitMediaService.cleanup();

      peerConnectionsRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {}
      });
      peerConnectionsRef.current.clear();

      setCallState('ended');
      setOutgoingState('idle');
      setCallEndReason(reason);
      setConnectionStatus('disconnected');
      setCurrentCall(null);
      setLocalTracks({ audioTrack: null, videoTrack: null });
      setRemoteParticipants(new Map());
      setActiveSpeakerId(null);
      setIsCallMinimized(false);
      setIsMuted(false);
      setIsCameraOff(false);
      setIsScreenSharing(false);
      setActiveScreenShare(null);

      setTimeout(() => {
        setCallState((prev) => (prev === 'ended' ? 'idle' : prev));
        setIsCallModalOpen(false);
        setCallEndReason(null);
      }, 2800);
    },
    [stopAudioIntervals]
  );

  // ── End Call for Everyone (Host action) ──────────────────────────────────
  const endCallForEveryone = useCallback(() => {
    const call = currentCallRef.current;
    if (call) {
      socket.emit('call:end', {
        callId: call.callId,
        roomId: call.roomId,
      });
    }
    leaveCall('Call ended for everyone');
  }, [leaveCall]);

  // ── Setup Media Service Callbacks ───────────────────────────────────────
  useEffect(() => {
    livekitMediaService.setCallbacks({
      onParticipantConnected: (participant) => {
        updateRemoteParticipant(participant);
        addCallNotification(
          'Participant Joined',
          `${participant.name || 'Someone'} joined the meeting`,
          'join'
        );
      },
      onParticipantDisconnected: (participant) => {
        updateRemoteParticipant(participant, null, true);
        const identity = participant.identity || participant.sid;
        setActiveScreenShare((prev) => (prev?.participant?.identity === identity ? null : prev));
        addCallNotification(
          'Participant Left',
          `${participant.name || 'Someone'} left the meeting`,
          'leave'
        );
      },
      onTrackSubscribed: (track, publication, participant) => {
        updateRemoteParticipant(participant, track);
      },
      onTrackUnsubscribed: (track, publication, participant) => {
        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          const identity = participant.identity || participant.sid;
          const p = next.get(identity);
          if (p) {
            if (track.kind === Track.Kind.Video && p.videoTrack === track) {
              p.videoTrack = null;
            }
            if (track.kind === Track.Kind.Audio && p.audioTrack === track) {
              p.audioTrack = null;
            }
            next.set(identity, { ...p });
          }
          return next;
        });
      },
      onScreenShareSubscribed: (track, participant) => {
        const identity = participant.identity || participant.sid;
        let avatar = '';
        try {
          if (participant.metadata) {
            const meta = JSON.parse(participant.metadata);
            if (meta.avatar) avatar = meta.avatar;
          }
        } catch {
          /* noop */
        }
        setActiveScreenShare({
          participant: {
            identity,
            name: participant.name || 'Participant',
            avatar,
          },
          track,
          isLocal: false,
        });
        addCallNotification(
          'Screen Sharing',
          `${participant.name || 'Participant'} started presenting their screen`,
          'screenshare'
        );
      },
      onScreenShareUnsubscribed: (track, participant) => {
        const identity = participant.identity || participant.sid;
        setActiveScreenShare((prev) => (prev?.participant?.identity === identity ? null : prev));
        addCallNotification(
          'Screen Sharing Ended',
          `${participant.name || 'Participant'} stopped presenting`,
          'screenshare'
        );
      },
      onLocalScreenShareStopped: () => {
        setIsScreenSharing(false);
        setActiveScreenShare((prev) => (prev?.isLocal ? null : prev));
        addCallNotification('Screen Sharing Ended', 'You stopped sharing your screen', 'screenshare');
        const call = currentCallRef.current;
        if (call) {
          socket.emit('call:toggle_media', {
            callId: call.callId,
            roomId: call.roomId,
            mediaType: 'screenshare',
            enabled: false,
          });
        }
      },
      onTrackMuted: (publication, participant) => {
        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          const identity = participant.identity || participant.sid;
          const p = next.get(identity);
          if (p) {
            if (publication.kind === Track.Kind.Audio) p.isAudioMuted = true;
            if (publication.kind === Track.Kind.Video) p.isVideoMuted = true;
            next.set(identity, { ...p });
          }
          return next;
        });
      },
      onTrackUnmuted: (publication, participant) => {
        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          const identity = participant.identity || participant.sid;
          const p = next.get(identity);
          if (p) {
            if (publication.kind === Track.Kind.Audio) p.isAudioMuted = false;
            if (publication.kind === Track.Kind.Video) p.isVideoMuted = false;
            next.set(identity, { ...p });
          }
          return next;
        });
      },
      onActiveSpeakersChanged: (speakers) => {
        if (speakers && speakers.length > 0) {
          setActiveSpeakerId(speakers[0].identity || speakers[0].sid);
        } else {
          setActiveSpeakerId(null);
        }
      },
      onConnectionQualityChanged: (quality) => {
        setConnectionQuality(quality);
      },
      onConnectionStateChanged: (status) => {
        setConnectionStatus(status);
        if (status === 'connected') {
          setCallState('connected');
          setPermissionWarning(null);
        } else if (status === 'reconnecting') {
          setCallState('reconnecting');
          setPermissionWarning('Reconnecting to call...');
        } else if (status === 'offline') {
          setPermissionWarning('Connection lost: You are currently offline.');
          addCallNotification('You are Offline', 'Please check your internet connection.', 'warning');
        } else if (status === 'lost') {
          setPermissionWarning('Connection lost: Unable to reconnect to media server.');
          addCallNotification('Connection Lost', 'Unable to reconnect after network loss.', 'error');
        }
      },
      onMediaError: (err) => {
        console.error('[CallContext] Media error:', err);
        setPermissionWarning(err.message || 'Media device issue');
      },
      onDeviceInterrupted: ({ kind, message }) => {
        setPermissionWarning(message);
        if (kind === 'audio') setIsMuted(true);
        if (kind === 'video') setIsCameraOff(true);
      },
      onDevicesChanged: (cameras) => {
        setHasMultipleCameras(cameras.length > 1);
      },
    });
  }, [updateRemoteParticipant, addCallNotification]);

  // ── WebRTC Direct P2P Fallback Engine ──────────────────────────────────
  const getP2PConnection = useCallback((peerId, isOfferer = false) => {
    if (!peerId) return null;
    let pc = peerConnectionsRef.current.get(peerId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    try {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
        ],
      });
    } catch (e) {
      console.warn('[P2P WebRTC] Failed to create RTCPeerConnection:', e);
      return null;
    }

    peerConnectionsRef.current.set(peerId, pc);

    // Add local media tracks to peer connection
    const localAudio = livekitMediaService.localAudioTrack?.mediaStreamTrack;
    const localVideo = livekitMediaService.localVideoTrack?.mediaStreamTrack;
    if (localAudio) {
      try {
        pc.addTrack(localAudio);
      } catch {}
    }
    if (localVideo) {
      try {
        pc.addTrack(localVideo);
      } catch {}
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && currentCallRef.current) {
        socket.emit('call:signal', {
          callId: currentCallRef.current.callId,
          roomId: currentCallRef.current.roomId,
          toUserId: peerId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      const streamTrack = event.track;
      const wrapped = {
        kind: streamTrack.kind,
        mediaStreamTrack: streamTrack,
        attach: (el) => {
          if (el) {
            el.srcObject = new MediaStream([streamTrack]);
            if (el.paused) el.play().catch(() => {});
          }
          return el;
        },
        detach: (el) => {
          if (el) el.srcObject = null;
        },
      };

      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        const existing = next.get(peerId) || {
          identity: peerId,
          name: 'Participant',
          avatar: '',
          isAudioMuted: false,
          isVideoMuted: false,
          isSpeaking: false,
        };
        if (streamTrack.kind === 'video') existing.videoTrack = wrapped;
        if (streamTrack.kind === 'audio') existing.audioTrack = wrapped;
        next.set(peerId, { ...existing });
        return next;
      });
    };

    if (isOfferer) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (currentCallRef.current) {
            socket.emit('call:signal', {
              callId: currentCallRef.current.callId,
              roomId: currentCallRef.current.roomId,
              toUserId: peerId,
              signal: { type: 'offer', sdp: pc.localDescription.sdp },
            });
          }
        })
        .catch((err) => console.warn('[P2P WebRTC] Offer creation failed:', err));
    }

    return pc;
  }, []);

  // ── Core Method: Join or Start Call ─────────────────────────────────────
  const joinOrStartCall = useCallback(
    async ({ roomId, roomName, callType = 'video', existingCallId = null, isInitiator = false }) => {
      try {
        setCallState('calling');
        setOutgoingState(isInitiator ? 'calling' : 'accepted');
        setConnectionStatus('connecting');
        setIsCallModalOpen(true);
        setPermissionWarning(null);
        setCallEndReason(null);
        setActiveScreenShare(null);

        // 1. Fetch SFU Token from Backend
        const res = await api.post('/calls/token', {
          roomId,
          callType,
        });

        if (!res.data || !res.data.success) {
          throw new Error(res.data?.message || 'Failed to authorize call session');
        }

        const { token, sfuUrl, callId, sfuRoomName } = res.data;

        const callInfo = {
          callId: existingCallId || callId,
          roomId,
          roomName: roomName || 'Room Call',
          callType,
          sfuRoomName,
        };
        setCurrentCall(callInfo);

        // Pre-populate any existing remote participants returned by token endpoint
        if (Array.isArray(res.data.participants)) {
          const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
          setRemoteParticipants((prev) => {
            const next = new Map(prev);
            res.data.participants.forEach((p) => {
              const pId = String(p.user?._id || p.user?.id || p.user || '');
              if (pId && pId !== myId) {
                if (!next.has(pId)) {
                  next.set(pId, {
                    identity: pId,
                    name: p.username || 'Participant',
                    avatar: p.avatar || '',
                    audioTrack: null,
                    videoTrack: null,
                    isAudioMuted: Boolean(p.audioMuted),
                    isVideoMuted: Boolean(p.videoDisabled),
                    isSpeaking: false,
                  });
                }
              }
            });
            return next;
          });
        }

        // If initiator: start ringback loop & 30s timeout
        if (isInitiator) {
          setTimeout(() => {
            setOutgoingState((prev) => (prev === 'calling' ? 'ringing' : prev));
          }, 1200);

          playSoundEffect('ringback');
          ringbackIntervalRef.current = setInterval(() => {
            playSoundEffect('ringback');
          }, 3000);

          outgoingRingTimerRef.current = setTimeout(() => {
            // If still no one joined after 30 seconds
            setOutgoingState('unavailable');
            leaveCall('Recipient unavailable (No answer)');
          }, 32000);
        }

        const initialPartCount = remoteParticipants.size + 1;

        // 2. Connect to SFU Room with adaptive preset
        await livekitMediaService.connect(sfuUrl, token, initialPartCount);

        // 3. Acquire Local Media with adaptive constraints & AEC/AGC
        const wantVideo = callType === 'video';
        const mediaResult = await livekitMediaService.acquireLocalMedia({
          audio: true,
          video: wantVideo,
          participantCount: initialPartCount,
        });

        if (mediaResult.permissionWarning) {
          setPermissionWarning(mediaResult.permissionWarning);
        }

        setLocalTracks({
          audioTrack: livekitMediaService.localAudioTrack,
          videoTrack: livekitMediaService.localVideoTrack,
        });

        setIsCameraOff(!mediaResult.videoAcquired);
        setIsMuted(!mediaResult.audioAcquired);

        // 4. Publish Local Media Tracks
        if (mediaResult.tracks && mediaResult.tracks.length > 0) {
          await livekitMediaService.publishLocalTracks(mediaResult.tracks);
        }

        // 5. Refresh camera list
        await refreshCameraDevices();

        // 6. Announce Join over Socket.IO and sync participants via ack
        socket.emit(
          'call:join',
          {
            callId: callInfo.callId,
            roomId,
          },
          (ack) => {
            if (ack?.success && Array.isArray(ack.participants)) {
              const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
              setRemoteParticipants((prev) => {
                const next = new Map(prev);
                ack.participants.forEach((p) => {
                  const pId = String(p.user?._id || p.user?.id || p.user || '');
                  if (pId && pId !== myId) {
                    if (!next.has(pId)) {
                      next.set(pId, {
                        identity: pId,
                        name: p.username || 'Participant',
                        avatar: p.avatar || '',
                        audioTrack: null,
                        videoTrack: null,
                        isAudioMuted: Boolean(p.audioMuted),
                        isVideoMuted: Boolean(p.videoDisabled),
                        isSpeaking: false,
                      });
                    }
                  }
                });
                return next;
              });
            }
          }
        );

        if (!isInitiator) {
          setCallState('connected');
          setConnectionStatus('connected');
        }
      } catch (err) {
        console.error('[CallContext] Failed to join or start call:', err);
        setPermissionWarning(err.response?.data?.message || err.message || 'Failed to establish call');
        setCallState('idle');
        setOutgoingState('idle');
        setConnectionStatus('disconnected');
      }
    },
    [refreshCameraDevices, leaveCall]
  );

  // ── Start New Call ──────────────────────────────────────────────────────
  const startCall = useCallback(
    (roomId, roomName, callType = 'video') => {
      socket.emit('call:start', { roomId, callType }, (ack) => {
        if (ack && ack.success) {
          joinOrStartCall({
            roomId,
            roomName,
            callType,
            existingCallId: ack.callId,
            isInitiator: true,
          });
        } else {
          joinOrStartCall({ roomId, roomName, callType, isInitiator: true });
        }
      });
    },
    [joinOrStartCall]
  );

  // ── Accept Incoming Call ────────────────────────────────────────────────
  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    const call = incomingCall;
    stopAudioIntervals();
    setIncomingCall(null);
    joinOrStartCall({
      roomId: call.roomId,
      roomName: call.roomName,
      callType: call.callType,
      existingCallId: call.callId,
      isInitiator: false,
    });
  }, [incomingCall, joinOrStartCall, stopAudioIntervals]);

  // ── Decline Incoming Call ────────────────────────────────────────────────
  const declineIncomingCall = useCallback(() => {
    if (incomingCall) {
      socket.emit('call:decline', {
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
      });
    }
    stopAudioIntervals();
    setIncomingCall(null);
  }, [incomingCall, stopAudioIntervals]);

  // ── Toggle Microphone ────────────────────────────────────────────────────
  const toggleMicrophone = useCallback(async () => {
    const nextState = !isMutedRef.current;
    setIsMuted(nextState);
    await livekitMediaService.setMicrophoneEnabled(!nextState);

    const call = currentCallRef.current;
    if (call) {
      socket.emit('call:toggle_media', {
        callId: call.callId,
        roomId: call.roomId,
        mediaType: 'audio',
        enabled: !nextState,
      });
    }
  }, []);

  // ── Toggle Camera ────────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    const nextState = !isCameraOffRef.current;
    setIsCameraOff(nextState);
    await livekitMediaService.setCameraEnabled(!nextState);

    const call = currentCallRef.current;
    if (call) {
      socket.emit('call:toggle_media', {
        callId: call.callId,
        roomId: call.roomId,
        mediaType: 'video',
        enabled: !nextState,
      });
    }
  }, []);

  // ── Switch Front / Rear Camera (Mobile) ──────────────────────────────────
  const switchCamera = useCallback(async () => {
    const result = await livekitMediaService.switchCamera();
    if (result.success) {
      setCurrentFacingMode(result.facingMode);
      setLocalTracks((prev) => ({
        ...prev,
        videoTrack: livekitMediaService.localVideoTrack,
      }));

      if (livekitMediaService.localVideoTrack?.mediaStreamTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(livekitMediaService.localVideoTrack.mediaStreamTrack).catch(() => {});
          }
        });
      }
    }
  }, []);

  // ── Toggle Screen Sharing ────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    const targetState = !isScreenSharing;

    if (targetState) {
      const success = await livekitMediaService.setScreenShareEnabled(true);
      if (success) {
        setIsScreenSharing(true);
        setActiveScreenShare({
          participant: {
            identity: user?._id ? user._id.toString() : user?.id ? String(user.id) : 'local-user',
            name: user?.username || 'You',
            avatar: user?.avatar || '',
          },
          track: livekitMediaService.localScreenTrack,
          isLocal: true,
        });

        const call = currentCallRef.current;
        if (call) {
          socket.emit('call:toggle_media', {
            callId: call.callId,
            roomId: call.roomId,
            mediaType: 'screenshare',
            enabled: true,
          });
        }
      }
    } else {
      await livekitMediaService.setScreenShareEnabled(false);
      setIsScreenSharing(false);
      setActiveScreenShare((prev) => (prev?.isLocal ? null : prev));

      const call = currentCallRef.current;
      if (call) {
        socket.emit('call:toggle_media', {
          callId: call.callId,
          roomId: call.roomId,
          mediaType: 'screenshare',
          enabled: false,
        });
      }
    }
  }, [isScreenSharing, user]);

  // ── Window Unload Safety Cleanup ─────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      leaveCall('You left the call');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [leaveCall]);

  // ── Socket.IO Global Call Listeners ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    // Incoming Call from another user
    const handleCallIncoming = (data) => {
      // If user is already on a call, auto-reject with busy status so caller is notified
      if (currentCallRef.current) {
        socket.emit('call:busy', { callId: data.callId, roomId: data.roomId });
        return;
      }

      setIncomingCall(data);
      playSoundEffect('incoming');
      incomingIntervalRef.current = setInterval(() => {
        playSoundEffect('incoming');
      }, 3500);
    };

    // Remote recipient declined call
    const handleCallDeclined = (data) => {
      if (currentCallRef.current && currentCallRef.current.callId === data.callId) {
        stopAudioIntervals();
        setOutgoingState('declined');
        leaveCall('Recipient declined the call');
      }
    };

    // Remote recipient is busy on another call
    const handleCallBusy = (data) => {
      if (currentCallRef.current && currentCallRef.current.callId === data.callId) {
        stopAudioIntervals();
        setOutgoingState('busy');
        leaveCall('Recipient is busy on another call');
      }
    };

    // Participant joined
    const handleCallParticipantJoined = ({ participant }) => {
      stopAudioIntervals();
      setOutgoingState('accepted');
      setCallState('connected');
      setConnectionStatus('connected');

      if (participant && participant.user) {
        const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
        const participantId = participant.user._id || participant.user.id || participant.user;

        // Never add local user to remote participants
        if (myId && participantId && String(participantId) === String(myId)) {
          return;
        }

        const identity = String(participantId);

        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          const existing = next.get(identity) || {
            identity,
            name: participant.username || 'Participant',
            avatar: participant.avatar || '',
            audioTrack: null,
            videoTrack: null,
            isAudioMuted: Boolean(participant.audioMuted),
            isVideoMuted: Boolean(participant.videoDisabled),
            isSpeaking: false,
          };
          next.set(identity, existing);
          return next;
        });

        // Trigger P2P direct WebRTC connection with the newly joined participant
        getP2PConnection(identity, true);
      }
    };

    // Existing participants in the call when we joined
    const handleExistingParticipants = ({ participants }) => {
      if (!Array.isArray(participants)) return;
      const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        participants.forEach((p) => {
          const pId = String(p.user?._id || p.user?.id || p.user || '');
          if (pId && pId !== myId) {
            if (!next.has(pId)) {
              next.set(pId, {
                identity: pId,
                name: p.username || 'Participant',
                avatar: p.avatar || '',
                audioTrack: null,
                videoTrack: null,
                isAudioMuted: Boolean(p.audioMuted),
                isVideoMuted: Boolean(p.videoDisabled),
                isSpeaking: false,
              });
            }
          }
        });
        return next;
      });
    };

    // P2P WebRTC Signal Exchange (Offer / Answer / ICE Candidate)
    const handleCallSignal = async ({ fromUserId, toUserId, signal }) => {
      const myId = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
      if (toUserId && String(toUserId) !== String(myId)) return;
      if (!fromUserId || String(fromUserId) === String(myId) || !signal) return;

      const peerId = String(fromUserId);

      try {
        if (signal.type === 'offer' && signal.sdp) {
          const pc = getP2PConnection(peerId, false);
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (currentCallRef.current) {
            socket.emit('call:signal', {
              callId: currentCallRef.current.callId,
              roomId: currentCallRef.current.roomId,
              toUserId: peerId,
              signal: { type: 'answer', sdp: answer.sdp },
            });
          }
        } else if (signal.type === 'answer' && signal.sdp) {
          const pc = peerConnectionsRef.current.get(peerId);
          if (pc && pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          const pc = peerConnectionsRef.current.get(peerId);
          if (pc && pc.signalingState !== 'closed') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }
      } catch (err) {
        console.warn('[P2P WebRTC] Signal processing error:', err);
      }
    };

    // Participant left
    const handleCallParticipantLeft = ({ userId, username }) => {
      if (userId) {
        const strUserId = String(userId);
        const pc = peerConnectionsRef.current.get(strUserId);
        if (pc) {
          try {
            pc.close();
          } catch {}
          peerConnectionsRef.current.delete(strUserId);
        }

        setRemoteParticipants((prev) => {
          const next = new Map();
          for (const [key, val] of prev.entries()) {
            const strKey = String(key);
            const valIdentity = String(val?.identity || '');
            const valSid = String(val?.sid || '');
            const valUserId = String(val?.user?._id || val?.user?.id || val?.user || '');
            const isMatch =
              strKey === strUserId ||
              valIdentity === strUserId ||
              valSid === strUserId ||
              valUserId === strUserId;
            if (!isMatch) {
              next.set(key, val);
            }
          }
          return next;
        });
        setActiveScreenShare((prev) => {
          const prevId = String(prev?.participant?.identity || '');
          return prevId === strUserId ? null : prev;
        });
      }
    };

    // Media toggled by remote participant
    const handleCallMediaChanged = ({ userId, mediaType, enabled }) => {
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        const p = next.get(userId);
        if (p) {
          if (mediaType === 'audio') p.isAudioMuted = !enabled;
          if (mediaType === 'video') p.isVideoMuted = !enabled;
          next.set(userId, { ...p });
        }
        return next;
      });

      if (mediaType === 'screenshare' && !enabled) {
        setActiveScreenShare((prev) => (prev?.participant?.identity === userId ? null : prev));
      }
    };

    // Call ended by host
    const handleCallEnded = () => {
      stopAudioIntervals();
      leaveCall('Call ended');
    };

    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:declined', handleCallDeclined);
    socket.on('call:busy', handleCallBusy);
    socket.on('call:participant_joined', handleCallParticipantJoined);
    socket.on('call:existing_participants', handleExistingParticipants);
    socket.on('call:signal', handleCallSignal);
    socket.on('call:participant_left', handleCallParticipantLeft);
    socket.on('call:media_changed', handleCallMediaChanged);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:declined', handleCallDeclined);
      socket.off('call:busy', handleCallBusy);
      socket.off('call:participant_joined', handleCallParticipantJoined);
      socket.off('call:existing_participants', handleExistingParticipants);
      socket.off('call:signal', handleCallSignal);
      socket.off('call:participant_left', handleCallParticipantLeft);
      socket.off('call:media_changed', handleCallMediaChanged);
      socket.off('call:ended', handleCallEnded);
    };
  }, [user, leaveCall, stopAudioIntervals]);

  const value = {
    callState,
    outgoingState,
    connectionStatus,
    connectionQuality,
    currentCall,
    incomingCall,
    callEndReason,
    callNotifications,
    addCallNotification,
    dismissCallNotification,
    isMuted,
    isCameraOff,
    isScreenSharing,
    activeScreenShare,
    isScreenShareSupported,
    permissionWarning,
    hasMultipleCameras,
    currentFacingMode,
    localTracks,
    remoteParticipants: Array.from(remoteParticipants.values()),
    activeSpeakerId,
    isCallModalOpen,
    isCallMinimized,
    callDurationSeconds,
    formatDuration,
    startCall,
    joinOrStartCall,
    acceptIncomingCall,
    declineIncomingCall,
    leaveCall,
    endCallForEveryone,
    toggleMicrophone,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    setIsCallModalOpen,
    setIsCallMinimized,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

CallProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
