import { useState, useRef, useEffect } from 'react';
import { animateModalEnter } from '../utils/animations';

const CATEGORIES = [
  { value: 'General', label: '💬 General' },
  { value: 'Tech',    label: '💻 Tech & Code' },
  { value: 'Gaming',  label: '🎮 Gaming' },
  { value: 'Music',   label: '🎵 Music & Arts' },
  { value: 'Random',  label: '✨ Random' },
];

export default function CreateRoomModal({ isOpen, onClose, onCreateRoom }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  useEffect(() => {
    if (isOpen && cardRef.current) {
      animateModalEnter(cardRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Room name is required');
      return;
    }
    onCreateRoom({ name: name.trim(), category, description: description.trim(), isPrivate });
    setName(''); setCategory('General'); setDescription(''); setIsPrivate(false); setError('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" ref={cardRef} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>

        {/* Header */}
        <div className="modal-header">
          <h2 id="create-room-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="11" x2="14" y2="11"/>
            </svg>
            Create New Room
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

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="create-room-name">Room Name</label>
              <input
                id="create-room-name"
                type="text"
                className="form-input"
                placeholder="e.g. React Developers Hangout"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="create-room-category">Category</label>
              <select
                id="create-room-category"
                className="form-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="create-room-desc">Description <span style={{ opacity: 0.5, fontWeight: 400 }}>(Optional)</span></label>
              <textarea
                id="create-room-desc"
                className="form-input"
                rows="3"
                placeholder="What is this room about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Private toggle */}
            <label
              htmlFor="create-room-private"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
              }}
            >
              <input
                id="create-room-private"
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>Private Room</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Requires Room Code to join</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 18 }}>🔒</span>
            </label>

          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Room
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
