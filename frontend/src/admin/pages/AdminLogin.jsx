import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminTheme } from '../context/AdminThemeContext';
import { getApiErrorMessage } from '../api/adminApi';
import { adminToast } from '../components/AdminToaster';

export default function AdminLogin() {
  const { admin, login, verifyMfa } = useAdminAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Admin sign in · ChatRoom';
  }, []);

  if (admin) {
    return <Navigate to={admin.mfaEnabled ? '/admin' : '/admin/setup-mfa'} replace />;
  }

  const destination = location.state?.from || '/admin';

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(email.trim(), password);
      if (result.mfaRequired) {
        setChallengeToken(result.challengeToken);
        adminToast.info('Enter the code from your authenticator app');
      } else {
        adminToast.success('Welcome back');
        navigate(destination, { replace: true });
      }
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to sign in');
      setError(message);
      adminToast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await verifyMfa(challengeToken, code.trim());
      adminToast.success('Signed in');
      navigate(destination, { replace: true });
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Invalid authentication code');
      setError(message);
      adminToast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-root admin-login" data-theme={theme}>
      <aside className="admin-login__aside">
        <div className="admin-login__brand">
          <span className="admin-brand-mark">CR</span>
          ChatRoom Administration
        </div>

        <div className="admin-login__pitch">
          <h1>Moderation, insight and control in one secure console.</h1>
          <p>
            A dedicated administrative workspace with role-based access, audited moderation actions,
            live platform analytics and two-factor authentication. Every privileged action is recorded.
          </p>
        </div>

        <div className="admin-login__features">
          <span className="admin-login__feature"><ShieldCheck size={15} /> Server-side RBAC</span>
          <span className="admin-login__feature"><LockKeyhole size={15} /> Session revocation</span>
          <span className="admin-login__feature"><ShieldCheck size={15} /> Append-only audit trail</span>
        </div>
      </aside>

      <section className="admin-login__panel">
        <div className="admin-login__card">
          <div className="admin-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <span className="admin-badge admin-badge--primary">Secure admin access</span>
            <button type="button" className="admin-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
          </div>

          {!challengeToken ? (
            <>
              <h2>Admin sign in</h2>
              <p>Use your administrator credentials. Public registration is disabled.</p>

              {error ? <div className="admin-alert admin-alert--danger" style={{ marginBottom: 14 }}>{error}</div> : null}

              <form className="admin-login__stack" onSubmit={handlePasswordSubmit}>
                <div className="admin-field">
                  <label htmlFor="admin-email">Email address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--a-muted)' }} />
                    <input
                      id="admin-email"
                      type="email"
                      className="admin-input"
                      style={{ paddingLeft: 36 }}
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="admin-field">
                  <label htmlFor="admin-password">Password</label>
                  <div style={{ position: 'relative' }}>
                    <LockKeyhole size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--a-muted)' }} />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      className="admin-input"
                      style={{ paddingLeft: 36, paddingRight: 40 }}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      className="admin-icon-btn"
                      style={{ position: 'absolute', right: 3, top: 2, width: 32, height: 32, border: 0, background: 'transparent' }}
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="admin-btn admin-btn--primary admin-btn--block" disabled={busy}>
                  {busy ? <span className="admin-spinner" /> : <LockKeyhole />}
                  {busy ? 'Signing in…' : 'Sign in securely'}
                </button>
              </form>

              <div className="admin-login__meta">
                Failed attempts are rate limited and recorded. Sessions expire after 8 hours and can be
                revoked immediately by a Super Admin. Contact a Super Admin if you have lost access.
              </div>
            </>
          ) : (
            <>
              <h2>Two-factor verification</h2>
              <p>Enter the current 6-digit code from your authenticator app.</p>

              {error ? <div className="admin-alert admin-alert--danger" style={{ marginBottom: 14 }}>{error}</div> : null}

              <form className="admin-login__stack" onSubmit={handleMfaSubmit}>
                <div className="admin-field">
                  <label htmlFor="admin-mfa-code">Authentication code</label>
                  <input
                    id="admin-mfa-code"
                    className="admin-input admin-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                  />
                </div>

                <button type="submit" className="admin-btn admin-btn--primary admin-btn--block" disabled={busy || code.length < 6}>
                  {busy ? <span className="admin-spinner" /> : <ShieldCheck />}
                  {busy ? 'Verifying…' : 'Verify and continue'}
                </button>

                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--block"
                  onClick={() => {
                    setChallengeToken('');
                    setCode('');
                    setError('');
                  }}
                >
                  Use a different account
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
