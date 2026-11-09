import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, LayoutDashboard, Users, MessagesSquare, MessageSquareWarning,
  Flag, UserRoundCheck, PhoneCall, Megaphone, BarChart3, ShieldCheck,
  ScrollText, Settings, ShieldAlert, Sun, Moon, LogOut, PanelLeft,
  ExternalLink, Clock, ArrowRight, CornerDownLeft, X, Sparkles, Activity
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminTheme } from '../context/AdminThemeContext';
import { adminToast } from './AdminToaster';

const STORAGE_RECENT_KEY = 'chatroom_admin_recent_pages';

export const getRecentAdminPages = () => {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const recordRecentAdminPage = (path, label, iconKey) => {
  try {
    const list = getRecentAdminPages();
    const filtered = list.filter((item) => item.path !== path);
    filtered.unshift({
      path,
      label,
      iconKey,
      visitedAt: Date.now()
    });
    localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(filtered.slice(0, 6)));
  } catch {
    /* ignore */
  }
};

export default function AdminCommandPalette({
  isOpen,
  onClose,
  onToggleSidebar,
  sidebarCollapsed
}) {
  const navigate = useNavigate();
  const { admin, logout, hasPermission } = useAdminAuth();
  const { theme, toggleTheme } = useAdminTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentPages, setRecentPages] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Load recent pages whenever palette opens
  useEffect(() => {
    if (isOpen) {
      setRecentPages(getRecentAdminPages());
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open via custom event or direct call
          const openEvt = new CustomEvent('open-admin-command-palette');
          window.dispatchEvent(openEvt);
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Navigation catalog
  const NAV_COMMANDS = useMemo(() => [
    {
      id: 'nav-dashboard',
      category: 'Navigation',
      label: 'Overview Dashboard',
      description: 'Platform metrics, health summary and activity stream',
      path: '/admin',
      icon: LayoutDashboard,
      shortcut: 'G D',
      permission: 'dashboard.view'
    },
    {
      id: 'nav-users',
      category: 'Navigation',
      label: 'User Management',
      description: 'Accounts, verification, bans, mutes and status',
      path: '/admin/users',
      icon: Users,
      shortcut: 'G U',
      permission: 'users.view'
    },
    {
      id: 'nav-rooms',
      category: 'Navigation',
      label: 'Room Management',
      description: 'Public & private rooms, creators and participant limits',
      path: '/admin/rooms',
      icon: MessagesSquare,
      shortcut: 'G R',
      permission: 'rooms.view'
    },
    {
      id: 'nav-messages',
      category: 'Navigation',
      label: 'Message Moderation',
      description: 'Flagged chat messages, direct chats and text audit',
      path: '/admin/messages',
      icon: MessageSquareWarning,
      shortcut: 'G M',
      permission: 'messages.view'
    },
    {
      id: 'nav-reports',
      category: 'Navigation',
      label: 'Reports Center',
      description: 'Community reports triage, resolution and actions',
      path: '/admin/reports',
      icon: Flag,
      shortcut: 'G P',
      permission: 'reports.view'
    },
    {
      id: 'nav-friends',
      category: 'Navigation',
      label: 'Friend Management',
      description: 'Friendships, pending connection requests and block lists',
      path: '/admin/friends',
      icon: UserRoundCheck,
      shortcut: 'G F',
      permission: 'friends.view'
    },
    {
      id: 'nav-calls',
      category: 'Navigation',
      label: 'Call Monitoring',
      description: 'Live audio/video rooms, sessions and WebRTC logs',
      path: '/admin/calls',
      icon: PhoneCall,
      shortcut: 'G C',
      permission: 'calls.view'
    },
    {
      id: 'nav-announcements',
      category: 'Navigation',
      label: 'Announcements',
      description: 'Broadcast global banners, system alerts and notifications',
      path: '/admin/announcements',
      icon: Megaphone,
      shortcut: 'G A',
      permission: 'announcements.view'
    },
    {
      id: 'nav-analytics',
      category: 'Navigation',
      label: 'Analytics & Insights',
      description: 'User acquisition, peak hours and message volumes',
      path: '/admin/analytics',
      icon: BarChart3,
      shortcut: 'G Y',
      permission: 'analytics.view'
    },
    {
      id: 'nav-roles',
      category: 'Navigation',
      label: 'Roles & Permissions',
      description: 'Role-based access control, moderators and admin accounts',
      path: '/admin/roles',
      icon: ShieldCheck,
      shortcut: 'G O',
      permission: 'roles.view'
    },
    {
      id: 'nav-audit',
      category: 'Navigation',
      label: 'Audit Logs',
      description: 'Immutable record of administrator actions and changes',
      path: '/admin/audit-logs',
      icon: ScrollText,
      shortcut: 'G L',
      permission: 'audit.view'
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      label: 'System Settings',
      description: 'Global configurations, maintenance mode and feature flags',
      path: '/admin/settings',
      icon: Settings,
      shortcut: 'G S',
      permission: 'settings.view'
    }
  ], []);

  // Quick Action Commands
  const ACTION_COMMANDS = useMemo(() => [
    {
      id: 'action-mfa',
      category: 'Quick Actions',
      label: 'Setup Two-Factor Authentication',
      description: 'Configure TOTP authenticator app for admin security',
      icon: ShieldAlert,
      action: () => {
        navigate('/admin/setup-mfa');
        onClose();
      }
    },
    {
      id: 'action-pending-reports',
      category: 'Quick Actions',
      label: 'View Pending Reports',
      description: 'Quickly open reports needing moderator action',
      icon: Flag,
      permission: 'reports.view',
      action: () => {
        navigate('/admin/reports?status=pending');
        onClose();
      }
    },
    {
      id: 'action-system-health',
      category: 'Quick Actions',
      label: 'Inspect System Health',
      description: 'View database latency, memory and uptime in settings',
      icon: Activity,
      permission: 'settings.view',
      action: () => {
        navigate('/admin/settings#health');
        onClose();
      }
    },
    {
      id: 'action-theme-toggle',
      category: 'Quick Actions',
      label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      description: `Current mode: ${theme === 'dark' ? 'Dark Galaxy' : 'Light Cream'}`,
      icon: theme === 'dark' ? Sun : Moon,
      action: () => {
        toggleTheme();
        adminToast.info(`Switched to ${theme === 'dark' ? 'Light' : 'Dark'} mode`);
        onClose();
      }
    },
    {
      id: 'action-sidebar-toggle',
      category: 'Quick Actions',
      label: sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar',
      description: 'Toggle the navigation sidebar width state',
      icon: PanelLeft,
      action: () => {
        onToggleSidebar?.();
        onClose();
      }
    },
    {
      id: 'action-open-app',
      category: 'Quick Actions',
      label: 'Open User Chat Application',
      description: 'Open standard client window in a new browser tab',
      icon: ExternalLink,
      action: () => {
        window.open('/chat', '_blank');
        onClose();
      }
    },
    {
      id: 'action-clear-recent',
      category: 'Quick Actions',
      label: 'Clear Recent Pages History',
      description: 'Reset command palette recently visited list',
      icon: Clock,
      action: () => {
        try {
          localStorage.removeItem(STORAGE_RECENT_KEY);
          setRecentPages([]);
          adminToast.success('Recent pages cleared');
        } catch {
          /* ignore */
        }
      }
    },
    {
      id: 'action-logout',
      category: 'Quick Actions',
      label: 'Sign Out Administrator',
      description: 'Safely end active admin session and clear credentials',
      icon: LogOut,
      isDanger: true,
      action: async () => {
        onClose();
        try {
          await logout();
          adminToast.success('Signed out safely');
          navigate('/admin/login', { replace: true });
        } catch {
          /* ignore */
        }
      }
    }
  ], [theme, toggleTheme, sidebarCollapsed, onToggleSidebar, navigate, onClose, logout]);

  // Filter items based on user query and permissions
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Available navigation items based on permissions
    const allowedNav = NAV_COMMANDS.filter((cmd) => !cmd.permission || hasPermission(cmd.permission));
    const allowedActions = ACTION_COMMANDS.filter((cmd) => !cmd.permission || hasPermission(cmd.permission));

    // When query is empty, show recent pages first, then top navigation, then actions
    if (!q) {
      const recents = recentPages
        .map((recent) => {
          const match = allowedNav.find((n) => n.path === recent.path);
          if (!match) return null;
          return {
            ...match,
            id: `recent-${match.id}`,
            category: 'Recent Pages',
            isRecent: true
          };
        })
        .filter(Boolean);

      return [
        ...recents,
        ...allowedNav.slice(0, 8),
        ...allowedActions.slice(0, 4)
      ];
    }

    // Filtered by query
    const matchNav = allowedNav.filter((cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.path.toLowerCase().includes(q) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
    );

    const matchActions = allowedActions.filter((cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );

    return [...matchNav, ...matchActions];
  }, [query, NAV_COMMANDS, ACTION_COMMANDS, hasPermission, recentPages]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute selected item
  const handleExecute = (item) => {
    if (!item) return;
    if (item.action) {
      item.action();
    } else if (item.path) {
      recordRecentAdminPage(item.path, item.label, item.id);
      navigate(item.path);
      onClose();
    }
  };

  // Keyboard navigation within the palette
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleExecute(filteredItems[selectedIndex]);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="admin-command-palette-backdrop" onClick={onClose} role="presentation">
          <motion.div
            className="admin-command-palette"
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Super Admin Command Palette"
          >
            {/* Search Input Header */}
            <div className="admin-cp-header">
              <Search className="admin-cp-search-icon" size={20} />
              <input
                ref={inputRef}
                type="text"
                className="admin-cp-input"
                placeholder="Type a command or search pages... (e.g. Users, Reports, Settings)"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                aria-autocomplete="list"
                aria-controls="admin-cp-results"
              />
              <div className="admin-cp-header-actions">
                <kbd className="admin-cp-kbd">ESC</kbd>
                <button
                  type="button"
                  className="admin-cp-close-btn"
                  onClick={onClose}
                  aria-label="Close command palette"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Results List */}
            <div ref={listRef} id="admin-cp-results" className="admin-cp-list" role="listbox">
              {filteredItems.length === 0 ? (
                <div className="admin-cp-empty">
                  <Sparkles size={28} className="admin-cp-empty-icon" />
                  <h4>No matching commands found</h4>
                  <p>Try searching for "users", "reports", "settings", or "theme"</p>
                </div>
              ) : (
                (() => {
                  let currentCategory = '';
                  return filteredItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isSelected = idx === selectedIndex;
                    const showCategory = item.category !== currentCategory;
                    if (showCategory) currentCategory = item.category;

                    return (
                      <div key={item.id}>
                        {showCategory && (
                          <div className="admin-cp-category-header">
                            {item.isRecent ? <Clock size={12} /> : null}
                            <span>{item.category}</span>
                          </div>
                        )}
                        <div
                          data-index={idx}
                          role="option"
                          aria-selected={isSelected}
                          className={`admin-cp-item ${isSelected ? 'selected' : ''} ${item.isDanger ? 'danger' : ''}`}
                          onPointerMove={() => setSelectedIndex(idx)}
                          onClick={() => handleExecute(item)}
                        >
                          <div className="admin-cp-item__icon-wrapper">
                            <Icon size={17} />
                          </div>

                          <div className="admin-cp-item__body">
                            <div className="admin-cp-item__title">
                              <span>{item.label}</span>
                              {item.path && <span className="admin-cp-item__path">{item.path}</span>}
                            </div>
                            <span className="admin-cp-item__desc">{item.description}</span>
                          </div>

                          <div className="admin-cp-item__end">
                            {item.shortcut ? (
                              <kbd className="admin-cp-kbd">{item.shortcut}</kbd>
                            ) : null}
                            {isSelected && (
                              <span className="admin-cp-select-pill">
                                <span>Jump</span>
                                <CornerDownLeft size={12} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Footer hint bar */}
            <div className="admin-cp-footer">
              <div className="admin-cp-footer-hints">
                <span>
                  <kbd className="admin-cp-kbd">↑</kbd>
                  <kbd className="admin-cp-kbd">↓</kbd> to navigate
                </span>
                <span>
                  <kbd className="admin-cp-kbd">↵</kbd> to select
                </span>
                <span>
                  <kbd className="admin-cp-kbd">ESC</kbd> to dismiss
                </span>
              </div>
              <div className="admin-cp-footer-status">
                <span className="admin-cp-dot" />
                <span>Super Admin · {admin?.username || 'Authenticated'}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

AdminCommandPalette.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onToggleSidebar: PropTypes.func,
  sidebarCollapsed: PropTypes.bool
};

