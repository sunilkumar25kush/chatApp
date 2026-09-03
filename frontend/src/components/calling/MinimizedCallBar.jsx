import { useCall } from '../../context/CallContext';

export default function MinimizedCallBar() {
  const {
    currentCall,
    callDurationSeconds,
    formatDuration,
    remoteParticipants,
    isMuted,
    isCameraOff,
    toggleMicrophone,
    toggleCamera,
    leaveCall,
    setIsCallMinimized,
  } = useCall();

  const totalParticipants = remoteParticipants.length + 1;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        right: 'max(12px, env(safe-area-inset-right, 0px))',
        zIndex: 2800,
        background: '#161922',
        border: '1px solid rgba(124, 58, 237, 0.4)',
        borderRadius: 14,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
        maxWidth: 'calc(100vw - 24px)',
        animation: 'slideUp 0.2s ease-out',
      }}
    >
      {/* Mini Call Info */}
      <div
        onClick={() => setIsCallMinimized(false)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
        title="Click to maximize call window"
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#22c55e',
            animation: 'pulse 1.5s infinite',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentCall?.roomName || 'Meeting Call'}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
            ⏱️ {formatDuration(callDurationSeconds)} • 👥 {totalParticipants}
          </div>
        </div>
      </div>

      {/* Mini Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={toggleMicrophone}
          title={isMuted ? 'Unmute' : 'Mute'}
          style={{
            background: isMuted ? '#ef4444' : '#282d3b',
            border: 'none',
            color: '#fff',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={toggleCamera}
          title={isCameraOff ? 'Start video' : 'Stop video'}
          style={{
            background: isCameraOff ? '#ef4444' : '#282d3b',
            border: 'none',
            color: '#fff',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {isCameraOff ? '🚫' : '📷'}
        </button>

        {/* Maximize Button */}
        <button
          type="button"
          onClick={() => setIsCallMinimized(false)}
          title="Maximize meeting"
          style={{
            background: 'var(--color-primary, #7c3aed)',
            border: 'none',
            color: '#fff',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ⤢
        </button>

        {/* Leave Call */}
        <button
          type="button"
          onClick={leaveCall}
          title="Leave call"
          style={{
            background: '#dc2626',
            border: 'none',
            color: '#fff',
            borderRadius: 8,
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
