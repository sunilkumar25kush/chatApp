import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useCall } from '../../context/CallContext';
import { useAuth } from '../../context/useAuth';
import ParticipantTile from './ParticipantTile';
import ParticipantOverflowCard from './ParticipantOverflowCard';
import ParticipantRosterDrawer from './ParticipantRosterDrawer';
import ScreenShareStage from './ScreenShareStage';
import NotificationToast from '../NotificationToast';
import { calculateParticipantLayout } from '../../utils/participantLayoutCalculator';

export default function CallRoom({ onClose = null }) {
  const { user } = useAuth();
  const {
    currentCall,
    callState,
    outgoingState,
    callEndReason,
    connectionStatus,
    connectionQuality,
    callNotifications,
    dismissCallNotification,
    localTracks,
    remoteParticipants,
    activeSpeakerId,
    isMuted,
    isCameraOff,
    isScreenSharing,
    activeScreenShare,
    isScreenShareSupported,
    permissionWarning,
    hasMultipleCameras,
    currentFacingMode,
    callDurationSeconds,
    formatDuration,
    toggleMicrophone,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    leaveCall,
    endCallForEveryone,
    setIsCallMinimized,
  } = useCall();

  const [pinnedId, setPinnedId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTogglePin = useCallback((id) => {
    setPinnedId((prev) => (prev === id ? null : id));
  }, []);

  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight - 136 : 720,
  });

  // ── Responsive Dimensions & Orientation Observer ─────────────────────────
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
          return;
        }
      }
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - (window.innerWidth < 768 ? 110 : 136),
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        updateDimensions();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      if (ro) ro.disconnect();
    };
  }, []);

  const isMobile = dimensions.width < 768;
  const isLandscapeMobile = dimensions.height < 500 && dimensions.width >= 500;
  const isCompactPhone = dimensions.width <= 360;

  // Construct local participant object
  const localParticipant = useMemo(() => {
    return {
      identity: user?._id ? user._id.toString() : user?.id ? String(user.id) : 'local-user',
      name: user?.username || 'You',
      avatar: user?.avatar || '',
      videoTrack: localTracks.videoTrack,
      audioTrack: localTracks.audioTrack,
      isAudioMuted: isMuted,
      isVideoMuted: isCameraOff,
    };
  }, [user, localTracks, isMuted, isCameraOff]);

  // Combine all participants: local + remotes (strictly deduplicate against local user)
  const allParticipants = useMemo(() => {
    const localId = String(localParticipant.identity);
    const uniqueRemotes = remoteParticipants.filter(
      (p) => String(p.identity) !== localId && String(p.user?._id || '') !== localId
    );
    return [localParticipant, ...uniqueRemotes];
  }, [localParticipant, remoteParticipants]);

  const participantCount = allParticipants.length;

  // ── Calculate Dynamic Grid Layout ────────────────────────────────────────
  const layout = useMemo(() => {
    return calculateParticipantLayout({
      count: participantCount,
      width: dimensions.width,
      height: dimensions.height,
    });
  }, [participantCount, dimensions.width, dimensions.height]);

  // ── Active Speaker Prioritization & Overflow Partitioning ────────────────
  const { visibleParticipants, overflowParticipants } = useMemo(() => {
    if (!layout.hasOverflow) {
      return { visibleParticipants: allParticipants, overflowParticipants: [] };
    }

    const slots = layout.visibleCount - 1;
    const priority = [];
    const rest = [];

    allParticipants.forEach((p) => {
      const isLocal = p.identity === localParticipant.identity;
      const isSpeaker = p.identity === activeSpeakerId;
      if (isLocal || isSpeaker) {
        priority.push(p);
      } else {
        rest.push(p);
      }
    });

    const combined = [...priority, ...rest];
    return {
      visibleParticipants: combined.slice(0, slots),
      overflowParticipants: combined.slice(slots),
    };
  }, [allParticipants, layout.hasOverflow, layout.visibleCount, localParticipant.identity, activeSpeakerId]);

  const overflowHasSpeaker = useMemo(() => {
    return overflowParticipants.some((p) => p.identity === activeSpeakerId);
  }, [overflowParticipants, activeSpeakerId]);

  // Toggle full screen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isPoorConnection = connectionQuality === 'poor' || connectionStatus === 'poor';
  const isConnectionLost = connectionStatus === 'offline' || connectionStatus === 'lost';

  const connectionColor = isConnectionLost
    ? '#ef4444'
    : connectionStatus === 'reconnecting'
    ? '#f59e0b'
    : isPoorConnection
    ? '#f97316'
    : connectionStatus === 'connected'
    ? '#22c55e'
    : '#9ca3af';

  const connectionLabel = isConnectionLost
    ? 'Connection lost'
    : connectionStatus === 'reconnecting'
    ? 'Reconnecting...'
    : isPoorConnection
    ? 'Poor connection'
    : connectionStatus === 'connected'
    ? 'Connected'
    : outgoingState === 'ringing'
    ? 'Ringing...'
    : 'Connecting...';

  const headerHeight = isLandscapeMobile ? 40 : isMobile ? 50 : 60;
  const footerHeight = isLandscapeMobile ? 54 : isMobile ? 66 : 76;

  return (
    <div
      className="call-room-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: '#0c0e14',
        color: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxHeight: '100dvh',
        width: '100vw',
        maxWidth: '100vw',
        overflow: 'hidden',
        userSelect: 'none',
        paddingLeft: 'max(0px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0px, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* ── Integrated In-Call Notifications ──────────────────────────────── */}
      <NotificationToast
        notifications={callNotifications}
        onDismiss={dismissCallNotification}
      />

      {/* ── 1. TOP AREA: Header & Status Bar ──────────────────────────────── */}
      <header
        style={{
          height: headerHeight,
          minHeight: headerHeight,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 20px',
          paddingTop: 'max(4px, env(safe-area-inset-top, 0px))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#12151e',
          gap: 8,
          zIndex: 10,
        }}
      >
        {/* Left: Call Title & Duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactPhone ? 6 : 10, minWidth: 0 }}>
          <div
            style={{
              width: isCompactPhone ? 26 : 30,
              height: isCompactPhone ? 26 : 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isCompactPhone ? 13 : 15,
              flexShrink: 0,
            }}
          >
            {activeScreenShare ? '🖥️' : currentCall?.callType === 'voice' ? '📞' : '📹'}
          </div>

          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: isCompactPhone ? 13 : isMobile ? 14 : 15,
                fontWeight: 700,
                color: '#fff',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: isMobile ? '35vw' : 'auto',
              }}
            >
              {activeScreenShare
                ? activeScreenShare.isLocal
                  ? 'Presenting Screen'
                  : `${activeScreenShare.participant?.name || 'Screen'} (Presenting)`
                : currentCall?.roomName || 'Meeting Call'}
            </h2>
            <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginTop: 1 }}>
              ⏱️ {formatDuration(callDurationSeconds)}
            </div>
          </div>
        </div>

        {/* Right: Status, Participant Count & Minimize */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactPhone ? 4 : 8 }}>
          {/* Connection Status Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 16,
              background: 'rgba(255, 255, 255, 0.06)',
              fontSize: 11,
              color: isPoorConnection ? '#fdba74' : isConnectionLost ? '#fca5a5' : '#d1d5db',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: connectionColor,
                display: 'inline-block',
                animation: connectionStatus === 'reconnecting' ? 'pulse 1.2s infinite' : 'none',
              }}
            />
            <span>{isMobile && isCompactPhone ? '' : connectionLabel}</span>
          </div>

          {/* Participant Count Button (opens roster) */}
          <button
            type="button"
            onClick={() => setIsRosterOpen(true)}
            title="View participants roster"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: isCompactPhone ? '3px 6px' : '4px 8px',
              borderRadius: 16,
              background: 'rgba(124, 58, 237, 0.18)',
              border: '1px solid rgba(124, 58, 237, 0.35)',
              color: '#c4b5fd',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 30,
            }}
          >
            <span>👥</span>
            <span>{participantCount}</span>
          </button>

          {/* Minimize / Floating PiP Button */}
          <button
            type="button"
            onClick={() => setIsCallMinimized(true)}
            title="Minimize into floating widget"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              color: '#9ca3af',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            🗗
          </button>
        </div>
      </header>

      {/* ── Warning Alert Banner ───────────────────────────────────────────── */}
      {permissionWarning && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fbbf24',
            padding: '6px 12px',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span>⚠️</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {permissionWarning}
          </span>
        </div>
      )}

      {/* ── 2. MAIN AREA: Dynamic Grid, Presentation, or Outgoing Ringing ──── */}
      <main
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          padding: isMobile ? 6 : 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ── Mode 0: Outgoing Calling / Ringing State ───────────────────────── */}
        {(outgoingState === 'calling' || outgoingState === 'ringing') && participantCount <= 1 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 18,
              padding: 24,
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {/* Pulsing Ringing Avatar */}
            <div
              style={{
                position: 'relative',
                width: 90,
                height: 90,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                color: '#fff',
                boxShadow: '0 0 32px rgba(124, 58, 237, 0.55)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: -10,
                  borderRadius: '50%',
                  border: '2px solid rgba(124, 58, 237, 0.45)',
                  animation: 'pulse 1.6s infinite',
                }}
              />
              <span>{currentCall?.callType === 'voice' ? '📞' : '📹'}</span>
            </div>

            <div>
              <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
                {outgoingState === 'ringing' ? 'Ringing...' : 'Calling...'}
              </h2>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
                Waiting for participants in <strong>#{currentCall?.roomName || 'Room'}</strong>
              </p>
            </div>

            {/* Cancel Outgoing Call Button */}
            <button
              type="button"
              onClick={() => {
                leaveCall('Call cancelled');
                onClose?.();
              }}
              style={{
                marginTop: 6,
                background: '#dc2626',
                border: 'none',
                color: '#fff',
                borderRadius: 24,
                padding: '10px 24px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(220, 38, 38, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s ease',
              }}
            >
              <span>✕</span>
              <span>Cancel Call</span>
            </button>
          </div>
        ) : activeScreenShare ? (
          /* ── Mode A: Screen Sharing Presentation Stage ─────────────────────── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.isPortrait ? '1fr' : 'minmax(0, 3.2fr) minmax(160px, 1fr)',
              gridTemplateRows: layout.isPortrait ? 'minmax(0, 2.8fr) minmax(110px, 1fr)' : '1fr',
              gap: 8,
              width: '100%',
              height: '100%',
            }}
          >
            <ScreenShareStage
              screenTrack={activeScreenShare.track}
              presenter={activeScreenShare.participant}
              isLocal={activeScreenShare.isLocal}
              onStopSharing={toggleScreenShare}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: layout.isPortrait ? 'row' : 'column',
                gap: 6,
                overflowX: layout.isPortrait ? 'auto' : 'hidden',
                overflowY: layout.isPortrait ? 'hidden' : 'auto',
                height: '100%',
              }}
            >
              {allParticipants.map((p) => {
                const isPLocal = p.identity === localParticipant.identity;
                return (
                  <div
                    key={p.identity}
                    style={{
                      height: layout.isPortrait ? '100%' : 120,
                      width: layout.isPortrait ? 140 : '100%',
                      flexShrink: 0,
                    }}
                  >
                    <ParticipantTile
                      participant={p}
                      isLocal={isPLocal}
                      isActiveSpeaker={activeSpeakerId === p.identity}
                      isPinned={false}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : pinnedId ? (
          /* ── Mode B: Pinned Participant Stage ────────────────────────────── */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.isPortrait ? '1fr' : 'minmax(0, 3fr) minmax(140px, 1fr)',
              gridTemplateRows: layout.isPortrait ? 'minmax(0, 3fr) minmax(100px, 1fr)' : '1fr',
              gap: 8,
              width: '100%',
              height: '100%',
            }}
          >
            {(() => {
              const pinnedPart = allParticipants.find((p) => p.identity === pinnedId) || localParticipant;
              const isPinnedLocal = pinnedPart.identity === localParticipant.identity;
              return (
                <ParticipantTile
                  participant={pinnedPart}
                  isLocal={isPinnedLocal}
                  isActiveSpeaker={activeSpeakerId === pinnedPart.identity}
                  isPinned={true}
                  onTogglePin={() => handleTogglePin(pinnedPart.identity)}
                />
              );
            })()}

            <div
              style={{
                display: 'flex',
                flexDirection: layout.isPortrait ? 'row' : 'column',
                gap: 6,
                overflowX: layout.isPortrait ? 'auto' : 'hidden',
                overflowY: layout.isPortrait ? 'hidden' : 'auto',
                height: '100%',
              }}
            >
              {allParticipants
                .filter((p) => p.identity !== pinnedId)
                .map((p) => {
                  const isPLocal = p.identity === localParticipant.identity;
                  return (
                    <div
                      key={p.identity}
                      style={{
                        height: layout.isPortrait ? '100%' : 120,
                        width: layout.isPortrait ? 140 : '100%',
                        flexShrink: 0,
                      }}
                    >
                      <ParticipantTile
                        participant={p}
                        isLocal={isPLocal}
                        isActiveSpeaker={activeSpeakerId === p.identity}
                        isPinned={false}
                        onTogglePin={() => handleTogglePin(p.identity)}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          /* ── Mode C: Normal Dynamic Adaptive Grid ────────────────────────── */
          <div style={layout.gridStyle}>
            {visibleParticipants.map((p, index) => {
              const isPLocal = p.identity === localParticipant.identity;
              const customTileStyle = layout.tileStyle ? layout.tileStyle(index) : {};

              return (
                <div key={p.identity} style={customTileStyle}>
                  <ParticipantTile
                    participant={p}
                    isLocal={isPLocal}
                    isActiveSpeaker={activeSpeakerId === p.identity}
                    isPinned={false}
                    onTogglePin={() => handleTogglePin(p.identity)}
                  />
                </div>
              );
            })}

            {layout.hasOverflow && overflowParticipants.length > 0 && (
              <ParticipantOverflowCard
                overflowParticipants={overflowParticipants}
                hasActiveSpeaker={overflowHasSpeaker}
                onClick={() => setIsRosterOpen(true)}
              />
            )}
          </div>
        )}
      </main>

      {/* ── 3. BOTTOM CONTROL BAR: Actions Toolbar ─────────────────────────── */}
      <footer
        style={{
          height: footerHeight,
          minHeight: footerHeight,
          flexShrink: 0,
          background: '#12151e',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isCompactPhone ? 8 : isMobile ? 12 : 14,
          padding: '0 12px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
          maxWidth: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          zIndex: 10,
          position: 'relative',
        }}
      >
        {/* Microphone Toggle */}
        <button
          type="button"
          onClick={toggleMicrophone}
          title={isMuted ? 'Turn on microphone (Unmute)' : 'Turn off microphone (Mute)'}
          style={{
            background: isMuted ? '#ef4444' : '#282d3b',
            border: isMuted ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff',
            borderRadius: '50%',
            width: isLandscapeMobile ? 40 : 48,
            height: isLandscapeMobile ? 40 : 48,
            minWidth: isLandscapeMobile ? 40 : 48,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: isLandscapeMobile ? 16 : 19,
            boxShadow: isMuted ? '0 2px 12px rgba(239, 68, 68, 0.4)' : 'none',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          <span>{isMuted ? '🔇' : '🎤'}</span>
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={toggleCamera}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          style={{
            background: isCameraOff ? '#ef4444' : '#282d3b',
            border: isCameraOff ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff',
            borderRadius: '50%',
            width: isLandscapeMobile ? 40 : 48,
            height: isLandscapeMobile ? 40 : 48,
            minWidth: isLandscapeMobile ? 40 : 48,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: isLandscapeMobile ? 16 : 19,
            boxShadow: isCameraOff ? '0 2px 12px rgba(239, 68, 68, 0.4)' : 'none',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          <span>{isCameraOff ? '🚫' : '📷'}</span>
        </button>

        {/* Camera Flip */}
        {hasMultipleCameras && (
          <button
            type="button"
            onClick={switchCamera}
            title={`Switch to ${currentFacingMode === 'user' ? 'rear' : 'front'} camera`}
            style={{
              background: '#282d3b',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              borderRadius: '50%',
              width: isLandscapeMobile ? 40 : 48,
              height: isLandscapeMobile ? 40 : 48,
              minWidth: isLandscapeMobile ? 40 : 48,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: isLandscapeMobile ? 15 : 18,
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span>🔄</span>
          </button>
        )}

        {/* Desktop Screen Share Toggle */}
        {!isMobile && isScreenShareSupported && (
          <button
            type="button"
            onClick={toggleScreenShare}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
            style={{
              background: isScreenSharing ? 'var(--color-primary, #6366f1)' : '#282d3b',
              border: isScreenSharing ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              borderRadius: '50%',
              width: 48,
              height: 48,
              minWidth: 48,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 18,
              boxShadow: isScreenSharing ? '0 2px 12px rgba(99, 102, 241, 0.45)' : 'none',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span>🖥️</span>
          </button>
        )}

        {/* Participant Roster Toggle Button */}
        <button
          type="button"
          onClick={() => setIsRosterOpen(!isRosterOpen)}
          title={`Participants (${participantCount})`}
          style={{
            background: isRosterOpen ? 'var(--color-primary, #6366f1)' : '#282d3b',
            border: isRosterOpen ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff',
            borderRadius: '50%',
            width: isLandscapeMobile ? 40 : 48,
            height: isLandscapeMobile ? 40 : 48,
            minWidth: isLandscapeMobile ? 40 : 48,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: isLandscapeMobile ? 15 : 17,
            position: 'relative',
            boxShadow: isRosterOpen ? '0 2px 12px rgba(99, 102, 241, 0.4)' : 'none',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          <span>👥</span>
          {participantCount > 1 && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                background: 'var(--color-primary, #6366f1)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                padding: '0 4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #12151e',
              }}
            >
              {participantCount}
            </span>
          )}
        </button>

        {/* Mobile ⋮ More Actions Button */}
        {isMobile && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title="More meeting actions"
              style={{
                background: isMobileMenuOpen ? 'var(--color-primary, #7c3aed)' : '#282d3b',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fff',
                borderRadius: '50%',
                width: isLandscapeMobile ? 40 : 48,
                height: isLandscapeMobile ? 40 : 48,
                minWidth: isLandscapeMobile ? 40 : 48,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 18,
                transition: 'all 0.15s ease',
              }}
            >
              ⋮
            </button>

            {/* Mobile Actions Popover Sheet */}
            {isMobileMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: isLandscapeMobile ? 48 : 56,
                  right: -10,
                  background: '#161922',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 14,
                  padding: 8,
                  minWidth: 180,
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  animation: 'slideUp 0.15s ease-out',
                }}
              >
                {/* Screen share (ONLY if supported) */}
                {isScreenShareSupported && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleScreenShare();
                      setIsMobileMenuOpen(false);
                    }}
                    style={{
                      background: isScreenSharing ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontSize: 13,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      minHeight: 42,
                    }}
                  >
                    <span>🖥️</span>
                    <span>{isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}</span>
                  </button>
                )}

                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={() => {
                    handleToggleFullscreen();
                    setIsMobileMenuOpen(false);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    minHeight: 42,
                  }}
                >
                  <span>{isFullscreen ? '⤦' : '⛶'}</span>
                  <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                </button>

                {/* End for All (Host only) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (window.confirm('End meeting for all participants?')) {
                      endCallForEveryone();
                      onClose?.();
                    }
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: 'none',
                    color: '#f87171',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    minHeight: 42,
                  }}
                >
                  <span>🔴</span>
                  <span>End for All</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Desktop Fullscreen Button */}
        {!isMobile && (
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            style={{
              background: '#282d3b',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              borderRadius: '50%',
              width: 48,
              height: 48,
              minWidth: 48,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span>{isFullscreen ? '⤦' : '⛶'}</span>
          </button>
        )}

        {!isMobile && (
          <div style={{ width: 1, height: 28, background: 'rgba(255, 255, 255, 0.15)', margin: '0 4px' }} />
        )}

        {/* Leave Call (Red Button) */}
        <button
          type="button"
          onClick={() => {
            leaveCall('You left the call');
            onClose?.();
          }}
          title="Leave this meeting"
          style={{
            background: '#dc2626',
            border: 'none',
            color: '#fff',
            borderRadius: isMobile ? '50%' : 24,
            width: isMobile ? (isLandscapeMobile ? 40 : 48) : 'auto',
            height: isLandscapeMobile ? 40 : 48,
            minWidth: isLandscapeMobile ? 40 : 48,
            padding: isMobile ? 0 : '0 20px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: isLandscapeMobile ? 15 : 18,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.45)',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          <span>📞</span>
          {!isMobile && <span style={{ fontSize: 14 }}>Leave Call</span>}
        </button>

        {/* Desktop End for All (Host only) */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to end the meeting for all participants?')) {
                endCallForEveryone();
                onClose?.();
              }
            }}
            title="End meeting for everyone"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              borderRadius: 24,
              height: 48,
              padding: '0 16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <span>🔴</span>
            <span>End for All</span>
          </button>
        )}
      </footer>

      {/* ── 4. Slide-Over Participant Roster Drawer ────────────────────────── */}
      <ParticipantRosterDrawer
        isOpen={isRosterOpen}
        onClose={() => setIsRosterOpen(false)}
        participants={allParticipants}
        activeSpeakerId={activeSpeakerId}
        pinnedId={pinnedId}
        onPinParticipant={(id) => setPinnedId(id)}
      />

      {/* ── 5. Call Ended / Disconnected Full-Screen State ──────────────────── */}
      {(callState === 'ended' || callEndReason) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(12, 14, 20, 0.95)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              color: '#ef4444',
            }}
          >
            📞
          </div>

          <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 700, color: '#fff', margin: 0 }}>
            {callEndReason || 'Call Ended'}
          </h2>

          <p style={{ fontSize: 14, color: '#9ca3af', maxWidth: 320, margin: 0 }}>
            The call session has concluded. Duration: {formatDuration(callDurationSeconds)}
          </p>

          <button
            type="button"
            onClick={() => {
              leaveCall();
              onClose?.();
            }}
            style={{
              marginTop: 12,
              background: 'var(--color-primary, #7c3aed)',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
            }}
          >
            Return to Chat
          </button>
        </div>
      )}
    </div>
  );
}

CallRoom.propTypes = {
  onClose: PropTypes.func,
};
