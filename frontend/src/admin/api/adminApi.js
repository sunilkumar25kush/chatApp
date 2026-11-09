import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

export const ADMIN_TOKEN_KEY = 'chatroom_admin_token';
export const ADMIN_PROFILE_KEY = 'chatroom_admin_profile';

export const getAdminToken = () => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminSession = (token, admin) => {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    if (admin) localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(admin));
  } catch {
    /* storage unavailable */
  }
};

export const clearAdminSession = () => {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
  } catch {
    /* storage unavailable */
  }
};

const adminApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

adminApi.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    // In development mode, do not forcibly redirect to login
    if (!import.meta.env.DEV) {
      if (status === 401) {
        clearAdminSession();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/login')) {
          window.location.assign('/admin/login');
        }
      }
      if (status === 403 && code === 'MFA_SETUP_REQUIRED') {
        if (typeof window !== 'undefined' && window.location.pathname !== '/admin/setup-mfa') {
          window.location.assign('/admin/setup-mfa');
        }
      }
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || error?.message || fallback;

export default adminApi;
