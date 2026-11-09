import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Eye, MessageSquareWarning, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, relativeTime } from '../utils/format';

export default function MessagesPage() {
  const { hasPermission } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [inspectReason, setInspectReason] = useState('');
  const [reasonPromptOpen, setReasonPromptOpen] = useState(false);

  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/admin/messages/reported', {
        params: { page, limit: 20, status: status || undefined, priority: priority || undefined }
      });
      setRows(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load reported messages');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, status, priority]);

  useEffect(() => {
    document.title = 'Reported messages · ChatRoom Admin';
    load();
  }, [load]);

  const needsPrivateReason = (item) => item.kind === 'direct' || (item.message?.room?.isPrivate || item.message?.room?.visibility === 'private');

  const openDetail = (item) => {
    setDetailTarget(item);
    setInspectReason('');
    if (needsPrivateReason(item)) {
      setReasonPromptOpen(true);
      return;
    }
    fetchDetail(item);
  };

  const fetchDetail = async (item, reasonValue = '') => {
    setReasonPromptOpen(false);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/messages/${item.message._id}`, {
        params: { type: item.kind, reason: reasonValue || undefined }
      });
      setDetail(response.data);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to load message evidence'));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitInspectReason = () => {
    if (inspectReason.trim().length < 3) {
      adminToast.warning('A reason is required to inspect private evidence');
      return;
    }
    fetchDetail(detailTarget, inspectReason.trim());
  };

  const openAction = (type) => {
    setAction(type);
    setReason('');
  };

  const submitAction = async () => {
    if (!detail?.data?._id) return;
    if (reason.trim().length < 3) {
      adminToast.warning('Please provide a reason (at least 3 characters)');
      return;
    }
    setBusy(true);
    try {
      const endpoint = action === 'remove' ? 'remove' : action === 'restore' ? 'restore' : 'warn';
      if (action === 'warn') {
        await adminApi.post('/admin/messages/warn', { userId: detail.data.sender?._id, reason: reason.trim() });
      } else {
        await adminApi.post(`/admin/messages/${detail.data._id}/${endpoint}`, { reason: reason.trim() });
      }
      adminToast.success(action === 'warn' ? 'Warning delivered' : `Message ${action === 'remove' ? 'removed' : 'restored'}`);
      setAction(null);
      load();
      if (action !== 'warn') {
        fetchDetail(detailTarget, inspectReason.trim());
      }
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  const message = detail?.data;
  const isRemoved = Boolean(message?.moderation?.removedBy || message?.isDeleted);

  return (
    <>
      <PageHeader
        title="Reported messages"
        description="Moderate reported room and direct messages. Private evidence is masked and only accessible with an audited investigation reason."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      <div className="admin-card">
        <div className="admin-filter-bar">
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">Open queue</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under review</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="admin-select" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {loading ? <TableSkeleton rows={8} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No reported messages" description="The moderation queue is clear." icon={MessageSquareWarning} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Message</th><th>Sender</th><th>Type</th><th>Report</th><th>Priority</th><th>Reported</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.report._id}>
                      <td>
                        <span className="admin-truncate">
                          {item.contentMasked ? '[Private evidence]' : item.message?.content || item.message?.fileName || '[Attachment]'}
                        </span>
                      </td>
                      <td className="admin-table__muted">{item.message?.sender?.username || '—'}</td>
                      <td><Badge tone={item.kind === 'direct' ? 'warning' : 'primary'}>{item.kind === 'direct' ? 'Direct' : 'Room'}</Badge></td>
                      <td className="admin-table__muted">{item.report.category?.replace(/_/g, ' ')}</td>
                      <td><Badge>{item.report.priority}</Badge></td>
                      <td className="admin-table__muted">{relativeTime(item.report.createdAt)}</td>
                      <td>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(item)}>
                          <Eye /> Review
                        </button>
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
        open={reasonPromptOpen}
        onClose={() => setReasonPromptOpen(false)}
        title="Access private evidence"
        description="Private messages are only reviewed for valid safety reports. Your reason is recorded in the audit log."
        footer={(
          <>
            <button type="button" className="admin-btn" onClick={() => setReasonPromptOpen(false)}>Cancel</button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={submitInspectReason}>Continue</button>
          </>
        )}
      >
        <Field label="Investigation reason" hint="Minimum 3 characters. Be specific and policy-compliant.">
          <textarea className="admin-textarea" value={inspectReason} onChange={(event) => setInspectReason(event.target.value)} placeholder="e.g. Reviewing a credible harassment report…" />
        </Field>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Message evidence"
        description={message?.room?.name ? `Room: ${message.room.name}` : detail?.kind === 'direct' ? 'Direct message' : undefined}
        size="lg"
        footer={message ? (
          <div className="admin-row" style={{ width: '100%' }}>
            {hasPermission('messages.moderate') && !isRemoved ? (
              <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => openAction('remove')}><Trash2 /> Remove message</button>
            ) : null}
            {hasPermission('messages.moderate') && isRemoved ? (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('restore')}><RotateCcw /> Restore message</button>
            ) : null}
            {hasPermission('messages.moderate') && message.sender?._id ? (
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => openAction('warn')}><AlertTriangle /> Warn sender</button>
            ) : null}
          </div>
        ) : null}
      >
        {detailLoading ? <TableSkeleton rows={5} columns={2} /> : detail ? (
          <div className="admin-stack">
            {isRemoved ? <div className="admin-alert admin-alert--warning"><AlertTriangle size={16} /> This message is soft-removed and can be restored.</div> : null}
            <dl className="admin-kv">
              <dt>Sender</dt><dd>{message.sender?.username || '—'} {message.sender?.publicId ? `· ${message.sender.publicId}` : ''}</dd>
              <dt>Recipient</dt><dd>{message.recipient?.username || '—'}</dd>
              <dt>Sent</dt><dd>{formatDate(message.createdAt)}</dd>
              <dt>Status</dt><dd><Badge>{isRemoved ? 'removed' : 'visible'}</Badge></dd>
              <dt>Content</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{message.content || '[No text]'}</dd>
              <dt>Attachment</dt><dd>{message.fileName ? `${message.fileName} (${message.fileType || 'file'})` : '—'}</dd>
              <dt>Moderation reason</dt><dd>{message.moderation?.reason || '—'}</dd>
            </dl>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Conversation context</h4>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--a-border)', borderRadius: 10, padding: 12 }}>
                {(detail.context || []).map((entry) => (
                  <div key={entry._id} style={{ padding: '7px 0', borderBottom: '1px solid var(--a-border)' }}>
                    <div className="admin-row" style={{ justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 12 }}>{entry.sender?.username || entry.sender || 'unknown'}</strong>
                      <span className="admin-table__muted">{formatDate(entry.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{entry.content || '[attachment]'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Related reports</h4>
              {(detail.reports || []).length ? detail.reports.map((report) => (
                <div className="admin-health-row" key={report._id}>
                  <div>
                    <strong>{report.category?.replace(/_/g, ' ')}</strong>
                    <div className="admin-table__muted">{report.description || 'No description'} · {relativeTime(report.createdAt)}</div>
                  </div>
                  <Badge>{report.status}</Badge>
                </div>
              )) : <p className="admin-text-muted">No related reports.</p>}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action === 'remove' ? 'Remove message' : action === 'restore' ? 'Restore message' : 'Warn sender'}
        description={action === 'warn' ? `Send a moderation warning to ${message?.sender?.username || 'this user'}.` : 'This action is recorded in the audit log and may notify the sender.'}
        confirmLabel={action === 'remove' ? 'Remove message' : action === 'restore' ? 'Restore message' : 'Send warning'}
        tone={action === 'remove' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={submitAction}
      >
        <Field label="Reason" hint="Required. Visible in the audit trail and sent to the user.">
          <textarea className="admin-textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain this moderation decision…" />
        </Field>
      </ConfirmDialog>
    </>
  );
}
