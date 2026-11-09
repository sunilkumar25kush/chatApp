import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import toast from '../utils/toast';
import './Auth.css';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register, error: serverError, setError } = useAuth();
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';
  const navigate = useNavigate();

  const validateForm = () => {
    if (!username.trim()) {
      return 'Username is required';
    }
    if (username.trim().length < 3) {
      return 'Username must be at least 3 characters long';
    }
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
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
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
      toast.error('Validation Error', { description: errorMsg });
      return;
    }

    setSubmitting(true);
    try {
      const result = await register(username.trim(), email.trim(), password);
      if (result.success) {
        toast.success('Account Created!', { description: 'Welcome to ChatRoom. Redirecting to chat...' });
        navigate('/chat', { replace: true });
      } else if (result.error) {
        toast.error('Registration Failed', { description: result.error });
      }
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
        <section className="auth-card-column" aria-label="Registration Form">
          <div className="auth-floating-card">
            {/* Header */}
            <div className="auth-card-header">
              <h1 className="auth-card-title">Join ChatRoom</h1>
              <p className="auth-card-subtitle">
                Create your account in seconds and unlock real-time channels and HD calling
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
            <form onSubmit={handleSubmit} noValidate className="auth-form">
              {/* Username Input */}
              <div className="auth-input-pill-wrapper">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="register-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Choose a username"
                  className="auth-input-pill"
                />
              </div>

              {/* Email Input */}
              <div className="auth-input-pill-wrapper">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="register-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Email address"
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
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Password (min. 6 characters)"
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

              {/* Confirm Password Input */}
              <div className="auth-input-pill-wrapper">
                <svg className="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <input
                  id="register-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="Confirm password"
                  className="auth-input-pill"
                />
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
                    <span>Creating account...</span>
                  </>
                ) : (
                  <span>Create Account</span>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="auth-card-footer">
              Already have an account?{' '}
              <Link to="/login" className="auth-link">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
