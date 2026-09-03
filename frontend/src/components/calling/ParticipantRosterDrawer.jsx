import { useState } from 'react';
import PropTypes from 'prop-types';

export default function ParticipantRosterDrawer({
  isOpen = false,
  onClose = null,
  participants = [],
  activeSpeakerId = null,
  pinnedId = null,
  onPinParticipant = null,
}) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = participants.filter((p) =>
    (p.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside
      className="call-roster-drawer"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(360px, 92vw)',
        background: '#161922',
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        zIndex: 3200,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
        animation: 'slideLeft 0.2s ease-out',
        paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 54,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
            Participants ({participants.length})
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Close roster"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {/* Search Input */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search participants..."
          style={{
            width: '100%',
            background: '#1f2430',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Participants List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {filtered.map((p) => {
          const isSpeaking = activeSpeakerId === p.identity;
          const isPinned = pinnedId === p.identity;
          const initials = p.name ? p.name.substring(0, 1).toUpperCase() : 'U';

          return (
            <div
              key={p.identity}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                gap: 12,
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                background: isSpeaking ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
              }}
            >
              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    overflow: 'hidden',
                    border: isSpeaking ? '2px solid #22c55e' : 'none',
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

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSpeaking ? '#22c55e' : '#f3f4f6',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {isSpeaking ? 'Speaking now...' : p.isAudioMuted ? 'Muted' : 'Microphone on'}
                  </div>
                </div>
              </div>

              {/* Status Icons & Pin Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Mic Status */}
                <span
                  title={p.isAudioMuted ? 'Microphone muted' : 'Microphone active'}
                  style={{
                    color: p.isAudioMuted ? '#ef4444' : isSpeaking ? '#22c55e' : '#9ca3af',
                    fontSize: 14,
                  }}
                >
                  {p.isAudioMuted ? '🔇' : '🎤'}
                </span>

                {/* Video Status */}
                <span
                  title={p.isVideoMuted ? 'Camera off' : 'Camera on'}
                  style={{
                    color: p.isVideoMuted ? '#ef4444' : '#9ca3af',
                    fontSize: 14,
                  }}
                >
                  {p.isVideoMuted ? '🚫' : '📹'}
                </span>

                {/* Pin Button */}
                {onPinParticipant && (
                  <button
                    type="button"
                    onClick={() => onPinParticipant(isPinned ? null : p.identity)}
                    title={isPinned ? 'Unpin participant' : 'Pin to stage'}
                    style={{
                      background: isPinned ? 'var(--color-primary, #7c3aed)' : '#282d3b',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 6,
                      width: 26,
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    📌
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

ParticipantRosterDrawer.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  participants: PropTypes.array,
  activeSpeakerId: PropTypes.string,
  pinnedId: PropTypes.string,
  onPinParticipant: PropTypes.func,
};
