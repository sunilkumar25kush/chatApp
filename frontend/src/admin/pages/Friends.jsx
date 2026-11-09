import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, UserRoundCheck } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, TableSkeleton
} from '../components/ui';
import { BarList } from '../components/charts';
import { adminToast } from '../components/AdminToaster';
import { formatDate, formatNumber } from '../utils/format';

export default function FriendsPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('accepted');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResponse, statsResponse] = await Promise.all([
        adminApi.get('/admin/friends', { params: { page, limit: 20, status: status || undefined, search: search || undefined } }),
        adminApi.get('/admin/friends/stats', { params: { days: 30 } })
      ]);
      setRows(listResponse.data.data);
      setPagination(listResponse.data.pagination);
      setStats(statsResponse.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load friend data');
      setError(message);
      adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    document.title = 'Friend management · ChatRoom Admin';
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Friend management"
        description="Inspect connection metadata and monitor request volume. Private friendship content is not exposed."
        actions={<button type="button" className="admin-btn" onClick={load} disabled={loading}><RefreshCw /> Refresh</button>}
      />

      {stats ? (
        <div className="admin-grid admin-grid--sidebar" style={{ marginBottom: 16 }}>
          <div className="admin-stat-grid" style={{ marginBottom: 0 }}>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Total connections</span><span className="admin-stat__icon"><UserRoundCheck /></span></div>
              <div className="admin-stat__value">{formatNumber(stats.total)}</div>
              <div className="admin-stat__hint">All friendship records</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Accepted</span></div>
              <div className="admin-stat__value">{formatNumber(stats.byStatus?.accepted)}</div>
              <div className="admin-stat__hint">Mutual connections</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>Pending</span></div>
              <div className="admin-stat__value">{formatNumber(stats.byStatus?.pending)}</div>
              <div className="admin-stat__hint">Awaiting response</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat__top"><span>New requests (30d)</span></div>
              <div className="admin-stat__value">{formatNumber(stats.recentRequests)}</div>
              <div className="admin-stat__hint">Last 30 days</div>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__head"><h3>Most requested recipients</h3><p>Last 30 days</p></div>
            <div className="admin-card__body">
              <BarList items={(stats.mostRequestedRecipients || []).map((item) => ({ label: item.username || 'Unknown', value: item.count }))} emptyLabel="No pending requests" />
              <div className="admin-divider" />
              <h4 style={{ fontSize: 12, marginBottom: 8, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Top requesters</h4>
              <BarList items={(stats.topRequesters || []).map((item) => ({ label: item.username || 'Unknown', value: item.count, color: 'var(--a-info)' }))} emptyLabel="No requests" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-filter-bar">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search either user…" />
          <select className="admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="accepted">Accepted</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? <TableSkeleton rows={8} columns={5} /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <EmptyState title="No friendship records" description="No connections match these filters." icon={UserRoundCheck} />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Requester</th><th /><th>Recipient</th><th>Status</th><th>Requested</th><th>Accepted</th></tr></thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div className="admin-table__primary"><div><strong>{item.requester?.username || 'Unknown'}</strong><span>{item.requester?.publicId || ''}</span></div></div>
                      </td>
                      <td style={{ width: 26 }}><ArrowRight size={15} style={{ color: 'var(--a-muted)' }} /></td>
                      <td>
                        <div className="admin-table__primary"><div><strong>{item.recipient?.username || 'Unknown'}</strong><span>{item.recipient?.publicId || ''}</span></div></div>
                      </td>
                      <td><Badge>{item.status}</Badge></td>
                      <td className="admin-table__muted">{formatDate(item.createdAt)}</td>
                      <td className="admin-table__muted">{item.acceptedAt ? formatDate(item.acceptedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
