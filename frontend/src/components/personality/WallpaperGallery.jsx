import { useState } from 'react';
import { useWallpaper } from '../../context/WallpaperContext';

const PRESET_WALLPAPERS = [
  { id: 'wp_space', name: 'Deep Space', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_neon', name: 'Cyberpunk Neon', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_sakura', name: 'Pink Sakura', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_ocean', name: 'Oceanic Wave', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_mountain', name: 'Midnight Mountains', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_forest', name: 'Misty Forest', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_abstract', name: 'Glass Wave', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop' },
  { id: 'wp_minimal', name: 'Dark Geometry', url: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop' },
];

export default function WallpaperGallery({ targetRoomId }) {
  const {
    personalityState,
    setGlobalWallpaper,
    setPerChatWallpaper,
    toggleFavoriteWallpaper,
    deleteCustomWallpaper,
    getActiveWallpaperForRoom,
  } = useWallpaper();

  const [activeTab, setActiveTab] = useState('presets'); // 'presets' | 'custom' | 'favorites'

  const activeUrl = getActiveWallpaperForRoom(targetRoomId);

  const customList = personalityState.customWallpapers || [];
  const favoritesList = customList.filter((w) => w.isFavorite);

  const handleSelectWallpaper = (url) => {
    if (targetRoomId) {
      setPerChatWallpaper(targetRoomId, url);
    } else {
      setGlobalWallpaper(url);
    }
  };

  const displayList =
    activeTab === 'presets'
      ? PRESET_WALLPAPERS
      : activeTab === 'favorites'
      ? favoritesList
      : customList;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub Tabs (Horizontal Scroll) */}
      <div className="ui-scroll-tabs" role="tablist" aria-label="Wallpaper categories" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
        {[
          { id: 'presets', label: 'Curated Wallpapers' },
          { id: 'custom', label: `My Uploads (${customList.length})` },
          { id: 'favorites', label: `⭐ Favorites (${favoritesList.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            className={`ui-tab-chip ${activeTab === tab.id ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Remove / Clear Background Option */}
      {activeUrl && (
        <button
          onClick={() => handleSelectWallpaper('')}
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          🚫 Clear Active Wallpaper
        </button>
      )}

      {/* Grid */}
      {displayList.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {activeTab === 'favorites' ? 'No favorite wallpapers starred yet.' : 'No custom wallpapers uploaded.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
          {displayList.map((item) => {
            const isSelected = activeUrl === item.url;
            return (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  height: 100,
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--theme-primary, #7c3aed)' : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: isSelected ? '0 0 12px var(--theme-primary, #7c3aed)' : 'none',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => handleSelectWallpaper(item.url)}
              >
                <img
                  src={item.url}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Name Tag */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    insetX: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                    padding: '4px 6px',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.name}
                </div>

                {/* Custom Actions (Star / Delete) */}
                {activeTab !== 'presets' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}
                  >
                    <button
                      onClick={() => toggleFavoriteWallpaper(item.id)}
                      style={{
                        background: 'rgba(0,0,0,0.6)',
                        border: 'none',
                        color: item.isFavorite ? '#facc15' : '#fff',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                      title="Star Favorite"
                    >
                      ★
                    </button>
                    <button
                      onClick={() => deleteCustomWallpaper(item.id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.7)',
                        border: 'none',
                        color: '#fff',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      background: 'var(--theme-primary, #7c3aed)',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
