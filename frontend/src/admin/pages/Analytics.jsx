import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { ErrorState, PageHeader, StatsSkeleton } from '../components/ui';
import { BarList, DonutChart, LineChart } from '../components/charts';
import { adminToast } from '../components/AdminToaster';
import { formatNumber, titleCase } from '../utils/format';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const load = useCallback(async (range = days, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await adminApi.get('/admin/analytics', { params: { days: range } });
      setData(response.data.data);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load analytics');
      setError(message);
      if (!silent) adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    document.title = 'Analytics · ChatRoom Admin';
    load(days);
  }, [load, days]);

  const exportCsv = () => {
    if (!data?.analytics) return;
    const lines = [['date', 'room_messages', 'direct_messages', 'registrations']];
    (data.analytics.messageActivity || []).forEach((point, index) => {
      const registration = data.analytics.registrations?.[index]?.count || 0;
      lines.push([point.date, point.room, point.direct, registration]);
    });
    const blob = new Blob([lines.map((line) => line.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chatroom-analytics-${days}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const analytics = data?.analytics;
  const stats = data?.stats;

  const reportSegments = analytics ? Object.entries(analytics.reportStatus || {}).map(([label, value], index) => ({
    label: titleCase(label),
    value,
    color: ['var(--a-warning)', 'var(--a-info)', 'var(--a-success)', 'var(--a-danger)', 'var(--a-primary)'][index % 5]
  })) : [];

  const callTypeItems = analytics ? Object.entries(analytics.callStats?.byTypeAndStatus || {})
    .map(([key, value]) => ({ label: key.replace(/_/g, ' '), value })) : [];

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Database-backed growth, messaging, moderation and call trends. Export the current range as CSV."
        actions={(
          <>
            <select className="admin-select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
            <button type="button" className="admin-btn" onClick={() => load(days, true)} disabled={loading}><RefreshCw /> Refresh</button>
            <button type="button" className="admin-btn" onClick={exportCsv} disabled={!analytics}><Download /> Export CSV</button>
          </>
        )}
      />

      {loading && !data ? <StatsSkeleton count={4} /> : error ? <ErrorState message={error} onRetry={() => load(days)} /> : null}

      {analytics ? (
        <div className="admin-stack">
          <div className="admin-stat-grid">
            {[
              ['Total users', stats?.totalUsers],
              ['Messages in range', analytics.totalMessagesInRange],
              ['New users in range', analytics.registrations?.reduce((sum, item) => sum + item.count, 0)],
              ['Completed calls', analytics.callStats?.completedCalls]
            ].map(([label, value]) => (
              <div className="admin-stat" key={label}>
                <div className="admin-stat__top"><span>{label}</span><span className="admin-stat__icon"><BarChart3 /></span></div>
                <div className="admin-stat__value">{formatNumber(value)}</div>
                <div className="admin-stat__hint">Last {days} days</div>
              </div>
            ))}
          </div>

          <div className="admin-card">
            <div className="admin-card__head"><div><h3>Message volume</h3><p>Room and direct messages per day</p></div></div>
            <div className="admin-card__body">
              <LineChart
                series={[
                  { label: 'Room messages', color: 'var(--a-primary)', values: (analytics.messageActivity || []).map((point) => ({ date: point.date, value: point.room })) },
                  { label: 'Direct messages', color: 'var(--a-warning)', values: (analytics.messageActivity || []).map((point) => ({ date: point.date, value: point.direct })) }
                ]}
              />
            </div>
          </div>

          <div className="admin-grid admin-grid--2">
            <div className="admin-card">
              <div className="admin-card__head"><div><h3>Registrations</h3><p>New accounts per day</p></div></div>
              <div className="admin-card__body">
                <LineChart
                  showLegend={false}
                  series={[{ label: 'Registrations', color: 'var(--a-success)', values: (analytics.registrations || []).map((point) => ({ date: point.date, value: point.count })) }]}
                />
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card__head"><div><h3>Report status</h3><p>All-time distribution</p></div></div>
              <div className="admin-card__body">
                <DonutChart segments={reportSegments} centerLabel="Reports" />
              </div>
            </div>
          </div>

          <div className="admin-grid admin-grid--2">
            <div className="admin-card">
              <div className="admin-card__head"><div><h3>Report categories</h3><p>Most reported categories</p></div></div>
              <div className="admin-card__body">
                <BarList
                  items={(analytics.reportCategories || []).map((item) => ({ label: titleCase(item.category), value: item.count }))}
                  emptyLabel="No reports filed yet"
                />
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card__head"><div><h3>Call outcomes</h3><p>Calls by type and status</p></div></div>
              <div className="admin-card__body">
                <BarList items={callTypeItems} emptyLabel="No call sessions yet" />
                <p className="admin-field__hint admin-mt">
                  Average completed call duration: {formatNumber(analytics.callStats?.averageDurationSeconds)} seconds.
                </p>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card__head"><div><h3>Platform totals</h3><p>Current snapshot</p></div></div>
            <div className="admin-card__body">
              <div className="admin-grid admin-grid--3">
                {[
                  ['Total users', stats?.totalUsers],
                  ['Active users', stats?.activeUsers],
                  ['Total rooms', stats?.totalRooms],
                  ['Room messages', stats?.roomMessages],
                  ['Direct messages', stats?.directMessages],
                  ['Pending reports', stats?.pendingReports],
                  ['Suspended users', stats?.suspendedUsers],
                  ['Banned users', stats?.bannedUsers],
                  ['Suspended rooms', stats?.suspendedRooms]
                ].map(([label, value]) => (
                  <div className="admin-health-row" key={label}>
                    <span className="admin-text-muted">{label}</span>
                    <strong>{formatNumber(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
