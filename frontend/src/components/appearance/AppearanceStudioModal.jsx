import { useState } from 'react';
import PropTypes from 'prop-types';
import { useAppearance } from '../../context/AppearanceContext';
import { VISUAL_EFFECTS } from '../../config/appearanceConfig';
import ThemeGallery from './ThemeGallery';
import WallpaperEditor from './WallpaperEditor';
import AnimationControls from './AnimationControls';
import SoundControls from './SoundControls';
import SavedThemesManager from './SavedThemesManager';
import ThemeShareModal from './ThemeShareModal';
import AppearanceLivePreview from './AppearanceLivePreview';
import '../../styles/gajim/gajim-provided.css';

const TABS = [
  { id: 'themes',     label: 'Themes',     icon: '🎨' },
  { id: 'wallpapers', label: 'Wallpapers', icon: '🖼' },
  { id: 'effects',    label: 'Effects',    icon: '✨' },
  { id: 'animations', label: 'Animations', icon: '⚡' },
  { id: 'sounds',     label: 'Sounds',     icon: '🔊' },
  { id: 'saved',      label: 'Saved',      icon: '💾' },
];

export default function AppearanceStudioModal({ isOpen, onClose, targetRoomId, roomName }) {
  const { appearanceState, setActiveEffect, resetAppearance } = useAppearance();
  const [activeTab, setActiveTab] = useState('themes');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [mobileView, setMobileView] = useState('controls'); // 'controls' | 'preview'

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="appearance-studio-backdrop"
        onClick={onClose}
      >
        {/* Modal Card */}
        <div
          className="appearance-studio-modal modal-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="studio-modal-header">
            <div className="studio-header-left">
              <button className="back-btn" onClick={onClose} aria-label="Back" title="Back" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
              </button>
              <div className="studio-header-titles">
                <div className="studio-header-title">✨ Appearance Studio</div>
                <div className="studio-header-subtitle">
                  Personalize themes, wallpapers, effects &amp; sounds
                </div>
              </div>
            </div>

            {/* Desktop Actions */}
            <div className="studio-desktop-header-actions">
              <button
                onClick={() => setShowShareModal(true)}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                📤 Share
              </button>
              <button
                onClick={resetAppearance}
                className="btn btn-secondary"
                title="Reset to Default"
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                🔄 Reset
              </button>
              <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Mobile Actions (Kebab Menu + Close) */}
            <div className="studio-mobile-kebab-btn" style={{ position: 'relative' }}>
              <button
                className="btn-icon"
                onClick={() => setShowKebabMenu((prev) => !prev)}
                aria-label="More options"
                title="More options"
                type="button"
                style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #1a1d25)', border: '1px solid var(--border, #2a2f3d)', borderRadius: 8 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="12" cy="19" r="2.2" />
                </svg>
              </button>
              {showKebabMenu && (
                <div className="studio-kebab-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setShowShareModal(true); setShowKebabMenu(false); }}
                    style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'left', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span>📤</span> Share Theme
                  </button>
                  <button
                    onClick={() => { resetAppearance(); setShowKebabMenu(false); }}
                    style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', color: 'var(--text-main)', textAlign: 'left', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span>🔄</span> Reset to Default
                  </button>
                </div>
              )}
              <button
                className="btn-icon"
                onClick={onClose}
                aria-label="Close"
                type="button"
                style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #1a1d25)', border: '1px solid var(--border, #2a2f3d)', borderRadius: 8 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Mobile View Switcher (Controls vs Live Preview) ── */}
          <div className="studio-mobile-view-switcher">
            <button
              type="button"
              className={`studio-view-switch-btn ${mobileView === 'controls' ? 'active' : ''}`}
              onClick={() => setMobileView('controls')}
            >
              <span>🎛️ Customize Controls</span>
            </button>
            <button
              type="button"
              className={`studio-view-switch-btn ${mobileView === 'preview' ? 'active' : ''}`}
              onClick={() => setMobileView('preview')}
            >
              <span>👁️ Live Preview</span>
              <span className="live-pulse-dot" />
            </button>
          </div>

          {/* ── Category / Tool Tabs (Dedicated Non-circular Tabs Strip) ── */}
          <div className={`studio-tab-strip ${mobileView === 'preview' ? 'mobile-hidden' : ''}`}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`studio-category-tab ${activeTab === tab.id ? 'active' : ''}`}
                type="button"
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Main Content (Desktop: Split View / Mobile: Switchable Clean View) ── */}
          <div className="studio-content-layout">

            {/* Controls pane (Visible on desktop, or when mobileView === 'controls') */}
            <div className={`studio-controls-pane scrollzone ${mobileView === 'preview' ? 'mobile-hidden' : ''}`}>
              {activeTab === 'themes'     && <ThemeGallery />}
              {activeTab === 'wallpapers' && <WallpaperEditor />}
              {activeTab === 'effects'    && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                  {VISUAL_EFFECTS.map((eff) => (
                    <button
                      key={eff.id}
                      onClick={() => setActiveEffect(eff.id)}
                      style={{
                        padding: '12px 8px',
                        borderRadius: 10,
                        background: 'var(--bg-input)',
                        border: appearanceState.activeEffectId === eff.id
                          ? '2px solid var(--color-primary)'
                          : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 6, textAlign: 'center', minHeight: 70,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{eff.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{eff.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {activeTab === 'animations' && <AnimationControls />}
              {activeTab === 'sounds'     && <SoundControls />}
              {activeTab === 'saved'      && <SavedThemesManager />}

              {/* Jump to Live Preview Banner for Mobile */}
              <div
                className="studio-preview-jump-banner"
                onClick={() => setMobileView('preview')}
                role="button"
                tabIndex={0}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>👁️</span>
                  <span>View Full Chat Live Preview</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Preview →</span>
              </div>
            </div>

            {/* Live Preview pane (Visible on desktop, or when mobileView === 'preview') */}
            <div className={`studio-preview-pane ${mobileView === 'controls' ? 'mobile-hidden' : ''}`}>
              <div className="studio-preview-header">
                <span>👁️ Live Chat Preview</span>
                <button
                  type="button"
                  onClick={() => setMobileView('controls')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-primary, #a855f7)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  ✏️ Edit Controls
                </button>
              </div>
              <AppearanceLivePreview targetRoomId={targetRoomId} roomName={roomName} />
            </div>
          </div>

          {/* ── Mobile Sticky Footer ───────────────────────────────── */}
          <div className="studio-mobile-footer">
            <button
              className="btn btn-primary"
              style={{ width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={onClose}
            >
              ✓ Save / Apply Theme
            </button>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <ThemeShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />
    </>
  );
}

AppearanceStudioModal.propTypes = {
  isOpen:       PropTypes.bool.isRequired,
  onClose:      PropTypes.func.isRequired,
  targetRoomId: PropTypes.string,
  roomName:     PropTypes.string,
};
