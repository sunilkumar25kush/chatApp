import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const defaultTheme = {
  preset: 'default',
  primaryColor: '#7c3aed',
  msgIncomingBg: '#222530',
  msgOutgoingBg: '#7c3aed',
  chatBg: '#181a20',
  sidebarBg: '#1a1c23',
  borderRadius: '12px',
  fontFamily: 'Inter',
};

// Surface tokens that must flip with the color mode (dark ↔ light).
// These are intentionally NOT set inline in light mode so the stylesheet
// `body.theme-light` palette can take over with correct contrast.
const SURFACE_TOKENS = ['--theme-chat-bg', '--theme-sidebar-bg', '--theme-msg-in-bg'];

const resolveSystemMode = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export const ThemeProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [theme, setThemeState] = useState(() => {
    // 1. Try to load from localStorage first for instant render
    const saved = localStorage.getItem('gajim_theme');
    if (saved) {
      try {
        return { ...defaultTheme, ...JSON.parse(saved) };
      } catch (e) {
        return defaultTheme;
      }
    }
    return defaultTheme;
  });

  // Color mode: 'dark' | 'light' | 'system' (persisted separately)
  const [mode, setModeState] = useState(() => {
    const saved = localStorage.getItem('gajim_theme_mode');
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  });

  const [systemMode, setSystemMode] = useState(resolveSystemMode);

  // Follow OS preference when mode === 'system'
  useEffect(() => {
    if (mode !== 'system') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e) => setSystemMode(e.matches ? 'light' : 'dark');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const resolvedMode = mode === 'system' ? systemMode : mode;

  // 2. Sync with User data from MongoDB on login
  useEffect(() => {
    if (isAuthenticated && user?.theme) {
      const mergedTheme = { ...defaultTheme, ...user.theme };
      setThemeState(mergedTheme);
      localStorage.setItem('gajim_theme', JSON.stringify(mergedTheme));
    }
  }, [user, isAuthenticated]);

  // 3. Inject CSS Variables dynamically whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.primaryColor);
    root.style.setProperty('--theme-msg-out-bg', theme.msgOutgoingBg);
    root.style.setProperty('--theme-radius', theme.borderRadius);
    root.style.setProperty('--theme-font', theme.fontFamily);

    let isAppearanceLight = false;
    let hasCustomAppearanceTheme = false;
    const appearance = localStorage.getItem('appearance_studio_v2');
    try {
      const parsed = JSON.parse(appearance);
      if (parsed && parsed.activeThemeId && parsed.activeThemeId !== 'default') {
        hasCustomAppearanceTheme = true;
      }
      if (['sakura', 'pastel', 'snow'].includes(parsed?.activeThemeId)) {
        isAppearanceLight = true;
      }
    } catch (e) {}

    if (!hasCustomAppearanceTheme) {
      if (resolvedMode === 'light') {
        // Let the stylesheet's light palette control surfaces for contrast.
        SURFACE_TOKENS.forEach((t) => root.style.removeProperty(t));
      } else {
        root.style.setProperty('--theme-chat-bg', theme.chatBg);
        root.style.setProperty('--theme-sidebar-bg', theme.sidebarBg);
        root.style.setProperty('--theme-msg-in-bg', theme.msgIncomingBg);
      }
    }

    // Apply special classes to body & root for complex themes
    document.body.classList.toggle('theme-glass', theme.preset === 'glassmorphism');
    document.body.classList.toggle('theme-amoled', theme.preset === 'amoled');

    if (resolvedMode === 'light') {
      root.classList.add('theme-light');
      document.body.classList.add('theme-light');
    } else {
      if (!isAppearanceLight) {
        root.classList.remove('theme-light');
        document.body.classList.remove('theme-light');
      }
    }

    // Native form controls + scrollbars follow the mode
    root.style.colorScheme = (resolvedMode === 'light' || isAppearanceLight) ? 'light' : 'dark';
  }, [theme, resolvedMode]);

  // Update theme locally and persist to MongoDB
  const updateTheme = useCallback(async (newThemeUpdates) => {
    const updatedTheme = { ...theme, ...newThemeUpdates };
    setThemeState(updatedTheme);
    localStorage.setItem('gajim_theme', JSON.stringify(updatedTheme));

    if (isAuthenticated) {
      try {
        await api.put('/users/theme', { theme: newThemeUpdates });
      } catch (err) {
        console.error('Failed to save theme to server:', err);
      }
    }
  }, [theme, isAuthenticated]);

  const resetTheme = useCallback(async () => {
    setThemeState(defaultTheme);
    localStorage.removeItem('gajim_theme');
    if (isAuthenticated) {
      try {
        await api.put('/users/theme', { theme: defaultTheme });
      } catch (err) {
        console.error('Failed to reset theme on server:', err);
      }
    }
  }, [isAuthenticated]);

  // Toggle color mode: 'dark' | 'light' | 'system'
  const setMode = useCallback((nextMode) => {
    if (!['dark', 'light', 'system'].includes(nextMode)) return;
    setModeState(nextMode);
    localStorage.setItem('gajim_theme_mode', nextMode);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, updateTheme, resetTheme, defaultTheme, mode, setMode, resolvedMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
