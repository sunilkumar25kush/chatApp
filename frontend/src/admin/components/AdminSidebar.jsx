import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  MessagesSquare,
  MessageSquareWarning,
  Flag,
  UserRoundCheck,
  PhoneCall,
  Megaphone,
  BarChart3,
  ShieldCheck,
  ScrollText,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Command,
  Sun,
  Moon,
  LogOut,
  X,
  Circle
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminTheme } from '../context/AdminThemeContext';
import { roleLabel } from '../utils/format';
import { recordRecentAdminPage } from './AdminCommandPalette';

// Navigation configuration with 12 canonical items, grouping, and nested children
export const ADMIN_NAV_CONFIG = [
  {
    group: 'Overview',
    items: [
      {
        to: '/admin',
        exact: true,
        label: 'Overview',
        subtitle: 'Platform metrics & activity stream',
        icon: LayoutDashboard,
        permission: 'dashboard.view',
        badge: null,
        shortcut: '1'
      }
    ]
  },
  {
    group: 'Community & Moderation',
    items: [
      {
        to: '/admin/users',
        label: 'User Management',
        subtitle: 'Accounts, status, mutes & bans',
        icon: Users,
        permission: 'users.view',
        badge: null,
        shortcut: '2',
        children: [
          { to: '/admin/users', label: 'All Users', exact: true },
          { to: '/admin/users?status=suspended', label: 'Suspended & Banned' }
        ]
      },
      {
        to: '/admin/rooms',
        label: 'Room Management',
        subtitle: 'Channels, creators & member limits',
        icon: MessagesSquare,
        permission: 'rooms.view',
        badge: null,
        shortcut: '3'
      },
      {
        to: '/admin/messages',
        label: 'Message Moderation',
        subtitle: 'Flagged messages & content audits',
        icon: MessageSquareWarning,
        permission: 'messages.view',
        badge: null,
        shortcut: '4'
      },
      {
        to: '/admin/reports',
        label: 'Reports Center',
        subtitle: 'Triage abuse, harassment & spam',
        icon: Flag,
        permission: 'reports.view',
        badge: 'Priority',
        shortcut: '5',
        children: [
          { to: '/admin/reports', label: 'All Reports', exact: true },
          { to: '/admin/reports?status=pending', label: 'Pending Triage' },
          { to: '/admin/reports?status=resolved', label: 'Resolved & Closed' }
        ]
      },
      {
        to: '/admin/friends',
        label: 'Friend Management',
        subtitle: 'Connections, relationships & requests',
        icon: UserRoundCheck,
        permission: 'friends.view',
        badge: null,
        shortcut: '6'
      }
    ]
  },
  {
    group: 'Operations',
    items: [
      {
        to: '/admin/calls',
        label: 'Call Monitoring',
        subtitle: 'Live voice/video rooms & call history',
        icon: PhoneCall,
        permission: 'calls.view',
        badge: null,
        shortcut: '7'
      },
      {
        to: '/admin/announcements',
        label: 'Announcements',
        subtitle: 'Global banners & system broadcasts',
        icon: Megaphone,
        permission: 'announcements.view',
        badge: null,
        shortcut: '8'
      },
      {
        to: '/admin/analytics',
        label: 'Analytics',
        subtitle: 'Growth trends & retention charts',
        icon: BarChart3,
        permission: 'analytics.view',
        badge: null,
        shortcut: '9'
      }
    ]
  },
  {
    group: 'Administration & System',
    items: [
      {
        to: '/admin/roles',
        label: 'Roles & Permissions',
        subtitle: 'RBAC access control & admin users',
        icon: ShieldCheck,
        permission: 'roles.view',
        badge: null
      },
      {
        to: '/admin/audit-logs',
        label: 'Audit Logs',
        subtitle: 'Immutable record of admin actions',
        icon: ScrollText,
        permission: 'audit.view',
        badge: null
      },
      {
        to: '/admin/settings',
        label: 'System Settings',
        subtitle: 'Maintenance, feature flags & health',
        icon: Settings,
        permission: 'settings.view',
        badge: null,
        children: [
          { to: '/admin/settings', label: 'General & Maintenance', exact: true },
          { to: '/admin/setup-mfa', label: 'Two-Factor Auth (MFA)' },
          { to: '/admin/settings#health', label: 'Platform Health & Cache' }
        ]
      }
    ]
  }
];

export default function AdminSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onOpenCommandPalette
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout, hasPermission } = useAdminAuth();
  const { theme, toggleTheme } = useAdminTheme();

  // Expanded accordion groups for nested navigation
  const [openAccordions, setOpenAccordions] = useState(() => {
    // Auto-open accordion if current route matches child
    const initial = {};
    ADMIN_NAV_CONFIG.forEach((grp) => {
      grp.items.forEach((item) => {
        if (item.children) {
          const isMatch = item.children.some((child) => location.pathname === child.to.split('?')[0]);
          if (isMatch) initial[item.to] = true;
        }
      });
    });
    return initial;
  });

  // Track hovered item for floating tooltips when collapsed
  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  // Filter groups and items based on permissions
  const authorizedGroups = useMemo(() => {
    return ADMIN_NAV_CONFIG.map((group) => {
      const allowedItems = group.items.filter((item) => !item.permission || hasPermission(item.permission));
      return {
        ...group,
        items: allowedItems
      };
    }).filter((group) => group.items.length > 0);
  }, [hasPermission]);

  // Keep accordion open when navigating to nested route
  useEffect(() => {
    ADMIN_NAV_CONFIG.forEach((grp) => {
      grp.items.forEach((item) => {
        if (item.children) {
          const isMatch = item.children.some((child) => location.pathname === child.to.split('?')[0].split('#')[0]);
          if (isMatch) {
            setOpenAccordions((prev) => ({ ...prev, [item.to]: true }));
          }
        }
      });
    });
  }, [location.pathname]);

  const toggleAccordion = (itemTo, e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpenAccordions((prev) => ({
      ...prev,
      [itemTo]: !prev[itemTo]
    }));
  };

  const handleItemHover = (item, e) => {
    if (!collapsed) {
      setHoveredItem(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      top: rect.top,
      left: rect.right + 10
    });
    setHoveredItem(item);
  };

  const handleItemLeave = () => {
    setHoveredItem(null);
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="admin-mobile-overlay"
          onClick={onCloseMobile}
          role="presentation"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Super Admin Navigation"
      >
        {/* ── Brand & Workspace Header ───────────────────────── */}
        <div className="admin-sidebar__brand">
          <NavLink
            to="/admin"
            className="admin-brand-link"
            onClick={() => mobileOpen && onCloseMobile()}
            title="ChatRoom Super Admin Dashboard"
          >
            <div className="admin-brand-mark">
              <span>CR</span>
              <span className="admin-brand-pulse" />
            </div>

            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  className="admin-brand-copy"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="admin-brand-copy__row">
                    <strong>ChatRoom</strong>
                    <span className="admin-brand-version">v2.4</span>
                  </div>
                  <span>Super Admin SaaS</span>
                </motion.div>
              )}
            </AnimatePresence>
          </NavLink>

          {/* Close button for mobile or collapse toggle */}
          {mobileOpen ? (
            <button
              type="button"
              className="admin-icon-btn admin-sidebar-close-mobile"
              onClick={onCloseMobile}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="admin-icon-btn admin-sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          )}
        </div>

        {/* ── Quick Command Palette Trigger ───────────────────── */}
        <div className="admin-sidebar__search-wrap">
          <button
            type="button"
            className="admin-sidebar-search-btn"
            onClick={onOpenCommandPalette}
            aria-label="Open Command Palette (Ctrl+K)"
            title="Open Command Palette (Ctrl+K)"
          >
            <Search size={15} className="admin-search-btn-icon" />
            {!collapsed && (
              <>
                <span className="admin-search-btn-label">Quick Search...</span>
                <kbd className="admin-search-btn-kbd">
                  <Command size={10} /> K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* ── Navigation Tree ─────────────────────────────────── */}
        <nav className="admin-sidebar__nav" role="navigation">
          {authorizedGroups.map((group) => (
            <div key={group.group} className="admin-nav-group">
              {!collapsed && (
                <div className="admin-nav-group-label">
                  <span>{group.group}</span>
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = item.children && item.children.length > 0;
                const isAccordionOpen = Boolean(openAccordions[item.to]);
                const isActive = item.exact
                  ? location.pathname === item.to
                  : location.pathname === item.to || (item.to !== '/admin' && location.pathname.startsWith(`${item.to}`));

                return (
                  <div
                    key={item.to}
                    className="admin-nav-item-container"
                    onMouseEnter={(e) => handleItemHover(item, e)}
                    onMouseLeave={handleItemLeave}
                  >
                    <NavLink
                      to={item.to}
                      end={item.exact}
                      className={({ isActive: linkActive }) =>
                        `admin-nav-link ${linkActive || isActive ? 'active' : ''} ${hasChildren ? 'has-children' : ''}`
                      }
                      onClick={() => {
                        recordRecentAdminPage(item.to, item.label, item.label);
                        if (mobileOpen) onCloseMobile();
                      }}
                      title={collapsed ? `${item.label} (Press ${item.shortcut || ''})` : undefined}
                    >
                      {/* Active Indicator Glow Pill (Framer Motion) */}
                      {(isActive) && (
                        <motion.span
                          layoutId="admin-active-pill"
                          className="admin-nav-active-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        />
                      )}

                      <div className="admin-nav-link__icon-box">
                        <Icon size={18} />
                      </div>

                      <AnimatePresence>
                        {!collapsed && (
                          <motion.div
                            className="admin-nav-link__body"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12 }}
                          >
                            <span className="admin-nav-link__label">{item.label}</span>
                            {item.badge && (
                              <span className={`admin-nav-badge ${item.badge.toLowerCase()}`}>
                                {item.badge}
                              </span>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Nested chevron expander */}
                      {!collapsed && hasChildren && (
                        <button
                          type="button"
                          className="admin-nav-expander"
                          onClick={(e) => toggleAccordion(item.to, e)}
                          aria-label={isAccordionOpen ? 'Collapse sub-items' : 'Expand sub-items'}
                        >
                          {isAccordionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </NavLink>

                    {/* Expanded Nested Children (Accordion) */}
                    {!collapsed && hasChildren && isAccordionOpen && (
                      <motion.div
                        className="admin-nav-sub-list"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.16 }}
                      >
                        {item.children.map((child) => {
                          const isChildActive = child.exact
                            ? location.pathname === child.to
                            : location.pathname + location.search + location.hash === child.to || location.pathname === child.to;

                          return (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={`admin-nav-sub-link ${isChildActive ? 'active' : ''}`}
                              onClick={() => mobileOpen && onCloseMobile()}
                            >
                              <span className="admin-sub-bullet" />
                              <span className="admin-sub-label">{child.label}</span>
                            </NavLink>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── Collapsed Floating Tooltip & Popout (Rendered via Portal) ── */}
        {collapsed && hoveredItem && typeof document !== 'undefined' && createPortal(
          <div
            className="admin-collapsed-tooltip"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left
            }}
            onMouseEnter={() => setHoveredItem(hoveredItem)}
            onMouseLeave={handleItemLeave}
          >
            <div className="admin-tooltip-header">
              <span className="admin-tooltip-title">{hoveredItem.label}</span>
              {hoveredItem.shortcut && (
                <kbd className="admin-tooltip-kbd">{hoveredItem.shortcut}</kbd>
              )}
            </div>
            {hoveredItem.subtitle && (
              <span className="admin-tooltip-sub">{hoveredItem.subtitle}</span>
            )}

            {/* Nested children links in collapsed popover */}
            {hoveredItem.children && hoveredItem.children.length > 0 && (
              <div className="admin-tooltip-children">
                {hoveredItem.children.map((child) => (
                  <button
                    key={child.to}
                    type="button"
                    className="admin-tooltip-child-btn"
                    onClick={() => {
                      navigate(child.to);
                      setHoveredItem(null);
                    }}
                  >
                    <span className="admin-sub-bullet" />
                    <span>{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}

        {/* ── Footer Profile & Controls ───────────────────────── */}
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar-user">
            <div className="admin-avatar-wrap">
              <span className="admin-avatar">
                {String(admin?.username || admin?.email || 'A').slice(0, 2)}
              </span>
              <span className="admin-presence-indicator" title="Super Admin Online" />
            </div>

            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  className="admin-sidebar-user__meta"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <strong>{admin?.username || 'Administrator'}</strong>
                  <span className="admin-role-tag">{roleLabel(admin?.role)}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick system buttons in sidebar footer */}
          {!collapsed && (
            <div className="admin-sidebar-quick-actions">
              <button
                type="button"
                className="admin-footer-btn"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <a
                className="admin-footer-btn"
                href="/chat"
                target="_blank"
                rel="noreferrer"
                title="Open Client App"
              >
                <ExternalLink size={15} />
              </a>
              <button
                type="button"
                className="admin-footer-btn logout"
                onClick={logout}
                title="Sign out of Admin Panel"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

AdminSidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  mobileOpen: PropTypes.bool.isRequired,
  onCloseMobile: PropTypes.func.isRequired,
  onOpenCommandPalette: PropTypes.func.isRequired
};
