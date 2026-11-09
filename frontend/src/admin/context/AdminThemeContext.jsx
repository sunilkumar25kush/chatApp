import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AdminThemeContext = createContext(null);
const STORAGE_KEY = 'chatroom_admin_theme';

const resolveInitial = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
};

export function AdminThemeProvider({ children }) {
  const [theme, setTheme] = useState(resolveInitial);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    return () => {
      document.documentElement.style.colorScheme = '';
    };
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    setTheme
  }), [theme]);

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export const useAdminTheme = () => {
  const context = useContext(AdminThemeContext);
  if (!context) throw new Error('useAdminTheme must be used inside AdminThemeProvider');
  return context;
};
