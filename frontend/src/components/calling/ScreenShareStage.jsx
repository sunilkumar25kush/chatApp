import { useEffect, useRef, useState, memo } from 'react';
import PropTypes from 'prop-types';

function ScreenShareStage({
  screenTrack = null,
  presenter = null,
  isLocal = false,
  onStopSharing = null,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Attach/Detach Screen Track ──────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !screenTrack) return;

    try {
      if (typeof screenTrack.attach === 'function') {
        screenTrack.attach(el);
      } else if (screenTrack.mediaStreamTrack) {
        el.srcObject = new MediaStream([screenTrack.mediaStreamTrack]);
      }
    } catch (err) {
      console.warn('[ScreenShareStage] Error attaching screen track:', err);
    }

    return () => {
      try {
        if (typeof screenTrack.detach === 'function') {
          screenTrack.detach(el);
        } else if (el) {
          el.srcObject = null;
        }
      } catch {
        /* noop */
      }
    };
  }, [screenTrack]);

  // Toggle fullscreen on the presentation container
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const presenterName = presenter?.name || (isLocal ? 'You' : 'Participant');

  return (
    <div
      ref={containerRef}
      className="call-screenshare-stage"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        background: '#050608',
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(124, 58, 237, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
      }}
    >
      {/* Top Presenter Overlay Bar */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {/* Presenter Info Pill */}
        <div
          style={{
            background: 'rgba(18, 21, 30, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: 20,
            padding: '4px 12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '70%',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: 14 }}>🖥️</span>
          <span
            style={{
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isLocal ? 'You are presenting' : `${presenterName}'s screen`}
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
          {/* Local "Stop Sharing" Prominent Button */}
          {isLocal && onStopSharing && (
            <button
              type="button"
              onClick={onStopSharing}
              title="Stop sharing your screen"
              style={{
                background: '#dc2626',
                border: 'none',
                color: '#fff',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>✕</span>
              <span>Stop Sharing</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit presentation fullscreen' : 'Full presentation'}
            style={{
              background: 'rgba(18, 21, 30, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
              backdropFilter: 'blur(8px)',
            }}
          >
            {isFullscreen ? '⤦' : '⛶'}
          </button>
        </div>
      </div>

      {/* Screen Share Video Track Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#050608',
        }}
      />
    </div>
  );
}

ScreenShareStage.propTypes = {
  screenTrack: PropTypes.object,
  presenter: PropTypes.shape({
    identity: PropTypes.string,
    name: PropTypes.string,
    avatar: PropTypes.string,
  }),
  isLocal: PropTypes.bool,
  onStopSharing: PropTypes.func,
};

export default memo(ScreenShareStage);
