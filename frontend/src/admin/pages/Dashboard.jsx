import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowUpRight, Flag, MessageSquare, PhoneCall, RefreshCw,
  Users, Wifi, DoorOpen, ShieldCheck, Megaphone, Settings,
  Clock, ShieldAlert, CheckCircle2
} from 'lucide-react';
import adminApi, { getApiErrorMessage } from '../api/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  StatsSkeleton, TableSkeleton, ErrorState, Badge, EmptyState,
  SpotlightCard, CountUp, BlurText, AuroraBackground, FadeContent
} from '../components/ui';
import { LineChart } from '../components/charts';
import { adminToast } from '../components/AdminToaster';
import { formatNumber, relativeTime } from '../utils/format';

/**
 * Super Admin Dashboard
 * Premium SaaS Interface powered by React Bits & Design Tokens
 */
export default function Dashboard() {
  const { admin } = useAdminAuth();
  const [data, setData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live real-time clock updating every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Formatted date & time
  const formattedDateTime = useMemo(() => {
    const dateStr = currentTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${dateStr} · ${timeStr}`;
  }, [currentTime]);

  const load = useCallback(async (range = days, silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [dashRes, auditRes] = await Promise.all([
        adminApi.get('/admin/dashboard', { params: { days: range } }),
        adminApi.get('/admin/audit-logs', { params: { limit: 5 } }).catch(() => ({ data: { data: [] } }))
      ]);
      setData(dashRes.data.data);
      if (auditRes?.data?.data) {
        setAuditLogs(Array.isArray(auditRes.data.data) ? auditRes.data.data : auditRes.data.data.logs || []);
      }
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load dashboard');
      setError(message);
      if (!silent) adminToast.error(message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    document.title = 'Dashboard · ChatRoom Super Admin';
    load(days);
  }, [load, days]);

  const stats = data?.stats;
  const charts = data?.charts;
  const recent = data?.recent;

  return (
    <div className="admin-dashboard-root">
      {/* --------------------------------------------------------------------
          1. WELCOME HERO SECTION & 2. CURRENT DATE/TIME DISPLAY
          -------------------------------------------------------------------- */}
      <AuroraBackground className="admin-welcome-card">
        <div className="admin-welcome-content">
          <div className="admin-welcome-title-group">
            <h2>
              <span className="admin-status-dot-live" title="Systems Live" />
              <BlurText
                text="Super Admin Dashboard"
                delay={80}
                direction="top"
                animateBy="words"
              />
            </h2>
            <p>
              Welcome back, <strong>{admin?.username || 'Administrator'}</strong>. Live database-backed platform metrics, real-time activity and moderation queue.
            </p>
          </div>

          <div className="admin-welcome-meta">
            <div className="admin-datetime-pill" title="System Local & UTC Clock">
              <Clock size={14} style={{ color: 'var(--admin-accent-light)' }} />
              <span>{formattedDateTime}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="admin-select"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                aria-label="Time range"
                style={{ height: 36, padding: '4px 12px', fontSize: 13 }}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={180}>Last 180 days</option>
              </select>

              <button
                type="button"
                className="admin-btn admin-btn--sm"
                onClick={() => load(days, true)}
                disabled={loading}
                title="Refresh dashboard metrics"
              >
                <RefreshCw size={14} className={loading ? 'admin-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </AuroraBackground>

      {/* --------------------------------------------------------------------
          10. QUICK ACTION BUTTONS STRIP
          -------------------------------------------------------------------- */}
      <FadeContent delay={0.05} direction="up" distance={12}>
        <div className="admin-quick-strip">
          <Link to="/admin/announcements" className="admin-quick-action-btn">
            <span className="admin-quick-action-icon">
              <Megaphone size={16} />
            </span>
            <span>Broadcast Announcement</span>
          </Link>

          <Link to="/admin/reports" className="admin-quick-action-btn">
            <span className="admin-quick-action-icon" style={{ background: 'var(--admin-warning-soft)', color: 'var(--admin-warning)' }}>
              <Flag size={16} />
            </span>
            <span>Triage Reports ({stats?.pendingReports || 0})</span>
          </Link>

          <Link to="/admin/users" className="admin-quick-action-btn">
            <span className="admin-quick-action-icon" style={{ background: 'var(--admin-success-soft)', color: 'var(--admin-success)' }}>
              <Users size={16} />
            </span>
            <span>Manage Users</span>
          </Link>

          <Link to="/admin/calls" className="admin-quick-action-btn">
            <span className="admin-quick-action-icon" style={{ background: 'rgba(56, 189, 248, 0.14)', color: 'var(--admin-info)' }}>
              <PhoneCall size={16} />
            </span>
            <span>Monitor Live Calls</span>
          </Link>

          <Link to="/admin/settings" className="admin-quick-action-btn">
            <span className="admin-quick-action-icon">
              <Settings size={16} />
            </span>
            <span>System Settings</span>
          </Link>
        </div>
      </FadeContent>

      {/* Error state */}
      {error && !data ? <ErrorState message={error} onRetry={() => load(days)} /> : null}

      {/* Loading Skeleton */}
      {loading && !data ? <StatsSkeleton count={8} /> : null}

      {/* --------------------------------------------------------------------
          3. DASHBOARD SUMMARY CARDS (SpotlightCard + CountUp)
          -------------------------------------------------------------------- */}
      {stats ? (
        <>
          <FadeContent delay={0.1} direction="up" distance={14}>
            <div className="admin-stat-grid">
              {/* Total Users */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Total Users</span>
                  <span className="admin-stat__icon">
                    <Users size={16} />
                  </span>
                </div>
                <div className="admin-stat__value">
                  <CountUp to={stats.totalUsers} duration={1.2} />
                </div>
                <div className="admin-stat__hint">
                  +{formatNumber(stats.newUsers24h)} in 24h · +{formatNumber(stats.newUsers7d)} in 7d
                </div>
              </SpotlightCard>

              {/* Online Now */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Online Now</span>
                  <span className="admin-stat__icon" style={{ color: 'var(--admin-success)', background: 'var(--admin-success-soft)' }}>
                    <Wifi size={16} />
                  </span>
                </div>
                <div className="admin-stat__value" style={{ color: 'var(--admin-success)' }}>
                  <CountUp to={stats.onlineUsers} duration={0.8} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.activeUsers)} active account sessions
                </div>
              </SpotlightCard>

              {/* Total Rooms */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Rooms Created</span>
                  <span className="admin-stat__icon">
                    <DoorOpen size={16} />
                  </span>
                </div>
                <div className="admin-stat__value">
                  <CountUp to={stats.totalRooms} duration={1.1} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.publicRooms)} public · {formatNumber(stats.privateRooms)} private
                </div>
              </SpotlightCard>

              {/* Total Messages */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Messages Sent</span>
                  <span className="admin-stat__icon">
                    <MessageSquare size={16} />
                  </span>
                </div>
                <div className="admin-stat__value">
                  <CountUp to={stats.totalMessages} duration={1.4} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.roomMessages)} room · {formatNumber(stats.directMessages)} direct
                </div>
              </SpotlightCard>

              {/* Pending Reports */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Pending Reports</span>
                  <span
                    className="admin-stat__icon"
                    style={{
                      color: stats.pendingReports > 0 ? 'var(--admin-warning)' : 'var(--admin-text-muted)',
                      background: stats.pendingReports > 0 ? 'var(--admin-warning-soft)' : 'var(--admin-surface-2)'
                    }}
                  >
                    <Flag size={16} />
                  </span>
                </div>
                <div className="admin-stat__value" style={stats.pendingReports > 0 ? { color: 'var(--admin-warning)' } : undefined}>
                  <CountUp to={stats.pendingReports} duration={0.6} />
                </div>
                <div className="admin-stat__hint">
                  {stats.pendingReports > 0 ? 'Requires moderation review' : 'Moderation queue clear'}
                </div>
              </SpotlightCard>

              {/* Calls Today */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Calls Today</span>
                  <span className="admin-stat__icon" style={{ color: 'var(--admin-info)', background: 'var(--admin-info-soft)' }}>
                    <PhoneCall size={16} />
                  </span>
                </div>
                <div className="admin-stat__value">
                  <CountUp to={stats.callsToday} duration={1.0} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.activeCalls)} active call session(s)
                </div>
              </SpotlightCard>

              {/* Daily Active Users (DAU) */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Daily Active (DAU)</span>
                  <span className="admin-stat__icon">
                    <Activity size={16} />
                  </span>
                </div>
                <div className="admin-stat__value">
                  <CountUp to={stats.dau} duration={1.1} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.mau)} monthly active (MAU)
                </div>
              </SpotlightCard>

              {/* Enforcements */}
              <SpotlightCard className="admin-stat">
                <div className="admin-stat__top">
                  <span>Enforcements</span>
                  <span className="admin-stat__icon" style={{ color: 'var(--admin-danger)', background: 'var(--admin-danger-soft)' }}>
                    <ShieldAlert size={16} />
                  </span>
                </div>
                <div className="admin-stat__value" style={{ color: 'var(--admin-danger)' }}>
                  <CountUp to={stats.suspendedUsers + stats.bannedUsers} duration={0.9} />
                </div>
                <div className="admin-stat__hint">
                  {formatNumber(stats.suspendedUsers)} suspended · {formatNumber(stats.bannedUsers)} banned
                </div>
              </SpotlightCard>
            </div>
          </FadeContent>

          {/* ------------------------------------------------------------------
              4. USER GROWTH CHART & 5. MESSAGE ACTIVITY CHART
              ------------------------------------------------------------------ */}
          <FadeContent delay={0.15} direction="up" distance={16}>
            <div className="admin-grid admin-grid--2" style={{ marginBottom: 18 }}>
              {/* User Growth */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>User Growth & Registrations</h3>
                    <p>New registrations vs cumulative verified accounts</p>
                  </div>
                  <Badge tone="info">Live Aggregate</Badge>
                </div>
                <div className="admin-card__body">
                  <LineChart
                    height={230}
                    series={[
                      {
                        label: 'New Registrations',
                        color: 'var(--admin-accent-primary)',
                        values: (charts?.userGrowth || []).map((point) => ({
                          date: point.date,
                          value: point.registrations
                        }))
                      },
                      {
                        label: 'Cumulative Total',
                        color: 'var(--admin-info)',
                        values: (charts?.userGrowth || []).map((point) => ({
                          date: point.date,
                          value: point.totalUsers
                        }))
                      }
                    ]}
                  />
                </div>
              </SpotlightCard>

              {/* Message Activity */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Message Activity Stream</h3>
                    <p>Public & private room chats vs direct peer messages</p>
                  </div>
                  <Badge tone="primary">Volume</Badge>
                </div>
                <div className="admin-card__body">
                  <LineChart
                    height={230}
                    series={[
                      {
                        label: 'Room Messages',
                        color: 'var(--admin-accent-primary)',
                        values: (charts?.messageActivity || []).map((point) => ({
                          date: point.date,
                          value: point.room
                        }))
                      },
                      {
                        label: 'Direct Messages',
                        color: 'var(--admin-warning)',
                        values: (charts?.messageActivity || []).map((point) => ({
                          date: point.date,
                          value: point.direct
                        }))
                      }
                    ]}
                  />
                </div>
              </SpotlightCard>
            </div>
          </FadeContent>

          {/* ------------------------------------------------------------------
              6. ACTIVE USERS & 7. RECENT REPORTS & 8. AUDIT LOGS & 9. HEALTH
              ------------------------------------------------------------------ */}
          <div className="admin-grid admin-grid--sidebar">
            {/* Left Main Column: Active / Recent Users & Rooms */}
            <div className="admin-stack">
              {/* 6. Active / Recent Users Section */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Recent & Active Users</h3>
                    <p>Latest registered members and account status</p>
                  </div>
                  <Link to="/admin/users" className="admin-btn admin-btn--sm admin-btn--ghost">
                    View all users <ArrowUpRight size={14} />
                  </Link>
                </div>
                {loading ? (
                  <TableSkeleton rows={4} columns={3} />
                ) : recent?.users?.length ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User Profile</th>
                          <th>Status</th>
                          <th>Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.users.map((u) => (
                          <tr key={u._id}>
                            <td>
                              <div className="admin-table__primary">
                                <span className="admin-avatar">
                                  {String(u.username || '?').slice(0, 2).toUpperCase()}
                                </span>
                                <div>
                                  <strong>{u.username || 'Unknown'}</strong>
                                  <span>{u.publicId || u.email}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Badge>{u.accountStatus || 'active'}</Badge>
                            </td>
                            <td className="admin-table__muted">
                              {relativeTime(u.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No users yet" description="New accounts will appear here." />
                )}
              </SpotlightCard>

              {/* Recent Rooms */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Recent Chat Rooms</h3>
                    <p>Active rooms created across the platform</p>
                  </div>
                  <Link to="/admin/rooms" className="admin-btn admin-btn--sm admin-btn--ghost">
                    View all rooms <ArrowUpRight size={14} />
                  </Link>
                </div>
                {recent?.rooms?.length ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Room Name</th>
                          <th>Visibility</th>
                          <th>Members</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.rooms.map((room) => (
                          <tr key={room._id}>
                            <td>
                              <div className="admin-table__primary">
                                <div>
                                  <strong>{room.name}</strong>
                                  <span>{room.code} · {room.category || 'General'}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Badge>{room.visibility || (room.isPrivate ? 'private' : 'public')}</Badge>
                            </td>
                            <td className="admin-table__muted">
                              {formatNumber(room.memberCount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No rooms yet" description="Rooms created by users will display here." />
                )}
              </SpotlightCard>

              {/* 8. Recent Admin Activities (Audit Trail) */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Administrative Audit Log</h3>
                    <p>Recent immutable administrative operations</p>
                  </div>
                  <Link to="/admin/audit-logs" className="admin-btn admin-btn--sm admin-btn--ghost">
                    Audit trail <ArrowUpRight size={14} />
                  </Link>
                </div>
                <div className="admin-card__body">
                  {auditLogs?.length ? (
                    auditLogs.map((log) => (
                      <div className="admin-audit-mini-item" key={log._id}>
                        <div className="admin-audit-mini-meta">
                          <strong>{log.action}</strong>
                          <span>
                            by {log.adminEmail || 'System'} · {log.targetType || 'entity'} ({relativeTime(log.createdAt)})
                          </span>
                        </div>
                        <Badge tone={log.outcome === 'success' ? 'success' : 'danger'}>
                          {log.outcome || 'success'}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No recent admin actions"
                      description="Administrative operations are recorded automatically."
                      icon={ShieldCheck}
                    />
                  )}
                </div>
              </SpotlightCard>
            </div>

            {/* Right Sidebar Column: Moderation, Engagement & Platform Health */}
            <div className="admin-stack">
              {/* 9. Platform Health Section */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Platform Health & Infrastructure</h3>
                    <p>Live service status and operational telemetry</p>
                  </div>
                  <span className="admin-status-dot-live" title="Healthy" />
                </div>
                <div className="admin-card__body">
                  <div className="admin-health-grid">
                    <div className="admin-health-badge">
                      <span>Database</span>
                      <strong>
                        <CheckCircle2 size={13} style={{ color: 'var(--admin-success)' }} />
                        MongoDB Atlas
                      </strong>
                    </div>

                    <div className="admin-health-badge">
                      <span>WebSocket</span>
                      <strong>
                        <CheckCircle2 size={13} style={{ color: 'var(--admin-success)' }} />
                        Socket.IO Live
                      </strong>
                    </div>

                    <div className="admin-health-badge">
                      <span>WebRTC</span>
                      <strong>
                        <CheckCircle2 size={13} style={{ color: 'var(--admin-success)' }} />
                        LiveKit Mesh
                      </strong>
                    </div>

                    <div className="admin-health-badge">
                      <span>Storage</span>
                      <strong>
                        <CheckCircle2 size={13} style={{ color: 'var(--admin-success)' }} />
                        Cloudinary CDN
                      </strong>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--admin-border-subtle)', fontSize: 12, color: 'var(--admin-text-muted)' }}>
                    Maintenance mode is currently <strong>Inactive</strong>. Realtime presence ping active every 30s.
                  </div>
                </div>
              </SpotlightCard>

              {/* 7. Recent Reports / Moderation Queue */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Moderation Queue</h3>
                    <p>Open community safety reports</p>
                  </div>
                  <Link to="/admin/reports" className="admin-btn admin-btn--sm admin-btn--ghost">
                    Open triage <ArrowUpRight size={14} />
                  </Link>
                </div>
                <div className="admin-card__body">
                  {recent?.reports?.length ? (
                    recent.reports.map((report) => (
                      <div className="admin-health-row" key={report._id}>
                        <div style={{ minWidth: 0 }}>
                          <strong className="admin-truncate" style={{ display: 'block' }}>
                            {report.category?.replace(/_/g, ' ') || 'Report'}
                          </strong>
                          <span className="admin-table__muted">
                            {report.reporter?.username || 'Anonymous'} · {relativeTime(report.createdAt)}
                          </span>
                        </div>
                        <Badge tone={report.status === 'resolved' ? 'success' : 'warning'}>
                          {report.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="Queue is completely clear"
                      description="No open reports require action right now."
                      icon={Flag}
                    />
                  )}
                </div>
              </SpotlightCard>

              {/* Active Engagement Telemetry */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Daily Active Senders</h3>
                    <p>Users actively contributing chat messages</p>
                  </div>
                </div>
                <div className="admin-card__body">
                  <LineChart
                    height={160}
                    showLegend={false}
                    series={[
                      {
                        label: 'Active senders',
                        color: 'var(--admin-success)',
                        values: (charts?.engagement || []).map((point) => ({
                          date: point.date,
                          value: point.activeUsers
                        }))
                      }
                    ]}
                  />
                  <p className="admin-field__hint" style={{ marginTop: 10 }}>
                    Calculated from distinct message authors across room and peer conversations.
                  </p>
                </div>
              </SpotlightCard>

              {/* Recent Voice & Video Calls */}
              <SpotlightCard className="admin-card">
                <div className="admin-card__head">
                  <div>
                    <h3>Recent Call Sessions</h3>
                    <p>Voice and video WebRTC sessions</p>
                  </div>
                  <Link to="/admin/calls" className="admin-btn admin-btn--sm admin-btn--ghost">
                    All calls <ArrowUpRight size={14} />
                  </Link>
                </div>
                <div className="admin-card__body">
                  {recent?.calls?.length ? (
                    recent.calls.map((call) => (
                      <div className="admin-health-row" key={call._id}>
                        <div>
                          <strong style={{ textTransform: 'capitalize' }}>
                            {call.callType || 'Audio Call'}
                          </strong>
                          <div className="admin-table__muted">
                            Initiated by {call.creator?.username || 'User'} · {relativeTime(call.createdAt)}
                          </div>
                        </div>
                        <Badge tone={call.status === 'ended' ? 'neutral' : 'success'}>
                          {call.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No calls recorded" description="Live call sessions will appear here." icon={PhoneCall} />
                  )}
                </div>
              </SpotlightCard>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
