import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Pencil, Plus, RefreshCw, Send, XCircle } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination,
  SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber, relativeTime } from '../utils/format';

const EMPTY_FORM = { title: '', message: '', audience: 'all', scheduledFor: '', userIds: '' };

export default function AnnouncementsPage() {
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [audience, setAudience] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [sendTarget, setSendTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get('/admin/announcements', { params: { page, limit: 20, status: status || undefined, audience: audience || undefined, search: search || undefined } }),
        adminApi.get('/admin/announcements/stats')
      ]);
      setRows(listResponse.data.data);
      setPagination(listResponse.data.pagination);
      setStats(statsResponse.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load announcements');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, status, audience, search]);

  useEffect(() => {
    document.title = 'Announcements · ChatRoom Admin';
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title || '',
      message: item.message || '',
      audience: item.audience || 'all',
      scheduledFor: item.scheduledFor ? new Date(item.scheduledFor).toISOString().slice(0, 16) : '',
      userIds: (item.userIds || []).join(', ')
    });
    setFormOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (form.title.trim().length < 3 || form.message.trim().length < 3) {
      adminToast.warning('Title and message must be at least 3 characters');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        audience: form.audience,
        scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
        userIds: form.audience === 'selected'
          ? form.userIds.split(',').map((value) => value.trim()).filter(Boolean)
          : []
      };
      if (editing) {
        await adminApi.patch(`/admin/announcements/${editing._id}`, payload);
        adminToast.success('Announcement updated');
      } else {
        await adminApi.post('/admin/announcements', payload);
        adminToast.success(payload.scheduledFor ? 'Announcement scheduled' : 'Draft saved');
      }
      setFormOpen(false);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to save announcement'));
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    if (!sendTarget) return;
    setBusy(true);
    try {
      await adminApi.post(`/admin/announcements/${sendTarget._id}/send`);
      adminToast.success('Announcement dispatched');
      setSendTarget(null);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to send announcement'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await adminApi.post(`/admin/announcements/${cancelTarget._id}/cancel`);
      adminToast.success('Announcement cancelled');
      setCancelTarget(null);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to cancel announcement'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Create drafts, schedule delivery and send platform notifications to all, selected or online users."
        actions={(
          <>
            <button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>
            {hasPermission('announcements.manage') ? <button type="button" className="admin-btn admin-btn--primary" onClick={openCreate}><Plus /> New announcement</button> : null}
          </>
        )}
      />

      {stats ? (
        <div className="admin-stat-grid">
          {[
            ['Sent', stats.byStatus?.sent?.count, 'Delivered announcements'],
            ['Scheduled', stats.byStatus?.scheduled?.count, 'Awaiting delivery'],
            ['Drafts', stats.byStatus?.draft?.count, 'Not yet sent'],
            ['Notifications delivered', stats.byStatus?.sent?.delivered, 'Successful notification records']
          ].map(([label, value, hint]) => (
            <div className="admin-stat" key={label}>
              <div className="admin-stat__top"><span>{label}</span><span className="admin-stat__icon"><Megaphone /></span></div>
              <div className="admin-stat__value">{formatNumber(value)}</div>
              <div className="admin-stat__hint">{hint}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search title or message…" />
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="admin-select" value={audience} onChange={(event) => { setAudience(event.target.value); setPage(1); }}>
            <option value="">All audiences</option>
            <option value="all">All users</option>
            <option value="selected">Selected users</option>
            <option value="online">Online users</option>
          </select>
        </div>

        {loading ? <TableSkeleton rows={7} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No announcements" description="Create your first platform announcement." icon={Megaphone} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Announcement</th><th>Audience</th><th>Status</th><th>Recipients</th><th>Scheduled / sent</th><th>Created by</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item._id}>
                      <td><div className="admin-table__primary"><div><strong>{item.title}</strong><span className="admin-truncate">{item.message}</span></div></div></td>
                      <td className="admin-capitalize">{item.audience}</td>
                      <td><Badge>{item.status}</Badge></td>
                      <td className="admin-table__muted">{item.stats?.recipients ? formatNumber(item.stats.recipients) : item.userIds?.length ? formatNumber(item.userIds.length) : item.audience === 'all' ? 'All' : '—'}</td>
                      <td className="admin-table__muted">{item.sentAt ? formatDate(item.sentAt) : item.scheduledFor ? formatDate(item.scheduledFor) : relativeTime(item.createdAt)}</td>
                      <td className="admin-table__muted">{item.createdBy?.username || '—'}</td>
                      <td>
                        <div className="admin-table__actions">
                          {hasPermission('announcements.manage') && ['draft', 'scheduled'].includes(item.status) ? (
                            <>
                              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openEdit(item)}><Pencil /></button>
                              <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => setSendTarget(item)}><Send /></button>
                              <button type="button" className="admin-btn admin-btn--sm" onClick={() => setCancelTarget(item)}><XCircle /></button>
                            </>
                          ) : <span className="admin-table__muted">No actions</span>}
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit announcement' : 'New announcement'}
        description="Messages are delivered as notifications and via Socket.IO to online recipients."
        size="lg"
        footer={(
          <>
            <button type="button" className="admin-btn" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={busy}>
              {busy ? <span className="admin-spinner" /> : null}
              {editing ? 'Save changes' : form.scheduledFor ? 'Schedule' : 'Save draft'}
            </button>
          </>
        )}
      >
        <form className="admin-form-grid" onSubmit={save}>
          <Field label="Title" full>
            <input className="admin-input" maxLength={120} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Important platform update" />
          </Field>
          <Field label="Message" full hint="Up to 2,000 characters. Plain text; links are not auto-embedded.">
            <textarea className="admin-textarea" maxLength={2000} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Write the announcement…" />
          </Field>
          <Field label="Audience">
            <select className="admin-select" value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}>
              <option value="all">All users</option>
              <option value="online">Online users only</option>
              <option value="selected">Selected users</option>
            </select>
          </Field>
          <Field label="Schedule for (optional)" hint="Leave empty to save as a draft.">
            <input className="admin-input" type="datetime-local" value={form.scheduledFor} onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))} />
          </Field>
          {form.audience === 'selected' ? (
            <Field label="Recipient user IDs" full hint="Comma-separated MongoDB user IDs. All recipients must exist and not be deleted.">
              <textarea className="admin-textarea" value={form.userIds} onChange={(event) => setForm((current) => ({ ...current, userIds: event.target.value }))} placeholder="64f…, 64f…" />
            </Field>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(sendTarget)}
        onClose={() => setSendTarget(null)}
        title="Send announcement now"
        description={`“${sendTarget?.title || ''}” will be delivered immediately to ${sendTarget?.audience === 'all' ? 'all active users' : sendTarget?.audience === 'online' ? 'currently online users' : `${sendTarget?.userIds?.length || 0} selected users`}.`}
        confirmLabel="Send now"
        tone="primary"
        busy={busy}
        onConfirm={sendNow}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel announcement"
        description={`“${cancelTarget?.title || ''}” will be cancelled and will not be sent.`}
        confirmLabel="Cancel announcement"
        tone="danger"
        busy={busy}
        onConfirm={cancel}
      />
    </>
  );
}
