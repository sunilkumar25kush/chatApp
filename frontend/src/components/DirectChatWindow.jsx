import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import conversationService from '../services/conversationService';
import api from '../services/api';
import { socket, isSocketConnected } from '../services/socket';
import { useAuth } from '../context/useAuth';
import { useCall } from '../context/CallContext';
import { useAppearance } from '../context/AppearanceContext';
import { useTheme } from '../context/ThemeContext';
import { toast } from '../utils/toast';
import UserProfileModal from './profile/UserProfileModal';
import AppearanceStudioModal from './appearance/AppearanceStudioModal';
import WallpaperEffectsLayer from './appearance/WallpaperEffectsLayer';
import VoiceRecorder from './VoiceRecorder';
import AudioPlayer from './AudioPlayer';
import EmojiPicker, { Theme } from 'emoji-picker-react';

export default function DirectChatWindow({
  conversation,
  onBack,
  onToggleMobileSidebar
}) {
  const { user: currentUser } = useAuth();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();

  const { startCall } = useCall();
  const { getActiveWallpaperForRoom, appearanceState } = useAppearance();
  const { resolvedMode } = useTheme();
  const isDarkMode = resolvedMode === 'dark';

  const friend = conversation?.friend;
  const conversationId = conversation?._id?.toString() || conversation?.id?.toString();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [friendTyping, setFriendTyping] = useState(false);

  // Message editing state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');

  // Reactions state
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [popoverPlacement, setPopoverPlacement] = useState('top');

  // Emoji picker for input composer
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // File & voice attachments
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Modals
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [targetProfileId, setTargetProfileId] = useState(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const reactionPickerRef = useRef(null);
  const composerEmojiRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Close emoji pickers on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        reactionPickerRef.current &&
        !reactionPickerRef.current.contains(e.target) &&
        !e.target.closest('.msg-emoji-expand-btn') &&
        !e.target.closest('.msg-emoji-search-btn')
      ) {
        setReactionPickerMessageId(null);
      }
      if (
        composerEmojiRef.current &&
        !composerEmojiRef.current.contains(e.target) &&
        !e.target.closest('.composer-emoji-btn')
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 1. Initial messages fetch & socket room join
  useEffect(() => {
    if (!conversationId) return;

    let isMounted = true;

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await conversationService.getMessages(conversationId, null, 30);
        if (isMounted) {
          setMessages(res.messages || []);
          setHasMore(res.hasMore || false);
          setNextCursor(res.nextCursor || null);
          setTimeout(() => scrollToBottom(false), 50);
        }

        await conversationService.markAsRead(conversationId).catch(() => {});
      } catch (err) {
        console.error('Failed to load direct messages:', err);
        toast.error('Failed to load message history');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();

    socket.emit('join_conversation', { conversationId });

    return () => {
      isMounted = false;
      socket.emit('leave_conversation', { conversationId });
    };
  }, [conversationId]);

  // 2. Real-time Socket.IO Listeners
  useEffect(() => {
    if (!conversationId) return;

    const handleMessageReceived = (data) => {
      if (data?.conversationId === conversationId && data?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
        scrollToBottom(true);

        const senderId = (data.message.sender?._id || data.message.sender?.id || data.message.sender)?.toString();
        if (senderId !== currentUserId) {
          conversationService.markAsRead(conversationId).catch(() => {});
          socket.emit('mark_direct_read', { conversationId });
        }
      }
    };

    const handleMessagesRead = (data) => {
      if (data?.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => {
            const senderId = (msg.sender?._id || msg.sender?.id || msg.sender)?.toString();
            if (senderId === currentUserId) {
              return { ...msg, isRead: true, readAt: data.readAt };
            }
            return msg;
          })
        );
      }
    };

    const handleMessageEdited = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, content: data.content, isEdited: true, editedAt: data.editedAt }
            : msg
        )
      );
    };

    const handleMessageDeleted = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, isDeleted: true, content: 'This message was deleted', fileUrl: null }
            : msg
        )
      );
    };

    const handleUserTyping = (data) => {
      if (data?.conversationId === conversationId && String(data?.userId) !== currentUserId) {
        setFriendTyping(Boolean(data.isTyping));
      }
    };

    const handleReactionUpdated = (updatedMsg) => {
      if (!updatedMsg) return;
      const targetConvId = (updatedMsg.conversation?._id || updatedMsg.conversation)?.toString();
      if (!targetConvId || targetConvId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === updatedMsg._id ? { ...m, reactions: updatedMsg.reactions || [] } : m
          )
        );
      }
    };

    socket.on('direct_message_received', handleMessageReceived);
    socket.on('direct_messages_read', handleMessagesRead);
    socket.on('direct_message_edited', handleMessageEdited);
    socket.on('direct_message_deleted', handleMessageDeleted);
    socket.on('direct_user_typing', handleUserTyping);
    socket.on('message_reaction_updated', handleReactionUpdated);

    return () => {
      socket.off('direct_message_received', handleMessageReceived);
      socket.off('direct_messages_read', handleMessagesRead);
      socket.off('direct_message_edited', handleMessageEdited);
      socket.off('direct_message_deleted', handleMessageDeleted);
      socket.off('direct_user_typing', handleUserTyping);
      socket.off('message_reaction_updated', handleReactionUpdated);
    };
  }, [conversationId, currentUserId]);

  // 3. Load Older Messages (Pagination)
  const handleLoadMore = async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    try {
      setLoadingMore(true);
      const res = await conversationService.getMessages(conversationId, nextCursor, 30);
      setMessages((prev) => [...(res.messages || []), ...prev]);
      setHasMore(res.hasMore || false);
      setNextCursor(res.nextCursor || null);
    } catch {
      toast.error('Failed to load older messages');
    } finally {
      setLoadingMore(false);
    }
  };

  // 4. Send Text Message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    const clientMsgId = 'dm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    try {
      setSending(true);
      setInputText('');
      setShowEmojiPicker(false);

      socket.emit('direct_typing', { conversationId, isTyping: false });

      const res = await conversationService.sendMessage(conversationId, {
        content: trimmed,
        clientMsgId
      });

      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === res.message._id)) return prev;
          return [...prev, res.message];
        });
        scrollToBottom(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
      setInputText(trimmed);
    } finally {
      setSending(false);
    }
  };

  // 5. Typing Handler
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    socket.emit('direct_typing', { conversationId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('direct_typing', { conversationId, isTyping: false });
    }, 2000);
  };

  // 6. Edit & Delete Message
  const handleSaveEdit = async (messageId) => {
    if (!editText.trim()) return;
    try {
      await conversationService.editMessage(messageId, editText.trim());
      setEditingMessageId(null);
      setEditText('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await conversationService.deleteMessage(messageId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete message');
    }
  };

  // 7. Message Reactions Handler
  const handleToggleReaction = (messageId, emoji) => {
    if (!messageId || !emoji) return;

    if (isSocketConnected()) {
      socket.emit('toggle_reaction', { messageId, roomId: conversationId, emoji }, (res) => {
        if (res?.ok && res?.message) {
          setMessages((prev) =>
            prev.map((m) => (m._id === messageId ? { ...m, reactions: res.message.reactions || [] } : m))
          );
        }
      });
    } else {
      api.post(`/messages/${messageId}/reaction`, { emoji, roomId: conversationId })
        .then((res) => {
          if (res.data) {
            setMessages((prev) =>
              prev.map((m) => (m._id === messageId ? { ...m, reactions: res.data.reactions || [] } : m))
            );
          }
        })
        .catch((err) => {
          console.error('Failed to toggle reaction fallback:', err);
        });
    }
  };

  // 8. Voice Note Send Handler
  const handleSendVoiceNote = async (blob) => {
    try {
      setIsRecordingVoice(false);
      setUploadingFile(true);

      const formData = new FormData();
      formData.append('file', blob, 'voice-note.webm');

      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const { url } = res.data;

      const sent = await conversationService.sendMessage(conversationId, {
        content: '',
        fileUrl: url,
        fileType: 'audio',
        fileName: 'Voice Note'
      });

      if (sent.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === sent.message._id)) return prev;
          return [...prev, sent.message];
        });
        scrollToBottom(true);
      }
    } catch (err) {
      console.error('Failed to send voice note:', err);
      toast.error('Failed to upload voice note');
    } finally {
      setUploadingFile(false);
    }
  };

  // 9. File Upload Handler (Images & Documents)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploadingFile(true);

    try {
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { url, fileType, fileName } = response.data;
      const isImg = file.type.startsWith('image/');
      const computedFileType = isImg ? 'image' : (fileType || 'file');

      const sent = await conversationService.sendMessage(conversationId, {
        content: '',
        fileUrl: url,
        fileType: computedFileType,
        fileName: fileName || file.name,
        fileSize: file.size
      });

      if (sent.message) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === sent.message._id)) return prev;
          return [...prev, sent.message];
        });
        scrollToBottom(true);
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
      toast.error('File upload failed');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 10. Call Starters
  const handleVoiceCall = () => {
    const friendName = friend?.fullName || friend?.username || 'Friend';
    startCall(conversationId, friendName, 'voice');
  };

  const handleVideoCall = () => {
    const friendName = friend?.fullName || friend?.username || 'Friend';
    startCall(conversationId, friendName, 'video');
  };

  const isFriendOnline = friend?.status === 'online';
  const wallpaperUrl = getActiveWallpaperForRoom(conversationId);

  return (
    <div
      className="direct-chat-window"
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--theme-chat-bg, #181a20)',
        color: '#f3f4f6',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* ── Wallpaper Background Layer ──────────────────────────────── */}
      {wallpaperUrl && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: appearanceState?.controls?.fitMode === 'contain' ? 'contain' : appearanceState?.controls?.fitMode === 'fill' ? '100% 100%' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: appearanceState?.controls?.opacity ?? 0.85,
            filter: `blur(${appearanceState?.controls?.blur || 0}px) brightness(${appearanceState?.controls?.brightness || 100}%) contrast(${appearanceState?.controls?.contrast || 100}%) saturate(${appearanceState?.controls?.saturation || 100}%)`,
            transform: `scale(${(appearanceState?.controls?.scale || 100) / 100})`,
            transformOrigin: 'center center',
            transition: 'all 0.15s ease',
            pointerEvents: 'none',
            zIndex: 0
          }}
        />
      )}

      {/* ── Animated Visual Effects Layer ───────────────────────────── */}
      <WallpaperEffectsLayer />

      {/* ── Direct Chat Header ───────────────────────────────────────── */}
      <div
        className="direct-chat-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'var(--theme-sidebar-bg, #1a1c23)',
          zIndex: 10,
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="btn-icon"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#222530',
                border: '1px solid #3f4657',
                color: '#f3f4f6',
                cursor: 'pointer'
              }}
            >
              ←
            </button>
          )}

          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="mobile-sidebar-toggle"
              aria-label="Toggle Menu"
              style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 20 }}
            >
              ☰
            </button>
          )}

          {/* Friend Profile Trigger (Avatar + Name clickable) */}
          <div
            onClick={() => setTargetProfileId(friend?._id || friend?.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            title="Click to view friend profile"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setTargetProfileId(friend?._id || friend?.id);
            }}
          >
            <div style={{ position: 'relative' }}>
              <img
                src={friend?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${friend?.username || 'Friend'}`}
                alt={friend?.username || 'Friend'}
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: '#2d3139' }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: isFriendOnline ? '#10b981' : '#6b7280',
                  border: '2px solid #1a1c23'
                }}
                title={isFriendOnline ? 'Online' : 'Offline'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{friend?.fullName || friend?.username}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>@{friend?.username}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                {friend?.publicId && (
                  <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                    ID: {friend.publicId}
                  </span>
                )}
                <span>•</span>
                <span style={{ color: isFriendOnline ? '#10b981' : '#9ca3af' }}>
                  {isFriendOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Header Right Actions: Voice Call, Video Call, Theme Studio */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleVoiceCall}
            className="btn-icon"
            title="Start Voice Call"
            aria-label="Start Voice Call"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#34d399',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleVideoCall}
            className="btn-icon"
            title="Start Video Call"
            aria-label="Start Video Call"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#60a5fa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setIsStudioOpen(true)}
            className="btn-icon"
            title="Customize Theme & Wallpaper"
            aria-label="Customize Theme & Wallpaper"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f472b6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Message History Stream ──────────────────────────────────── */}
      <div
        className="direct-messages-stream chat-feed"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Load More Button */}
        {hasMore && (
          <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
            <button
              type="button"
              disabled={loadingMore}
              onClick={handleLoadMore}
              style={{
                padding: '6px 16px',
                borderRadius: 16,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {loadingMore ? 'Loading older messages...' : '↑ Load older messages'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#9ca3af',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              margin: 'auto'
            }}
          >
            <div style={{ fontSize: 42, marginBottom: 12 }}>👋</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f3f4f6', margin: '0 0 6px' }}>
              Say hello to {friend?.fullName || friend?.username}!
            </h3>
            <p style={{ fontSize: 13, margin: 0 }}>This is the beginning of your direct conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderId = (msg.sender?._id || msg.sender?.id || msg.sender)?.toString();
            const isMe = senderId === currentUserId;
            const isEditing = editingMessageId === msg._id;
            const isHovered = hoveredMessageId === msg._id;

            return (
              <div
                key={msg._id}
                className={`msg-row-container ${isMe ? 'msg-row--me' : 'msg-row--incoming'}`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPopoverPlacement(rect.top < 180 ? 'bottom' : 'top');
                  setHoveredMessageId(msg._id);
                }}
                onMouseLeave={() => {
                  if (reactionPickerMessageId !== msg._id) {
                    setHoveredMessageId(null);
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  marginBottom: 6,
                  position: 'relative'
                }}
              >
                {/* Message Bubble Container */}
                <div
                  className="msg-bubble-wrapper"
                  style={{
                    maxWidth: '78%',
                    position: 'relative'
                  }}
                >
                  {/* Unified Hover Menu: Quick Emoji Reactions & Author Actions */}
                  {isHovered && !isEditing && (
                    <div
                      className={`msg-unified-menu ${isMe ? 'msg-unified-menu--me' : 'msg-unified-menu--incoming'} ${
                        popoverPlacement === 'bottom' ? 'msg-unified-menu--bottom' : 'msg-unified-menu--top'
                      }`}
                      role="toolbar"
                      aria-label="Message options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Emoji Reactions Row */}
                      <div className="msg-reactions-toolbar">
                        {['👍', '❤️', '😂', '🔥', '😮', '😢'].map((emoji) => {
                          const hasReactedWithThis = (msg.reactions || []).some(
                            (r) =>
                              r.emoji === emoji &&
                              (r.users || []).some(
                                (u) => (u?._id || u?.id || u).toString() === currentUserId
                              )
                          );
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReaction(msg._id, emoji);
                                setHoveredMessageId(null);
                                setReactionPickerMessageId(null);
                              }}
                              className={`msg-emoji-btn ${hasReactedWithThis ? 'msg-emoji-btn--active' : ''}`}
                              title={`React with ${emoji}`}
                              aria-label={`React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          );
                        })}

                        {/* Search / Expand Reactions */}
                        <button
                          type="button"
                          className="msg-emoji-btn msg-emoji-expand-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionPickerMessageId(
                              reactionPickerMessageId === msg._id ? null : msg._id
                            );
                          }}
                          title="More reactions"
                          aria-label="More reactions"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      </div>

                      {/* Author Edit/Delete Toolbar */}
                      {isMe && !msg.isDeleted && (
                        <>
                          <div className="msg-toolbar-divider" />
                          <div className="msg-actions-toolbar">
                            <button
                              type="button"
                              className="msg-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingMessageId(msg._id);
                                setEditText(msg.content || '');
                                setHoveredMessageId(null);
                              }}
                              title="Edit message"
                              aria-label="Edit message"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="msg-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMessage(msg._id);
                                setHoveredMessageId(null);
                              }}
                              title="Delete message"
                              aria-label="Delete message"
                              style={{ color: '#ef4444' }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Reaction Picker Popover */}
                  {reactionPickerMessageId === msg._id && (
                    <div
                      ref={reactionPickerRef}
                      className={`msg-reaction-picker-popover ${
                        isMe ? 'msg-reaction-picker-popover--me' : 'msg-reaction-picker-popover--incoming'
                      } ${popoverPlacement === 'bottom' ? 'msg-reaction-picker-popover--bottom' : 'msg-reaction-picker-popover--top'}`}
                      role="dialog"
                      aria-label="Search and choose reaction emoji"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          if (emojiData?.emoji) {
                            handleToggleReaction(msg._id, emojiData.emoji);
                          }
                          setReactionPickerMessageId(null);
                          setHoveredMessageId(null);
                        }}
                        theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
                        lazyLoadEmojis
                        searchPlaceHolder="Search reaction emoji..."
                        width={300}
                        height={360}
                        previewConfig={{ showPreview: false }}
                        skinTonesDisabled={false}
                        autoFocusSearch={true}
                      />
                    </div>
                  )}

                  {/* Main Bubble Box */}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe ? 'var(--theme-msg-outgoing, #7c3aed)' : 'var(--theme-msg-incoming, #222530)',
                      color: '#fff',
                      wordBreak: 'break-word',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      position: 'relative'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 6,
                            padding: '6px 8px',
                            color: '#fff',
                            fontSize: 13
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(msg._id)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              fontSize: 11,
                              cursor: 'pointer'
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(255,255,255,0.2)',
                              color: '#fff',
                              border: 'none',
                              fontSize: 11,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.isDeleted ? (
                          <span style={{ fontStyle: 'italic', opacity: 0.65 }}>
                            🚫 {msg.content}
                          </span>
                        ) : (
                          <>
                            {/* Image Attachment */}
                            {msg.fileUrl && msg.fileType === 'image' && (
                              <div style={{ marginBottom: msg.content ? 8 : 2 }}>
                                <img
                                  src={msg.fileUrl}
                                  alt="Attachment"
                                  onClick={() => setPreviewImageUrl(msg.fileUrl)}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: 280,
                                    borderRadius: 8,
                                    display: 'block',
                                    cursor: 'pointer',
                                    objectFit: 'cover'
                                  }}
                                />
                              </div>
                            )}

                            {/* Audio / Voice Note Attachment */}
                            {msg.fileUrl && msg.fileType === 'audio' && (
                              <div style={{ marginBottom: msg.content ? 8 : 2 }}>
                                <AudioPlayer src={msg.fileUrl} />
                              </div>
                            )}

                            {/* Generic Document File Attachment */}
                            {msg.fileUrl && msg.fileType !== 'image' && msg.fileType !== 'audio' && (
                              <div style={{ marginBottom: msg.content ? 8 : 2 }}>
                                <a
                                  href={msg.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={msg.fileName || true}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    background: 'rgba(0, 0, 0, 0.25)',
                                    color: '#38bdf8',
                                    textDecoration: 'none',
                                    fontSize: 13
                                  }}
                                >
                                  <span>📎 {msg.fileName || 'Download attachment'}</span>
                                  {msg.fileSize && (
                                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                                      ({Math.round(msg.fileSize / 1024)} KB)
                                    </span>
                                  )}
                                </a>
                              </div>
                            )}

                            {/* Text Body */}
                            {msg.content && <div>{msg.content}</div>}
                          </>
                        )}

                        {/* Metadata Row: Timestamp, Edited tag, Read Receipts */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            marginTop: 4,
                            fontSize: 11,
                            opacity: 0.75
                          }}
                        >
                          {msg.isEdited && <span>(edited)</span>}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>

                          {isMe && !msg.isDeleted && (
                            <span
                              title={msg.isRead ? 'Read' : 'Delivered'}
                              style={{ color: msg.isRead ? '#38bdf8' : 'inherit', marginLeft: 2, fontWeight: 700 }}
                            >
                              {msg.isRead ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Reaction Pills Below Bubble */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="msg-reactions-container" style={{ marginTop: 4 }}>
                      {msg.reactions.map((reaction, i) => {
                        const reactedUsers = (reaction.users || []).map((u) => {
                          if (typeof u === 'object' && u !== null) {
                            return { id: (u._id || u.id || '').toString(), name: u.username || 'User' };
                          }
                          return { id: String(u), name: 'User' };
                        });
                        const hasReacted = reactedUsers.some((u) => u.id === currentUserId);
                        const namesList = reactedUsers
                          .map((u) => (u.id === currentUserId ? 'You' : u.name))
                          .join(', ');

                        return (
                          <button
                            key={`${reaction.emoji}-${i}`}
                            type="button"
                            className={`msg-reaction-pill ${hasReacted ? 'msg-reaction-pill--active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReaction(msg._id, reaction.emoji);
                            }}
                            title={`${reaction.emoji} reacted by: ${namesList}`}
                            aria-label={`${reaction.emoji} reacted by ${namesList}`}
                          >
                            <span className="msg-reaction-pill-emoji">{reaction.emoji}</span>
                            <span className="msg-reaction-pill-count">{reaction.users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Friend Typing Indicator */}
        {friendTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: 13, fontStyle: 'italic', margin: '4px 0' }}>
            <span>{friend?.username} is typing...</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af', animation: 'pulse 1s infinite' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af', animation: 'pulse 1s infinite 0.2s' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af', animation: 'pulse 1s infinite 0.4s' }} />
            </div>
          </div>
        )}

        {uploadingFile && (
          <div style={{ fontSize: 12, color: 'var(--theme-primary, #a78bfa)', fontStyle: 'italic', padding: '4px 0' }}>
            Uploading attachment...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Floating Emoji Picker for Input Bar ──────────────────────── */}
      {showEmojiPicker && (
        <div
          ref={composerEmojiRef}
          style={{
            position: 'absolute',
            bottom: 74,
            left: 20,
            zIndex: 100,
            boxShadow: '0 8px 30px rgba(0,0,0,0.45)'
          }}
        >
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              if (emojiData?.emoji) {
                setInputText((prev) => prev + emojiData.emoji);
              }
              inputRef.current?.focus();
            }}
            theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
            lazyLoadEmojis
            searchPlaceHolder="Search emoji..."
            width={320}
            height={380}
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {/* ── Input Bar / Voice Recorder ───────────────────────────────── */}
      <div
        style={{
          padding: '12px 18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'var(--theme-sidebar-bg, #1a1c23)',
          zIndex: 10,
          position: 'relative'
        }}
      >
        {isRecordingVoice ? (
          <VoiceRecorder
            onCancel={() => setIsRecordingVoice(false)}
            onSend={handleSendVoiceNote}
          />
        ) : (
          <form
            onSubmit={handleSendMessage}
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            />

            {/* File Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              title="Send image or file"
              aria-label="Send image or file"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
                cursor: uploadingFile ? 'not-allowed' : 'pointer'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Voice Note Button */}
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              title="Record voice note"
              aria-label="Record voice note"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171',
                cursor: 'pointer'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {/* Emoji Picker Button */}
            <button
              type="button"
              className="composer-emoji-btn"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title="Choose emoji"
              aria-label="Choose emoji"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#facc15',
                cursor: 'pointer',
                fontSize: 18
              }}
            >
              😊
            </button>

            {/* Message Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              placeholder={`Message ${friend?.username || 'friend'}...`}
              maxLength={4000}
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 24,
                padding: '12px 18px',
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              style={{
                padding: '10px 22px',
                borderRadius: 24,
                background: 'var(--theme-primary, #7c3aed)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: 14,
                cursor: !inputText.trim() || sending ? 'not-allowed' : 'pointer',
                opacity: !inputText.trim() || sending ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              Send
            </button>
          </form>
        )}
      </div>

      {/* ── Image Lightbox Modal ─────────────────────────────────────── */}
      {previewImageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'zoom-out'
          }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <img
            src={previewImageUrl}
            alt="Full Preview"
            style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
          />
        </div>
      )}

      {/* ── Friend User Profile Modal ────────────────────────────────── */}
      {targetProfileId && (
        <UserProfileModal
          targetUserId={targetProfileId}
          onClose={() => setTargetProfileId(null)}
        />
      )}

      {/* ── Appearance Studio Modal for Direct Chat ─────────────────── */}
      <AppearanceStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        targetRoomId={conversationId}
        roomName={friend?.fullName || friend?.username}
      />
    </div>
  );
}

DirectChatWindow.propTypes = {
  conversation: PropTypes.object.isRequired,
  onBack: PropTypes.func,
  onToggleMobileSidebar: PropTypes.func
};
