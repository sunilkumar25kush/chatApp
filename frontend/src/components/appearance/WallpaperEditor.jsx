import { useState, useRef } from 'react';
import { useAppearance } from '../../context/AppearanceContext';
import api from '../../services/api';

/* Shared style objects — all values from Design System tokens */
const S = {
  sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-xs)', color: 'var(--color-text-faint)' },
  adjustCard: {
    display: 'flex', flexDirection: 'column', gap: 10,
    background: 'var(--color-bg-deep)',
    padding: 'var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-subtle)',
  },
};

export default function WallpaperEditor() {
  const { appearanceState, setGlobalWallpaper, updateControls, addCustomWallpaper } = useAppearance();
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const controls = appearanceState.controls || {};

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File size exceeds 10MB limit!');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Only JPG, PNG, WEBP, AVIF, and GIF files are allowed!');
      return;
    }

    setErrorMsg('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const imageUrl = response.data.url || response.data.fileUrl;
      if (imageUrl) {
        addCustomWallpaper({ url: imageUrl, name: file.name });
        setGlobalWallpaper(imageUrl);
      }
    } catch (err) {
      console.error('[WallpaperEditor] Upload failed:', err);
      // Fallback local ObjectURL preview
      const localUrl = URL.createObjectURL(file);
      addCustomWallpaper({ url: localUrl, name: file.name });
      setGlobalWallpaper(localUrl);
    } finally {
      setUploading(false);
    }
  };

  const presetWallpapers = [
    { name: 'Cosmic Nebula', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1000' },
    { name: 'Sakura Garden', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?q=80&w=1000' },
    { name: 'Rainy Street', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1000' },
    { name: 'Cyber Neon', url: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1000' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      {/* Upload Drag & Drop Box */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--color-blue)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-lg)',
          textAlign: 'center',
          background: 'rgba(59, 130, 246, 0.08)',
          cursor: 'pointer',
        }}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*" />
        <div style={{ fontSize: 24 }}>🖼️</div>
        <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--color-text-bright)', marginTop: 4 }}>
          {uploading ? '⏳ Uploading Wallpaper...' : 'Click to Upload Custom Wallpaper'}
        </div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-faint)', marginTop: 2 }}>
          Supports JPG, PNG, WEBP, AVIF (Max 10MB)
        </div>
        {errorMsg && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-error)', marginTop: 6 }}>{errorMsg}</div>}
      </div>

      {/* Preset Curated Wallpapers */}
      <div>
        <div style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--color-text-soft)', marginBottom: 'var(--space-sm)' }}>Curated Wallpapers</div>
        <div className="responsive-grid-gallery" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
          <div
            onClick={() => setGlobalWallpaper('')}
            className="touch-btn"
            style={{
              height: 50,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-input)',
              border: appearanceState.globalWallpaperUrl === '' ? '2px solid var(--theme-primary)' : '1px solid var(--color-border-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--font-xs)',
              color: 'var(--color-text-faint)',
              cursor: 'pointer',
            }}
          >
            None
          </div>
          {presetWallpapers.map((wp) => (
            <div
              key={wp.url}
              onClick={() => setGlobalWallpaper(wp.url)}
              className="touch-btn"
              style={{
                height: 50,
                borderRadius: 'var(--radius-sm)',
                backgroundImage: `url(${wp.url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: appearanceState.globalWallpaperUrl === wp.url ? '2px solid var(--theme-primary)' : '1px solid var(--color-border-dark)',
                cursor: 'pointer',
              }}
              title={wp.name}
            />
          ))}
        </div>
      </div>

      {/* Controls Sliders */}
      <div style={S.adjustCard}>
        <div style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--color-text-soft)' }}>Wallpaper Adjustments</div>

        {/* Opacity */}
        <div style={S.sliderLabel}>
          <span>Opacity</span>
          <span>{Math.round((controls.opacity ?? 0.85) * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={controls.opacity ?? 0.85}
          onChange={(e) => updateControls({ opacity: parseFloat(e.target.value) })}
        />

        {/* Blur */}
        <div style={S.sliderLabel}>
          <span>Blur</span>
          <span>{controls.blur ?? 0}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="20"
          step="1"
          value={controls.blur ?? 0}
          onChange={(e) => updateControls({ blur: parseInt(e.target.value, 10) })}
        />

        {/* Brightness */}
        <div style={S.sliderLabel}>
          <span>Brightness</span>
          <span>{controls.brightness ?? 100}%</span>
        </div>
        <input
          type="range"
          min="30"
          max="150"
          step="5"
          value={controls.brightness ?? 100}
          onChange={(e) => updateControls({ brightness: parseInt(e.target.value, 10) })}
        />

        {/* Scale */}
        <div style={S.sliderLabel}>
          <span>Zoom / Scale</span>
          <span>{controls.scale ?? 100}%</span>
        </div>
        <input
          type="range"
          min="100"
          max="200"
          step="5"
          value={controls.scale ?? 100}
          onChange={(e) => updateControls({ scale: parseInt(e.target.value, 10) })}
        />

        {/* Fit Mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-xs)', color: 'var(--color-text-faint)', marginTop: 4 }}>
          <span>Fit Mode</span>
          <select
            value={controls.fitMode ?? 'cover'}
            onChange={(e) => updateControls({ fitMode: e.target.value })}
            className="form-control"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-white)',
              border: '1px solid var(--color-border-dark)',
              borderRadius: 'var(--radius-xs, 8px)',
              padding: '0 12px',
              fontSize: 'var(--font-xs)',
              minHeight: 38,
              height: 38,
            }}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Fill Stretch</option>
            <option value="center">Center</option>
          </select>
        </div>
      </div>
    </div>
  );
}
