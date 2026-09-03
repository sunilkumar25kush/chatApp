
import { useAppearance } from '../../context/AppearanceContext';

/* Shared inline style objects — all values from Design System tokens */
const S = {
  card: {
    display: 'flex', flexDirection: 'column', gap: 14,
    background: 'var(--color-bg-deep)',
    padding: 14,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-subtle)',
  },
  cardTitle: { fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--color-text-bright)' },
  sliderRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-xs)', color: 'var(--color-text-faint)' },
  toggle: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 'var(--font-sm)', color: 'var(--color-text-soft)', cursor: 'pointer',
    minHeight: 44, padding: '8px 0', borderTop: '1px solid var(--color-bg-elevated)',
  },
  hint: { fontSize: 'var(--font-xs)', color: 'var(--color-text-ghost)', marginTop: -4 },
};

export default function AnimationControls() {
  const { appearanceState, updateAnimationControls } = useAppearance();

  const anim = appearanceState.animationControls || {};

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>⚡ Animation &amp; Performance Controls</div>

      {/* Speed Slider */}
      <div style={S.sliderRow}>
        <div style={S.sliderLabel}>
          <span>Animation Speed</span>
          <span>{anim.speed ?? 1}x</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="3"
          step="0.2"
          value={anim.speed ?? 1}
          onChange={(e) => updateAnimationControls({ speed: parseFloat(e.target.value) })}
        />
      </div>

      {/* Density Slider */}
      <div style={S.sliderRow}>
        <div style={S.sliderLabel}>
          <span>Particle Density</span>
          <span>{Math.round((anim.density ?? 1) * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="2"
          step="0.1"
          value={anim.density ?? 1}
          onChange={(e) => updateAnimationControls({ density: parseFloat(e.target.value) })}
        />
      </div>

      {/* Battery Saver Toggle */}
      <label style={S.toggle}>
        <span>🔋 Battery Saver Mode</span>
        <input
          type="checkbox"
          checked={!!anim.batterySaver}
          onChange={(e) => updateAnimationControls({ batterySaver: e.target.checked })}
          style={{ width: 20, height: 20, accentColor: 'var(--theme-primary)' }}
        />
      </label>
      <div style={S.hint}>
        Reduces particle refresh rate and limits canvas draw calls.
      </div>

      {/* Reduce Motion Toggle */}
      <label style={S.toggle}>
        <span>♿ Reduce Motion Mode</span>
        <input
          type="checkbox"
          checked={!!anim.reduceMotion}
          onChange={(e) => updateAnimationControls({ reduceMotion: e.target.checked })}
          style={{ width: 20, height: 20, accentColor: 'var(--theme-primary)' }}
        />
      </label>
      <div style={S.hint}>
        Disables ambient canvas particles for accessibility compliance.
      </div>
    </div>
  );
}
