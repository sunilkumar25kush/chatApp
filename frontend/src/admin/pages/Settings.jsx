import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Save, Settings as SettingsIcon } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  ConfirmDialog, ErrorState, Field, PageHeader, Skeleton, Switch
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate } from '../utils/format';

const FORMAT_OPTIONS = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar', 'xlsx', 'webm', 'mp3', 'wav', 'm4a', 'ogg', 'mp4'];

const Card = ({ title, description, children }) => (
  <div className="admin-card">
    <div className="admin-card__head"><div><h3>{title}</h3><p>{description}</p></div></div>
    <div className="admin-card__body">{children}</div>
  </div>
);

export default function SettingsPage() {
  const { hasPermission } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const canManage = hasPermission('settings.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/admin/settings');
      setSettings(response.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load settings');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'System settings · ChatRoom Admin';
    load();
  }, [load]);

  const update = (path, value) => {
    setSettings((current) => {
      if (!current) return current;
      if (!path.includes('.')) return { ...current, [path]: value };
      const [root, key] = path.split('.');
      return { ...current, [root]: { ...current[root], [key]: value } };
    });
  };

  const toggleFormat = (format) => {
    const current = settings.allowedUploadFormats || [];
    update('allowedUploadFormats', current.includes(format) ? current.filter((item) => item !== format) : [...current, format]);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload = {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        maxMessageLength: settings.maxMessageLength,
        maxRoomMembers: settings.maxRoomMembers,
        maxFileSizeMB: settings.maxFileSizeMB,
        allowedUploadFormats: settings.allowedUploadFormats,
        rateLimit: settings.rateLimit,
        registrationEnabled: settings.registrationEnabled,
        friendRequestsEnabled: settings.friendRequestsEnabled,
        publicRoomCreationEnabled: settings.publicRoomCreationEnabled,
        privateRoomCreationEnabled: settings.privateRoomCreationEnabled,
        featureFlags: settings.featureFlags,
        announcement: settings.announcement
      };
      const response = await adminApi.patch('/admin/settings', payload);
      setSettings(response.data.data);
      adminToast.success('Settings saved and cache invalidated');
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const response = await adminApi.post('/admin/settings/reset');
      setSettings(response.data.data);
      adminToast.success('Settings reset to defaults');
      setResetOpen(false);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to reset settings'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="System settings" description="Platform configuration and feature flags." />
        <div className="admin-grid admin-grid--2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="admin-card" key={index}><div className="admin-card__body"><Skeleton width="55%" height={16} /><div style={{ marginTop: 16 }}><Skeleton width="100%" height={38} /></div><div style={{ marginTop: 10 }}><Skeleton width="80%" height={38} /></div></div></div>
          ))}
        </div>
      </>
    );
  }

  if (error || !settings) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="System settings"
        description="Settings are stored in MongoDB, cached briefly, and audited on every change."
        actions={(
          <>
            <button type="button" className="admin-btn" onClick={load} disabled={saving}><RefreshCw /> Reload</button>
            {canManage ? <button type="button" className="admin-btn" onClick={() => setResetOpen(true)} disabled={saving}><RotateCcw /> Reset</button> : null}
            {canManage ? <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>{saving ? <span className="admin-spinner" /> : <Save />} Save settings</button> : null}
          </>
        )}
      />

      {settings.maintenanceMode ? (
        <div className="admin-alert admin-alert--warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={18} />
          <div><strong>Maintenance mode is active.</strong> Non-admin API requests receive HTTP 503. The admin panel remains available.</div>
        </div>
      ) : null}

      <div className="admin-grid admin-grid--2">
        <Card title="Maintenance & registration" description="Control platform availability and new signups.">
          <div className="admin-stack">
            <Switch checked={settings.maintenanceMode} onChange={(value) => update('maintenanceMode', value)} disabled={!canManage} label="Maintenance mode" description="Blocks normal user API traffic with a maintenance response." />
            <Field label="Maintenance message">
              <textarea className="admin-textarea" value={settings.maintenanceMessage} onChange={(event) => update('maintenanceMessage', event.target.value)} disabled={!canManage} />
            </Field>
            <Switch checked={settings.registrationEnabled} onChange={(value) => update('registrationEnabled', value)} disabled={!canManage} label="Public registration" description="Allow new users to create an account." />
            <Switch checked={settings.friendRequestsEnabled} onChange={(value) => update('friendRequestsEnabled', value)} disabled={!canManage} label="Friend requests" description="Allow sending new friend requests." />
            <Switch checked={settings.publicRoomCreationEnabled} onChange={(value) => update('publicRoomCreationEnabled', value)} disabled={!canManage} label="Public room creation" description="Allow users to create public rooms." />
            <Switch checked={settings.privateRoomCreationEnabled} onChange={(value) => update('privateRoomCreationEnabled', value)} disabled={!canManage} label="Private room creation" description="Allow users to create private rooms." />
          </div>
        </Card>

        <Card title="Limits" description="Message, room and upload constraints.">
          <div className="admin-form-grid">
            <Field label="Max message length" hint="1–10,000 characters.">
              <input className="admin-input" type="number" min="1" max="10000" value={settings.maxMessageLength} onChange={(event) => update('maxMessageLength', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Max room members" hint="2–100,000.">
              <input className="admin-input" type="number" min="2" max="100000" value={settings.maxRoomMembers} onChange={(event) => update('maxRoomMembers', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Max upload size (MB)" hint="1–1,024 MB.">
              <input className="admin-input" type="number" min="1" max="1024" value={settings.maxFileSizeMB} onChange={(event) => update('maxFileSizeMB', event.target.value)} disabled={!canManage} />
            </Field>
          </div>
          <div className="admin-divider" />
          <Field label="Allowed upload formats">
            <div className="admin-row" style={{ gap: 4 }}>
              {FORMAT_OPTIONS.map((format) => (
                <label className="admin-check" key={format} style={{ padding: '2px 8px 2px 0' }}>
                  <input type="checkbox" checked={(settings.allowedUploadFormats || []).includes(format)} onChange={() => toggleFormat(format)} disabled={!canManage} />
                  {format}
                </label>
              ))}
            </div>
          </Field>
        </Card>

        <Card title="Feature flags" description="Enable or disable product capabilities.">
          <div className="admin-stack">
            {[
              ['voiceCalls', 'Voice calls', 'LiveKit voice calling'],
              ['videoCalls', 'Video calls', 'LiveKit video calling'],
              ['screenSharing', 'Screen sharing', 'In-call screen share'],
              ['fileUploads', 'File uploads', 'Room and direct-message attachments'],
              ['googleAuth', 'Google sign-in', 'OAuth login for users'],
              ['directMessages', 'Direct messages', 'Private one-to-one messaging']
            ].map(([key, label, description]) => (
              <Switch key={key} checked={settings.featureFlags?.[key]} onChange={(value) => update(`featureFlags.${key}`, value)} disabled={!canManage} label={label} description={description} />
            ))}
          </div>
        </Card>

        <Card title="Rate limiting" description="Stored limits for operators; gateway limits are configured in the server environment.">
          <div className="admin-form-grid">
            <Field label="Global window (minutes)">
              <input className="admin-input" type="number" min="1" max="1440" value={settings.rateLimit?.windowMinutes} onChange={(event) => update('rateLimit.windowMinutes', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Max requests / window">
              <input className="admin-input" type="number" min="10" max="100000" value={settings.rateLimit?.maxRequests} onChange={(event) => update('rateLimit.maxRequests', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Auth attempts / window">
              <input className="admin-input" type="number" min="3" max="1000" value={settings.rateLimit?.authMaxAttempts} onChange={(event) => update('rateLimit.authMaxAttempts', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Friend requests / window">
              <input className="admin-input" type="number" min="1" max="1000" value={settings.rateLimit?.friendRequestMax} onChange={(event) => update('rateLimit.friendRequestMax', event.target.value)} disabled={!canManage} />
            </Field>
          </div>
        </Card>

        <Card title="Platform banner" description="Optional banner delivered through the public settings endpoint.">
          <div className="admin-stack">
            <Switch checked={settings.announcement?.enabled} onChange={(value) => update('announcement.enabled', value)} disabled={!canManage} label="Announcement feature enabled" description="Master switch for admin announcements." />
            <Switch checked={settings.announcement?.bannerEnabled} onChange={(value) => update('announcement.bannerEnabled', value)} disabled={!canManage} label="Show platform banner" />
            <Field label="Banner text">
              <input className="admin-input" maxLength={300} value={settings.announcement?.bannerText || ''} onChange={(event) => update('announcement.bannerText', event.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Banner type">
              <select className="admin-select" value={settings.announcement?.bannerType || 'info'} onChange={(event) => update('announcement.bannerType', event.target.value)} disabled={!canManage}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Audit information" description="Read-only metadata for this settings document.">
          <dl className="admin-kv">
            <dt>Document key</dt><dd className="admin-mono">{settings.key}</dd>
            <dt>Last updated</dt><dd>{formatDate(settings.updatedAt)}</dd>
            <dt>Last updated by</dt><dd>{settings.updatedBy?.username || settings.updatedBy || '—'}</dd>
            <dt>Created</dt><dd>{formatDate(settings.createdAt)}</dd>
          </dl>
          <div className="admin-alert admin-mt"><SettingsIcon size={16} /><div>Every settings change is written to the append-only audit log with the administrator, IP address and changed fields.</div></div>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all settings"
        description="Restore every system setting to its default value. This is audited and takes effect immediately."
        confirmLabel="Reset settings"
        tone="danger"
        busy={saving}
        onConfirm={reset}
      />
    </>
  );
}
