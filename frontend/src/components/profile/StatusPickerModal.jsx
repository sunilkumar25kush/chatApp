import { useState } from 'react';
import { socket } from '../../services/socket';
import { useAuth } from '../../context/useAuth';

const STATUS_PRESETS = [
  { emoji: '😀', text: 'Happy' },
  { emoji: '💻', text: 'Coding' },
  { emoji: '🎮', text: 'Gaming' },
  { emoji: '🍔', text: 'Lunch' },
  { emoji: '😴', text: 'Sleeping' },
  { emoji: '📚', text: 'Studying' },
  { emoji: '✈️', text: 'Traveling' },
];

const DURATIONS = [
  { label: 'Don\'t clear', value: null },
  { label: '1 Hour', value: 60 * 60 * 1000 },
  { label: '4 Hours', value: 4 * 60 * 60 * 1000 },
  { label: 'Today', value: 24 * 60 * 60 * 1000 },
];

export default function StatusPickerModal({ onClose }) {
  const { user, updateLocalUser } = useAuth();
  
  const [selectedEmoji, setSelectedEmoji] = useState(user?.customStatus?.emoji || '💬');
  const [customText, setCustomText] = useState(user?.customStatus?.text || '');
  const [duration, setDuration] = useState(DURATIONS[0].value);

  const handleSave = () => {
    let expiresAt = null;
    if (duration) {
      expiresAt = new Date(Date.now() + duration).toISOString();
    }

    const statusData = {
      emoji: selectedEmoji,
      text: customText.trim(),
      expiresAt
    };

    // Update locally instantly
    updateLocalUser({ ...user, customStatus: statusData });

    // Emit to server
    socket.emit('update_status', statusData);

    onClose();
  };

  const handleClear = () => {
    const statusData = { emoji: '', text: '', expiresAt: null };
    updateLocalUser({ ...user, customStatus: statusData });
    socket.emit('update_status', statusData);
    onClose();
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #282c37', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#f3f4f6', fontWeight: 700 }}>Set a custom status</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            type="button"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#9ca3af',
              width: 38,
              height: 38,
              minWidth: 38,
              minHeight: 38,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
        
        <div style={{ padding: 20 }}>
          {/* Input Area */}
          <div style={{ display: 'flex', gap: 10, background: '#111216', padding: 10, borderRadius: 8, border: '1px solid #282c37', alignItems: 'center' }}>
            <div style={{ fontSize: 24, lineHeight: 1 }}>{selectedEmoji}</div>
            <input 
              type="text" 
              placeholder="What's on your mind?"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 14, outline: 'none' }}
              maxLength={100}
            />
            {customText && (
              <button onClick={() => setCustomText('')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            )}
          </div>

          {/* Presets (Wrapping Chips) */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Presets</div>
            <div className="ui-chip-group" style={{ gap: 8 }}>
              {STATUS_PRESETS.map((preset) => {
                const isSelected = selectedEmoji === preset.emoji && customText === preset.text;
                return (
                  <button 
                    key={preset.text}
                    type="button"
                    onClick={() => { setSelectedEmoji(preset.emoji); setCustomText(preset.text); }}
                    className={`ui-chip ${isSelected ? 'active' : ''}`}
                    style={{ flex: '1 1 calc(50% - 8px)', minWidth: 120, minHeight: 40, padding: '10px 14px', fontSize: 13 }}
                  >
                    <span style={{ fontSize: 16 }}>{preset.emoji}</span>
                    <span>{preset.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration Picker */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Clear After</div>
            <select 
              value={duration === null ? '' : duration} 
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
              className="form-control"
              style={{ width: '100%', padding: '0 12px', borderRadius: 8, background: '#111216', border: '1px solid #282c37', color: '#e5e7eb', outline: 'none', minHeight: 42 }}
            >
              {DURATIONS.map(d => (
                <option key={d.label} value={d.value === null ? '' : d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer (Stacked Buttons on Mobile) */}
        <div className="modal-footer" style={{ padding: '14px 16px', background: '#181a20', borderTop: '1px solid #282c37', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          <button type="button" onClick={handleClear} className="btn btn-secondary" style={{ color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)', minHeight: 44 }}>
            Clear Status
          </button>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ minHeight: 44 }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={!customText.trim()} className="btn btn-primary" style={{ opacity: !customText.trim() ? 0.5 : 1, minHeight: 44 }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 'clamp(8px, 3vw, 20px)'
};
const modalStyle = {
  width: '100%', maxWidth: 450, background: '#1c1f28', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', position: 'relative', maxHeight: '90vh', overflowY: 'auto'
};
