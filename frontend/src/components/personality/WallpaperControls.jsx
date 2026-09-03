
import { useWallpaper } from '../../context/WallpaperContext';

export default function WallpaperControls() {
  const { personalityState, updateControls, defaultControls } = useWallpaper();
  const controls = personalityState.controls || defaultControls;

  const handleChange = (field, value) => {
    updateControls({ [field]: value });
  };

  const handleReset = () => {
    updateControls(defaultControls);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>🎛 Wallpaper & Visual Adjustments</h4>
        <button
          onClick={handleReset}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#cbd5e1',
            padding: '4px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Reset Controls
        </button>
      </div>

      {/* Background Fit Mode (Wrapping Chips) */}
      <div>
        <label style={labelStyle}>Background Fit Mode</label>
        <div className="ui-chip-group" style={{ marginTop: 8 }}>
          {[
            { id: 'cover', label: 'Cover' },
            { id: 'contain', label: 'Contain' },
            { id: 'fill', label: 'Fill' },
            { id: 'center', label: 'Center' },
            { id: 'original', label: 'Original' },
            { id: 'fit-width', label: 'Fit Width' },
            { id: 'fit-height', label: 'Fit Height' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleChange('fitMode', mode.id)}
              type="button"
              className={`ui-chip ${controls.fitMode === mode.id ? 'active' : ''}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {/* Opacity */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Wallpaper Opacity</span>
            <span>{Math.round((controls.opacity || 0.85) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={controls.opacity ?? 0.85}
            onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
            style={rangeInputStyle}
          />
        </div>

        {/* Blur */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Background Blur</span>
            <span>{controls.blur || 0}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={controls.blur ?? 0}
            onChange={(e) => handleChange('blur', parseInt(e.target.value, 10))}
            style={rangeInputStyle}
          />
        </div>

        {/* Brightness */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Brightness</span>
            <span>{controls.brightness || 100}%</span>
          </div>
          <input
            type="range"
            min="30"
            max="170"
            step="5"
            value={controls.brightness ?? 100}
            onChange={(e) => handleChange('brightness', parseInt(e.target.value, 10))}
            style={rangeInputStyle}
          />
        </div>

        {/* Contrast */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Contrast</span>
            <span>{controls.contrast || 100}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="150"
            step="5"
            value={controls.contrast ?? 100}
            onChange={(e) => handleChange('contrast', parseInt(e.target.value, 10))}
            style={rangeInputStyle}
          />
        </div>

        {/* Saturation */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Saturation</span>
            <span>{controls.saturation || 100}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            step="5"
            value={controls.saturation ?? 100}
            onChange={(e) => handleChange('saturation', parseInt(e.target.value, 10))}
            style={rangeInputStyle}
          />
        </div>

        {/* Scale / Zoom */}
        <div>
          <div style={sliderHeaderStyle}>
            <span>Scale / Zoom</span>
            <span>{controls.scale || 100}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="200"
            step="5"
            value={controls.scale ?? 100}
            onChange={(e) => handleChange('scale', parseInt(e.target.value, 10))}
            style={rangeInputStyle}
          />
        </div>
      </div>

      {/* Overlay Color & Opacity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <div>
          <label style={labelStyle}>Overlay Color</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={controls.overlayColor || '#000000'}
              onChange={(e) => handleChange('overlayColor', e.target.value)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
            <input
              type="text"
              value={controls.overlayColor || '#000000'}
              onChange={(e) => handleChange('overlayColor', e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
              }}
            />
          </div>
        </div>

        <div>
          <div style={sliderHeaderStyle}>
            <span>Overlay Opacity</span>
            <span>{Math.round((controls.overlayOpacity || 0.2) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.05"
            value={controls.overlayOpacity ?? 0.2}
            onChange={(e) => handleChange('overlayOpacity', parseFloat(e.target.value))}
            style={{ ...rangeInputStyle, marginTop: 12 }}
          />
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  display: 'block',
};

const sliderHeaderStyle = {
  display: 'flex',
  justify: 'space-between',
  justifyContent: 'space-between',
  fontSize: 13,
  color: '#cbd5e1',
  marginBottom: 4,
};

const rangeInputStyle = {
  width: '100%',
  accentColor: 'var(--theme-primary, #7c3aed)',
  cursor: 'pointer',
};
