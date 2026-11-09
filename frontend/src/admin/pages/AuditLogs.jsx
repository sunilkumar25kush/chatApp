import { useCallback, useEffect, useState } from 'react';
import { Eye, RefreshCw, ScrollText } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import {
  Badge, EmptyState, ErrorState, Modal, PageHeader, Pagination, SearchInput, TableSkeleton
} from '../components/ui';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber, relativeTime, roleLabel } from '../utils/format';

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get('/admin/audit-logs', {
          params: {
            page,
            limit: 25,
            action: action || undefined,
            targetType: targetType || undefined,
            outcome: outcome || undefined,
            search: search || undefined,
            from: from || undefined,
            to: to || undefined
          }
        }),
        adminApi.get('/admin/audit-logs/stats')
      ]);
      setRows(listResponse.data.data);
      setPagination(listResponse.data.pagination);
      setStats(statsResponse.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load audit logs');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType, outcome, search, from, to]);

  useEffect(() => {
    document.title = 'Audit logs · ChatRoom Admin';
    load();
  }, [load]);

  const openDetail = async (id) => {
    setDetailOpen(true);
    setDetail(null);
    try {
      const response = await adminApi.get(`/admin/audit-logs/${id}`);
      setDetail(response.data.data);
    } catch (requestError) {
      adminToast.error(getApiErrorMessage(requestError, 'Unable to load audit entry'));
      setDetailOpen(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Append-only record of privileged actions. Entries cannot be edited or deleted through the application."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      {stats ? (
        <div className="admin-stat-grid">
          {[
            ['Total entries', stats.total, 'Immutable audit records'],
            ['Last 24 hours', stats.last24h, 'Actions recorded'],
            ['Failed actions (24h)', stats.failuresLast24h, 'Rejected or errored'],
            ['Top action', stats.topActions?.[0]?.action || '—', stats.topActions?.[0] ? `${formatNumber(stats.topActions[0].count)} in 30 days` : 'No actions yet']
          ].map(([label, value, hint]) => (
            <div className="admin-stat" key={label}>
              <div className="admin-stat__top"><span>{label}</span><span className="admin-stat__icon"><ScrollText /></span></div>
              <div className="admin-stat__value" style={{ fontSize: typeof value === 'string' && value.length > 16 ? 15 : undefined, wordBreak: 'break-word' }}>{typeof value === 'number' ? formatNumber(value) : value}</div>
              <div className="admin-stat__hint">{hint}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search action, admin, target or reason…" />
          <input className="admin-input" style={{ width: 160 }} value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} placeholder="Action prefix" />
          <select className="admin-select" value={targetType} onChange={(event) => { setTargetType(event.target.value); setPage(1); }}>
            <option value="">All targets</option>
            {['user', 'room', 'message', 'direct_message', 'report', 'admin', 'announcement', 'settings', 'call'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="admin-select" value={outcome} onChange={(event) => { setOutcome(event.target.value); setPage(1); }}>
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
          <input className="admin-input" style={{ width: 170 }} type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="From date" />
          <input className="admin-input" style={{ width: 170 }} type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="To date" />
        </div>

        {loading ? <TableSkeleton rows={10} columns={6} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No audit entries" description="No actions match these filters." icon={ScrollText} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Action</th><th>Administrator</th><th>Target</th><th>Outcome</th><th>Reason</th><th>When</th><th>Detail</th></tr></thead>
                <tbody>
                  {rows.map((log) => (
                    <tr key={log._id}>
                      <td><span className="admin-mono">{log.action}</span></td>
                      <td>
                        <div className="admin-table__primary"><div><strong>{log.admin?.username || log.adminEmail || 'System'}</strong><span>{log.admin ? roleLabel(log.admin.role) : ''}</span></div></div>
                      </td>
                      <td className="admin-table__muted">{log.targetType || '—'}{log.targetId ? <div className="admin-mono admin-truncate">{String(log.targetId)}</div> : null}</td>
                      <td><Badge tone={log.outcome === 'failure' ? 'danger' : 'success'}>{log.outcome}</Badge></td>
                      <td className="admin-table__muted"><span className="admin-truncate">{log.reason || '—'}</span></td>
                      <td className="admin-table__muted" title={formatDate(log.createdAt)}>{relativeTime(log.createdAt)}</td>
                      <td><button type="button" className="admin-btn admin-btn--sm" onClick={() => openDetail(log._id)}><Eye /></button></td>
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
        title="Audit entry"
        description="Immutable record. Metadata may contain before/after context for the action."
        size="lg"
      >
        {detail ? (
          <div className="admin-stack">
            <dl className="admin-kv">
              <dt>Action</dt><dd className="admin-mono">{detail.action}</dd>
              <dt>Administrator</dt><dd>{detail.admin?.username || detail.adminEmail || 'System'} {detail.admin?.email ? `· ${detail.admin.email}` : ''}</dd>
              <dt>Role</dt><dd>{detail.admin?.role ? roleLabel(detail.admin.role) : '—'}</dd>
              <dt>Outcome</dt><dd><Badge tone={detail.outcome === 'failure' ? 'danger' : 'success'}>{detail.outcome}</Badge></dd>
              <dt>Target</dt><dd>{detail.targetType || '—'} <span className="admin-mono">{detail.targetId || ''}</span></dd>
              <dt>Reason</dt><dd>{detail.reason || '—'}</dd>
              <dt>IP address</dt><dd className="admin-mono">{detail.ip || '—'}</dd>
              <dt>User agent</dt><dd style={{ wordBreak: 'break-word' }}>{detail.userAgent || '—'}</dd>
              <dt>Recorded</dt><dd>{formatDate(detail.createdAt)}</dd>
            </dl>
            <div>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Metadata</h4>
              <pre style={{ margin: 0, padding: 13, borderRadius: 10, background: 'var(--a-surface-2)', border: '1px solid var(--a-border)', fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(detail.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : <TableSkeleton rows={5} columns={2} />}
      </Modal>
    </>
  );
}
