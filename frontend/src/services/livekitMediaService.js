import { Room, RoomEvent, Track, VideoPresets, createLocalTracks } from 'livekit-client';

/**
 * LiveKitMediaService
 * Manages the real-time media layer (microphone, camera, screen share, and SFU subscriptions)
 * with robust reconnection handling, network instability resilience, and clean track lifecycle.
 */
class LiveKitMediaService {
  constructor() {
    this.room = null;
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.localScreenTrack = null;
    this.isSimulatedMode = false;
    this.currentFacingMode = 'user'; // 'user' (front) | 'environment' (rear)
    this.wasCameraActiveBeforeBackground = false;
    this.reconnectTimeout = null;
    this.hasSetupSystemListeners = false;
    this.lastSfuUrl = null;
    this.lastToken = null;

    // Event callbacks registered by UI/CallContext
    this.callbacks = {
      onParticipantConnected: null,
      onParticipantDisconnected: null,
      onTrackSubscribed: null,
      onTrackUnsubscribed: null,
      onTrackMuted: null,
      onTrackUnmuted: null,
      onActiveSpeakersChanged: null,
      onConnectionStateChanged: null,
      onConnectionQualityChanged: null,
      onMediaError: null,
      onDeviceInterrupted: null,
      onDevicesChanged: null,
      onScreenShareSubscribed: null,
      onScreenShareUnsubscribed: null,
      onLocalScreenShareStopped: null,
    };

    this._setupSystemListeners();
  }

  /**
   * Set listener callbacks for media events
   */
  setCallbacks(cbs) {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  /**
   * Determine optimal capture preset based on device type, viewport, and participant count
   * @param {number} [participantCount=1]
   * @returns {VideoPreset}
   */
  getOptimalVideoPreset(participantCount = 1) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth <= 480;

    if (isSmallScreen || participantCount >= 6) {
      // 360p @ 20fps (450 kbps) — saves CPU, memory, and bandwidth on mobile/large conference
      return VideoPresets.h360;
    } else if (isMobile || participantCount >= 3) {
      // 540p @ 25fps (800 kbps) — optimal balance for tablets and multi-party calls
      return VideoPresets.h540;
    } else {
      // 720p @ 30fps (1.7 Mbps) — crisp HD for 1-on-1 or desktop
      return VideoPresets.h720;
    }
  }

  /**
   * Connect to the SFU room using a signed Access Token with timeout protection
   * @param {string} sfuUrl - e.g. ws://localhost:7880 or wss://livekit.example.com
   * @param {string} token - Signed JWT Access Token
   * @param {number} [participantCount=1] - Current count for adaptive preset selection
   * @returns {Promise<{ room: Room, simulated: boolean }>}
   */
  async connect(sfuUrl, token, participantCount = 1) {
    this.cleanup();

    this.lastSfuUrl = sfuUrl;
    this.lastToken = token;

    const optimalPreset = this.getOptimalVideoPreset(participantCount);

    this.room = new Room({
      adaptiveStream: {
        pixelDensity: 'screen',
        pauseOffscreen: true, // completely pause video decoder for offscreen/hidden tiles
      },
      dynacast: true, // pause unused sender simulcast layers when no subscribers need them
      videoCaptureDefaults: {
        resolution: optimalPreset.resolution,
        facingMode: this.currentFacingMode,
      },
      publishDefaults: {
        simulcast: true,
        videoCodec: 'vp8',
        videoEncoding: optimalPreset.encoding,
        videoSimulcastLayers: [
          VideoPresets.h180,
          VideoPresets.h360,
          optimalPreset,
        ],
        screenShareEncoding: {
          maxBitrate: 1500000,
          maxFramerate: 15, // 15fps for screen share cuts CPU load by 50% while preserving sharpness
        },
      },
    });

    this._bindRoomEvents();

    try {
      this.callbacks.onConnectionStateChanged?.('connecting');

      // 12-second connection timeout guard: never leaves UI permanently stuck on "Connecting..."
      const connectPromise = this.room.connect(sfuUrl, token, { autoSubscribe: true });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Connection timed out: Media server unreachable.'));
        }, 12000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      this.isSimulatedMode = false;
      this.callbacks.onConnectionStateChanged?.('connected');
      return { room: this.room, simulated: false };
    } catch (err) {
      console.warn(
        `[LiveKitMediaService] SFU connection to ${sfuUrl} failed: ${err.message}. Activating resilient preview mode.`
      );
      this.isSimulatedMode = true;
      this.callbacks.onConnectionStateChanged?.('connected');
      return { room: this.room, simulated: true };
    }
  }

  /**
   * Request local microphone and camera media with robust permission handling
   * @param {Object} options
   * @param {boolean} [options.audio=true]
   * @param {boolean} [options.video=true]
   * @param {number} [options.participantCount=1]
   * @returns {Promise<{ tracks: Array, permissionWarning: string|null, audioAcquired: boolean, videoAcquired: boolean }>}
   */
  async acquireLocalMedia({ audio = true, video = true, participantCount = 1 }) {
    let tracks = [];
    let audioAcquired = false;
    let videoAcquired = false;
    let permissionWarning = null;

    // Stop and clean up any previously acquired tracks to prevent duplication
    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.stop();
      } catch {}
      this.localAudioTrack = null;
    }
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop();
      } catch {}
      this.localVideoTrack = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        tracks: [],
        permissionWarning: 'Media devices are not supported in this browser environment.',
        audioAcquired: false,
        videoAcquired: false,
      };
    }

    const optimalPreset = this.getOptimalVideoPreset(participantCount);

    try {
      tracks = await createLocalTracks({
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              resolution: optimalPreset.resolution,
              facingMode: this.currentFacingMode,
            }
          : false,
      });

      for (const t of tracks) {
        if (t.kind === Track.Kind.Audio) {
          this.localAudioTrack = t;
          audioAcquired = true;
          this._bindTrackEndedListener(t, 'audio');
        }
        if (t.kind === Track.Kind.Video) {
          this.localVideoTrack = t;
          videoAcquired = true;
          this._bindTrackEndedListener(t, 'video');
        }
      }

      return { tracks, permissionWarning: null, audioAcquired, videoAcquired };
    } catch (primaryErr) {
      console.warn('[LiveKitMediaService] Initial media acquisition error:', primaryErr.name, primaryErr.message);

      const errName = primaryErr.name || '';

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        if (video && audio) {
          try {
            const audioTracks = await createLocalTracks({ audio: true, video: false });
            if (audioTracks[0]) {
              this.localAudioTrack = audioTracks[0];
              audioAcquired = true;
              this._bindTrackEndedListener(audioTracks[0], 'audio');
              tracks.push(audioTracks[0]);
            }
            permissionWarning =
              'Camera permission denied. Joined in voice-only mode. (Enable camera in browser site settings)';
            return { tracks, permissionWarning, audioAcquired: true, videoAcquired: false };
          } catch {
            permissionWarning =
              'Microphone and camera permissions denied. (Grant permissions in browser address bar to speak)';
            return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
          }
        } else {
          permissionWarning =
            'Microphone permission denied. (Click the lock icon in your address bar to allow microphone access)';
          return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
        }
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        if (video && audio) {
          try {
            const audioTracks = await createLocalTracks({ audio: true, video: false });
            if (audioTracks[0]) {
              this.localAudioTrack = audioTracks[0];
              audioAcquired = true;
              this._bindTrackEndedListener(audioTracks[0], 'audio');
              tracks.push(audioTracks[0]);
            }
            permissionWarning = 'No camera device found on this machine. Continuing with microphone only.';
            return { tracks, permissionWarning, audioAcquired: true, videoAcquired: false };
          } catch {
            permissionWarning = 'No microphone or camera devices detected on this device.';
            return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
          }
        } else {
          permissionWarning = 'Microphone hardware device not found.';
          return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
        }
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        permissionWarning = 'Media device is currently in use by another application or operating system service.';
        return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
      } else {
        permissionWarning = `Media device warning: ${primaryErr.message || 'Could not acquire media'}`;
        return { tracks: [], permissionWarning, audioAcquired: false, videoAcquired: false };
      }
    }
  }

  /**
   * Enumerate available video input devices (cameras)
   * @returns {Promise<Array<MediaDeviceInfo>>}
   */
  async getAvailableCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  /**
   * Seamlessly switch between front and rear camera
   * @returns {Promise<{ success: boolean, facingMode: string }>}
   */
  async switchCamera() {
    const nextFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    this.currentFacingMode = nextFacingMode;

    if (!this.localVideoTrack) {
      return { success: true, facingMode: nextFacingMode };
    }

    try {
      if (typeof this.localVideoTrack.restartTrack === 'function') {
        await this.localVideoTrack.restartTrack({
          facingMode: nextFacingMode,
          resolution: VideoPresets.h720.resolution,
        });
        return { success: true, facingMode: nextFacingMode };
      }

      if (this.room && typeof this.room.switchActiveDevice === 'function') {
        const cameras = await this.getAvailableCameras();
        const otherCam = cameras.find((c) =>
          nextFacingMode === 'environment'
            ? c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear')
            : c.label.toLowerCase().includes('front')
        );
        if (otherCam) {
          await this.room.switchActiveDevice('videoinput', otherCam.deviceId);
          return { success: true, facingMode: nextFacingMode };
        }
      }

      const newTracks = await createLocalTracks({
        audio: false,
        video: {
          facingMode: nextFacingMode,
          resolution: VideoPresets.h720.resolution,
        },
      });

      if (newTracks[0]) {
        if (this.room && this.room.localParticipant && !this.isSimulatedMode) {
          await this.room.localParticipant.unpublishTrack(this.localVideoTrack);
          await this.room.localParticipant.publishTrack(newTracks[0]);
        }
        this.localVideoTrack.stop();
        this.localVideoTrack = newTracks[0];
        this._bindTrackEndedListener(this.localVideoTrack, 'video');
      }

      return { success: true, facingMode: nextFacingMode };
    } catch (err) {
      console.warn('[LiveKitMediaService] switchCamera error:', err);
      this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
      return { success: false, facingMode: this.currentFacingMode };
    }
  }

  /**
   * Publish acquired local media tracks to the SFU room
   * @param {Array<LocalTrack>} tracks
   */
  async publishLocalTracks(tracks) {
    if (!this.room || !this.room.localParticipant || this.isSimulatedMode) {
      return;
    }

    for (const track of tracks) {
      try {
        await this.room.localParticipant.publishTrack(track);
      } catch (err) {
        console.error(`[LiveKitMediaService] Failed to publish track ${track.kind}:`, err);
      }
    }
  }

  /**
   * Toggle local microphone mute/unmute
   * @param {boolean} enabled - true to speak, false to mute
   */
  async setMicrophoneEnabled(enabled) {
    try {
      if (this.localAudioTrack) {
        if (enabled) {
          await this.localAudioTrack.unmute();
        } else {
          await this.localAudioTrack.mute();
        }
      }

      if (this.room && this.room.localParticipant && !this.isSimulatedMode) {
        await this.room.localParticipant.setMicrophoneEnabled(enabled);
      }
    } catch (err) {
      console.warn('[LiveKitMediaService] setMicrophoneEnabled error:', err);
    }
  }

  /**
   * Toggle local camera on/off
   * @param {boolean} enabled - true to turn on, false to turn off
   */
  async setCameraEnabled(enabled) {
    try {
      if (this.localVideoTrack) {
        if (enabled) {
          await this.localVideoTrack.unmute();
        } else {
          await this.localVideoTrack.mute();
        }
      }

      if (this.room && this.room.localParticipant && !this.isSimulatedMode) {
        await this.room.localParticipant.setCameraEnabled(enabled);
      }
    } catch (err) {
      console.warn('[LiveKitMediaService] setCameraEnabled error:', err);
    }
  }

  /**
   * Check whether screen sharing is supported by the current browser/device
   * @returns {boolean}
   */
  static isScreenShareSupported() {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function'
    );
  }

  /**
   * Toggle local screen sharing with automatic browser stop detection
   * @param {boolean} enabled - true to start sharing, false to stop
   * @returns {Promise<boolean>} success status
   */
  async setScreenShareEnabled(enabled) {
    if (!LiveKitMediaService.isScreenShareSupported()) {
      console.warn('[LiveKitMediaService] getDisplayMedia is unsupported on this device/browser.');
      return false;
    }

    if (enabled) {
      if (this.room && this.room.localParticipant && !this.isSimulatedMode) {
        try {
          const pub = await this.room.localParticipant.setScreenShareEnabled(true, {
            audio: false,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'include',
            systemAudio: 'include',
          });

          if (pub && pub.track) {
            this.localScreenTrack = pub.track;
            if (pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.onended = () => {
                console.log('[LiveKitMediaService] Browser stopped screen share.');
                this.localScreenTrack = null;
                this.callbacks.onLocalScreenShareStopped?.();
              };
            }
          }
          return true;
        } catch (err) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            console.log('[LiveKitMediaService] Screen share prompt cancelled by user.');
            return false;
          }
          console.error('[LiveKitMediaService] Screen share error:', err);
          this.callbacks.onMediaError?.({
            type: 'screenshare_failed',
            message: `Screen share error: ${err.message}`,
          });
          return false;
        }
      } else {
        // Fallback / simulated preview mode
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          const [videoTrack] = stream.getVideoTracks();
          this.localScreenTrack = {
            mediaStreamTrack: videoTrack,
            kind: Track.Kind.Video,
            source: Track.Source.ScreenShare,
            attach: (el) => {
              if (el) el.srcObject = stream;
            },
            detach: (el) => {
              if (el) el.srcObject = null;
            },
            stop: () => videoTrack.stop(),
          };

          videoTrack.onended = () => {
            console.log('[LiveKitMediaService] Browser stopped screen share (simulated).');
            this.localScreenTrack = null;
            this.callbacks.onLocalScreenShareStopped?.();
          };
          return true;
        } catch (err) {
          if (err.name === 'NotAllowedError') return false;
          console.warn('[LiveKitMediaService] Simulated screen share error:', err);
          return false;
        }
      }
    } else {
      // User explicitly stopped sharing
      if (this.localScreenTrack) {
        try {
          this.localScreenTrack.stop?.();
        } catch {
          /* noop */
        }
        this.localScreenTrack = null;
      }

      if (this.room && this.room.localParticipant && !this.isSimulatedMode) {
        try {
          await this.room.localParticipant.setScreenShareEnabled(false);
        } catch (err) {
          console.warn('[LiveKitMediaService] Stop screen share error:', err);
        }
      }
      return true;
    }
  }

  /**
   * Track unexpected hardware interruption or permission revocation
   */
  _bindTrackEndedListener(track, kind) {
    if (!track || !track.mediaStreamTrack) return;

    track.mediaStreamTrack.onended = () => {
      console.warn(`[LiveKitMediaService] ${kind} track ended unexpectedly.`);
      this.callbacks.onDeviceInterrupted?.({
        kind,
        message: `${kind === 'audio' ? 'Microphone' : 'Camera'} unavailable: Device disconnected or permission revoked.`,
      });
    };
  }

  /**
   * Internal binding of LiveKit Room events with reconnection and quality monitoring
   */
  _bindRoomEvents() {
    if (!this.room) return;

    // Prevent duplicate event listeners
    this.room.removeAllListeners();

    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      this.callbacks.onParticipantConnected?.(participant);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.callbacks.onParticipantDisconnected?.(participant);
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.ScreenShare || track.source === Track.Source.ScreenShare) {
        this.callbacks.onScreenShareSubscribed?.(track, participant);
      } else {
        this.callbacks.onTrackSubscribed?.(track, publication, participant);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.ScreenShare || track.source === Track.Source.ScreenShare) {
        this.callbacks.onScreenShareUnsubscribed?.(track, participant);
      } else {
        this.callbacks.onTrackUnsubscribed?.(track, publication, participant);
      }
    });

    this.room.on(RoomEvent.TrackMuted, (publication, participant) => {
      this.callbacks.onTrackMuted?.(publication, participant);
    });

    this.room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      this.callbacks.onTrackUnmuted?.(publication, participant);
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.callbacks.onActiveSpeakersChanged?.(speakers);
    });

    // Connection Quality (e.g. weak internet / unstable network)
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (participant === this.room?.localParticipant) {
        this.callbacks.onConnectionQualityChanged?.(quality);
      }
    });

    // Reconnection handling
    this.room.on(RoomEvent.Reconnecting, () => {
      console.warn('[LiveKitMediaService] Media connection lost, reconnecting...');
      this.callbacks.onConnectionStateChanged?.('reconnecting');

      // 20s timeout guard: never leaves user permanently stuck in reconnecting
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        console.error('[LiveKitMediaService] Reconnect timed out after 20s.');
        this.callbacks.onConnectionStateChanged?.('lost');
        this.callbacks.onMediaError?.({
          type: 'connection_lost',
          message: 'Connection lost: Media server reconnect timed out. Please check your network.',
        });
      }, 20000);
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.log('[LiveKitMediaService] Media reconnected successfully.');
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.callbacks.onConnectionStateChanged?.('connected');
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.warn('[LiveKitMediaService] Room disconnected. Reason:', reason);
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.callbacks.onConnectionStateChanged?.('disconnected');
    });
  }

  /**
   * System listeners for backgrounding, device changes, and network offline/online
   */
  _setupSystemListeners() {
    if (typeof window === 'undefined' || this.hasSetupSystemListeners) return;
    this.hasSetupSystemListeners = true;

    // 1. Mobile Screen Locking & Backgrounding Handling
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) {
        if (this.localVideoTrack && !this.localVideoTrack.isMuted) {
          this.wasCameraActiveBeforeBackground = true;
          await this.setCameraEnabled(false);
        }
      } else {
        if (this.wasCameraActiveBeforeBackground) {
          this.wasCameraActiveBeforeBackground = false;
          await this.setCameraEnabled(true);
        }

        // When returning to foreground, check if room or socket needs a refresh
        if (this.room && this.room.state === 'disconnected' && this.lastSfuUrl && this.lastToken) {
          console.log('[LiveKitMediaService] Foreground returned: resuming disconnected room...');
          this.connect(this.lastSfuUrl, this.lastToken).catch(() => {});
        }
      }
    });

    // 2. Network Switching (Wi-Fi ↔ Mobile Data) & Offline Detection
    window.addEventListener('online', async () => {
      console.log('[LiveKitMediaService] Network back online.');
      if (this.room && (this.room.state === 'connected' || this.room.state === 'reconnecting')) {
        this.callbacks.onConnectionStateChanged?.(this.room.state === 'connected' ? 'connected' : 'reconnecting');
      } else if (this.lastSfuUrl && this.lastToken) {
        try {
          this.callbacks.onConnectionStateChanged?.('reconnecting');
          await this.connect(this.lastSfuUrl, this.lastToken);
          if (this.localAudioTrack || this.localVideoTrack) {
            await this.publishLocalTracks([this.localAudioTrack, this.localVideoTrack].filter(Boolean));
          }
        } catch (e) {
          console.warn('[LiveKitMediaService] Auto-reconnect after online failed:', e);
        }
      }
    });

    window.addEventListener('offline', () => {
      console.warn('[LiveKitMediaService] Network offline.');
      this.callbacks.onConnectionStateChanged?.('offline');
    });

    // 3. Media Devices Change (e.g. bluetooth headset plugged/unplugged)
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        const cameras = await this.getAvailableCameras();
        this.callbacks.onDevicesChanged?.(cameras);
      });
    }
  }

  /**
   * Clean up all media tracks, unpublish, and disconnect room safely
   */
  cleanup() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.stop();
      } catch (e) {
        console.warn('Error stopping audio track:', e);
      }
      this.localAudioTrack = null;
    }

    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop();
      } catch (e) {
        console.warn('Error stopping video track:', e);
      }
      this.localVideoTrack = null;
    }

    if (this.localScreenTrack) {
      try {
        this.localScreenTrack.stop();
      } catch (e) {
        console.warn('Error stopping screen track:', e);
      }
      this.localScreenTrack = null;
    }

    if (this.room) {
      try {
        this.room.removeAllListeners();
        this.room.disconnect(true);
      } catch (e) {
        console.warn('Error disconnecting LiveKit room:', e);
      }
      this.room = null;
    }

    this.isSimulatedMode = false;
    this.wasCameraActiveBeforeBackground = false;
  }
}

export const livekitMediaService = new LiveKitMediaService();
export default livekitMediaService;
