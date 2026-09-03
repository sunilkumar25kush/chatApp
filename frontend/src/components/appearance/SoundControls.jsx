
import { useAppearance } from '../../context/AppearanceContext';
import { themeSoundManager } from '../../utils/themeSoundManager';

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
  subRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 'var(--font-sm)', color: 'var(--color-text-faint)',
    minHeight: 40,
  },
  innerGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  testBtn: {
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-dark)',
    color: 'var(--color-blue)',
    borderRadius: 'var(--radius-xs, 6px)',
    padding: '6px 12px',
    minHeight: 34,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subSection: {
    paddingTop: 8,
    borderTop: '1px solid var(--color-bg-elevated)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
};

export default function SoundControls() {
  const { appearanceState, updateSoundControls } = useAppearance();

  const snd = appearanceState.soundControls || {};

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>🔊 Theme Sound Effects</div>

      {/* Main Enable Sounds Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-sm)', color: 'var(--color-text-soft)', cursor: 'pointer', minHeight: 44 }}>
        <span style={{ fontWeight: 600 }}>Enable UI Sounds</span>
        <input
          type="checkbox"
          checked={!!snd.enableSounds}
          onChange={(e) => updateSoundControls({ enableSounds: e.target.checked })}
          style={{ width: 20, height: 20, accentColor: 'var(--theme-primary)' }}
        />
      </label>

      {/* Sub-toggles & sound tests */}
      <div style={{ opacity: snd.enableSounds ? 1 : 0.4, pointerEvents: snd.enableSounds ? 'auto' : 'none', ...S.subSection }}>
        {/* Sent Sound */}
        <div style={S.subRow}>
          <span>Message Sent Sound</span>
          <div style={S.innerGroup}>
            <button onClick={() => themeSoundManager.playSentSound()} style={S.testBtn}>▶ Test</button>
            <input
              type="checkbox"
              checked={!!snd.enableSentSound}
              onChange={(e) => updateSoundControls({ enableSentSound: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
          </div>
        </div>

        {/* Typing Sound */}
        <div style={S.subRow}>
          <span>Typing Tick Sound</span>
          <div style={S.innerGroup}>
            <button onClick={() => themeSoundManager.playTypingSound()} style={S.testBtn}>▶ Test</button>
            <input
              type="checkbox"
              checked={!!snd.enableTypingSound}
              onChange={(e) => updateSoundControls({ enableTypingSound: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
          </div>
        </div>

        {/* Notification Sound */}
        <div style={S.subRow}>
          <span>Notification Chime</span>
          <div style={S.innerGroup}>
            <button onClick={() => themeSoundManager.playNotificationSound()} style={S.testBtn}>▶ Test</button>
            <input
              type="checkbox"
              checked={!!snd.enableNotificationSound}
              onChange={(e) => updateSoundControls({ enableNotificationSound: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
