import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut,
  ExternalLink, ShieldAlert, Search, Command
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminTheme } from '../context/AdminThemeContext';
import { roleLabel } from '../utils/format';
import { adminToast } from './AdminToaster';
import AdminSidebar from './AdminSidebar';
import AdminCommandPalette, { recordRecentAdminPage } from './AdminCommandPalette';

const TITLE_MAP = [
  ['/admin/setup-mfa', 'Two-Factor Authentication', 'Secure your administrator account with TOTP'],
  ['/admin/users', 'User Management', 'Account status, moderation, mutes and activity'],
  ['/admin/rooms', 'Room Management', 'Public & private room metadata and moderation'],
  ['/admin/messages', 'Message Moderation', 'Review and moderate flagged/reported content'],
  ['/admin/reports', 'Reports Center', 'Triage and resolve community abuse reports'],
  ['/admin/friends', 'Friend Management', 'Connection metadata, friendships and request health'],
  ['/admin/calls', 'Call Monitoring', 'Live audio/video rooms, sessions and WebRTC metrics'],
  ['/admin/announcements', 'Announcements', 'Platform-wide broadcasts, banners and system notices'],
  ['/admin/analytics', 'Analytics & Insights', 'Growth, engagement, retention and moderation trends'],
  ['/admin/roles', 'Roles & Permissions', 'RBAC permissions, roles and admin user accounts'],
  ['/admin/audit-logs', 'Audit Logs', 'Append-only immutable administrative audit trail'],
  ['/admin/settings', 'System Settings', 'Platform configuration, feature flags and system health'],
  ['/admin', 'Overview', 'Real-time platform metrics & health at a glance']
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
  const { admin, logout } = useAdminAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const title = getTitle(location.pathname);

  // Persist sidebar collapsed state
  useEffect(() => {
    try {
      localStorage.setItem('chatroom_admin_sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Record recent page visit
  useEffect(() => {
    recordRecentAdminPage(location.pathname, title[1], title[1]);
  }, [location.pathname, title]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Custom event listener for opening command palette
  useEffect(() => {
    const handleOpenCommandPalette = () => setCommandPaletteOpen(true);
    window.addEventListener('open-admin-command-palette', handleOpenCommandPalette);
    return () => window.removeEventListener('open-admin-command-palette', handleOpenCommandPalette);
  }, []);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
      adminToast.success('Signed out safely');
      navigate('/admin/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }, [logout, navigate]);

  return (
    <div
      className={`admin-root admin-shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      data-theme={theme}
    >
      {/* ── Collapsible & Mobile-Ready Premium Sidebar ─────────────────── */}
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* ── Main Viewport Area ─────────────────────────────────────────── */}
      <div className="admin-main">
        {/* Topbar */}
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <button
              type="button"
              className="admin-icon-btn admin-mobile-menu"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation drawer"
            >
              <Menu size={18} />
            </button>

            <button
              type="button"
              className="admin-icon-btn admin-desktop-collapse"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>

            <div className="admin-topbar__title">
              <h1>{title[1]}</h1>
              <span>{title[2]}</span>
            </div>
          </div>

          {/* Quick Search pill in topbar */}
          <div className="admin-topbar__center">
            <button
              type="button"
              className="admin-topbar-search-trigger"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Search pages and admin actions (Ctrl+K)"
            >
              <Search size={14} className="admin-topbar-search-icon" />
              <span className="admin-topbar-search-text">Search or jump to...</span>
              <kbd className="admin-topbar-search-kbd">
                <Command size={11} /> K
              </kbd>
            </button>
          </div>

          {/* Actions & Utilities */}
          <div className="admin-topbar__actions">
            {admin?.role && (
              <span className="admin-role-pill" title={`Logged in as ${admin.username}`}>
                <ShieldAlert size={14} /> {roleLabel(admin.role)}
              </span>
            )}

            <button
              type="button"
              className="admin-icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <a
              className="admin-icon-btn"
              href="/chat"
              target="_blank"
              rel="noreferrer"
              aria-label="Open chat application"
              title="Open Chat App in new tab"
            >
              <ExternalLink size={17} />
            </a>

            <button
              type="button"
              className="admin-icon-btn logout"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Sign out"
              title="Sign Out"
            >
              {loggingOut ? <span className="admin-spinner" /> : <LogOut size={17} />}
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="admin-content">
          {!admin?.mfaEnabled && location.pathname !== '/admin/setup-mfa' && (
            <div className="admin-alert admin-alert--warning" style={{ marginBottom: 16 }}>
              <ShieldAlert size={18} />
              <div>
                <strong>Two-factor authentication is not enabled.</strong>
                <div>
                  Enable MFA to secure sensitive moderation and system administration actions.{' '}
                  <a href="/admin/setup-mfa" style={{ textDecoration: 'underline' }}>
                    Set it up now
                  </a>.
                </div>
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* ── Command Palette (Ctrl+K) ─────────────────────────────────── */}
      <AdminCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onToggleSidebar={() => setCollapsed((v) => !v)}
        sidebarCollapsed={collapsed}
      />
    </div>
  );
}
