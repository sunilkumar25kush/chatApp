import { useCallback, useEffect, useState } from 'react';
import { Eye, Flag, RefreshCw } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, relativeTime } from '../utils/format';

const OPEN_STATUS = ['pending', 'under_review', 'escalated'];

export default function ReportsPage() {
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [search, setSearch] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [decision, setDecision] = useState('resolved');
  const [moderationAction, setModerationAction] = useState('none');
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonNeeded, setReasonNeeded] = useState(false);
  const [reasonValue, setReasonValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResponse, statsResponse, assigneeResponse] = await Promise.all([
        adminApi.get('/admin/reports', {
          params: { page, limit: 20, status: status || undefined, priority: priority || undefined, category: category || undefined, assignedTo: assignedTo || undefined, search: search || undefined }
        }),
        adminApi.get('/admin/reports/stats'),
        adminApi.get('/admin/reports/assignees')
      ]);
      setRows(listResponse.data.data);
      setPagination(listResponse.data.pagination);
      setStats(statsResponse.data.data);
      setAssignees(assigneeResponse.data.data || []);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load reports');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, status, priority, category, assignedTo, search]);

  useEffect(() => {
    document.title = 'Reports · ChatRoom Admin';
    load();
  }, [load]);

  const fetchDetail = async (id, reasonText = '') => {
    setDetailId(id);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/reports/${id}`, { params: reasonText ? { reason: reasonText } : undefined });
      setDetail(response.data);
      setReasonNeeded(false);
    } catch (requestError) {
      const data = requestError.response?.data;
      if (data?.requiresReason) {
        setReasonNeeded(true);
      } else {
        adminToast.error(getApiErrorMessage(requestError, 'Unable to load report'));
        setDetailOpen(false);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = (report) => {
    setReasonValue('');
    fetchDetail(report._id);
  };

  const submitReason = () => {
    if (reasonValue.trim().length < 3) {
      adminToast.warning('A reason is required to inspect private evidence');
      return;
    }
    fetchDetail(detailId, reasonValue.trim());
  };

  const assign = async (assignedToValue) => {
    if (!detail?.data?._id) return;
    try {
      await adminApi.post(`/admin/reports/${detail.data._id}/assign`, { assignedTo: assignedToValue });
      adminToast.success('Report assignment updated');
      load();
      fetchDetail(detail.data._id);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to assign report'));
    }
  };

  const changeStatus = async (nextStatus) => {
    if (!detail?.data?._id) return;
    try {
      await adminApi.patch(`/admin/reports/${detail.data._id}/status`, { status: nextStatus });
      adminToast.success('Report status updated');
      load();
      fetchDetail(detail.data._id);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to update status'));
    }
  };

  const openResolve = (isReject = false) => {
    setDecision(isReject ? 'rejected' : 'resolved');
    setModerationAction('none');
    setReason('');
    setDurationHours('');
    setResolveOpen(true);
  };

  const submitResolve = async () => {
    if (!detail?.data?._id) return;
    if (reason.trim().length < 3) {
      adminToast.warning('Please provide a resolution reason (at least 3 characters)');
      return;
    }
    setBusy(true);
    try {
      await adminApi.post(`/admin/reports/${detail.data._id}/resolve`, {
        decision,
        action: decision === 'rejected' ? 'none' : moderationAction,
        reason: reason.trim(),
        durationHours: durationHours ? Number(durationHours) : undefined
      });
      adminToast.success(decision === 'resolved' ? 'Report resolved' : 'Report rejected');
      setResolveOpen(false);
      setDetailOpen(false);
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to resolve report'));
    } finally {
      setBusy(false);
    }
  };

  const report = detail?.data;
  const target = detail?.targetDetail;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Triage community reports, assign ownership and apply policy-compliant resolutions."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      {stats ? (
        <div className="admin-stat-grid">
          {[
            ['Open reports', stats.open ?? stats.pending, 'Open queue'],
            ['Resolved', stats.resolved, 'All time'],
            ['Rejected', stats.rejected, 'All time'],
            ['Avg resolution', stats.avgResolutionHours != null ? `${stats.avgResolutionHours}h` : '—', 'Mean time to close']
          ].map(([label, value, hint]) => (
            <div className="admin-stat" key={label}>
              <div className="admin-stat__top"><span>{label}</span><span className="admin-stat__icon"><Flag /></span></div>
              <div className="admin-stat__value">{value ?? 0}</div>
              <div className="admin-stat__hint">{hint}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search report, reporter or target…" />
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under review</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="admin-select" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
            <option value="">All priorities</option>
            {['low', 'medium', 'high', 'critical'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="admin-select" value={assignedTo} onChange={(event) => { setAssignedTo(event.target.value); setPage(1); }}>
            <option value="">Any assignee</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((admin) => <option key={admin._id} value={admin._id}>{admin.username}</option>)}
          </select>
          <input className="admin-input" style={{ width: 170 }} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} placeholder="Category" />
        </div>

        {loading ? <TableSkeleton rows={8} columns={7} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No reports found" description="Adjust filters or enjoy the clear queue." icon={Flag} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Report</th><th>Target</th><th>Reporter</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div className="admin-table__primary"><div><strong>{item.category?.replace(/_/g, ' ')}</strong><span className="admin-truncate">{item.description || 'No description'}</span></div></div>
                      </td>
                      <td><Badge tone="primary">{item.targetType?.replace(/_/g, ' ')}</Badge></td>
                      <td className="admin-table__muted">{item.reporter?.username || '—'}</td>
                      <td><Badge>{item.priority}</Badge></td>
                      <td><Badge>{item.status}</Badge></td>
                      <td className="admin-table__muted">{item.assignedTo?.username || 'Unassigned'}</td>
                      <td className="admin-table__muted">{relativeTime(item.createdAt)}</td>
                      <td><button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(item)}><Eye /> Open</button></td>
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
        title={report ? `Report: ${report.category?.replace(/_/g, ' ')}` : 'Report detail'}
        description={report ? `Target: ${report.targetType?.replace(/_/g, ' ')} · Created ${formatDate(report.createdAt)}` : undefined}
        size="lg"
        footer={report ? (
          <div className="admin-row" style={{ width: '100%' }}>
            {hasPermission('reports.resolve') && OPEN_STATUS.includes(report.status) ? (
              <>
                <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => openResolve(false)}>Resolve</button>
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => openResolve(true)}>Reject</button>
              </>
            ) : null}
            {hasPermission('reports.assign') && OPEN_STATUS.includes(report.status) ? (
              <select className="admin-select" style={{ width: 190, marginLeft: 'auto' }} value={report.assignedTo?._id || ''} onChange={(event) => assign(event.target.value)}>
                <option value="">Unassigned</option>
                {assignees.map((admin) => <option key={admin._id} value={admin._id}>{admin.username}</option>)}
              </select>
            ) : null}
          </div>
        ) : null}
      >
        {detailLoading ? <TableSkeleton rows={6} columns={2} /> : reasonNeeded ? (
          <div className="admin-stack">
            <div className="admin-alert admin-alert--warning">Private message evidence requires an investigation reason. Access is audited.</div>
            <Field label="Investigation reason" hint="Minimum 3 characters.">
              <textarea className="admin-textarea" value={reasonValue} onChange={(event) => setReasonValue(event.target.value)} />
            </Field>
            <button type="button" className="admin-btn admin-btn--primary" onClick={submitReason}>Access evidence</button>
          </div>
        ) : report ? (
          <div className="admin-stack">
            <div className="admin-row">
              <Badge>{report.status}</Badge>
              <Badge>{report.priority}</Badge>
              <Badge tone="primary">{report.targetType?.replace(/_/g, ' ')}</Badge>
              {detail.restricted ? <Badge tone="warning">restricted evidence</Badge> : null}
            </div>

            <dl className="admin-kv">
              <dt>Reporter</dt><dd>{report.reporter?.username || '—'} {report.reporter?.publicId ? `· ${report.reporter.publicId}` : ''}</dd>
              <dt>Description</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{report.description || 'No description'}</dd>
              <dt>Assigned to</dt><dd>{report.assignedTo?.username || 'Unassigned'}</dd>
              <dt>Created</dt><dd>{formatDate(report.createdAt)}</dd>
              {report.resolution ? <><dt>Resolution</dt><dd>{report.resolution.note || report.resolution.reason || '—'}</dd></> : null}
            </dl>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Target evidence</h4>
              {target?.type === 'user' ? (
                <dl className="admin-kv">
                  <dt>Username</dt><dd>{target.user.username}</dd>
                  <dt>Account status</dt><dd><Badge>{target.user.accountStatus}</Badge></dd>
                  <dt>Public ID</dt><dd>{target.user.publicId || '—'}</dd>
                  <dt>Joined</dt><dd>{formatDate(target.user.createdAt)}</dd>
                </dl>
              ) : target?.type === 'room' ? (
                <dl className="admin-kv">
                  <dt>Room</dt><dd>{target.room.name} ({target.room.code})</dd>
                  <dt>Visibility</dt><dd>{target.room.visibility || (target.room.isPrivate ? 'private' : 'public')}</dd>
                  <dt>Suspended</dt><dd>{target.room.isSuspended ? 'Yes' : 'No'}</dd>
                  <dt>Created</dt><dd>{formatDate(target.room.createdAt)}</dd>
                </dl>
              ) : target?.type === 'message' || target?.type === 'direct_message' ? (
                <div className="admin-stack">
                  <dl className="admin-kv">
                    <dt>Sender</dt><dd>{target.message?.sender?.username || '—'}</dd>
                    <dt>Recipient</dt><dd>{target.message?.recipient?.username || '—'}</dd>
                    <dt>Sent</dt><dd>{formatDate(target.message?.createdAt)}</dd>
                    <dt>Removed</dt><dd>{target.message?.isDeleted ? 'Yes' : 'No'}</dd>
                  </dl>
                  <div className="admin-alert"><div style={{ whiteSpace: 'pre-wrap' }}>{target.message?.content || '[No visible content]'}</div></div>
                </div>
              ) : target?.type === 'call' ? (
                <dl className="admin-kv">
                  <dt>Call type</dt><dd>{target.call?.callType || '—'}</dd>
                  <dt>Status</dt><dd>{target.call?.status || '—'}</dd>
                  <dt>Creator</dt><dd>{target.call?.creator?.username || '—'}</dd>
                  <dt>Started</dt><dd>{formatDate(target.call?.startedAt)}</dd>
                </dl>
              ) : <p className="admin-text-muted">No target evidence available.</p>}
            </div>

            {(report.history || []).length ? (
              <div>
                <h4 style={{ marginBottom: 8, fontSize: 13 }}>Report history</h4>
                {report.history.map((entry, index) => (
                  <div className="admin-health-row" key={index}>
                    <div><strong>{entry.action || entry.status}</strong><div className="admin-table__muted">{entry.note || entry.reason || ''}</div></div>
                    <span className="admin-table__muted">{formatDate(entry.at)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title={decision === 'resolved' ? 'Resolve report' : 'Reject report'}
        description="The reporter is notified and the decision is written to the append-only audit log."
        footer={(
          <>
            <button type="button" className="admin-btn" onClick={() => setResolveOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className={`admin-btn ${decision === 'resolved' ? 'admin-btn--primary' : 'admin-btn--danger'}`} onClick={submitResolve} disabled={busy}>
              {busy ? <span className="admin-spinner" /> : null}
              {decision === 'resolved' ? 'Resolve' : 'Reject'}
            </button>
          </>
        )}
      >
        <div className="admin-stack">
          {decision === 'resolved' ? (
            <Field label="Moderation action" hint="Applied atomically with the resolution.">
              <select className="admin-select" value={moderationAction} onChange={(event) => setModerationAction(event.target.value)}>
                <option value="none">No further action</option>
                <option value="warn">Warn target user</option>
                <option value="remove_message">Remove reported message</option>
                <option value="suspend_user">Suspend target user</option>
                <option value="ban_user">Ban target user</option>
                <option value="remove_room">Remove target room</option>
              </select>
            </Field>
          ) : null}
          {moderationAction === 'suspend_user' ? (
            <Field label="Suspension duration (hours)" hint="Leave blank for indefinite suspension.">
              <input className="admin-input" type="number" min="1" max="8760" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} />
            </Field>
          ) : null}
          <Field label="Resolution reason" hint="Required. Recorded in the audit trail and shared with the reporter.">
            <textarea className="admin-textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the decision…" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
