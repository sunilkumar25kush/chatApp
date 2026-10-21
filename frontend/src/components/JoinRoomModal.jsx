import { useState, useEffect, useRef } from 'react';
import { animateModalEnter } from '../utils/animations';

export default function JoinRoomModal({ isOpen, onClose, onJoinRoom, roomName }) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  // Auto-format: uppercase + remove spaces
  useEffect(() => {
    setRoomCode((prev) => prev.toUpperCase().replace(/\s+/g, ''));
  }, [roomCode]);

  useEffect(() => {
    if (isOpen && cardRef.current) {
      animateModalEnter(cardRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = roomCode.trim();
    if (!code) {
      setError('Please enter a valid Room Code or ID');
      return;
    }
    // Validate format: ROOM-XXXX or alphanumeric 4-12 chars
    if (!/^ROOM-[A-Z0-9]{4}$/.test(code) && !/^[A-Z0-9]{4,12}$/.test(code)) {
      setError('Invalid format. Use ROOM-XXXX or custom code (4-12 chars)');
      return;
    }
    onJoinRoom(code);
    setRoomCode('');
    setError('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" ref={cardRef} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>

        {/* Header */}
        <div className="modal-header">
          <h2 id="join-room-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Join a Room
          </h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {error && (
              <div className="auth-error-alert" role="alert" style={{ marginBottom: 0 }}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-error)', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Hint banner */}
            <div style={{
              background: 'var(--color-primary-alpha)',
              border: '1px solid rgba(124,58,237,0.25)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: 'var(--text-muted)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              {roomName
                ? `"${roomName}" is a private room. Enter its code below to join.`
                : 'Ask the room owner to share their Room Code or paste it below.'}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="join-room-code">Room Code / ID</label>
              <input
                id="join-room-code"
                type="text"
                className="form-input"
                placeholder="e.g. ROOM-7892 or tech-lounge"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}
              />
            </div>

          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Join Room
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
