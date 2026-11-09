import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';
import { connectSocket } from '../services/socket';
import toast from '../utils/toast';
import './Auth.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, error: serverError, setError } = useAuth();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = location.state?.from?.pathname || '/chat';

  // Load remembered email on mount
  useEffect(() => {
    const saved = localStorage.getItem('remember_email');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const validateForm = () => {
    if (!email.trim()) {
      return 'Email or username is required';
    }
    if (!password) {
      return 'Password is required';
    }
    return null;
  };

  const handleSignIn = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setValidationError('');
    setError(null);

    const errorMsg = validateForm();
    if (errorMsg) {
      setValidationError(errorMsg);
      toast.error('Validation Error', { description: errorMsg });
      return;
    }

    if (rememberMe) {
      localStorage.setItem('remember_email', email.trim());
    } else {
      localStorage.removeItem('remember_email');
    }

    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (result.success) {
        toast.success('Welcome back!', { description: 'Logged in successfully.' });
        navigate(redirectPath, { replace: true });
      } else if (result.error) {
        toast.error('Login Failed', { description: result.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Google OAuth flow
  const googleSuccessHandler = async (credentialResponse) => {
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      setError('Google sign-in failed. No credential returned.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post('/auth/google', { idToken });
      const { token, ...userData } = response.data;
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));

      connectSocket(token || undefined);
      toast.success('Welcome!', { description: 'Signed in with Google successfully.' });
      window.location.href = redirectPath;
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Google login failed.';
      setError(errorMessage);
      toast.error('Google Sign-In Error', { description: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = validationError || serverError;

  return (
    <div className={`auth-page-root ${isDark ? 'theme-dark-mode' : 'theme-light-mode'}`}>
      {/* Organic Animated Backdrop */}
      <div className="auth-canvas-backdrop" aria-hidden="true">
        <div className="auth-cloud auth-cloud-1" />
        <div className="auth-cloud auth-cloud-2" />
        <div className="auth-cloud auth-cloud-3" />
        <div className="auth-cloud auth-cloud-4" />
      </div>

      {/* Main Two-Column Stage */}
      <main className="auth-stage-container">
        {/* Left Column: Artwork & Storytelling */}
        <section className="auth-art-column" aria-label="Welcome Illustration">
          <div className="auth-art-visual-wrapper">
            <img
              src="/images/auth-illustration.jpg"
              alt="Friends hanging out and chatting together"
              className="auth-art-img"
              loading="eager"
            />
          </div>
        </section>

        {/* Right Column: Floating Auth Card */}
        <section className="auth-card-column" aria-label="Login Form">
          <div className="auth-floating-card">
            {/* Header */}
            <div className="auth-card-header">
              <h1 className="auth-card-title">Welcome to ChatRoom</h1>
              <p className="auth-card-subtitle">
                Connect with friends and teams through real-time chat, voice, and video rooms
              </p>
            </div>

            {/* Error Message */}
            {activeError && (
              <div className="auth-error-banner" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{activeError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSignIn} noValidate className="auth-form">
              {/* Username / Email Input */}
              <div className="auth-input-pill-wrapper">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="login-email"
                  type="text"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Username or email"
                  className="auth-input-pill"
                />
              </div>

              {/* Password Input */}
              <div className="auth-input-pill-wrapper">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Password"
                  className="auth-input-pill"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="auth-input-toggle-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Utilities Row: Remember Me & Forgot Password */}
              <div className="auth-utilities-row">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="auth-custom-checkbox"
                  />
                  <span>Remember me</span>
                </label>

                <Link to="/forgot-password" className="auth-link">
                  Forgot password?
                </Link>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="auth-submit-btn"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span>Logging in...</span>
                  </>
                ) : (
                  <span>Login</span>
                )}
              </button>

              {/* Social Login Divider */}
              <div className="auth-divider" aria-hidden="true">
                <span>or continue with</span>
              </div>

              {/* Google OAuth Button */}
              <div className="auth-google-container">
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    setValidationError('');
                    setError(null);
                    googleSuccessHandler(credentialResponse);
                  }}
                  onError={() => setError('Google Sign-In failed. Please try again.')}
                  theme={isDark ? 'filled_black' : 'outline'}
                  shape="pill"
                  text="signin_with"
                  size="large"
                  width="100%"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="auth-card-footer">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="auth-link">
                Sign up
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
