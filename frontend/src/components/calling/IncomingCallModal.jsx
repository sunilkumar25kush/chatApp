import { useCall } from '../../context/CallContext';

export default function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useCall();

  if (!incomingCall) return null;

  const { roomName, callType, caller } = incomingCall;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3500,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#161922',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 18,
          padding: 24,
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Ringing Avatar with Glow */}
        <div
          style={{
            position: 'relative',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            color: '#fff',
            boxShadow: '0 0 24px rgba(124, 58, 237, 0.5)',
            overflow: 'hidden',
          }}
        >
          {caller?.avatar ? (
            <img
              src={caller.avatar}
              alt={caller.username}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span>{callType === 'voice' ? '📞' : '📹'}</span>
          )}
        </div>

        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 4 }}>
          Incoming {callType === 'voice' ? 'Voice' : 'Video'} Meeting
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
          {caller?.username || 'Team Member'}
        </h3>

        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>
          Calling in <strong>#{roomName || 'Conversation'}</strong>
        </p>

        {/* Action Buttons: Accept & Decline */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={acceptIncomingCall}
            style={{
              flex: 1,
              background: '#22c55e',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
              transition: 'transform 0.1s ease',
            }}
          >
            <span>📞</span>
            <span>Join Call</span>
          </button>

          <button
            type="button"
            onClick={declineIncomingCall}
            style={{
              flex: 1,
              background: '#ef4444',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
              transition: 'transform 0.1s ease',
            }}
          >
            <span>✕</span>
            <span>Decline</span>
          </button>
        </div>
      </div>
    </div>
  );
}
