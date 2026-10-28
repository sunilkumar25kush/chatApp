import { useState } from 'react';

export default function RoomCard({ room, onSelectRoom }) {
  const [showCode, setShowCode] = useState(false);

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Tech': return '💻';
      case 'Gaming': return '🎮';
      case 'Music': return '🎵';
      case 'Random': return '✨';
      default: return '💬';
    }
  };

  return (
    <div className="room-card" onClick={() => onSelectRoom(room)}>
      <div className="room-card-header">
        <span className="room-category-pill">
          {getCategoryIcon(room.category)} {room.category || 'General'}
        </span>
        {room.isPrivate && (
          <span className="roster-badge roster-badge-private" style={{ marginLeft: 6 }}>
            🔒 Private
          </span>
        )}
        {room.code && (
          showCode ? (
            <span
              className="room-code-badge"
              title="Click to hide"
              onClick={(e) => {
                e.stopPropagation();
                setShowCode(false);
              }}
              style={{ cursor: 'pointer' }}
            >
              {room.code} ✕
            </span>
          ) : (
            <button
              type="button"
              className="room-code-badge"
              title="Click to view Room ID"
              onClick={(e) => {
                e.stopPropagation();
                setShowCode(true);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              👁️ Show Room ID
            </button>
          )
        )}
      </div>

      <h3 className="room-title">{room.name}</h3>
      <p className="room-description">
        {room.description || 'Welcome to this chat room. Connect with members in real-time.'}
      </p>

      <div className="room-card-footer">
        <span className="room-members-count">
          👥 {room.membersCount || (room.members ? room.members.length : 1)} {room.membersCount === 1 ? 'member' : 'members'}
        </span>
        <button
          className="btn-enter-room"
          onClick={(e) => {
            e.stopPropagation();
            onSelectRoom(room);
          }}
        >
          Enter Room &rarr;
        </button>
      </div>
    </div>
  );
}
