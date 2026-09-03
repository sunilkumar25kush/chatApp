import PropTypes from 'prop-types';

export default function ParticipantOverflowCard({
  overflowParticipants = [],
  onClick = null,
  hasActiveSpeaker = false,
}) {
  const count = overflowParticipants.length;

  return (
    <div
      onClick={onClick}
      className={`call-overflow-card ${hasActiveSpeaker ? 'call-participant-tile--speaking' : ''}`}
      role="button"
      tabIndex={0}
      title="Click to view all participants in side roster"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        background: '#161922',
        border: hasActiveSpeaker ? '2px solid #22c55e' : '1px dashed rgba(255, 255, 255, 0.2)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 16,
        cursor: 'pointer',
        boxShadow: hasActiveSpeaker ? '0 0 20px rgba(34, 197, 94, 0.35)' : '0 4px 16px rgba(0, 0, 0, 0.4)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Stack of Mini Avatars */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {overflowParticipants.slice(0, 3).map((p, idx) => {
          const initials = p.name ? p.name.substring(0, 1).toUpperCase() : 'U';
          return (
            <div
              key={p.identity || idx}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                border: '2px solid #161922',
                marginLeft: idx > 0 ? -12 : 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                overflow: 'hidden',
                zIndex: 3 - idx,
              }}
            >
              {p.avatar ? (
                <img
                  src={p.avatar}
                  alt={p.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>
          );
        })}
      </div>

      {/* Count and Label */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(14px, 3vw, 18px)', fontWeight: 700, color: '#fff' }}>
          +{count} more
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
          {hasActiveSpeaker ? '🎙️ Participant speaking' : 'Click to view roster'}
        </div>
      </div>
    </div>
  );
}

ParticipantOverflowCard.propTypes = {
  overflowParticipants: PropTypes.array,
  onClick: PropTypes.func,
  hasActiveSpeaker: PropTypes.bool,
};
