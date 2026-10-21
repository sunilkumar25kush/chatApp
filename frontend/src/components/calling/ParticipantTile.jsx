import { useEffect, useRef, useState, memo } from 'react';
import PropTypes from 'prop-types';

function ParticipantTile({
  participant,
  isLocal = false,
  isActiveSpeaker = false,
  isPinned = false,
  onTogglePin = null,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [videoAttached, setVideoAttached] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(null);
  const [fitMode, setFitMode] = useState(null); // null = auto, 'contain', 'cover'

  const {
    name = 'Participant',
    avatar = '',
    videoTrack = null,
    audioTrack = null,
    isAudioMuted = false,
    isVideoMuted = false,
  } = participant || {};

  const hasVideo = Boolean(videoTrack) && !isVideoMuted;

  // ── Track Video Stream Aspect Ratio (Portrait vs Landscape) ─────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const updateRatio = () => {
      if (el.videoWidth && el.videoHeight) {
        setVideoAspectRatio(el.videoWidth / el.videoHeight);
      }
    };

    el.addEventListener('loadedmetadata', updateRatio);
    el.addEventListener('resize', updateRatio);
    if (el.videoWidth && el.videoHeight) {
      updateRatio();
    }

    return () => {
      el.removeEventListener('loadedmetadata', updateRatio);
      el.removeEventListener('resize', updateRatio);
    };
  }, [hasVideo, videoAttached]);

  // Default to 'contain' so that NO video feed (neither local camera nor remote caller)
  // is ever cropped, zoomed in, or has heads/chins cut off!
  // Users can click the Fit/Fill toggle button in the top right or double-click to switch to 'cover'.
  const effectiveFit = fitMode || 'contain';

  // ── Attach/Detach Video Track ───────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack || isVideoMuted) {
      setVideoAttached(false);
      return;
    }

    try {
      videoTrack.attach(el);
      setVideoAttached(true);
    } catch (err) {
      console.warn('[ParticipantTile] Error attaching video track:', err);
    }

    return () => {
      try {
        videoTrack.detach(el);
      } catch {
        /* noop */
      }
      setVideoAttached(false);
    };
  }, [videoTrack, isVideoMuted]);

  // ── Attach/Detach Remote Audio Track ────────────────────────────────────
  // NEVER attach local audio track to local element (causes feedback echo!)
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioTrack || isLocal) return;

    try {
      audioTrack.attach(el);
    } catch (err) {
      console.warn('[ParticipantTile] Error attaching audio track:', err);
    }

    return () => {
      try {
        audioTrack.detach(el);
      } catch {
        /* noop */
      }
    };
  }, [audioTrack, isLocal]);

  // Fallback initial from name
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <div
      className={`call-participant-tile ${isActiveSpeaker ? 'call-participant-tile--speaking' : ''} ${
        isPinned ? 'call-participant-tile--pinned' : ''
      }`}
      onDoubleClick={() => hasVideo && setFitMode(effectiveFit === 'contain' ? 'cover' : 'contain')}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        background: '#0d0f15',
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: isActiveSpeaker ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isActiveSpeaker ? '0 0 20px rgba(34, 197, 94, 0.35)' : '0 4px 16px rgba(0, 0, 0, 0.4)',
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Remote Audio Playback Element */}
      {!isLocal && <audio ref={audioRef} autoPlay />}

      {/* Video Stream Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: effectiveFit,
          display: hasVideo ? 'block' : 'none',
          transform: isLocal ? 'scaleX(-1)' : 'none', // Mirror selfie camera
        }}
      />

      {/* Camera Off / Voice-Only Avatar Placeholder */}
      {!hasVideo && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 'clamp(56px, 12vw, 96px)',
              height: 'clamp(56px, 12vw, 96px)',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isActiveSpeaker ? '0 0 0 6px rgba(34, 197, 94, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.3)',
              transition: 'box-shadow 0.25s ease',
              overflow: 'hidden',
            }}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span style={{ color: '#fff', fontSize: 'clamp(20px, 4vw, 32px)', fontWeight: 700 }}>
                {initials}
              </span>
            )}

            {/* Speaking wave halo indicator */}
            {isActiveSpeaker && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid #22c55e',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            )}
          </div>

          <span
            style={{
              color: '#9ca3af',
              fontSize: 'clamp(12px, 2.5vw, 14px)',
              fontWeight: 500,
            }}
          >
            {isVideoMuted ? 'Camera is turned off' : 'Audio participant'}
          </span>
        </div>
      )}

      {/* Top Controls: Pin & Connection Status */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 2,
        }}
      >
        {/* Fit / Fill Toggle Button */}
        {hasVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFitMode((prev) => {
                const current = prev || (isPortraitStream && !isLocal ? 'contain' : 'cover');
                return current === 'contain' ? 'cover' : 'contain';
              });
            }}
            title={effectiveFit === 'contain' ? 'Fill screen (cover mode)' : 'Fit full uncropped view (contain mode)'}
            style={{
              background: effectiveFit === 'contain' ? 'var(--color-primary, #6366f1)' : 'rgba(0, 0, 0, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              borderRadius: 6,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
              backdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease',
            }}
          >
            {effectiveFit === 'contain' ? '↔️' : '🔍'}
          </button>
        )}

        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? 'Unpin participant' : 'Pin to full size'}
            style={{
              background: isPinned ? 'var(--color-primary, #7c3aed)' : 'rgba(0, 0, 0, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              borderRadius: 6,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
              backdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease',
            }}
          >
            📌
          </button>
        )}
      </div>

      {/* Bottom Information Overlay: Name & Microphone Status */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div
          style={{
            background: 'rgba(15, 17, 23, 0.82)',
            backdropFilter: 'blur(6px)',
            borderRadius: 6,
            padding: '3px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            maxWidth: '85%',
            overflow: 'hidden',
          }}
        >
          {/* Speaking Audio Wave Icon or Mic Badge */}
          {isAudioMuted ? (
            <span
              title="Microphone is muted"
              style={{
                background: '#ef4444',
                color: '#fff',
                width: 16,
                height: 16,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                flexShrink: 0,
              }}
            >
              ✕
            </span>
          ) : isActiveSpeaker ? (
            <span
              title="Speaking"
              style={{
                color: '#22c55e',
                fontSize: 11,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              🎙️
            </span>
          ) : (
            <span
              title="Microphone active"
              style={{
                color: '#9ca3af',
                fontSize: 11,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              🎤
            </span>
          )}

          <span
            style={{
              color: '#f3f4f6',
              fontSize: 'clamp(10px, 2.5vw, 12px)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name} {isLocal ? '(You)' : ''}
          </span>
        </div>

        {/* Local Self-View Tag */}
        {isLocal && (
          <span
            style={{
              background: 'rgba(124, 58, 237, 0.85)',
              color: '#fff',
              fontSize: 'clamp(8px, 2vw, 10px)',
              fontWeight: 700,
              padding: '2px 5px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            Self
          </span>
        )}
      </div>
    </div>
  );
}

ParticipantTile.propTypes = {
  participant: PropTypes.shape({
    identity: PropTypes.string,
    name: PropTypes.string,
    avatar: PropTypes.string,
    videoTrack: PropTypes.object,
    audioTrack: PropTypes.object,
    isAudioMuted: PropTypes.bool,
    isVideoMuted: PropTypes.bool,
  }).isRequired,
  isLocal: PropTypes.bool,
  isActiveSpeaker: PropTypes.bool,
  isPinned: PropTypes.bool,
  onTogglePin: PropTypes.func,
};

function areParticipantTilePropsEqual(prevProps, nextProps) {
  const p1 = prevProps.participant;
  const p2 = nextProps.participant;

  return (
    p1?.identity === p2?.identity &&
    p1?.videoTrack === p2?.videoTrack &&
    p1?.audioTrack === p2?.audioTrack &&
    p1?.isAudioMuted === p2?.isAudioMuted &&
    p1?.isVideoMuted === p2?.isVideoMuted &&
    p1?.name === p2?.name &&
    p1?.avatar === p2?.avatar &&
    prevProps.isLocal === nextProps.isLocal &&
    prevProps.isActiveSpeaker === nextProps.isActiveSpeaker &&
    prevProps.isPinned === nextProps.isPinned &&
    prevProps.onTogglePin === nextProps.onTogglePin
  );
}

export default memo(ParticipantTile, areParticipantTilePropsEqual);
