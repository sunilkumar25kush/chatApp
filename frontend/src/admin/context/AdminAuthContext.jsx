import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import adminApi, {
  ADMIN_PROFILE_KEY,
  clearAdminSession,
  getAdminToken,
  setAdminSession
} from '../api/adminApi';

const AdminAuthContext = createContext(null);

export const DEV_SUPER_ADMIN = {
  _id: '6aeb81efe374dc81df074763',
  username: 'SuperAdmin',
  email: 'admin@example.com',
  role: 'super_admin',
  permissions: ['*'],
  mfaEnabled: true,
  status: 'active'
};

const readStoredAdmin = () => {
  try {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
    if (raw) return JSON.parse(raw);
    if (import.meta.env.DEV) return DEV_SUPER_ADMIN;
    return null;
  } catch {
    return import.meta.env.DEV ? DEV_SUPER_ADMIN : null;
  }
};

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(readStoredAdmin);
  const [loading, setLoading] = useState(!import.meta.env.DEV);

  const refresh = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      if (import.meta.env.DEV) {
        setAdmin((prev) => prev || DEV_SUPER_ADMIN);
      } else {
        setAdmin(null);
      }
      setLoading(false);
      return import.meta.env.DEV ? DEV_SUPER_ADMIN : null;
    }
    try {
      const { data } = await adminApi.get('/admin/auth/me');
      setAdmin(data.data);
      setAdminSession(token, data.data);
      return data.data;
    } catch {
      if (import.meta.env.DEV) {
        setAdmin((prev) => prev || DEV_SUPER_ADMIN);
        return DEV_SUPER_ADMIN;
      }
      clearAdminSession();
      setAdmin(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const completeLogin = useCallback((payload) => {
    setAdminSession(payload.token, payload.admin);
    setAdmin(payload.admin);
    return payload.admin;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await adminApi.post('/admin/auth/login', { email, password });
    if (data.mfaRequired) {
      return { mfaRequired: true, challengeToken: data.challengeToken };
    }
    const loggedIn = completeLogin(data);
    return { mfaRequired: false, admin: loggedIn };
  }, [completeLogin]);

  const verifyMfa = useCallback(async (challengeToken, code) => {
    const { data } = await adminApi.post('/admin/auth/mfa', { challengeToken, code });
    const loggedIn = completeLogin(data);
    return loggedIn;
  }, [completeLogin]);

  const logout = useCallback(async () => {
    try {
      await adminApi.post('/admin/auth/logout');
    } catch {
      /* session may already be invalid */
    }
    clearAdminSession();
    setAdmin(null);
  }, []);

  const hasPermission = useCallback((permission) => {
    if (import.meta.env.DEV) return true;
    if (!admin) return false;
    const permissions = admin.permissions || [];
    return permissions.includes('*') || permissions.includes(permission) || admin.role === 'super_admin';
  }, [admin]);

  const hasAnyPermission = useCallback((list = []) => {
    if (import.meta.env.DEV) return true;
    if (!admin) return false;
    const permissions = admin.permissions || [];
    if (permissions.includes('*') || admin.role === 'super_admin') return true;
    return list.some((permission) => permissions.includes(permission));
  }, [admin]);

  const value = useMemo(() => ({
    admin,
    loading,
    login,
    verifyMfa,
    logout,
    refresh,
    hasPermission,
    hasAnyPermission,
    setAdmin
  }), [admin, loading, login, verifyMfa, logout, refresh, hasPermission, hasAnyPermission]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return context;
};
