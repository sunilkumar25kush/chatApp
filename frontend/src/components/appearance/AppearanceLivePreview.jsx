
import PropTypes from 'prop-types';
import { useAppearance } from '../../context/AppearanceContext';
import WallpaperEffectsLayer from './WallpaperEffectsLayer';

export default function AppearanceLivePreview({ targetRoomId, roomName }) {
  const { appearanceState, getActiveWallpaperForRoom } = useAppearance();

  const activeWallpaper = getActiveWallpaperForRoom(targetRoomId);
  const controls = appearanceState.controls || {};

  return (
    <div
      className="appearance-live-preview-box"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        height: '100%',
        background: 'var(--theme-chat-bg)',
        borderRadius: 'var(--theme-radius, 14px)',
        border: '1px solid #2d3241',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        boxSizing: 'border-box',
      }}
    >
      {/* Dynamic Wallpaper Background Layer (z-index 0) */}
      {activeWallpaper && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url(${activeWallpaper})`,
            backgroundSize: controls.fitMode === 'contain' ? 'contain' : controls.fitMode === 'fill' ? '100% 100%' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: controls.opacity ?? 0.85,
            filter: `blur(${controls.blur || 0}px) brightness(${controls.brightness || 100}%) contrast(${controls.contrast || 100}%) saturate(${controls.saturation || 100}%)`,
            transform: `scale(${(controls.scale || 100) / 100})`,
            transformOrigin: 'center center',
            transition: 'all 0.15s ease',
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
          }}
        />
      )}

      {/* GPU Animated Visual Effects Layer (z-index 1) */}
      <WallpaperEffectsLayer />

      {/* Dynamic Overlay Layer (z-index 2) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          backgroundColor: controls.overlayColor || '#000000',
          opacity: controls.overlayOpacity ?? 0.2,
          pointerEvents: 'none',
          zIndex: 2,
          overflow: 'hidden',
        }}
      />

      {/* Mock Header (z-index 4) */}
      <div
        style={{
          height: 42,
          minHeight: 42,
          padding: '0 12px',
          background: 'var(--theme-header-bg)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
          zIndex: 4,
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: 26, height: 26, minWidth: 26, borderRadius: '50%', background: 'var(--theme-primary, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
          {roomName ? roomName.substring(0, 2).toUpperCase() : 'AS'}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--theme-header-text, #f3f4f6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {roomName || 'Live Appearance Preview'}
        </div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} title="Live Preview" />
      </div>

      {/* Mock Messages Feed (z-index 3) */}
      <div
        className="scrollzone"
        style={{
          flex: 1,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          position: 'relative',
          zIndex: 3,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
          boxSizing: 'border-box',
        }}
      >
        {/* Incoming Message */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: '85%', minWidth: 0 }}>
          <div style={{ width: 24, height: 24, minWidth: 24, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            AL
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--link-color, #60a5fa)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Alex</span>
              <span style={{ fontSize: 9, color: 'var(--timestamp-color, #9ca3af)', flexShrink: 0 }}>10:42 AM</span>
            </div>
            <div
              className="msg-bubble msg-bubble-in"
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                padding: '7px 11px',
                borderRadius: 'var(--theme-radius, 10px)',
                color: 'var(--bubble-text-in, var(--text-primary))',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              Hey! Check out this new custom theme setup 🎨✨
            </div>
          </div>
        </div>

        {/* Outgoing Message */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '85%', minWidth: 0, marginLeft: 'auto' }}>
          <span style={{ fontSize: 9, color: 'var(--timestamp-color, #9ca3af)', marginBottom: 2 }}>10:43 AM</span>
          <div
            className="msg-bubble msg-bubble-out"
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              padding: '7px 11px',
              borderRadius: 'var(--theme-radius, 10px)',
              color: 'var(--bubble-text-out, #ffffff)',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            Looks super clean and 60 FPS smooth! 🔥
          </div>
        </div>
      </div>

      {/* Mock Input Bar (z-index 4) */}
      <div style={{ padding: '8px 10px', background: 'var(--theme-sidebar-bg, #161921)', borderTop: '1px solid rgba(255,255,255,0.08)', position: 'relative', zIndex: 4, flexShrink: 0, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--theme-input-bg, #1a1d25)', borderRadius: 'var(--theme-radius, 8px)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 10px', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
          <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>😃</span>
          <input
            readOnly
            value="Type a message..."
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--placeholder-color, #9ca3af)', fontSize: 11, outline: 'none', padding: 0 }}
          />
          <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>🚀</span>
        </div>
      </div>
    </div>
  );
}

AppearanceLivePreview.propTypes = {
  targetRoomId: PropTypes.string,
  roomName: PropTypes.string,
};
