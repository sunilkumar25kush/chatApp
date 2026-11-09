import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Eye, RefreshCw, RotateCcw, ShieldOff, Trash2, UserCheck, UserX } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination,
  SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber, relativeTime } from '../utils/format';

const ACTIONS = {
  suspend: { title: 'Suspend user', endpoint: 'suspend', tone: 'danger', label: 'Suspend account', needsReason: true, duration: true },
  ban: { title: 'Ban user', endpoint: 'ban', tone: 'danger', label: 'Ban account', needsReason: true },
  restore: { title: 'Restore user', endpoint: 'restore', tone: 'primary', label: 'Restore account', needsReason: false },
  revoke: { title: 'Revoke sessions', endpoint: 'revoke-sessions', tone: 'primary', label: 'Revoke sessions', needsReason: true, post: true },
  delete: { title: 'Delete user', endpoint: '', tone: 'danger', label: 'Delete account', needsReason: true, confirmText: 'DELETE' }
};

export default function UsersPage() {
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [online, setOnline] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const [action, setAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionDuration, setActionDuration] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/admin/users', {
        params: { page, limit: 20, search: search || undefined, status: status || undefined, provider: provider || undefined, online: online ? 'true' : undefined }
      });
      setRows(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load users');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, provider, online]);

  useEffect(() => {
    document.title = 'Users · ChatRoom Admin';
    load();
  }, [load]);

  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/users/${id}`);
      setDetail(response.data.data);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to load user'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openAction = (type, user) => {
    setAction({ type, user });
    setActionReason('');
    setActionNote('');
    setActionDuration('');
    setConfirmText('');
  };

  const submitAction = async () => {
    if (!action) return;
    const config = ACTIONS[action.type];
    if (config.needsReason && actionReason.trim().length < 3) {
      adminToast.warning('Please provide a reason (at least 3 characters)');
      return;
    }
    if (config.confirmText && confirmText !== config.confirmText) {
      adminToast.warning(`Type ${config.confirmText} to confirm`);
      return;
    }
    setActionBusy(true);
    try {
      const payload = {
        reason: actionReason.trim() || undefined,
        note: actionNote.trim() || undefined,
        durationHours: actionDuration ? Number(actionDuration) : undefined
      };
      if (action.type === 'delete') {
        await adminApi.delete(`/admin/users/${action.user._id}`, { data: { ...payload, confirmation: confirmText } });
      } else if (config.post) {
        await adminApi.post(`/admin/users/${action.user._id}/${config.endpoint}`, payload);
      } else {
        await adminApi.post(`/admin/users/${action.user._id}/${config.endpoint}`, payload);
      }
      adminToast.success(`${config.title} completed`);
      setAction(null);
      if (detail?._id === action.user._id) openDetail(action.user._id);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Action failed'));
    } finally {
      setActionBusy(false);
    }
  };

  const stats = detail?.stats;

  const statusOptions = useMemo(() => ['active', 'suspended', 'banned', 'deleted'], []);

  return (
    <>
      <PageHeader
        title="Users"
        description="Search accounts, inspect activity and apply audited moderation actions."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search username, email, name or public ID…" />
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Status filter">
            <option value="">All statuses</option>
            {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select className="admin-select" value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }} aria-label="Provider filter">
            <option value="">All providers</option>
            <option value="local">Local</option>
            <option value="google">Google</option>
          </select>
          <label className="admin-check" style={{ padding: 0 }}>
            <input type="checkbox" checked={online} onChange={(event) => { setOnline(event.target.checked); setPage(1); }} />
            Online only
          </label>
        </div>

        {loading ? <TableSkeleton rows={8} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search or clear the filters." action={<button type="button" className="admin-btn" onClick={() => { setSearch(''); setStatus(''); setProvider(''); setOnline(false); }}>Clear filters</button>} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>User</th><th>Status</th><th>Provider</th><th>Last seen</th><th>Joined</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div className="admin-table__primary">
                          <span className="admin-avatar" style={{ position: 'relative' }}>
                            {String(user.username || '?').slice(0, 2)}
                            {user.isOnline ? <span style={{ position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%', background: 'var(--a-success)', border: '2px solid var(--a-surface)' }} /> : null}
                          </span>
                          <div>
                            <strong>{user.username || 'Unknown'}</strong>
                            <span>{user.email}{user.publicId ? ` · ${user.publicId}` : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td><Badge>{user.accountStatus || 'active'}</Badge></td>
                      <td className="admin-table__muted admin-capitalize">{user.provider || 'local'}</td>
                      <td className="admin-table__muted">{user.isOnline ? 'Online now' : relativeTime(user.lastSeen || user.lastLoginAt)}</td>
                      <td className="admin-table__muted">{formatDate(user.createdAt, { hour: undefined, minute: undefined })}</td>
                      <td>
                        <div className="admin-table__actions">
                          <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(user._id)}><Eye /> View</button>
                          {hasPermission('users.suspend') && user.accountStatus !== 'suspended' && user.accountStatus !== 'deleted' ? (
                            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('suspend', user)}><UserX /></button>
                          ) : null}
                          {hasPermission('users.restore') && ['suspended', 'banned'].includes(user.accountStatus) ? (
                            <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('restore', user)}><RotateCcw /></button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.username || 'User details'}
        description={detail?.email}
        size="lg"
        footer={detail ? (
          <div className="admin-row" style={{ marginRight: 'auto', width: '100%' }}>
            {hasPermission('users.suspend') && detail.accountStatus !== 'suspended' && detail.accountStatus !== 'deleted' ? (
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => openAction('suspend', detail)}><UserX /> Suspend</button>
            ) : null}
            {hasPermission('users.ban') && detail.accountStatus !== 'banned' && detail.accountStatus !== 'deleted' ? (
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => openAction('ban', detail)}><Ban /> Ban</button>
            ) : null}
            {hasPermission('users.restore') && ['suspended', 'banned'].includes(detail.accountStatus) ? (
              <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => openAction('restore', detail)}><UserCheck /> Restore</button>
            ) : null}
            {hasPermission('users.edit') ? (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('revoke', detail)}><ShieldOff /> Revoke sessions</button>
            ) : null}
            {hasPermission('users.delete') && detail.accountStatus !== 'deleted' ? (
              <button type="button" className="admin-btn admin-btn--sm admin-text-danger" onClick={() => openAction('delete', detail)}><Trash2 /> Delete</button>
            ) : null}
          </div>
        ) : null}
      >
        {detailLoading ? <TableSkeleton rows={6} columns={2} /> : detail ? (
          <div className="admin-stack">
            <div className="admin-row" style={{ gap: 14 }}>
              <span className="admin-avatar" style={{ width: 52, height: 52, flexBasis: 52, fontSize: 18 }}>{String(detail.username || '?').slice(0, 2)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="admin-row" style={{ gap: 7 }}>
                  <strong style={{ fontSize: 17 }}>{detail.username}</strong>
                  <Badge>{detail.accountStatus || 'active'}</Badge>
                  {detail.isOnline ? <Badge tone="success">online</Badge> : null}
                </div>
                <div className="admin-text-muted">{detail.publicId} · {detail.email}</div>
              </div>
            </div>

            {detail.accountStatus !== 'active' ? (
              <div className="admin-alert admin-alert--warning">
                <div>
                  <strong>Account is {detail.accountStatus}</strong>
                  {detail.moderation?.reason ? <div>Reason: {detail.moderation.reason}</div> : null}
                  {detail.suspendedUntil ? <div>Suspended until {formatDate(detail.suspendedUntil)}</div> : null}
                </div>
              </div>
            ) : null}

            <div className="admin-grid admin-grid--3">
              {[
                ['Rooms owned', stats?.roomsOwned],
                ['Room messages', stats?.roomMessages],
                ['Direct messages', stats?.directMessages],
                ['Friends', stats?.acceptedFriends],
                ['Open reports', stats?.pendingReports],
                ['Reports total', stats?.reportsAgainst]
              ].map(([label, value]) => (
                <div key={label} style={{ padding: 12, border: '1px solid var(--a-border)', borderRadius: 10, background: 'var(--a-surface-2)' }}>
                  <div className="admin-text-muted" style={{ fontSize: 11 }}>{label}</div>
                  <strong style={{ fontSize: 19 }}>{formatNumber(value)}</strong>
                </div>
              ))}
            </div>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Profile & activity</h4>
              <dl className="admin-kv">
                <dt>Full name</dt><dd>{detail.fullName || '—'}</dd>
                <dt>Provider</dt><dd className="admin-capitalize">{detail.provider || 'local'}</dd>
                <dt>Joined</dt><dd>{formatDate(detail.createdAt)}</dd>
                <dt>Last login</dt><dd>{formatDate(detail.lastLoginAt)}</dd>
                <dt>Last seen</dt><dd>{formatDate(detail.lastSeen)}</dd>
                <dt>Registration IP</dt><dd>{detail.registrationIp || '—'}</dd>
                <dt>Last login IP</dt><dd>{detail.lastLoginIp || '—'}</dd>
                <dt>Bio</dt><dd>{detail.bio || '—'}</dd>
              </dl>
            </div>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Recent reports against this user</h4>
              {detail.recentReports?.length ? detail.recentReports.map((report) => (
                <div className="admin-health-row" key={report._id}>
                  <div>
                    <strong>{report.category?.replace(/_/g, ' ')}</strong>
                    <div className="admin-table__muted">By {report.reporter?.username || 'unknown'} · {relativeTime(report.createdAt)}</div>
                  </div>
                  <Badge>{report.status}</Badge>
                </div>
              )) : <p className="admin-text-muted">No reports filed against this user.</p>}
            </div>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Moderation history</h4>
              {detail.moderationHistory?.length ? detail.moderationHistory.map((entry) => (
                <div className="admin-health-row" key={entry._id}>
                  <div>
                    <strong>{entry.action}</strong>
                    <div className="admin-table__muted">{entry.reason || 'No reason recorded'} · {entry.adminEmail || 'system'}</div>
                  </div>
                  <span className="admin-table__muted">{formatDate(entry.createdAt)}</span>
                </div>
              )) : <p className="admin-text-muted">No moderation actions recorded.</p>}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? ACTIONS[action.type].title : ''}
        description={action ? `This action affects ${action.user.username} and is recorded in the audit log.` : ''}
        confirmLabel={action ? ACTIONS[action.type].label : 'Confirm'}
        tone={action ? ACTIONS[action.type].tone : 'danger'}
        busy={actionBusy}
        onConfirm={submitAction}
      >
        {action ? (
          <div className="admin-stack">
            {ACTIONS[action.type].needsReason ? (
              <Field label="Reason" hint="Required. Visible in the audit trail and sent to the user where applicable.">
                <textarea className="admin-textarea" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Explain why this action is necessary…" />
              </Field>
            ) : null}
            {ACTIONS[action.type].duration ? (
              <Field label="Duration (hours)" hint="Leave blank for an indefinite suspension; an admin restore is then required.">
                <input className="admin-input" type="number" min="1" max="8760" value={actionDuration} onChange={(event) => setActionDuration(event.target.value)} placeholder="e.g. 24" />
              </Field>
            ) : null}
            <Field label="Internal note (optional)">
              <input className="admin-input" value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Context for other administrators" />
            </Field>
            {ACTIONS[action.type].confirmText ? (
              <Field label={`Type ${ACTIONS[action.type].confirmText} to confirm`}>
                <input className="admin-input" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={ACTIONS[action.type].confirmText} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
