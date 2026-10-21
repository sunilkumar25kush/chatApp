import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/useAuth';
import UserProfileModal from './profile/UserProfileModal';
import StatusPickerModal from './profile/StatusPickerModal';
import ThemeSettingsModal from './profile/ThemeSettingsModal';
import AppearanceStudioModal from './appearance/AppearanceStudioModal';
import { SkeletonChatItem } from './SkeletonLoaders';
import '../styles/gajim/gajim-provided.css'; // Import the new Gajim styles

export default function Sidebar({
  activeTab = 'chats',
  setActiveTab,
  onOpenCreateModal,
  onOpenJoinModal,
  recentRooms = [],
  rooms = [],
  activeRoom,
  onSelectRoom,
  searchQuery,
  setSearchQuery,
  unreadCounts = {},
  roomsLoading = false,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen
}) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [showPersonalityStudio, setShowPersonalityStudio] = useState(false);

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
                <div className={`presence-dropdown ${showUserMenu ? 'active' : ''}`} role="menu" aria-hidden={!showUserMenu} style={{ display: showUserMenu ? 'block' : 'none' }}>
                    <div className="presence-header">
                        <span className="user-display-name">{user?.username || 'My Account'}</span>
                        <span className="user-jid">{user?.email || 'user@xmpp.net'}</span>
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
                </div>
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
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span className="tooltip">Group Rooms</span>
                </button>
                <button 
                  className={`nav-item ${activeTab === 'calls' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('calls')} 
                  title="Calls" 
                  aria-label="Calls" 
                  aria-selected={activeTab === 'calls'} 
                  role="tab"
                >
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span className="tooltip">Calls</span>
                </button>
            </nav>

            {/* Bottom Utilities */}
            <div className="sidebar-footer">
                <button className="nav-item" onClick={() => setShowThemeSettings(true)} title="Toggle Theme" aria-label="Toggle Theme">
                    <svg className="icon theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <span className="tooltip">Theme Mode</span>
                </button>
                <button className="nav-item" onClick={onOpenJoinModal} title="Settings" aria-label="Open Settings">
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
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
                    <h1 className="panel-title">{activeTab === 'joined' ? 'Rooms' : 'Chats'}</h1>
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
                  <button className="btn-icon btn-primary-soft" onClick={onOpenCreateModal} title="Add Contact or Join Room" aria-label="Add Contact or Join Room">
                      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="search-container">
                <div className="search-input-wrapper">
                    <svg className="search-icon icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
                          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                  🌐 Public
                </button>
                <button 
                  className={`tab-item ui-tab-chip tab-chip-private ${activeTab === 'private' ? 'active' : ''}`} 
                  onClick={() => setActiveTab('private')} 
                  role="tab" 
                  aria-selected={activeTab === 'private'}
                >
                  🔒 Private
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
            <div className="chat-list" data-lenis-prevent role="listbox" aria-label="Conversations List">
                {roomsLoading ? (
                  /* Loading Roster State - Skeleton Loaders */
                  <div className="chat-list-skeleton" style={{ padding: 8 }}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <SkeletonChatItem key={i} />
                    ))}
                  </div>
                ) : currentRoomsList.length === 0 ? (
                  /* Empty Roster State */
                  <div className="empty-roster-state">
                      <svg className="icon icon-empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <p className="empty-title">No conversations found</p>
                      <p className="empty-subtitle">
                        {activeTab === 'public' ? 'No public channels match your search.' : activeTab === 'private' ? 'No private rooms found.' : 'Click the + button to create a new channel.'}
                      </p>
                  </div>
                ) : (
                  currentRoomsList.map((room) => {
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
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                        <span>Private</span>
                                      </span>
                                    ) : (
                                      <span className="roster-badge roster-badge-public" title="Published Public Channel">
                                        <span className="badge-pulse" aria-hidden="true" />
                                        <span>🌐 Public</span>
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
                        </div>
                      </div>
                    )
                  })
                )}
            </div>
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
  onSelectRoom: PropTypes.func,
  searchQuery: PropTypes.string,
  setSearchQuery: PropTypes.func,
  unreadCounts: PropTypes.object,
  roomsLoading: PropTypes.bool,
  isMobileSidebarOpen: PropTypes.bool,
  setIsMobileSidebarOpen: PropTypes.func
};
