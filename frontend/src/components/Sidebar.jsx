import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/useAuth';
import UserProfileModal from './profile/UserProfileModal';
import StatusPickerModal from './profile/StatusPickerModal';
import ThemeSettingsModal from './profile/ThemeSettingsModal';
import AppearanceStudioModal from './appearance/AppearanceStudioModal';
import { SkeletonChatItem } from './SkeletonLoaders';
import '../styles/gajim/gajim-provided.css'; // Import the new Gajim styles
import { getRoomCreatorLabel } from '../utils/roomUtils';
import friendService from '../services/friendService';
import notificationService from '../services/notificationService';
import NotificationsModal from './NotificationsModal';
import { socket } from '../services/socket';
import AnimatedList from './AnimatedList';

export default function Sidebar({
  activeTab = 'chats',
  setActiveTab,
  onOpenCreateModal,
  onOpenJoinModal,
  recentRooms = [],
  rooms = [],
  activeRoom,
  directConversations = [],
  activeDirectConversation = null,
  onSelectDirectConversation,
  onSelectRoom,
  searchQuery,
  setSearchQuery,
  unreadCounts = {},
  roomsLoading = false,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onNavigateNotification
}) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [showPersonalityStudio, setShowPersonalityStudio] = useState(false);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  useEffect(() => {
    const fetchNotifsCount = async () => {
      try {
        const res = await notificationService.getNotifications();
        setUnreadNotificationsCount(res.unreadCount || 0);
      } catch {
        /* ignore */
      }
    };
    fetchNotifsCount();

    const handleNotifReceived = () => {
      setUnreadNotificationsCount((prev) => prev + 1);
    };
    socket.on('notification_received', handleNotifReceived);

    return () => {
      socket.off('notification_received', handleNotifReceived);
    };
  }, []);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await friendService.getIncomingRequests();
        setPendingFriendCount(res.requests?.length || 0);
      } catch {
        /* ignore */
      }
    };
    fetchPending();

    const handleReq = () => fetchPending();
    socket.on('friend_request_received', handleReq);
    socket.on('friend_request_accepted', handleReq);
    socket.on('friend_request_rejected', handleReq);
    socket.on('friend_request_cancelled', handleReq);

    return () => {
      socket.off('friend_request_received', handleReq);
      socket.off('friend_request_accepted', handleReq);
      socket.off('friend_request_rejected', handleReq);
      socket.off('friend_request_cancelled', handleReq);
    };
  }, []);

  const touchStartXRef = useRef(0);
  const userMenuRef = useRef(null);

  // Click Outside Listener for Presence Dropdown Menu
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showUserMenu]);

  // Body Scroll Lock & ESC Key Listener
  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileSidebarOpen, setIsMobileSidebarOpen]);

  // Touch Swipe Left Gesture Handlers
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchStartXRef.current - touchEndX;
    if (deltaX > 50) {
      setIsMobileSidebarOpen(false);
    }
  };

  // Derive initial/avatar from name
  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getRoomColor = (name) => {
    const colors = ['#d97706', '#2563eb', 'var(--theme-primary)', '#059669', '#dc2626', '#db2777'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  };

  const currentRoomsList = activeTab === 'joined' ? (rooms && rooms.length > 0 ? rooms : recentRooms) : rooms;

  const filteredDMs = (directConversations || []).filter((conv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const f = conv.friend || {};
    return (
      (f.username && f.username.toLowerCase().includes(q)) ||
      (f.fullName && f.fullName.toLowerCase().includes(q)) ||
      (f.publicId && f.publicId.toLowerCase().includes(q))
    );
  });

  return (
      <>
        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div 
            className="sidebar-backdrop visible"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <div
          className="gajim-sidebar-container"
          style={{
            display: 'flex',
            height: '100%',
          }}
        >
          {/* ========================================================= */}
          {/* 1. LEFT SIDEBAR                                          */}
          {/* ========================================================= */}
          <aside className="left-sidebar" aria-label="Main Navigation">
            {/* User Profile & Presence section */}
            <div className="sidebar-user-profile" ref={userMenuRef}>
                <div 
                  className="avatar-container" 
                  tabIndex="0" 
                  role="button" 
                  aria-haspopup="true" 
                  aria-expanded={showUserMenu} 
                  aria-label="User Profile & Presence Status"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                    <div className="avatar avatar-md" style={{ background: 'var(--theme-primary)' }}>
                        {user?.avatar ? (
                          <img src={user.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        ) : (
                          <svg viewBox="0 0 100 100" className="avatar-svg" aria-hidden="true">
                              <rect width="100" height="100" rx="50" fill="transparent" />
                              <text x="50" y="60" fontSize="40" fontWeight="600" fill="#ffffff" textAnchor="middle">
                                {getUserInitials(user?.username || 'Chatter')}
                              </text>
                          </svg>
                        )}
                    </div>
                    <span className="status-indicator status-online" title="Status: Online"></span>
                </div>

                {/* Presence Dropdown Menu */}
                {showUserMenu && (
                  <AnimatedList
                    className={`presence-dropdown ${showUserMenu ? 'active' : ''}`}
                    role="menu"
                    aria-hidden={!showUserMenu}
                    staggerDelay={0.03}
                    enableArrowNavigation
                  >
                    <div className="presence-header">
                        <span className="user-display-name">{user?.username || 'My Account'}</span>
                        <span className="user-jid">{user?.email || 'user@xmpp.net'}</span>
                        {user?.publicId && (
                          <span style={{ fontSize: '11px', color: 'var(--theme-primary, #a78bfa)', fontFamily: 'monospace', fontWeight: 700, marginTop: '2px' }}>
                            ID: {user.publicId}
                          </span>
                        )}
                    </div>
                    <div className="presence-divider"></div>
                    <button className="presence-option" onClick={() => { setShowUserMenu(false); setShowProfile(true); }} role="menuitem">
                        <span className="presence-label">👤 Profile</span>
                    </button>
                    <button className="presence-option" onClick={() => { setShowUserMenu(false); setShowStatusPicker(true); }} role="menuitem">
                        <span className="presence-label">💬 Set Status</span>
                    </button>
                    <button className="presence-option" onClick={() => { setShowUserMenu(false); setShowThemeSettings(true); }} role="menuitem">
                        <span className="presence-label">🎨 Themes</span>
                    </button>
                    <button className="presence-option" onClick={() => { setShowUserMenu(false); setShowPersonalityStudio(true); }} role="menuitem">
                        <span className="presence-label">✨ Personality Studio</span>
                    </button>
                    <div className="presence-divider"></div>
                    <button className="presence-option" onClick={logout} role="menuitem">
                        <span className="presence-label" style={{ color: '#f87171' }}>🚪 Logout</span>
                    </button>
                  </AnimatedList>
                )}
            </div>

            {/* Primary Navigation Icons */}
            <nav className="sidebar-nav" aria-label="Primary Features">
                <button 
                  className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('chats')} 
                  title="Chats & Roster" 
                  aria-label="Chats and Roster" 
                  aria-selected={activeTab === 'chats'} 
                  role="tab"
                >
                    <svg className="icon bi bi-chat-dots-fill" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0m4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0m3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg>
                    <span className="tooltip">Conversations</span>
                </button>
                <button 
                  className={`nav-item ${activeTab === 'joined' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('joined')} 
                  title="Group Chat Rooms" 
                  aria-label="Group Chat Rooms" 
                  aria-selected={activeTab === 'joined'} 
                  role="tab"
                >
                    <svg className="icon bi bi-people-fill" viewBox="0 0 16 16" fill="currentColor"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>
                    <span className="tooltip">Group Rooms</span>
                </button>
                <button 
                  className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('friends')} 
                  title="Friends" 
                  aria-label="Friends" 
                  aria-selected={activeTab === 'friends'} 
                  role="tab"
                  style={{ position: 'relative' }}
                >
                    <svg className="icon bi bi-person-heart" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M9 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-9 8c0 1 1 1 1 1h10s1 0 1-1-1-4-6-4-6 3-6 4m13.5-8.09c1.387-1.425 4.855 1.07 0 4.277-4.854-3.207-1.387-5.702 0-4.276Z"/>
                    </svg>
                    {pendingFriendCount > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        border: '2px solid var(--theme-sidebar-bg, #1a1c23)'
                      }}>
                        {pendingFriendCount}
                      </span>
                    )}
                    <span className="tooltip">Friends</span>
                </button>
                <button 
                  className={`nav-item ${activeTab === 'calls' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('calls')} 
                  title="Calls" 
                  aria-label="Calls" 
                  aria-selected={activeTab === 'calls'} 
                  role="tab"
                >
                    <svg className="icon bi bi-telephone-fill" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.68.68 0 0 0 .178.643l2.457 2.457a.68.68 0 0 0 .644.178l2.189-.547a1.75 1.75 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.6 18.6 0 0 1-7.01-4.42 18.6 18.6 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877z"/></svg>
                    <span className="tooltip">Calls</span>
                </button>
                <button 
                  className={`nav-item ${isNotificationsOpen ? 'active' : ''}`} 
                  onClick={() => setIsNotificationsOpen(true)} 
                  title="Notifications" 
                  aria-label="Notifications" 
                  style={{ position: 'relative' }}
                >
                    <svg className="icon bi bi-bell-fill" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>
                    </svg>
                    {unreadNotificationsCount > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        border: '2px solid var(--theme-sidebar-bg, #1a1c23)'
                      }}>
                        {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                      </span>
                    )}
                    <span className="tooltip">Notifications</span>
                </button>
            </nav>

            {/* Bottom Utilities */}
            <div className="sidebar-footer">
                <button className="nav-item" onClick={() => setShowThemeSettings(true)} title="Toggle Theme" aria-label="Toggle Theme">
                    <svg className="icon theme-icon-dark bi bi-moon-stars-fill" viewBox="0 0 16 16" fill="currentColor"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278M4.858 1.311A7.27 7.27 0 0 0 1.025 7.71c0 4.02 3.279 7.276 7.319 7.276a7.32 7.32 0 0 0 5.205-2.162q-.506.063-1.029.063c-4.61 0-8.343-3.714-8.343-8.29 0-1.167.242-2.278.681-3.286"/><path d="M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.73 1.73 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.73 1.73 0 0 0 9.25 6.206l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.73 1.73 0 0 0 1.097-1.097zM13.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732l-.774-.258a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z"/></svg>
                    <span className="tooltip">Theme Mode</span>
                </button>
                <button className="nav-item" onClick={onOpenJoinModal} title="Settings" aria-label="Open Settings">
                    <svg className="icon bi bi-gear-fill" viewBox="0 0 16 16" fill="currentColor"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>
                    <span className="tooltip">Settings</span>
                </button>
            </div>
        </aside>

        {/* ========================================================= */}
        {/* 2. CHAT LIST PANEL                                        */}
        {/* ========================================================= */}
        <section 
          className={`chat-list-panel ${isMobileSidebarOpen ? 'open' : ''}`}
          aria-label="Chat List and Roster"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
            {/* Header with Title & Action Button */}
            <div className="chat-list-header">
                <div className="header-title-container">
                    <h1 className="panel-title">{activeTab === 'joined' ? 'Rooms' : activeTab === 'friends' ? 'Friends' : activeTab === 'calls' ? 'Calls' : 'Chats'}</h1>
                    <span className="connection-status-pill connected" title="Connected">
                        <span className="status-dot"></span> JoyBoy
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button 
                    className="mobile-header-profile-btn" 
                    onClick={() => setShowProfile(true)} 
                    title="My Profile" 
                    aria-label="Open My Profile"
                  >
                    <div className="avatar avatar-sm" style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--theme-primary)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{getUserInitials(user?.username || 'User')}</span>
                      )}
                    </div>
                  </button>
                  <button 
                    className="btn-icon btn-primary-soft" 
                    onClick={() => setIsNotificationsOpen(true)} 
                    title="Notifications" 
                    aria-label="Open Notifications"
                    style={{ position: 'relative' }}
                  >
                    <svg className="icon bi bi-bell-fill" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>
                    </svg>
                    {unreadNotificationsCount > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        minWidth: 15,
                        height: 15,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                        border: '1.5px solid var(--theme-sidebar-bg, #1a1c23)'
                      }}>
                        {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                      </span>
                    )}
                  </button>
                  <button className="btn-icon btn-primary-soft" onClick={onOpenCreateModal} title="Add Contact or Join Room" aria-label="Add Contact or Join Room">
                      <svg className="icon bi bi-plus-lg" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>
                  </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="search-container">
                <div className="search-input-wrapper">
                    <svg className="search-icon icon bi bi-search" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
                    <input 
                      type="text" 
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                      className="search-input" 
                      placeholder="Search conversations or contacts..." 
                      aria-label="Search conversations" 
                    />
                    {searchQuery && (
                      <button 
                        className="btn-icon btn-sm clear-search-btn" 
                        onClick={() => setSearchQuery && setSearchQuery('')}
                        title="Clear search" 
                        aria-label="Clear Search"
                      >
                          <svg className="icon bi bi-x-lg" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
                      </button>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs ui-scroll-tabs" role="tablist" aria-label="Filter chats">
                <button 
                  className={`tab-item ui-tab-chip ${(activeTab === 'chats' || activeTab === 'explore') ? 'active' : ''}`} 
                  onClick={() => setActiveTab('chats')} 
                  role="tab" 
                  aria-selected={activeTab === 'chats' || activeTab === 'explore'}
                >
                  All
                </button>
                <button 
                  className={`tab-item ui-tab-chip tab-chip-public ${activeTab === 'public' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('public')} 
                  role="tab" 
                  aria-selected={activeTab === 'public'}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="bi bi-globe2" style={{ marginRight: 4, flexShrink: 0 }}><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A8 8 0 0 0 5.145 4H7.5zM4.09 4a9.3 9.3 0 0 1 .64-1.539 7 7 0 0 1 .597-.933A7.03 7.03 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a7 7 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.5 12.5 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12q.208.58.468 1.068c.552 1.035 1.218 1.65 1.887 1.855V12zm.18 2.472a6.7 6.7 0 0 1-.597-.933A9.3 9.3 0 0 1 4.09 12H2.255a7 7 0 0 0 3.07 2.472M1.674 8.5c.123.987.355 1.857.656 2.5h2.146a13 13 0 0 1-.312-2.5zm10.608 2.5h2.146c.301-.643.533-1.513.656-2.5h-2.49a13 13 0 0 1-.312 2.5m1.58-3.5a7 7 0 0 0-.656-2.5H12.28c.174.782.282 1.623.312 2.5zM12.49 4h2.146a7.03 7.03 0 0 0-3.07-2.472q.328.45.597.933c.24.478.455 1.02.639 1.539M8.5 4h2.355a8 8 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077zM11.887 13.068c.26-.487.468-1.068.468-1.068H8.5v2.923c.67-.204 1.335-.82 1.887-1.855M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1"/></svg>
                  <span>Public</span>
                </button>
                <button 
                  className={`tab-item ui-tab-chip tab-chip-private ${activeTab === 'private' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('private')} 
                  role="tab" 
                  aria-selected={activeTab === 'private'}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="bi bi-lock-fill" style={{ marginRight: 4, flexShrink: 0 }}><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"/></svg>
                  <span>Private</span>
                </button>
                <button 
                  className={`tab-item ui-tab-chip ${activeTab === 'joined' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('joined')} 
                  role="tab" 
                  aria-selected={activeTab === 'joined'}
                >
                  Joined
                </button>
            </div>

            {/* Chat List Scrollable Roster */}
            <AnimatedList
              className="chat-list"
              data-lenis-prevent
              role="listbox"
              aria-label="Conversations List"
              showGradients
              staggerDelay={0.02}
            >
                {roomsLoading ? (
                  /* Loading Roster State - Skeleton Loaders */
                  <div className="chat-list-skeleton" style={{ padding: 8 }}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <SkeletonChatItem key={i} />
                    ))}
                  </div>
                ) : (activeTab === 'chats' && filteredDMs.length === 0 && currentRoomsList.length === 0) || (activeTab !== 'chats' && currentRoomsList.length === 0) ? (
                  /* Empty Roster State */
                  <div className="empty-roster-state">
                      <svg className="icon icon-empty bi bi-chat-square-dots" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5a2 2 0 0 0-1.6.8L8 14.333 6.1 11.8a2 2 0 0 0-1.6-.8H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5a1 1 0 0 1 .8.4l1.9 2.533a1 1 0 0 0 1.6 0l1.9-2.533a1 1 0 0 1 .8-.4H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"/><path d="M5 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/></svg>
                      <p className="empty-title">No conversations found</p>
                      <p className="empty-subtitle">
                        {activeTab === 'public' ? 'No public channels match your search.' : activeTab === 'private' ? 'No private rooms found.' : 'Click the + button to create a new channel or add friends.'}
                      </p>
                  </div>
                ) : (
                  <>
                    {/* Direct Messages Section */}
                    {activeTab === 'chats' && filteredDMs.length > 0 && (
                      <div className="direct-messages-roster-group" style={{ marginBottom: 8 }}>
                        <div style={{
                          padding: '6px 14px 4px',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--theme-text-muted, #9ca3af)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span>Direct Messages ({filteredDMs.length})</span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('friends')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--theme-primary, #a78bfa)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            + Add
                          </button>
                        </div>

                        {filteredDMs.map((conv) => {
                          const isSelected = activeDirectConversation && (activeDirectConversation._id === conv._id);
                          const friend = conv.friend || {};
                          const isOnline = friend.status === 'online';
                          return (
                            <div
                              key={conv._id}
                              className={`chat-item direct-chat-item ${isSelected ? 'active' : ''}`}
                              onClick={() => onSelectDirectConversation && onSelectDirectConversation(conv)}
                              tabIndex="0"
                              role="button"
                            >
                              <div
                                className="avatar-circle"
                                style={{
                                  position: 'relative',
                                  width: 38,
                                  height: 38,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  background: '#374151',
                                  overflow: 'visible'
                                }}
                              >
                                {friend.avatar ? (
                                  <img
                                    src={friend.avatar}
                                    alt={friend.username || 'Friend'}
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      borderRadius: '50%',
                                      background: 'var(--theme-primary, #7c3aed)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#fff',
                                      fontWeight: 700,
                                      fontSize: 13
                                    }}
                                  >
                                    {getUserInitials(friend.fullName || friend.username || 'Friend')}
                                  </div>
                                )}
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    right: 0,
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: isOnline ? '#10b981' : '#6b7280',
                                    border: '2px solid var(--theme-sidebar-bg, #1a1c23)'
                                  }}
                                  title={isOnline ? 'Online' : 'Offline'}
                                />
                              </div>

                              <div className="chat-item-content">
                                <div className="chat-item-top">
                                  <div className="chat-name-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                                    <span className="chat-name" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                      {friend.fullName || friend.username}
                                    </span>
                                    {friend.publicId && (
                                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', background: 'rgba(124, 58, 237, 0.15)', padding: '1px 5px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>
                                        {friend.publicId}
                                      </span>
                                    )}
                                  </div>
                                  {conv.unreadCount > 0 && (
                                    <span className="unread-badge">
                                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <div className="chat-item-bottom">
                                  <span className="chat-preview" style={{ fontSize: 12, color: '#9ca3af' }}>
                                    {conv.lastMessage?.content ? conv.lastMessage.content : `@${friend.username}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Channels & Rooms Section Header */}
                    {activeTab === 'chats' && filteredDMs.length > 0 && currentRoomsList.length > 0 && (
                      <div style={{
                        padding: '8px 14px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--theme-text-muted, #9ca3af)'
                      }}>
                        Channels & Rooms ({currentRoomsList.length})
                      </div>
                    )}

                    {currentRoomsList.map((room) => {
                    const isSelected = activeRoom && (activeRoom._id || activeRoom.id) === (room._id || room.id);
                    const avatarBg = getRoomColor(room.name);
                    return (
                      <div
                        key={room._id || room.id || room.name}
                        className={`chat-item ${isSelected ? 'active' : ''}`}
                        onClick={() => onSelectRoom(room)}
                        tabIndex="0"
                      >
                        <div
                          className="avatar-circle"
                          style={{
                            background: avatarBg,
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            flexShrink: 0,
                            position: 'relative'
                          }}
                        >
                          {getUserInitials(room.name)}
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              background: room.isPrivate ? '#f59e0b' : '#10b981',
                              border: '1.5px solid var(--bg-sidebar, #0e1626)',
                              boxShadow: room.isPrivate ? '0 0 6px rgba(245, 158, 11, 0.5)' : '0 0 6px rgba(16, 185, 129, 0.6)'
                            }}
                          />
                        </div>

                        <div className="chat-item-content">
                            <div className="chat-item-top">
                                <div className="chat-name-wrapper">
                                    <span className="chat-name">{room.name}</span>
                                    {room.isPrivate ? (
                                      <span className="roster-badge roster-badge-private" title="Private Space (Code Required)">
                                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="bi bi-lock-fill" style={{ flexShrink: 0 }}><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"/></svg>
                                        <span>Private</span>
                                      </span>
                                    ) : (
                                      <span className="roster-badge roster-badge-public" title="Published Public Channel">
                                        <svg width="10.5" height="10.5" viewBox="0 0 16 16" fill="currentColor" className="bi bi-globe2" style={{ flexShrink: 0 }}><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A8 8 0 0 0 5.145 4H7.5zM4.09 4a9.3 9.3 0 0 1 .64-1.539 7 7 0 0 1 .597-.933A7.03 7.03 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a7 7 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.5 12.5 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12q.208.58.468 1.068c.552 1.035 1.218 1.65 1.887 1.855V12zm.18 2.472a6.7 6.7 0 0 1-.597-.933A9.3 9.3 0 0 1 4.09 12H2.255a7 7 0 0 0 3.07 2.472M1.674 8.5c.123.987.355 1.857.656 2.5h2.146a13 13 0 0 1-.312-2.5zm10.608 2.5h2.146c.301-.643.533-1.513.656-2.5h-2.49a13 13 0 0 1-.312 2.5m1.58-3.5a7 7 0 0 0-.656-2.5H12.28c.174.782.282 1.623.312 2.5zM12.49 4h2.146a7.03 7.03 0 0 0-3.07-2.472q.328.45.597.933c.24.478.455 1.02.639 1.539M8.5 4h2.355a8 8 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077zM11.887 13.068c.26-.487.468-1.068.468-1.068H8.5v2.923c.67-.204 1.335-.82 1.887-1.855M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1"/></svg>
                                        <span>Public</span>
                                      </span>
                                    )}
                                </div>
                                {unreadCounts[room._id || room.id] > 0 && (
                                  <span
                                    className="unread-badge"
                                    aria-label={`${unreadCounts[room._id || room.id]} unread messages`}
                                  >
                                    {unreadCounts[room._id || room.id] > 99 ? '99+' : unreadCounts[room._id || room.id]}
                                  </span>
                                )}
                            </div>
                            <div className="chat-item-bottom">
                                <span className="chat-preview room-creator-preview" title={`Created by ${getRoomCreatorLabel(room, user)}`}>
                                  Created by <strong>{getRoomCreatorLabel(room, user)}</strong>
                                </span>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                  </>
                )}
            </AnimatedList>
        </section>

      </div>

      {showProfile && user && (
        <UserProfileModal 
          targetUserId={user._id || user.id} 
          onClose={() => setShowProfile(false)} 
        />
      )}

      {showStatusPicker && (
        <StatusPickerModal onClose={() => setShowStatusPicker(false)} />
      )}

      {showThemeSettings && (
        <ThemeSettingsModal onClose={() => setShowThemeSettings(false)} />
      )}

      <AppearanceStudioModal
        isOpen={showPersonalityStudio}
        onClose={() => setShowPersonalityStudio(false)}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigate={onNavigateNotification}
        onUnreadCountChange={(cnt) => setUnreadNotificationsCount(cnt)}
      />
    </>
  );
}

Sidebar.propTypes = {
  activeTab: PropTypes.string,
  setActiveTab: PropTypes.func,
  onOpenCreateModal: PropTypes.func,
  onOpenJoinModal: PropTypes.func,
  recentRooms: PropTypes.array,
  rooms: PropTypes.array,
  activeRoom: PropTypes.object,
  directConversations: PropTypes.array,
  activeDirectConversation: PropTypes.object,
  onSelectDirectConversation: PropTypes.func,
  onSelectRoom: PropTypes.func,
  searchQuery: PropTypes.string,
  setSearchQuery: PropTypes.func,
  unreadCounts: PropTypes.object,
  roomsLoading: PropTypes.bool,
  isMobileSidebarOpen: PropTypes.bool,
  setIsMobileSidebarOpen: PropTypes.func,
  onNavigateNotification: PropTypes.func
};
