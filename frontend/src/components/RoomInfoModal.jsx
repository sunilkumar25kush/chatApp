import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/useAuth';
import { toast } from '../utils/toast';

export default function RoomInfoModal({
  isOpen,
  onClose,
  room,
  onLeaveRoom,
  onOpenStudio,
  onOpenPrivacy,
  onOpenJoinRequests,
  onDeleteRoom,
  isRoomOwnerOrAdmin,
  pendingRequestsCount = 0,
  onToggleSelectionMode,
  onViewAdminProfile
}) {
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const roomId = room?._id || room?.id || '';
  const storageMuteKey = `room_muted_${roomId}`;

  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(storageMuteKey) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isOpen) {
      setConfirmLeave(false);
      setShowMoreActions(false);
      try {
        setIsMuted(localStorage.getItem(storageMuteKey) === 'true');
      } catch {
        /* ignore */
      }
    }
  }, [isOpen, storageMuteKey]);

  if (!isOpen || !room) return null;

  const getUserInitials = (name) => {
    if (!name) return 'R';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const getRoomColor = (name) => {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  };

  const memberCount = room.members?.length || 1;

  // Identify administrator
  const adminObj = room.owner || room.admins?.[0] || room.createdBy;
  const adminId = adminObj?._id || adminObj?.id || (typeof adminObj === 'string' ? adminObj : null);
  const adminName = adminObj?.fullName || adminObj?.username || (adminId && adminId === user?._id ? user.username : 'Administrator');

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      localStorage.setItem(storageMuteKey, String(nextMuted));
    } catch {
      /* ignore */
    }
    if (nextMuted) {
      toast.info(`🔔 Notifications muted for #${room.name}`);
    } else {
      toast.success(`🔔 Notifications unmuted for #${room.name}`);
    }
  };

  const handleCopyCode = async () => {
    if (!room.code) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      toast.success(`Room code copied: ${room.code}`);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('Failed to copy room code');
    }
  };

  const handleAddFriend = async () => {
    if (room.code) {
      try {
        await navigator.clipboard.writeText(room.code);
        toast.success(`Room invite code (${room.code}) copied! Share with friends to invite them.`);
      } catch {
        toast.info(`Invite friends with code: ${room.code}`);
      }
    } else {
      toast.info('Share the room name or code with friends to invite them!');
    }
  };

  const handleLeaveConfirm = () => {
    onClose?.();
    onLeaveRoom?.(roomId);
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        className="room-info-card"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-panel, #182232)',
          color: 'var(--text-main, #f3f4f6)',
          borderRadius: 20,
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          animation: 'scale-up 150ms ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Room Information"
      >
        {/* Top Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: 'var(--text-muted, #9ca3af)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            zIndex: 10,
            transition: 'background 0.2s, color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = 'var(--text-muted, #9ca3af)';
          }}
        >
          ✕
        </button>

        {/* Room Header Banner & Avatar */}
        <div
          style={{
            padding: '28px 24px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))'
          }}
        >
          {/* Big Circular Avatar */}
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: getRoomColor(room.name),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 28,
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              marginBottom: 14
            }}
          >
            {getUserInitials(room.name)}
          </div>

          {/* Room Name */}
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: '0 0 4px',
              color: 'var(--text-main, #ffffff)',
              letterSpacing: '-0.01em',
              maxWidth: 320,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}
          >
            {room.name || 'Chat Room'}
          </h2>

          {/* Member Count Subtitle */}
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
            <span>•</span>
            <span style={{ color: room.isPrivate ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
              {room.isPrivate ? 'Private Room' : 'Public Channel'}
            </span>
          </div>

          {/* Quick Action Grid (Telegram Style) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              width: '100%',
              marginTop: 18
            }}
          >
            {/* 1. Mute */}
            <button
              type="button"
              onClick={handleToggleMute}
              style={{
                background: isMuted ? 'rgba(239, 68, 68, 0.16)' : 'var(--bg-panel-hover, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                borderRadius: 12,
                padding: '10px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: isMuted ? '#f87171' : 'var(--text-main, #f3f4f6)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>{isMuted ? '🔕' : '🔔'}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* 2. Chat Room Studio */}
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onOpenStudio?.();
              }}
              style={{
                background: 'var(--bg-panel-hover, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                borderRadius: 12,
                padding: '10px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-main, #f3f4f6)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>🎛️</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Studio</span>
            </button>

            {/* 3. Select Messages */}
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onToggleSelectionMode?.();
              }}
              style={{
                background: 'var(--bg-panel-hover, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                borderRadius: 12,
                padding: '10px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-main, #f3f4f6)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>☑️</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Select</span>
            </button>

            {/* 4. More Options */}
            <button
              type="button"
              onClick={() => setShowMoreActions((prev) => !prev)}
              style={{
                background: showMoreActions ? 'var(--color-primary-light, rgba(124, 58, 237, 0.2))' : 'var(--bg-panel-hover, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                borderRadius: 12,
                padding: '10px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: showMoreActions ? 'var(--color-primary, #a78bfa)' : 'var(--text-main, #f3f4f6)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>•••</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>More</span>
            </button>
          </div>
        </div>

        {/* Details & Action List */}
        <div
          style={{
            padding: '12px 14px 20px',
            overflowY: 'auto',
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          <div
            style={{
              padding: '6px 12px 2px',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-primary, #60a5fa)'
            }}
          >
            Room Details & Actions
          </div>

          {/* Member Count with Add Friend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--bg-panel-hover, rgba(255, 255, 255, 0.03))'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main, #f3f4f6)' }}>
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>Active participants</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddFriend}
              title="Add Friend or Invite"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>+👤</span>
              <span>Add Friend</span>
            </button>
          </div>

          {/* Administrator with profile preview */}
          <div
            onClick={() => {
              if (adminId) {
                onClose?.();
                onViewAdminProfile?.(adminId);
              } else {
                toast.info('Administrator profile not found');
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--bg-panel-hover, rgba(255, 255, 255, 0.03))',
              cursor: adminId ? 'pointer' : 'default',
              transition: 'background 0.15s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>🛡️</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main, #f3f4f6)' }}>
                  {adminName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                  Administrator • Tap to view profile
                </div>
              </div>
            </div>
            {adminId && (
              <span style={{ fontSize: 12, color: 'var(--color-primary, #a78bfa)', fontWeight: 600 }}>
                Profile →
              </span>
            )}
          </div>

          {/* Room Join Code */}
          {room.code && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg-panel-hover, rgba(255, 255, 255, 0.03))'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main, #f3f4f6)' }}>
                    Room Join Code
                  </div>
                  <code style={{ fontSize: 12, color: 'var(--color-primary, #f59e0b)', fontFamily: 'monospace', fontWeight: 700 }}>
                    {room.code}
                  </code>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: copiedCode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: copiedCode ? '#34d399' : 'var(--text-main, #f3f4f6)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copiedCode ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* More options expansion */}
          {showMoreActions && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 0',
                borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                marginTop: 4,
                marginBottom: 4
              }}
            >
              {/* Privacy settings */}
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenPrivacy?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-main, #f3f4f6)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <span style={{ fontSize: 16 }}>🔒</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Room Privacy Settings</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>Switch public/private & codes</div>
                </div>
              </button>

              {/* Join Requests (if owner/admin) */}
              {isRoomOwnerOrAdmin && onOpenJoinRequests && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onOpenJoinRequests?.();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-main, #f3f4f6)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                >
                  <span style={{ fontSize: 16 }}>👥</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Review Join Requests</span>
                      {pendingRequestsCount > 0 && (
                        <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                          {pendingRequestsCount}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>Approve or decline member access</div>
                  </div>
                </button>
              )}

              {/* Delete Room (if creator) */}
              {onDeleteRoom && room.owner && (user?._id === room.owner._id || user?.id === room.owner._id || user?._id === room.owner || user?.id === room.owner) && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onDeleteRoom?.();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                >
                  <span style={{ fontSize: 16 }}>🗑️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Delete Room</div>
                    <div style={{ fontSize: 11, color: 'rgba(239, 68, 68, 0.8)' }}>Permanently remove this chat space</div>
                  </div>
                </button>
              )}

              {/* Chat Room Studio in More */}
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenStudio?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-main, #f3f4f6)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <span style={{ fontSize: 16 }}>🎨</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Chat Room Studio</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>Customize visual style, sounds & effects</div>
                </div>
              </button>
            </div>
          )}

          {/* Leave Room Item */}
          <div style={{ marginTop: 8 }}>
            {confirmLeave ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                  Are you sure you want to leave #{room.name}?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleLeaveConfirm}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Yes, Leave Room
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-main, #f3f4f6)',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'none',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                <span style={{ fontSize: 18 }}>🚪</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Leave Room</div>
                  <div style={{ fontSize: 11, color: 'rgba(239, 68, 68, 0.8)' }}>Exit this chat room</div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

RoomInfoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  room: PropTypes.object,
  onLeaveRoom: PropTypes.func,
  onOpenStudio: PropTypes.func,
  onOpenPrivacy: PropTypes.func,
  onToggleSelectionMode: PropTypes.func,
  onViewAdminProfile: PropTypes.func
};

