import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessagesSquare, MessageSquareWarning, Flag, UserRoundCheck,
  PhoneCall, Megaphone, BarChart3, ShieldCheck, ScrollText, Settings, Menu, PanelLeftClose,
  PanelLeftOpen, Sun, Moon, LogOut, ExternalLink, ShieldAlert, X
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminTheme } from '../context/AdminThemeContext';
import { roleLabel } from '../utils/format';
import { adminToast } from './AdminToaster';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', exact: true, group: 'Overview' },
  { to: '/admin/users', label: 'Users', icon: Users, permission: 'users.view', group: 'Community' },
  { to: '/admin/rooms', label: 'Rooms', icon: MessagesSquare, permission: 'rooms.view', group: 'Community' },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquareWarning, permission: 'messages.view', group: 'Community' },
  { to: '/admin/reports', label: 'Reports', icon: Flag, permission: 'reports.view', group: 'Community' },
  { to: '/admin/friends', label: 'Friend Management', icon: UserRoundCheck, permission: 'friends.view', group: 'Community' },
  { to: '/admin/calls', label: 'Calls', icon: PhoneCall, permission: 'calls.view', group: 'Operations' },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, permission: 'announcements.view', group: 'Operations' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.view', group: 'Operations' },
  { to: '/admin/roles', label: 'Admin Roles & Permissions', icon: ShieldCheck, permission: 'roles.view', group: 'Administration' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit.view', group: 'Administration' },
  { to: '/admin/settings', label: 'System Settings', icon: Settings, permission: 'settings.view', group: 'Administration' }
];

const TITLE_MAP = [
  ['/admin/setup-mfa', 'Enable two-factor authentication', 'Secure your administrator account'],
  ['/admin/users', 'Users', 'Account status, moderation and activity'],
  ['/admin/rooms', 'Rooms', 'Room metadata and moderation'],
  ['/admin/messages', 'Reported messages', 'Review and moderate reported content'],
  ['/admin/reports', 'Reports', 'Triage and resolve community reports'],
  ['/admin/friends', 'Friend management', 'Connection metadata and request health'],
  ['/admin/calls', 'Calls', 'Live call monitoring and history'],
  ['/admin/announcements', 'Announcements', 'Platform-wide communications'],
  ['/admin/analytics', 'Analytics', 'Growth, engagement and moderation trends'],
  ['/admin/roles', 'Admin roles & permissions', 'Roles, granular permissions and admin accounts'],
  ['/admin/audit-logs', 'Audit logs', 'Append-only administrative audit trail'],
  ['/admin/settings', 'System settings', 'Platform configuration and feature flags'],
  ['/admin', 'Dashboard', 'Platform health at a glance']
];

const getTitle = (pathname) => {
  const match = TITLE_MAP.find(([path]) => pathname === path || (path !== '/admin' && pathname.startsWith(`${path}/`)));
  return match || TITLE_MAP[TITLE_MAP.length - 1];
};

const readCollapsed = () => {
  try {
    return localStorage.getItem('chatroom_admin_sidebar') === 'collapsed';
  } catch {
    return false;
  }
};

export default function AdminLayout() {
  const { admin, logout, hasPermission } = useAdminAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const title = getTitle(location.pathname);
  const navItems = useMemo(() => NAV_ITEMS.filter((item) => hasPermission(item.permission)), [hasPermission]);
  const groups = useMemo(() => {
    const map = new Map();
    navItems.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group).push(item);
    });
    return Array.from(map.entries());
  }, [navItems]);

  useEffect(() => {
    try {
      localStorage.setItem('chatroom_admin_sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      adminToast.success('Signed out safely');
      navigate('/admin/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div
      className={`admin-root admin-shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      data-theme={theme}
    >
      <div className="admin-mobile-overlay" role="presentation" onClick={() => setMobileOpen(false)} />

      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar__brand">
          <span className="admin-brand-mark">CR</span>
          <div className="admin-brand-copy">
            <strong>ChatRoom</strong>
            <span>Super Admin</span>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="admin-nav-group-label">{group}</div>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon />
                    <span className="admin-nav-link__label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar-user">
            <span className="admin-avatar">{String(admin?.username || admin?.email || 'A').slice(0, 2)}</span>
            <div className="admin-sidebar-user__meta">
              <strong>{admin?.username || 'Administrator'}</strong>
              <span>{roleLabel(admin?.role)}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-icon-btn admin-mobile-menu"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
          <button
            type="button"
            className="admin-icon-btn admin-desktop-collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>

          <div className="admin-topbar__title">
            <h1>{title[0]}</h1>
            <span>{title[1]}</span>
          </div>

          <div className="admin-topbar__spacer" />

          <div className="admin-topbar__actions">
            {admin?.role ? <span className="admin-role-pill"><ShieldAlert size={14} /> {roleLabel(admin.role)}</span> : null}
            <button
              type="button"
              className="admin-icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <a className="admin-icon-btn" href="/" target="_blank" rel="noreferrer" aria-label="Open user app">
              <ExternalLink />
            </a>
            <button type="button" className="admin-icon-btn" onClick={handleLogout} disabled={loggingOut} aria-label="Sign out">
              {loggingOut ? <span className="admin-spinner" /> : <LogOut />}
            </button>
          </div>
        </header>

        <main className="admin-content">
          {!admin?.mfaEnabled && location.pathname !== '/admin/setup-mfa' ? (
            <div className="admin-alert admin-alert--warning" style={{ marginBottom: 16 }}>
              <ShieldAlert size={18} />
              <div>
                <strong>Two-factor authentication is not enabled.</strong>
                <div>Enable MFA before using operational admin tools. <a href="/admin/setup-mfa" style={{ textDecoration: 'underline' }}>Set it up now</a>.</div>
              </div>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
