import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import { PageHeader, Skeleton } from '../components/ui';
import { adminToast } from '../components/AdminToaster';

export default function MfaSetup() {
  const { admin, refresh } = useAdminAuth();
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const startSetup = async () => {
    setStarting(true);
    setError('');
    try {
      const { data } = await adminApi.post('/admin/auth/mfa/setup');
      setSetup({ secret: data.secret, otpauthUrl: data.otpauthUrl });
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Could not start MFA setup');
      setError(message);
      adminToast.error(message);
    } finally {
      setStarting(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setup?.secret || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      adminToast.warning('Copy failed. Select the secret manually.');
    }
  };

  const enable = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.post('/admin/auth/mfa/enable', { code: code.trim() });
      await refresh();
      adminToast.success('Two-factor authentication enabled');
      navigate('/admin', { replace: true });
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Could not enable MFA');
      setError(message);
      adminToast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (admin?.mfaEnabled) {
    return (
      <>
        <PageHeader title="Two-factor authentication" description="Your account is already protected with MFA." />
        <div className="admin-card">
          <div className="admin-card__body admin-row" style={{ gap: 12 }}>
            <span className="admin-stat__icon" style={{ color: 'var(--a-success)', background: 'var(--a-success-soft)' }}><ShieldCheck /></span>
            <div>
              <strong>MFA is active</strong>
              <p className="admin-text-muted">You will be asked for a 6-digit code whenever you sign in.</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Enable two-factor authentication"
        description="MFA is required before operational admin tools can be used. Use any TOTP authenticator app."
      />

      {error ? <div className="admin-alert admin-alert--danger" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="admin-grid admin-grid--2">
        <div className="admin-card">
          <div className="admin-card__head"><h3>1. Add the account</h3></div>
          <div className="admin-card__body admin-stack">
            <p className="admin-text-muted">
              Open Google Authenticator, 1Password, Authy or any TOTP-compatible app, then add this account.
              You can enter the secret manually or copy the provisioning URI.
            </p>

            {!setup ? (
              <button type="button" className="admin-btn admin-btn--primary" onClick={startSetup} disabled={starting}>
                {starting ? <span className="admin-spinner" /> : <ShieldCheck />}
                {starting ? 'Generating secret…' : 'Generate MFA secret'}
              </button>
            ) : (
              <div className="admin-stack">
                <div className="admin-field">
                  <label>Manual secret</label>
                  <code className="admin-setup-code">{setup.secret}</code>
                </div>
                <button type="button" className="admin-btn admin-btn--sm" onClick={copySecret} style={{ width: 'fit-content' }}>
                  {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy secret'}
                </button>
                <div className="admin-field">
                  <label>Provisioning URI</label>
                  <code className="admin-setup-code">{setup.otpauthUrl}</code>
                </div>
                <p className="admin-field__hint">
                  Account: <strong>{admin?.email}</strong>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__head"><h3>2. Verify the code</h3></div>
          <div className="admin-card__body">
            {!setup ? (
              <div className="admin-stack">
                <Skeleton width="80%" height={12} />
                <Skeleton width="65%" height={12} />
                <Skeleton width="100%" height={38} />
                <p className="admin-field__hint">Generate the secret first to continue.</p>
              </div>
            ) : (
              <form className="admin-stack" onSubmit={enable}>
                <div className="admin-field">
                  <label htmlFor="mfa-code">6-digit code</label>
                  <input
                    id="mfa-code"
                    className="admin-input admin-code-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                  />
                </div>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || code.length < 6}>
                  {busy ? <span className="admin-spinner" /> : <ShieldCheck />}
                  {busy ? 'Enabling…' : 'Enable MFA'}
                </button>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={startSetup} disabled={starting}>
                  Generate a new secret
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
