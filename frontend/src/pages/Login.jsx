import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';
import { connectSocket } from '../services/socket';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, error: serverError, setError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = location.state?.from?.pathname || '/chat';

  const validateForm = () => {
    if (!email.trim()) {
      return 'Email address is required';
    }
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Password is required';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    setError(null);

    const errorMsg = validateForm();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      navigate(redirectPath, { replace: true });
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
      window.location.href = redirectPath;
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Google login failed.';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const activeError = validationError || serverError;

  return (
    <div className="auth-container">
      {/* Ambient background blur elements */}
      <div className="auth-ambient-blur-1" aria-hidden="true" />
      <div className="auth-ambient-blur-2" aria-hidden="true" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-badge">
            <span className="auth-spark">✦</span> ChatRoom
          </div>
          <h2>Welcome Back</h2>
          <p>Sign in to access your encrypted conversations and rooms</p>
        </div>

        {activeError && (
          <div className="auth-error-alert" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{activeError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <div className="input-with-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-leading-icon">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
            </div>
            <div className="input-with-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-leading-icon">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="icon-eye">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="icon-eye">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary auth-submit-btn"
            disabled={submitting}
          >
            {submitting ? (
              <span className="btn-loading-state">
                <span className="spinner-ring" />
                <span>Signing In...</span>
              </span>
            ) : (
              <span>Sign In to ChatRoom</span>
            )}
          </button>
        </form>

        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        <div className="google-auth-wrapper">
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              setValidationError('');
              setError(null);
              googleSuccessHandler(credentialResponse);
            }}
            onError={() => setError('Google Sign-In failed. Please try again.')}
            theme="filled_black"
            shape="pill"
            text="signin_with"
            size="large"
            width="100%"
          />
        </div>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="auth-switch-link">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
