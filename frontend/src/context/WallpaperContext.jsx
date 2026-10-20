import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';
import { getPersonalityById } from '../utils/chatPersonalities';

const WallpaperContext = createContext();

export const useWallpaper = () => {
  const context = useContext(WallpaperContext);
  if (!context) {
    throw new Error('useWallpaper must be used within a WallpaperProvider');
  }
  return context;
};

const defaultControls = {
  opacity: 0.85,
  blur: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  scale: 100,
  fitMode: 'cover', // 'cover' | 'contain' | 'fill' | 'original' | 'center' | 'fit-width' | 'fit-height'
  overlayColor: '#000000',
  overlayOpacity: 0.2,
};

const defaultPersonalityState = {
  activePersonalityId: 'default',
  globalWallpaperUrl: '',
  customWallpapers: [],
  perChatWallpapers: {},
  controls: defaultControls,
};

export const WallpaperProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [personalityState, setPersonalityState] = useState(() => {
    const saved = localStorage.getItem('chat_personality_studio');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultPersonalityState,
          ...parsed,
          controls: { ...defaultControls, ...(parsed.controls || {}) },
        };
      } catch (e) {
        return defaultPersonalityState;
      }
    }
    return defaultPersonalityState;
  });

  // Sync with MongoDB user.personality if available
  useEffect(() => {
    if (isAuthenticated && user?.personality) {
      const merged = {
        ...defaultPersonalityState,
        ...user.personality,
        controls: { ...defaultControls, ...(user.personality.controls || {}) },
      };
      setPersonalityState(merged);
      localStorage.setItem('chat_personality_studio', JSON.stringify(merged));
    }
  }, [user, isAuthenticated]);

  // Inject CSS Variables dynamically for instant Live Preview
  useEffect(() => {
    const root = document.documentElement;

    // If AppearanceContext (v2) is active in localStorage, let it control theme tokens & classes
    const hasAppearance = !!localStorage.getItem('appearance_studio_v2');

    if (!hasAppearance) {
      const activePersonality = getPersonalityById(personalityState.activePersonalityId);
      const theme = activePersonality.theme;

      // Set Theme CSS Variables
      const isLight = theme.isLight || (theme.chatBg && (theme.chatBg.startsWith('#f') || theme.chatBg.includes('253') || theme.chatBg.includes('245')));
      const textColor = theme.textColor || (isLight ? '#0f172a' : '#f8fafc');
      const textMuted = theme.textMuted || (isLight ? '#475569' : '#94a3b8');
      const senderColor = theme.senderColor || (isLight ? '#2563eb' : '#60a5fa');
      const headerText = theme.headerText || (isLight ? '#0f172a' : '#f8fafc');

      root.style.setProperty('--theme-primary', theme.primaryColor);
      root.style.setProperty('--theme-msg-in-bg', theme.msgIncomingBg);
      root.style.setProperty('--theme-msg-in-text', theme.msgIncomingText || (isLight ? '#0f172a' : '#e2e8f0'));
      root.style.setProperty('--theme-msg-out-bg', theme.msgOutgoingBg);
      root.style.setProperty('--theme-msg-out-text', theme.msgOutgoingText || '#ffffff');
      root.style.setProperty('--theme-chat-bg', theme.chatBg);
      root.style.setProperty('--theme-sidebar-bg', theme.sidebarBg);
      root.style.setProperty('--theme-header-bg', theme.headerBg || theme.sidebarBg);
      root.style.setProperty('--theme-input-bg', theme.inputBg || (isLight ? '#ffffff' : '#222530'));
      root.style.setProperty('--theme-radius', theme.borderRadius);
      root.style.setProperty('--theme-font', theme.fontFamily);
      root.style.setProperty('--theme-accent-glow', theme.accentGlow || 'none');

      // Dynamic contrast & text readability tokens
      root.style.setProperty('--theme-text-color', textColor);
      root.style.setProperty('--theme-text-muted', textMuted);
      root.style.setProperty('--theme-sender-color', senderColor);
      root.style.setProperty('--theme-header-text', headerText);
      root.style.setProperty('--theme-bubble-border', isLight ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--theme-bubble-shadow', isLight ? '0 2px 10px rgba(0, 0, 0, 0.08)' : '0 2px 10px rgba(0, 0, 0, 0.35)');

      if (isLight) {
        document.body.classList.add('theme-light');
        root.classList.add('theme-light');
      }
    }

    // Set Wallpaper & Controls CSS Variables
    const controls = personalityState.controls || defaultControls;
    root.style.setProperty('--wallpaper-opacity', controls.opacity);
    root.style.setProperty('--wallpaper-blur', `${controls.blur}px`);
    root.style.setProperty('--wallpaper-brightness', `${controls.brightness}%`);
    root.style.setProperty('--wallpaper-contrast', `${controls.contrast}%`);
    root.style.setProperty('--wallpaper-saturation', `${controls.saturation}%`);
    root.style.setProperty('--wallpaper-scale', `${controls.scale / 100}`);
    root.style.setProperty('--wallpaper-fit-mode', controls.fitMode);
    root.style.setProperty('--wallpaper-overlay-color', controls.overlayColor);
    root.style.setProperty('--wallpaper-overlay-opacity', controls.overlayOpacity);

    // Apply active personality class on body without obliterating existing theme classes
    Array.from(document.body.classList)
      .filter((c) => c.startsWith('personality-'))
      .forEach((c) => document.body.classList.remove(c));
    if (personalityState.activePersonalityId) {
      document.body.classList.add(`personality-${personalityState.activePersonalityId}`);
    }
  }, [personalityState]);

  // Persist personality updates
  const updatePersonalitySettings = useCallback(
    async (updates) => {
      setPersonalityState((prev) => {
        const nextState = {
          ...prev,
          ...updates,
          controls: {
            ...(prev.controls || defaultControls),
            ...(updates.controls || {}),
          },
        };
        localStorage.setItem('chat_personality_studio', JSON.stringify(nextState));

        if (isAuthenticated) {
          api.put('/users/personality', { personality: nextState }).catch((err) => {
            console.error('[WallpaperContext] Failed to save personality to server:', err);
          });
        }

        return nextState;
      });
    },
    [isAuthenticated]
  );

  // Set active preset personality
  const setActivePersonality = useCallback(
    (personalityId) => {
      const personality = getPersonalityById(personalityId);
      updatePersonalitySettings({
        activePersonalityId: personalityId,
        controls: {
          ...personalityState.controls,
          overlayColor: personality.theme.overlayColor || '#000000',
          overlayOpacity: personality.theme.overlayOpacity ?? 0.2,
        },
      });
    },
    [personalityState.controls, updatePersonalitySettings]
  );

  // Set global wallpaper
  const setGlobalWallpaper = useCallback(
    (url) => {
      updatePersonalitySettings({ globalWallpaperUrl: url });
    },
    [updatePersonalitySettings]
  );

  // Set per-chat wallpaper for a room ID
  const setPerChatWallpaper = useCallback(
    (roomId, url) => {
      const updatedPerChat = {
        ...(personalityState.perChatWallpapers || {}),
        [roomId]: url,
      };
      updatePersonalitySettings({ perChatWallpapers: updatedPerChat });
    },
    [personalityState.perChatWallpapers, updatePersonalitySettings]
  );

  // Add custom wallpaper to user library
  const addCustomWallpaper = useCallback(
    (wallpaperItem) => {
      const newItem = {
        id: 'wp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: wallpaperItem.url,
        name: wallpaperItem.name || 'Custom Wallpaper',
        isFavorite: false,
        collectionName: wallpaperItem.collectionName || 'General',
        createdAt: new Date().toISOString(),
      };
      const updatedList = [newItem, ...(personalityState.customWallpapers || [])];
      updatePersonalitySettings({ customWallpapers: updatedList });
      return newItem;
    },
    [personalityState.customWallpapers, updatePersonalitySettings]
  );

  // Toggle favorite wallpaper
  const toggleFavoriteWallpaper = useCallback(
    (id) => {
      const updatedList = (personalityState.customWallpapers || []).map((wp) =>
        wp.id === id ? { ...wp, isFavorite: !wp.isFavorite } : wp
      );
      updatePersonalitySettings({ customWallpapers: updatedList });
    },
    [personalityState.customWallpapers, updatePersonalitySettings]
  );

  // Delete custom wallpaper
  const deleteCustomWallpaper = useCallback(
    (id) => {
      const updatedList = (personalityState.customWallpapers || []).filter((wp) => wp.id !== id);
      updatePersonalitySettings({ customWallpapers: updatedList });
    },
    [personalityState.customWallpapers, updatePersonalitySettings]
  );

  // Update wallpaper controls (opacity, blur, scale, brightness, contrast, fitMode)
  const updateControls = useCallback(
    (controlUpdates) => {
      updatePersonalitySettings({
        controls: {
          ...personalityState.controls,
          ...controlUpdates,
        },
      });
    },
    [personalityState.controls, updatePersonalitySettings]
  );

  // Get active wallpaper URL for a given roomId (or global if not specified)
  const getActiveWallpaperForRoom = useCallback(
    (roomId) => {
      if (roomId && personalityState.perChatWallpapers?.[roomId]) {
        return personalityState.perChatWallpapers[roomId];
      }
      return personalityState.globalWallpaperUrl;
    },
    [personalityState.globalWallpaperUrl, personalityState.perChatWallpapers]
  );

  return (
    <WallpaperContext.Provider
      value={{
        personalityState,
        activePersonality: getPersonalityById(personalityState.activePersonalityId),
        setActivePersonality,
        setGlobalWallpaper,
        setPerChatWallpaper,
        addCustomWallpaper,
        toggleFavoriteWallpaper,
        deleteCustomWallpaper,
        updateControls,
        getActiveWallpaperForRoom,
        defaultControls,
      }}
    >
      {children}
    </WallpaperContext.Provider>
  );
};
