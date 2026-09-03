import { useState } from 'react';
import { BUILTIN_THEMES } from '../../config/appearanceConfig';
import { useAppearance } from '../../context/AppearanceContext';
import ThemeCard from './ThemeCard';

export default function ThemeGallery() {
  const { appearanceState, setActiveTheme } = useAppearance();
  const [filterCategory, setFilterCategory] = useState('All');

  const categories = ['All', 'Sci-Fi', 'Nature', 'Minimal', 'Tech', 'Cozy', 'Vibrant', 'Seasonal', 'Standard'];

  const filteredThemes = filterCategory === 'All'
    ? BUILTIN_THEMES
    : BUILTIN_THEMES.filter((t) => t.category === filterCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Category Tabs (Horizontal Scroll) */}
      <div className="ui-scroll-tabs" role="tablist" aria-label="Theme categories">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            type="button"
            className={`ui-tab-chip ${filterCategory === cat ? 'active' : ''}`}
            role="tab"
            aria-selected={filterCategory === cat}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of Theme Cards */}
      <div className="responsive-grid-gallery" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {filteredThemes.map((themeItem) => (
          <ThemeCard
            key={themeItem.id}
            themeItem={themeItem}
            isActive={appearanceState.activeThemeId === themeItem.id}
            onSelect={setActiveTheme}
          />
        ))}
      </div>
    </div>
  );
}
