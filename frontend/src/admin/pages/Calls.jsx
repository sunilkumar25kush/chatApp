import { useCallback, useEffect, useState } from 'react';
import { Eye, PhoneCall, RefreshCw, PhoneOff } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination,
  SearchInput, TableSkeleton, Tabs
} from '../components/ui';
import { DonutChart } from '../components/charts';
import { adminToast } from '../components/AdminToaster';
import { durationLabel, formatDate, formatNumber } from '../utils/format';

export default function CallsPage() {
  const { hasPermission } = useAdminAuth();
  const [tab, setTab] = useState('active');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [callType, setCallType] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = tab === 'active' ? '/admin/calls/active' : '/admin/calls/history';
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get(endpoint, { params: { page, limit: 20, callType: callType || undefined, search: search || undefined, status: status || undefined } }),
        adminApi.get('/admin/calls/stats')
      ]);
      setRows(listResponse.data.data);
      setPagination(listResponse.data.pagination);
      setStats(statsResponse.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load calls');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [tab, page, callType, search, status]);

  useEffect(() => {
    document.title = 'Calls · ChatRoom Admin';
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/calls/${id}`);
      setDetail(response.data.data);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to load call'));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const terminate = async () => {
    if (!terminateTarget) return;
    if (reason.trim().length < 3) {
      adminToast.warning('Please provide a reason (at least 3 characters)');
      return;
    }
    setBusy(true);
    try {
      await adminApi.post(`/admin/calls/${terminateTarget._id}/terminate`, { reason: reason.trim() });
      adminToast.success('Call session ended. Media streams were not accessed.');
      setTerminateTarget(null);
      setReason('');
      load();
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to end call'));
    } finally {
      setBusy(false);
    }
  };

  const statusSegments = stats ? [
    { label: 'Ended', value: stats.byStatus?.ended, color: 'var(--a-primary)' },
    { label: 'Active', value: stats.byStatus?.active, color: 'var(--a-success)' },
    { label: 'Ringing', value: stats.byStatus?.ringing, color: 'var(--a-warning)' },
    { label: 'Missed', value: stats.byStatus?.missed, color: 'var(--a-danger)' },
    { label: 'Other', value: (stats.byStatus?.declined || 0) + (stats.byStatus?.cancelled || 0), color: 'var(--a-muted)' }
  ].filter((item) => item.value) : [];

  return (
    <>
      <PageHeader
        title="Calls"
        description="Monitor logical call sessions and history. Audio, video and screen media are never accessed by the admin panel."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      {stats ? (
        <div className="admin-grid admin-grid--sidebar" style={{ marginBottom: 16 }}>
          <div className="admin-stat-grid" style={{ marginBottom: 0 }}>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Total calls</span><span className="admin-stat__icon"><PhoneCall /></span></div>
              <div className="admin-stat__value">{formatNumber((stats.byType?.voice || 0) + (stats.byType?.video || 0))}</div>
              <div className="admin-stat__hint">{formatNumber(stats.byType?.voice)} voice · {formatNumber(stats.byType?.video)} video</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Active</span></div>
              <div className="admin-stat__value">{formatNumber(stats.byStatus?.active)}</div>
              <div className="admin-stat__hint">{formatNumber(stats.byStatus?.ringing)} ringing</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Average duration</span></div>
              <div className="admin-stat__value">{durationLabel(stats.averageDurationSeconds)}</div>
              <div className="admin-stat__hint">{formatNumber(stats.longCalls)} calls over 1h</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Missed</span></div>
              <div className="admin-stat__value">{formatNumber(stats.byStatus?.missed)}</div>
              <div className="admin-stat__hint">Across all history</div>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__head"><h3>Call status mix</h3><p>All sessions</p></div>
            <div className="admin-card__body">
              <DonutChart segments={statusSegments} centerLabel="Calls" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-filter-bar">
          <Tabs
            tabs={[{ value: 'active', label: 'Active calls' }, { value: 'history', label: 'Call history' }]}
            value={tab}
            onChange={(value) => { setTab(value); }}
          />
          {tab === 'history' ? (
            <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search call ID…" />
          ) : null}
          <select className="admin-select" value={callType} onChange={(event) => { setCallType(event.target.value); setPage(1); }}>
            <option value="">All types</option>
            <option value="voice">Voice</option>
            <option value="video">Video</option>
          </select>
          {tab === 'history' ? (
            <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">Completed & missed</option>
              <option value="ended">Ended</option>
              <option value="missed">Missed</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ) : null}
        </div>

        {loading ? <TableSkeleton rows={7} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title={tab === 'active' ? 'No calls in progress' : 'No calls found'} description={tab === 'active' ? 'Active and ringing sessions will appear here.' : 'Adjust the filters to see history.'} icon={PhoneCall} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Call</th><th>Creator</th><th>Participants</th><th>Status</th><th>Duration</th><th>Started</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((call) => (
                    <tr key={call._id}>
                      <td>
                        <div className="admin-table__primary"><div><strong>{call.callType === 'video' ? 'Video call' : 'Voice call'}</strong><span className="admin-mono">{call.callId || call._id}</span></div></div>
                      </td>
                      <td className="admin-table__muted">{call.creator?.username || '—'}</td>
                      <td className="admin-table__muted">{call.participants?.length || 0}</td>
                      <td><Badge>{call.status}</Badge></td>
                      <td className="admin-table__muted">{durationLabel(call.liveDurationSeconds || call.duration)}</td>
                      <td className="admin-table__muted">{formatDate(call.startedAt || call.createdAt)}</td>
                      <td>
                        <div className="admin-table__actions">
                          <button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(call._id)}><Eye /> View</button>
                          {hasPermission('calls.disconnect') && ['ringing', 'active'].includes(call.status) ? (
                            <button type="button" className="admin-btn admin-btn--sm admin-text-danger" onClick={() => { setTerminateTarget(call); setReason(''); }}><PhoneOff /></button>
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

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Call session" description="Logical session metadata only — no media stream or recording access." size="lg">
        {detailLoading ? <TableSkeleton rows={5} columns={2} /> : detail ? (
          <div className="admin-stack">
            <div className="admin-row"><Badge>{detail.status}</Badge><Badge tone="primary">{detail.callType}</Badge><span className="admin-text-muted">Duration {durationLabel(detail.liveDurationSeconds || detail.duration)}</span></div>
            <dl className="admin-kv">
              <dt>Call ID</dt><dd className="admin-mono">{detail.callId || detail._id}</dd>
              <dt>Creator</dt><dd>{detail.creator?.username || '—'}</dd>
              <dt>Room</dt><dd>{detail.room?.name || detail.room || '—'}</dd>
              <dt>Started</dt><dd>{formatDate(detail.startedAt)}</dd>
              <dt>Ended</dt><dd>{formatDate(detail.endedAt)}</dd>
              <dt>Ended reason</dt><dd>{detail.endedReason || '—'}</dd>
              <dt>Admin terminated</dt><dd>{detail.adminTerminated ? `Yes · ${detail.terminationReason || ''}` : 'No'}</dd>
            </dl>
            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Participants ({detail.participants?.length || 0})</h4>
              {(detail.participants || []).map((participant) => (
                <div className="admin-health-row" key={String(participant.user?._id || participant.user)}>
                  <div><strong>{participant.user?.username || 'Unknown'}</strong><div className="admin-table__muted">{participant.user?.publicId || ''}</div></div>
                  <Badge>{participant.status || participant.role || 'participant'}</Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(terminateTarget)}
        onClose={() => setTerminateTarget(null)}
        title="End call session"
        description="This ends the logical call session for all participants. It does not access or record media streams."
        confirmLabel="End call"
        tone="danger"
        busy={busy}
        onConfirm={terminate}
      >
        <Field label="Reason" hint="Required. Recorded in the append-only audit log.">
          <textarea className="admin-textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Emergency safety intervention…" />
        </Field>
      </ConfirmDialog>
    </>
  );
}
