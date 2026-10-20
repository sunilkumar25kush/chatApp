import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';
import { getThemeById } from '../config/appearanceConfig';
import {
  parseColorToRGB,
  calculateLuminance,
  getReadableTextColor,
  getAdaptiveMutedText,
  getAdaptiveBorder,
  getAdaptiveTextShadow,
  getAutoOverlayOpacity,
} from '../utils/contrastEngine';

const AppearanceContext = createContext();

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
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
  fitMode: 'cover',
  overlayColor: '#000000',
  overlayOpacity: 0.2,
};

const defaultAnimationControls = {
  speed: 1,
  density: 1,
  size: 1,
  batterySaver: false,
  reduceMotion: false,
};

const defaultSoundControls = {
  enableSounds: true,
  enableTypingSound: true,
  enableNotificationSound: true,
  enableSentSound: true,
};

const defaultAppearanceState = {
  activeThemeId: 'galaxy',
  activeEffectId: 'stars',
  globalWallpaperUrl: '',
  customWallpapers: [],
  perChatWallpapers: {},
  savedCustomThemes: [],
  controls: defaultControls,
  animationControls: defaultAnimationControls,
  soundControls: defaultSoundControls,
};

export const AppearanceProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [appearanceState, setAppearanceState] = useState(() => {
    const saved = localStorage.getItem('appearance_studio_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultAppearanceState,
          ...parsed,
          controls: { ...defaultControls, ...(parsed.controls || {}) },
          animationControls: { ...defaultAnimationControls, ...(parsed.animationControls || {}) },
          soundControls: { ...defaultSoundControls, ...(parsed.soundControls || {}) },
        };
      } catch (e) {
        return defaultAppearanceState;
      }
    }
    return defaultAppearanceState;
  });

  // Sync with MongoDB user.personality if available
  useEffect(() => {
    if (isAuthenticated && user?.personality) {
      const merged = {
        ...defaultAppearanceState,
        ...user.personality,
        controls: { ...defaultControls, ...(user.personality.controls || {}) },
        animationControls: { ...defaultAnimationControls, ...(user.personality.animationControls || {}) },
        soundControls: { ...defaultSoundControls, ...(user.personality.soundControls || {}) },
      };
      setAppearanceState(merged);
      localStorage.setItem('appearance_studio_v2', JSON.stringify(merged));
    }
  }, [user, isAuthenticated]);

  // Dynamic CSS Variables & WCAG Smart Adaptive Contrast Safeguard
  useEffect(() => {
    const root = document.documentElement;
    const activeTheme = getThemeById(appearanceState.activeThemeId);
    const theme = activeTheme.theme;
    const controls = appearanceState.controls || defaultControls;

    // Calculate background luminance via Contrast Engine
    const bgRgb = parseColorToRGB(theme.chatBg);
    const bgLuminance = calculateLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

    // Auto-overlay opacity boost if wallpaper/background is very bright
    const effectiveOverlayOpacity = getAutoOverlayOpacity(
      bgLuminance,
      controls.brightness,
      controls.overlayOpacity
    );

    // Text & Element Colors derived via WCAG Contrast Engine
    const primaryText = theme.textColor || getReadableTextColor(theme.chatBg, '#0f172a', '#f8fafc');
    const secondaryText = bgLuminance > 0.5 ? '#334155' : '#cbd5e1';
    const mutedText = theme.textMuted || getAdaptiveMutedText(theme.chatBg);
    const senderColor = theme.senderColor || (bgLuminance > 0.5 ? '#1d4ed8' : '#60a5fa');
    const headerText = theme.headerText || getReadableTextColor(theme.headerBg || theme.sidebarBg, '#0f172a', '#f8fafc');
    const linkColor = bgLuminance > 0.5 ? '#1d4ed8' : '#60a5fa';
    const adaptiveBorder = getAdaptiveBorder(theme.chatBg);
    const adaptiveTextShadow = getAdaptiveTextShadow(bgLuminance, controls.brightness);

    // Bubble text calculations
    const bubbleTextIn = theme.msgIncomingText || getReadableTextColor(theme.msgIncomingBg, '#0f172a', '#f8fafc');
    const bubbleTextOut = theme.msgOutgoingText || getReadableTextColor(theme.msgOutgoingBg, '#ffffff', '#ffffff');

    // Input text & placeholder
    const inputRgb = parseColorToRGB(theme.inputBg || '#222530');
    const inputText = getReadableTextColor(theme.inputBg || '#222530', '#0f172a', '#f8fafc');
    const inputPlaceholder = calculateLuminance(inputRgb.r, inputRgb.g, inputRgb.b) > 0.5 ? '#64748b' : '#94a3b8';

    // Theme CSS Variables
    root.style.setProperty('--theme-primary', theme.primaryColor);
    root.style.setProperty('--theme-msg-in-bg', theme.msgIncomingBg);
    root.style.setProperty('--theme-msg-in-text', bubbleTextIn);
    root.style.setProperty('--theme-msg-out-bg', theme.msgOutgoingBg);
    root.style.setProperty('--theme-msg-out-text', bubbleTextOut);
    root.style.setProperty('--theme-chat-bg', theme.chatBg);
    root.style.setProperty('--theme-sidebar-bg', theme.sidebarBg);
    root.style.setProperty('--theme-header-bg', theme.headerBg || theme.sidebarBg);
    root.style.setProperty('--theme-input-bg', theme.inputBg || (bgLuminance > 0.5 ? '#ffffff' : '#222530'));
    root.style.setProperty('--theme-radius', theme.borderRadius);
    root.style.setProperty('--theme-font', theme.fontFamily);
    root.style.setProperty('--theme-accent-glow', theme.accentGlow || 'none');

    // Comprehensive Design Tokens
    root.style.setProperty('--text-primary', primaryText);
    root.style.setProperty('--text-secondary', secondaryText);
    root.style.setProperty('--text-muted', mutedText);
    root.style.setProperty('--icon-color', mutedText);
    root.style.setProperty('--border-color', adaptiveBorder);
    root.style.setProperty('--bubble-text-in', bubbleTextIn);
    root.style.setProperty('--bubble-text-out', bubbleTextOut);
    root.style.setProperty('--input-text', inputText);
    root.style.setProperty('--placeholder-color', inputPlaceholder);
    root.style.setProperty('--header-text', headerText);
    root.style.setProperty('--timestamp-color', mutedText);
    root.style.setProperty('--link-color', linkColor);
    root.style.setProperty('--reaction-bg', bgLuminance > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)');
    root.style.setProperty('--text-drop-shadow', adaptiveTextShadow);

    // Legacy Aliases
    root.style.setProperty('--theme-text-color', primaryText);
    root.style.setProperty('--theme-text-muted', mutedText);
    root.style.setProperty('--theme-sender-color', senderColor);
    root.style.setProperty('--theme-header-text', headerText);
    root.style.setProperty('--theme-bubble-border', adaptiveBorder);
    root.style.setProperty('--theme-bubble-shadow', bgLuminance > 0.5 ? '0 2px 10px rgba(0,0,0,0.08)' : '0 2px 10px rgba(0,0,0,0.35)');

    // Wallpaper Controls & Auto-Boost Overlay
    root.style.setProperty('--wallpaper-opacity', controls.opacity);
    root.style.setProperty('--wallpaper-blur', `${controls.blur}px`);
    root.style.setProperty('--wallpaper-brightness', `${controls.brightness}%`);
    root.style.setProperty('--wallpaper-contrast', `${controls.contrast}%`);
    root.style.setProperty('--wallpaper-saturation', `${controls.saturation}%`);
    root.style.setProperty('--wallpaper-scale', `${controls.scale / 100}`);
    root.style.setProperty('--wallpaper-fit-mode', controls.fitMode);
    const activeOverlayColor = (controls.overlayColor && controls.overlayColor !== '#000000')
      ? controls.overlayColor
      : (theme.overlayColor || (bgLuminance > 0.5 ? '#ffffff' : '#000000'));
    const activeOverlayOpacity = (controls.overlayColor && controls.overlayColor !== '#000000')
      ? effectiveOverlayOpacity
      : (theme.overlayOpacity ?? (bgLuminance > 0.5 ? 0.05 : effectiveOverlayOpacity));

    root.style.setProperty('--wallpaper-overlay-color', activeOverlayColor);
    root.style.setProperty('--wallpaper-overlay-opacity', activeOverlayOpacity);

    // Apply Active Theme Class & Light Mode Contrast Bridge
    const isLight = bgLuminance > 0.5 || Boolean(theme.isLight);

    Array.from(document.body.classList)
      .filter((c) => c.startsWith('theme-') && c !== 'theme-light' && c !== 'theme-amoled' && c !== 'theme-glass')
      .forEach((c) => document.body.classList.remove(c));
    document.body.classList.add(`theme-${appearanceState.activeThemeId}`);

    if (isLight) {
      document.body.classList.add('theme-light');
      root.classList.add('theme-light');
      root.style.setProperty('--color-bg-window', theme.chatBg);
      root.style.setProperty('--color-bg-card', theme.inputBg || '#ffffff');
      root.style.setProperty('--color-bg-hover', 'rgba(0, 0, 0, 0.05)');
      root.style.setProperty('--color-bg-input', theme.inputBg || '#ffffff');
      root.style.setProperty('--color-border', adaptiveBorder);
      root.style.setProperty('--color-text', primaryText);
      root.style.setProperty('--color-text-muted', mutedText);
      root.style.setProperty('--color-text-dim', mutedText);
      root.style.setProperty('--text-main', primaryText);
      root.style.setProperty('--text', primaryText);
      root.style.setProperty('--bg-input', theme.inputBg || '#ffffff');
      root.style.setProperty('--bg-card', theme.inputBg || '#ffffff');
      root.style.setProperty('--bg-panel', theme.sidebarBg || '#ffffff');
      root.style.setProperty('--bg-panel-hover', 'rgba(0, 0, 0, 0.05)');
      root.style.setProperty('--bg-hover', 'rgba(0, 0, 0, 0.05)');
      root.style.setProperty('--border-color', adaptiveBorder);
      root.style.setProperty('--border', adaptiveBorder);
      root.style.colorScheme = 'light';
    } else {
      const isThemeContextLight = localStorage.getItem('gajim_theme_mode') === 'light';
      if (!isThemeContextLight) {
        document.body.classList.remove('theme-light');
        root.classList.remove('theme-light');
        root.style.removeProperty('--color-bg-window');
        root.style.removeProperty('--color-bg-card');
        root.style.removeProperty('--color-bg-hover');
        root.style.removeProperty('--color-bg-input');
        root.style.removeProperty('--color-border');
        root.style.removeProperty('--color-text');
        root.style.removeProperty('--color-text-muted');
        root.style.removeProperty('--color-text-dim');
        root.style.removeProperty('--text-main');
        root.style.removeProperty('--text');
        root.style.removeProperty('--bg-input');
        root.style.removeProperty('--bg-card');
        root.style.removeProperty('--bg-panel');
        root.style.removeProperty('--bg-panel-hover');
        root.style.removeProperty('--bg-hover');
        root.style.removeProperty('--border-color');
        root.style.removeProperty('--border');
        root.style.colorScheme = 'dark';
      }
    }
  }, [appearanceState]);

  // Persist Appearance State
  const updateAppearanceSettings = useCallback(
    async (updates) => {
      setAppearanceState((prev) => {
        const nextState = {
          ...prev,
          ...updates,
          controls: { ...(prev.controls || defaultControls), ...(updates.controls || {}) },
          animationControls: { ...(prev.animationControls || defaultAnimationControls), ...(updates.animationControls || {}) },
          soundControls: { ...(prev.soundControls || defaultSoundControls), ...(updates.soundControls || {}) },
        };
        localStorage.setItem('appearance_studio_v2', JSON.stringify(nextState));

        if (isAuthenticated) {
          api.put('/users/personality', { personality: nextState }).catch((err) => {
            console.error('[AppearanceContext] Failed to save to server:', err);
          });
        }

        return nextState;
      });
    },
    [isAuthenticated]
  );

  // Set Theme & auto-select default effect if provided
  const setActiveTheme = useCallback(
    (themeId) => {
      const themeConfig = getThemeById(themeId);
      updateAppearanceSettings({
        activeThemeId: themeId,
        activeEffectId: themeConfig.defaultEffect || 'none',
        controls: {
          ...appearanceState.controls,
          overlayColor: themeConfig.theme.overlayColor || (themeConfig.theme.isLight ? '#ffffff' : '#000000'),
          overlayOpacity: themeConfig.theme.overlayOpacity ?? (themeConfig.theme.isLight ? 0.05 : 0.2),
        },
      });
    },
    [appearanceState.controls, updateAppearanceSettings]
  );

  // Set Visual Effect
  const setActiveEffect = useCallback(
    (effectId) => {
      updateAppearanceSettings({ activeEffectId: effectId });
    },
    [updateAppearanceSettings]
  );

  // Set Global Wallpaper
  const setGlobalWallpaper = useCallback(
    (url) => {
      updateAppearanceSettings({ globalWallpaperUrl: url });
    },
    [updateAppearanceSettings]
  );

  // Set Per-Chat Wallpaper
  const setPerChatWallpaper = useCallback(
    (roomId, url) => {
      const updatedPerChat = {
        ...(appearanceState.perChatWallpapers || {}),
        [roomId]: url,
      };
      updateAppearanceSettings({ perChatWallpapers: updatedPerChat });
    },
    [appearanceState.perChatWallpapers, updateAppearanceSettings]
  );

  // Update Controls
  const updateControls = useCallback(
    (controlUpdates) => {
      updateAppearanceSettings({
        controls: { ...appearanceState.controls, ...controlUpdates },
      });
    },
    [appearanceState.controls, updateAppearanceSettings]
  );

  // Update Animation Controls
  const updateAnimationControls = useCallback(
    (animUpdates) => {
      updateAppearanceSettings({
        animationControls: { ...appearanceState.animationControls, ...animUpdates },
      });
    },
    [appearanceState.animationControls, updateAppearanceSettings]
  );

  // Update Sound Controls
  const updateSoundControls = useCallback(
    (soundUpdates) => {
      updateAppearanceSettings({
        soundControls: { ...appearanceState.soundControls, ...soundUpdates },
      });
    },
    [appearanceState.soundControls, updateAppearanceSettings]
  );

  // Add Custom Wallpaper
  const addCustomWallpaper = useCallback(
    (item) => {
      const newItem = {
        id: 'wp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: item.url,
        name: item.name || 'Custom Wallpaper',
        isFavorite: false,
        createdAt: new Date().toISOString(),
      };
      const updatedList = [newItem, ...(appearanceState.customWallpapers || [])];
      updateAppearanceSettings({ customWallpapers: updatedList });
      return newItem;
    },
    [appearanceState.customWallpapers, updateAppearanceSettings]
  );

  // Save Custom Theme Preset
  const saveCustomTheme = useCallback(
    (name) => {
      const newPreset = {
        id: 'custom_theme_' + Date.now(),
        name: name || 'My Custom Theme',
        activeThemeId: appearanceState.activeThemeId,
        activeEffectId: appearanceState.activeEffectId,
        globalWallpaperUrl: appearanceState.globalWallpaperUrl,
        controls: { ...appearanceState.controls },
        createdAt: new Date().toISOString(),
      };
      const updatedList = [newPreset, ...(appearanceState.savedCustomThemes || [])];
      updateAppearanceSettings({ savedCustomThemes: updatedList });
    },
    [appearanceState, updateAppearanceSettings]
  );

  // Delete Custom Theme Preset
  const deleteCustomTheme = useCallback(
    (id) => {
      const updatedList = (appearanceState.savedCustomThemes || []).filter((t) => t.id !== id);
      updateAppearanceSettings({ savedCustomThemes: updatedList });
    },
    [appearanceState.savedCustomThemes, updateAppearanceSettings]
  );

  // Get active wallpaper for room
  const getActiveWallpaperForRoom = useCallback(
    (roomId) => {
      if (roomId && appearanceState.perChatWallpapers?.[roomId]) {
        return appearanceState.perChatWallpapers[roomId];
      }
      return appearanceState.globalWallpaperUrl;
    },
    [appearanceState.globalWallpaperUrl, appearanceState.perChatWallpapers]
  );

  // Reset Appearance
  const resetAppearance = useCallback(() => {
    updateAppearanceSettings(defaultAppearanceState);
  }, [updateAppearanceSettings]);

  return (
    <AppearanceContext.Provider
      value={{
        appearanceState,
        activeTheme: getThemeById(appearanceState.activeThemeId),
        setActiveTheme,
        setActiveEffect,
        setGlobalWallpaper,
        setPerChatWallpaper,
        updateControls,
        updateAnimationControls,
        updateSoundControls,
        addCustomWallpaper,
        saveCustomTheme,
        deleteCustomTheme,
        getActiveWallpaperForRoom,
        resetAppearance,
        defaultControls,
        defaultAnimationControls,
        defaultSoundControls,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
};
