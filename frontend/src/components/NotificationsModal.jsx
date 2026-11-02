import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import notificationService from '../services/notificationService';
import { toast } from '../utils/toast';
import LineSidebar from './LineSidebar';

export default function NotificationsModal({
  isOpen,
  onClose,
  onNavigate,
  onUnreadCountChange
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const cardRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationService.getNotifications();
      const list = res.notifications || [];
      setNotifications(list);
      if (typeof onUnreadCountChange === 'function') {
        onUnreadCountChange(res.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      if (typeof onUnreadCountChange === 'function') {
        const remaining = notifications.filter((n) => n._id !== id && !n.isRead).length;
        onUnreadCountChange(remaining);
      }
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setActionLoading(true);
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      if (typeof onUnreadCountChange === 'function') {
        onUnreadCountChange(0);
      }
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationService.deleteNotification(id);
      const updated = notifications.filter((n) => n._id !== id);
      setNotifications(updated);
      if (typeof onUnreadCountChange === 'function') {
        const unread = updated.filter((n) => !n.isRead).length;
        onUnreadCountChange(unread);
      }
    } catch {
      toast.error('Failed to remove notification');
    }
  };

  const handleItemClick = async (notif) => {
    if (!notif.isRead) {
      handleMarkAsRead(notif._id);
    }
    onClose();
    if (typeof onNavigate === 'function') {
      onNavigate(notif.link || { screen: 'friends' }, notif);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'friend_request':
        return '👋';
      case 'friend_accepted':
        return '🎉';
      case 'room_join_request':
        return '👥';
      case 'room_join_approved':
        return '🔓';
      case 'room_join_rejected':
        return '🚫';
      default:
        return '🔔';
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const friendReqCount = notifications.filter(
    (n) => n.type === 'friend_request' || n.type === 'friend_accepted'
  ).length;

  const roomReqCount = notifications.filter(
    (n) => n.type === 'room_join_request' || n.type === 'room_join_approved' || n.type === 'room_join_rejected'
  ).length;

  const categoryFilters = [
    { id: 'all', label: 'All Notifications', count: notifications.length },
    { id: 'friend_requests', label: 'Friend Requests', count: friendReqCount },
    { id: 'room_requests', label: 'Room Requests', count: roomReqCount }
  ];

  const displayedList = notifications.filter((n) => {
    if (activeCategoryIndex === 1) {
      return n.type === 'friend_request' || n.type === 'friend_accepted';
    }
    if (activeCategoryIndex === 2) {
      return n.type === 'room_join_request' || n.type === 'room_join_approved' || n.type === 'room_join_rejected';
    }
    return true;
  });

  return createPortal(
    <div
      className="modal-overlay modal-overlay--centered"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10005,
        padding: 16
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
    >
      <div
        className="modal-card"
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '85vh',
          background: 'var(--theme-modal-bg, #1a1c23)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <h2
              id="notifications-title"
              style={{
                fontSize: 18,
                fontWeight: 700,
                margin: 0,
                color: 'var(--theme-text, #f3f4f6)'
              }}
            >
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12
                }}
              >
                {unreadCount} new
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--theme-primary, #a78bfa)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn-icon"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* LineSidebar Category Filter */}
        <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(0, 0, 0, 0.15)' }}>
          <LineSidebar
            items={categoryFilters}
            accentColor="#A855F7"
            textColor="#c4c4c4"
            markerColor="#6c6c6c"
            showIndex={false}
            showMarker={true}
            proximityRadius={100}
            maxShift={20}
            falloff="smooth"
            markerLength={40}
            markerGap={0}
            tickScale={0.5}
            scaleTick={true}
            itemGap={6}
            fontSize={0.9}
            smoothing={100}
            defaultActive={0}
            activeItem={activeCategoryIndex}
            onItemClick={(index) => setActiveCategoryIndex(index)}
          />
        </div>

        {/* Content list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px'
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: '3px solid rgba(255,255,255,0.1)',
                  borderTopColor: 'var(--theme-primary, #a78bfa)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 12px'
                }}
              />
              Loading notifications...
            </div>
          ) : displayedList.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 16px',
                color: '#9ca3af'
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#f3f4f6' }}>
                No notifications
              </h3>
              <p style={{ fontSize: 13, margin: 0 }}>
                {activeCategoryIndex === 1
                  ? 'No friend requests waiting.'
                  : activeCategoryIndex === 2
                  ? 'No room requests waiting.'
                  : "You're completely caught up! Friend updates and room join requests will appear here."}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayedList.map((notif) => {
                const icon = getNotificationIcon(notif.type);
                return (
                  <div
                    key={notif._id}
                    onClick={() => handleItemClick(notif)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemClick(notif);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: notif.isRead
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(124, 58, 237, 0.08)',
                      border: notif.isRead
                        ? '1px solid rgba(255, 255, 255, 0.05)'
                        : '1px solid rgba(124, 58, 237, 0.25)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      position: 'relative'
                    }}
                  >
                    {/* Icon container */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: notif.isRead
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(124, 58, 237, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        flexShrink: 0
                      }}
                    >
                      {icon}
                    </div>

                    {/* Text content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          marginBottom: 2
                        }}
                      >
                        <span
                          style={{
                            fontWeight: notif.isRead ? 600 : 700,
                            fontSize: 14,
                            color: notif.isRead ? '#e5e7eb' : '#fff',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {notif.title}
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                          {formatTime(notif.createdAt)}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: 13,
                          color: '#9ca3af',
                          margin: 0,
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {notif.message}
                      </p>
                    </div>

                    {/* Actions: unread badge & delete */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0
                      }}
                    >
                      {!notif.isRead && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--theme-primary, #a78bfa)',
                            display: 'inline-block'
                          }}
                          title="Unread"
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDelete(notif._id, e)}
                        title="Delete notification"
                        aria-label="Delete notification"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6b7280',
                          cursor: 'pointer',
                          padding: 2,
                          fontSize: 12
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  ,
    document.body
  );
}

NotificationsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onNavigate: PropTypes.func,
  onUnreadCountChange: PropTypes.func
};

