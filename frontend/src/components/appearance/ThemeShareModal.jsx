import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAppearance } from '../../context/AppearanceContext';
import { exportThemeToJSON, parseThemeJSON, generateThemeShareLink, drawQRCodeOnCanvas } from '../../utils/themeShareUtils';

export default function ThemeShareModal({ isOpen, onClose }) {
  const { appearanceState, setActiveTheme, setActiveEffect, setGlobalWallpaper, updateControls } = useAppearance();
  const [importJson, setImportJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState('');
  const qrCanvasRef = useRef(null);

  const themeJson = exportThemeToJSON(appearanceState);
  const shareLink = generateThemeShareLink(appearanceState);

  useEffect(() => {
    if (isOpen && qrCanvasRef.current) {
      drawQRCodeOnCanvas(qrCanvasRef.current, shareLink);
    }
  }, [isOpen, shareLink]);

  if (!isOpen) return null;

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(themeJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = (e) => {
    e.preventDefault();
    setImportError('');
    const parsed = parseThemeJSON(importJson);
    if (!parsed) {
      setImportError('Invalid Theme JSON string!');
      return;
    }

    setActiveTheme(parsed.activeThemeId);
    if (parsed.activeEffectId) setActiveEffect(parsed.activeEffectId);
    if (parsed.globalWallpaperUrl) setGlobalWallpaper(parsed.globalWallpaperUrl);
    if (parsed.controls) updateControls(parsed.controls);

    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'calc(var(--z-drawer) + 10)',
        padding: 'clamp(12px, 3vw, var(--space-lg))',
        overscrollBehavior: 'contain',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-dark)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(16px, 4vw, 24px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-md)',
          boxShadow: 'var(--shadow-xl)',
          maxHeight: '88dvh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--color-white)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📤</span> Export &amp; Import Theme
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-faint)', fontSize: 18, cursor: 'pointer' }}>
            &times;
          </button>
        </div>

        {/* QR Code Section */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-md)', background: 'var(--color-bg-surface)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-bg-elevated)' }}>
          <canvas ref={qrCanvasRef} style={{ width: 90, height: 90, borderRadius: 'var(--radius-sm)', flexShrink: 0, margin: '0 auto' }} />
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--color-text-bright)' }}>Scan QR Code</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-faint)', marginTop: 2 }}>
              Share this theme visually with another mobile or desktop user.
            </div>
            <button
              onClick={handleCopyJSON}
              style={{
                marginTop: 8,
                background: 'var(--theme-primary)',
                color: 'var(--color-white)',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                padding: 'var(--space-2xs) var(--space-md)',
                fontSize: 'var(--font-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copied Theme JSON!' : 'Copy Theme JSON'}
            </button>
          </div>
        </div>

        {/* Import Section */}
        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <div style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--color-text-soft)' }}>Import Theme JSON</div>
          <textarea
            rows={3}
            placeholder="Paste theme JSON payload string here..."
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--color-bg-window)',
              border: '1px solid var(--color-border-dark)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-sm)',
              color: 'var(--color-green-bright)',
              fontFamily: 'monospace',
              fontSize: 'var(--font-xs)',
              outline: 'none',
            }}
          />
          {importError && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-error)' }}>{importError}</div>}

          <button
            type="submit"
            style={{
              background: 'var(--color-success)',
              color: 'var(--color-white)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-sm)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📥 Import &amp; Apply Theme
          </button>
        </form>
      </div>
    </div>
  );
}

ThemeShareModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
