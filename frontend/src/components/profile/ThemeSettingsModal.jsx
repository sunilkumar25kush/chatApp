import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import '../../styles/gajim/gajim-provided.css';

const THEME_PRESETS = [
  {
    id: 'galaxy',
    name: 'Galaxy Dark',
    primary: '#8b5cf6',
    chatBg: '#090a16',
    sidebarBg: '#0f1026',
    inBg: 'rgba(30, 27, 75, 0.85)',
    outBg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    isLight: false,
  },
  {
    id: 'cream-citrus',
    name: 'Cream & Citrus',
    primary: '#F0882C',
    chatBg: '#F7F1E3',
    sidebarBg: '#ECEAC9',
    inBg: '#ECEAC9',
    outBg: 'linear-gradient(135deg, #F0882C 0%, #D9721A 100%)',
    isLight: true,
  },
];

export default function ThemeSettingsModal({ onClose }) {
  const { theme, updateTheme, resetTheme, mode, setMode } = useTheme();
  const [localTheme, setLocalTheme] = useState(theme);

  const MODES = [
    { id: 'dark', label: '🌙', name: 'Galaxy (Dark)' },
    { id: 'light', label: '🍊', name: 'Cream & Citrus (Light)' },
  ];

  const handleApplyPreset = (preset) => {
    const newTheme = {
      preset: preset.id,
      primaryColor: preset.primary,
      chatBg: preset.chatBg,
      sidebarBg: preset.sidebarBg,
      msgIncomingBg: preset.inBg,
      msgOutgoingBg: preset.outBg,
    };
    setLocalTheme({ ...localTheme, ...newTheme });
    updateTheme(newTheme);
    const nextMode = preset.isLight ? 'light' : 'dark';
    setMode(nextMode);
    const nextThemeId = preset.isLight ? 'cream-citrus' : 'galaxy';
    try {
      const savedAppearance = localStorage.getItem('appearance_studio_v2');
      const parsed = savedAppearance ? JSON.parse(savedAppearance) : {};
      localStorage.setItem('appearance_studio_v2', JSON.stringify({
        ...parsed,
        activeThemeId: nextThemeId,
        activeEffectId: preset.isLight ? 'none' : 'stars',
      }));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { themeId: nextThemeId, mode: nextMode } }));
  };

  const handleColorChange = (key, val) => {
    const updated = { ...localTheme, [key]: val, preset: 'custom' };
    setLocalTheme(updated);
    updateTheme(updated);
  };

  return (
    <div
      className="modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header">
          <h2 id="settings-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎨</span> Theme Settings
          </h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close Settings">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Color Mode (Dark / Light / System) */}
          <section>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Mode
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    const matchingPreset = THEME_PRESETS.find(p => m.id === 'light' ? p.isLight : !p.isLight);
                    if (matchingPreset) handleApplyPreset(matchingPreset);
                  }}
                  aria-pressed={mode === m.id}
                  style={{
                    padding: '12px 10px',
                    minHeight: 56,
                    borderRadius: 12,
                    border: `2px solid ${mode === m.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    background: mode === m.id ? 'var(--primary-light)' : 'var(--bg-input)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{m.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>{m.name}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {mode === 'light'
                ? 'Cream & Citrus light theme (WCAG AAA contrast).'
                : 'Galaxy Dark cosmic theme.'}
            </p>
          </section>

          {/* Presets */}
          <section>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Presets
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10 }}>
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  style={{
                    padding: '10px 8px',
                    minHeight: 64,
                    borderRadius: 10,
                    border: `2px solid ${localTheme.preset === p.id ? p.primary : 'var(--border-color)'}`,
                    background: p.sidebarBg && p.sidebarBg !== 'transparent' ? p.sidebarBg : 'var(--bg-input)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.primary, display: 'block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.2 }}>{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Custom Colors */}
          <section>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Custom Colors
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ColorRow label="Primary Accent"    value={localTheme.primaryColor}  onChange={(v) => handleColorChange('primaryColor', v)} />
              <ColorRow label="Incoming Bubble"   value={localTheme.msgIncomingBg} onChange={(v) => handleColorChange('msgIncomingBg', v)} />
              <ColorRow label="Outgoing Bubble"   value={localTheme.msgOutgoingBg} onChange={(v) => handleColorChange('msgOutgoingBg', v)} />
              <ColorRow label="Chat Background"   value={localTheme.chatBg}        onChange={(v) => handleColorChange('chatBg', v)} />
              <ColorRow label="Sidebar Background" value={localTheme.sidebarBg}   onChange={(v) => handleColorChange('sidebarBg', v)} />
            </div>
          </section>

          {/* Shapes & Fonts */}
          <section>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Shapes &amp; Fonts
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="info-item" style={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', padding: '10px 14px' }}>
                <span style={{ fontSize: 13, color: 'var(--text-main)' }}>Bubble Radius</span>
                <select
                  value={localTheme.borderRadius}
                  onChange={(e) => handleColorChange('borderRadius', e.target.value)}
                  className="form-control"
                  style={{ width: 'auto', minHeight: 38, height: 38, padding: '0 10px', fontSize: 13, borderRadius: 8 }}
                >
                  <option value="4px">Square (4px)</option>
                  <option value="12px">Rounded (12px)</option>
                  <option value="24px">Pill (24px)</option>
                </select>
              </div>
              <div className="info-item" style={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', padding: '10px 14px' }}>
                <span style={{ fontSize: 13, color: 'var(--text-main)' }}>Font Family</span>
                <select
                  value={localTheme.fontFamily}
                  onChange={(e) => handleColorChange('fontFamily', e.target.value)}
                  className="form-control"
                  style={{ width: 'auto', minHeight: 38, height: 38, padding: '0 10px', fontSize: 13, borderRadius: 8 }}
                >
                  <option value="Inter">Inter (Default)</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Comic Sans MS">Comic Sans (Fun)</option>
                  <option value="monospace">Monospace (Hacker)</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => { resetTheme(); setLocalTheme(theme); }}
          >
            🔄 Reset to Default
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div className="info-item" style={{ borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', padding: '10px 14px' }}>
      <span style={{ fontSize: 13, color: 'var(--text-main)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 30, height: 30, padding: 2, border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
        />
      </div>
    </div>
  );
}
