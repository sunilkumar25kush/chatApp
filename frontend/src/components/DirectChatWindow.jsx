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
import PresenceBadge from './common/PresenceBadge';
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

  // Message reply & edit state
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');

  // Info card popover
  const [infoMessageId, setInfoMessageId] = useState(null);

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
  const chatFeedRef = useRef(null);
  const messageRefs = useRef({});

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Dynamically calculate whether popover should open above or below the message
  const updatePopoverPlacement = useCallback((msgId) => {
    const el = messageRefs.current[msgId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const feedEl = chatFeedRef.current;
    const feedTop = feedEl ? feedEl.getBoundingClientRect().top : 60;
    const isNearTop = rect.top - feedTop < 140;
    setPopoverPlacement(isNearTop ? 'bottom' : 'top');
  }, []);

  // Recalculate placement if feed scrolls while menu is open
  useEffect(() => {
    const feed = chatFeedRef.current;
    if (!feed) return;
    const onScroll = () => {
      if (hoveredMessageId) {
        updatePopoverPlacement(hoveredMessageId);
      }
    };
    feed.addEventListener('scroll', onScroll, { passive: true });
    return () => feed.removeEventListener('scroll', onScroll);
  }, [hoveredMessageId, updatePopoverPlacement]);

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
        clientMsgId,
        replyToId: replyingTo ? replyingTo._id : null
      });

      setReplyingTo(null);

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

  // 7. Message Actions: Copy & Star
  const copyMessage = async (msg) => {
    const text = msg.content || msg.fileUrl || '';
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied to clipboard');
    } catch {
      toast.error('Could not copy message');
    }
  };

  const toggleStar = async (msg) => {
    try {
      await api.post(`/messages/${msg._id}/star`);
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== msg._id) return m;
          const starredBy = m.starredBy || [];
          const isStarred = starredBy.includes(currentUserId);
          return {
            ...m,
            starredBy: isStarred
              ? starredBy.filter((id) => id !== currentUserId)
              : [...starredBy, currentUserId]
          };
        })
      );
    } catch {
      toast.error('Failed to update star');
    }
  };

  // 8. Message Reactions Handler
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

  // 9. Voice Note Send Handler
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
        fileName: 'Voice Note',
        replyToId: replyingTo ? replyingTo._id : null
      });

      setReplyingTo(null);

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

  // 10. File Upload Handler (Images & Documents)
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
        fileSize: file.size,
        replyToId: replyingTo ? replyingTo._id : null
      });

      setReplyingTo(null);

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

  // 11. Call Starters
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
        color: 'var(--text-main, #f3f4f6)',
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
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
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
                background: 'var(--bg-input, #222530)',
                border: '1px solid var(--border-color, #3f4657)',
                color: 'var(--text-main, #f3f4f6)',
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
              style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-main, #fff)', fontSize: 20 }}
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
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-deep, #2d3139)' }}
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
                  border: '2px solid var(--theme-sidebar-bg, #1a1c23)'
                }}
                title={isFriendOnline ? 'Online' : 'Offline'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{friend?.fullName || friend?.username}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>@{friend?.username}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                {friend?.publicId && (
                  <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                    ID: {friend.publicId}
                  </span>
                )}
                <span>•</span>
                <span style={{ color: isFriendOnline ? '#10b981' : 'var(--text-muted, #9ca3af)' }}>
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
        ref={chatFeedRef}
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
                background: 'var(--bg-input, rgba(255, 255, 255, 0.05))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                color: 'var(--text-muted, #9ca3af)',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {loadingMore ? 'Loading older messages...' : '↑ Load older messages'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted, #9ca3af)' }}>
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted, #9ca3af)',
              background: 'var(--bg-input, rgba(255,255,255,0.02))',
              borderRadius: 16,
              margin: 'auto'
            }}
          >
            <div style={{ fontSize: 42, marginBottom: 12 }}>👋</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-main, #f3f4f6)', margin: '0 0 6px' }}>
              Say hello to {friend?.fullName || friend?.username}!
            </h3>
            <p style={{ fontSize: 13, margin: 0 }}>This is the beginning of your direct conversation.</p>
          </div>
        ) : (() => {
          const isSameDay = (a, b) => { const da = new Date(a), db = new Date(b); return da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate(); };
          const fmtDateLbl = (iso) => new Date(iso).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
          const dcItems = [];
          messages.forEach((msg, idx) => {
            if (idx===0 || !isSameDay(messages[idx-1].createdAt, msg.createdAt)) {
              dcItems.push({ _type:'date', key:`date-${msg._id}`, label: fmtDateLbl(msg.createdAt) });
            }
            dcItems.push(msg);
          });
          return dcItems.map((item) => {
            if (item._type === 'date') {
              return (
                <div key={item.key} style={{display:'flex',justifyContent:'center',margin:'14px 0 6px'}}>
                  <span style={{background:'var(--bg-input,rgba(255,255,255,0.08))',color:'var(--text-muted)',borderRadius:20,padding:'3px 14px',fontSize:11.5,fontWeight:500,letterSpacing:0.2}}>{item.label}</span>
                </div>
              );
            }
            const msg = item;
            const senderId = (msg.sender?._id || msg.sender?.id || msg.sender)?.toString();
            const isMe = senderId === currentUserId;
            const isEditing = editingMessageId === msg._id;
            const isHovered = hoveredMessageId === msg._id;

                        const senderName = isMe
              ? (currentUser?.fullName || currentUser?.username || 'You')
              : (friend?.fullName || friend?.username || 'Friend');
            const senderAvatar = isMe ? currentUser?.avatar : friend?.avatar;

            return (
              <div
                key={msg._id}
                ref={(el) => {
                  if (el) messageRefs.current[msg._id] = el;
                }}
                className={`message-row ${isMe ? 'message-row--me' : ''} ${isHovered ? 'is-hovered' : ''}`}
                onMouseEnter={() => {
                  if (reactionPickerMessageId !== msg._id) {
                    updatePopoverPlacement(msg._id);
                    setHoveredMessageId(msg._id);
                  }
                }}
                onMouseLeave={() => {
                  if (reactionPickerMessageId !== msg._id) {
                    setHoveredMessageId(null);
                  }
                }}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  position: 'relative',
                  padding: '4px 8px'
                }}
              >
                {/* ── Avatar with Presence Badge (Image 2) ──────────────── */}
                <div
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setTargetProfileId(senderId)}
                  title={`View ${senderName}'s profile`}
                >
                  <PresenceBadge userId={senderId}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: isMe ? '#6366f1' : '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        overflow: 'hidden'
                      }}
                    >
                      {senderAvatar ? (
                        <img
                          src={senderAvatar}
                          alt={senderName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        getUserInitials(senderName)
                      )}
                    </div>
                  </PresenceBadge>
                </div>

                {/* ── Message Content Wrap ──────────────────────────────── */}
                <div
                  className="msg-content-wrap"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    position: 'relative'
                  }}
                >
                  {/* Sender Header Row: Name & Timestamp (Image 2) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 3
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isMe ? 'var(--theme-sender-me, #a78bfa)' : 'var(--theme-sender-color, #60a5fa)',
                        cursor: 'pointer'
                      }}
                      onClick={() => setTargetProfileId(senderId)}
                    >
                      {senderName}
                    </span>
                    <span
                      className="chat-timestamp"
                      title={new Date(msg.createdAt).toLocaleString()}
                      style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}
                    >
                      {formatTime(msg.createdAt)}
                    </span>
                    {msg.isEdited && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #9ca3af)' }}>(edited)</span>
                    )}
                    {(msg.starredBy || []).includes(currentUserId) && (
                      <span title="Starred by you" style={{ fontSize: 12 }}>⭐</span>
                    )}
                    {isMe && !msg.isDeleted && (
                      <span
                        title={msg.isRead ? 'Read' : 'Delivered'}
                        style={{
                          color: msg.isRead ? '#38bdf8' : 'var(--text-muted, #9ca3af)',
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        {msg.isRead ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>

                  {/* Reply Reference Preview Snippet */}
                  {msg.replyTo && (
                    <div
                      style={{
                        padding: '4px 10px',
                        background: 'var(--bg-input, rgba(0, 0, 0, 0.25))',
                        borderLeft: '3px solid var(--theme-primary, #7c3aed)',
                        borderRadius: 6,
                        marginBottom: 4,
                        fontSize: 12,
                        opacity: 0.9,
                        maxWidth: 'min(85%, 680px)'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--theme-primary, #a78bfa)' }}>
                        @{msg.replyTo.sender?.username || 'user'}
                      </div>
                      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {msg.replyTo.content || (msg.replyTo.fileType ? `Attachment: ${msg.replyTo.fileType}` : 'Message')}
                      </div>
                    </div>
                  )}

                  {/* Image Attachment */}
                  {msg.fileUrl && msg.fileType === 'image' && (
                    <div
                      className="msg-image-container"
                      style={{
                        marginTop: 2,
                        marginBottom: msg.content ? 4 : 0,
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <img
                        src={msg.fileUrl}
                        alt="Attachment"
                        style={{ width: '100%', maxWidth: 320, display: 'block', cursor: 'pointer', borderRadius: 12 }}
                        onClick={() => setPreviewImageUrl(msg.fileUrl)}
                      />
                    </div>
                  )}

                  {/* Audio / Voice Note Attachment */}
                  {msg.fileUrl && msg.fileType === 'audio' && (
                    <div style={{ marginTop: 2, marginBottom: msg.content ? 4 : 0 }}>
                      <AudioPlayer src={msg.fileUrl} />
                    </div>
                  )}

                  {/* Document File Attachment */}
                  {msg.fileUrl && msg.fileType !== 'image' && msg.fileType !== 'audio' && (
                    <div
                      className="attachment-item"
                      style={{
                        marginTop: 2,
                        marginBottom: msg.content ? 4 : 0,
                        width: 'fit-content',
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'var(--bg-deep, rgba(0, 0, 0, 0.25))',
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <span>📎</span>
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={msg.fileName || true}
                        style={{ color: '#38bdf8', fontSize: 13, textDecoration: 'none' }}
                      >
                        {msg.fileName || 'Download File'}
                      </a>
                      {msg.fileSize && (
                        <span style={{ fontSize: 11, opacity: 0.7 }}>
                          ({Math.round(msg.fileSize / 1024)} KB)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Text Message Bubble (Image 2) */}
                  {isEditing ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        width: '100%',
                        maxWidth: 420
                      }}
                    >
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{
                          background: 'var(--bg-input, rgba(0,0,0,0.3))',
                          border: '1px solid var(--border-color, rgba(255,255,255,0.2))',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: 'var(--text-main, #fff)',
                          fontSize: 14
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(msg._id)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(null)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            background: 'var(--bg-hover, rgba(255,255,255,0.2))',
                            color: 'var(--text-main, #fff)',
                            border: 'none',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    msg.content && (
                      <div
                        className={isMe ? 'msg-bubble msg-bubble-out' : 'msg-bubble msg-bubble-in'}
                        style={{
                          width: 'fit-content',
                          maxWidth: 'min(85%, 680px)'
                        }}
                      >
                        {msg.isDeleted ? (
                          <span style={{ fontStyle: 'italic', opacity: 0.65 }}>
                            🚫 {msg.content}
                          </span>
                        ) : (
                          msg.content
                        )}
                      </div>
                    )
                  )}

                  {/* ── Unified Hover Popover Menu (Image 1) ─────────────── */}
                  {isHovered && !isEditing && (
                    <div
                      className={`msg-unified-menu ${isMe ? 'msg-unified-menu--me' : 'msg-unified-menu--incoming'} ${
                        popoverPlacement === 'bottom' ? 'msg-unified-menu--bottom' : 'msg-unified-menu--top'
                      }`}
                      role="toolbar"
                      aria-label="Message options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Top Row: Quick Emoji Reactions + Search + Plus (Image 1) */}
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

                        {/* Search Emojis 🔍 */}
                        <button
                          type="button"
                          className="msg-emoji-btn msg-emoji-search-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionPickerMessageId(
                              reactionPickerMessageId === msg._id ? null : msg._id
                            );
                          }}
                          title="Search emojis"
                          aria-label="Search emojis"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </button>

                        {/* Expand / Plus Emojis ➕ */}
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

                      {/* Divider (Image 1) */}
                      <div className="msg-toolbar-divider" />

                      {/* Bottom Row: Actions (Reply, Copy, Star, Edit, Delete, Info) (Image 1) */}
                      <div className="msg-actions-toolbar">
                        {/* 1. Reply */}
                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyingTo(msg);
                            setHoveredMessageId(null);
                          }}
                          title="Reply"
                          aria-label="Reply"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 17 4 12 9 7" />
                            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                          </svg>
                        </button>

                        {/* 2. Copy */}
                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyMessage(msg);
                            setHoveredMessageId(null);
                          }}
                          title="Copy text"
                          aria-label="Copy text"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>

                        {/* 3. Star */}
                        <button
                          type="button"
                          className={`msg-action-btn ${(msg.starredBy || []).includes(currentUserId) ? 'starred' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(msg);
                            setHoveredMessageId(null);
                          }}
                          title={(msg.starredBy || []).includes(currentUserId) ? 'Unstar' : 'Star message'}
                          aria-label="Star message"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={(msg.starredBy || []).includes(currentUserId) ? '#f59e0b' : 'none'} stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>

                        {/* 4. Edit (if author) */}
                        {isMe && !msg.isDeleted && (
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                        )}

                        {/* 5. Delete (if author) */}
                        {isMe && !msg.isDeleted && (
                          <button
                            type="button"
                            className="msg-action-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg._id);
                              setHoveredMessageId(null);
                            }}
                            title="Delete message"
                            aria-label="Delete message"
                            style={{ color: '#ef4444' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}

                        {/* 6. Message Info */}
                        <button
                          type="button"
                          className="msg-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInfoMessageId(infoMessageId === msg._id ? null : msg._id);
                            setHoveredMessageId(null);
                          }}
                          title="Message Info"
                          aria-label="Message Info"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Full Reaction Emoji Picker Popover */}
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
                        width={310}
                        height={370}
                        previewConfig={{ showPreview: false }}
                        skinTonesDisabled={false}
                        autoFocusSearch={true}
                      />
                    </div>
                  )}

                  {/* Message Info Card */}
                  {infoMessageId === msg._id && (
                    <div
                      className="msg-info-card"
                      style={{
                        marginTop: 4,
                        padding: '8px 12px',
                        background: 'var(--bg-panel, rgba(0,0,0,0.4))',
                        borderRadius: 8,
                        fontSize: 12,
                        border: '1px solid var(--border-color, rgba(255,255,255,0.1))'
                      }}
                    >
                      <div><strong style={{ color: 'var(--text-main, #fff)' }}>From:</strong> {senderName}</div>
                      <div><strong style={{ color: 'var(--text-main, #fff)' }}>Sent:</strong> {new Date(msg.createdAt).toLocaleString()}</div>
                      {msg.editedAt && <div><strong style={{ color: 'var(--text-main, #fff)' }}>Edited:</strong> {new Date(msg.editedAt).toLocaleString()}</div>}
                      {msg.fileType && <div><strong style={{ color: 'var(--text-main, #fff)' }}>Type:</strong> {msg.fileType}</div>}
                      <div style={{ wordBreak: 'break-all' }}><strong style={{ color: 'var(--text-main, #fff)' }}>ID:</strong> {msg._id}</div>
                    </div>
                  )}

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
          });
        })()}

        {/* Friend Typing Indicator */}
        {friendTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted, #9ca3af)', fontSize: 13, fontStyle: 'italic', margin: '4px 0' }}>
            <span>{friend?.username} is typing...</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted, #9ca3af)', animation: 'pulse 1s infinite' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted, #9ca3af)', animation: 'pulse 1s infinite 0.2s' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted, #9ca3af)', animation: 'pulse 1s infinite 0.4s' }} />
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
          borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          background: 'var(--theme-sidebar-bg, #1a1c23)',
          zIndex: 10,
          position: 'relative'
        }}
      >
        {/* Reply Preview Banner */}
        {replyingTo && (
          <div
            style={{
              padding: '6px 12px',
              background: 'rgba(124, 58, 237, 0.15)',
              borderRadius: 8,
              border: '1px solid rgba(124, 58, 237, 0.3)',
              fontSize: 12,
              color: '#c4b5fd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Replying to <strong style={{ color: 'var(--text-main, #fff)' }}>@{replyingTo.sender?.username || 'user'}</strong>: &quot;
              {replyingTo.content || replyingTo.fileName || 'Attachment'}&quot;
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              style={{ background: 'transparent', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 16 }}
            >
              &times;
            </button>
          </div>
        )}

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
                background: 'var(--bg-input, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted, #9ca3af)',
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
              placeholder={
                replyingTo
                  ? `Replying to @${replyingTo.sender?.username || 'user'}...`
                  : `Message ${friend?.username || 'friend'}...`
              }
              maxLength={4000}
              style={{
                flex: 1,
                background: 'var(--bg-input, rgba(0, 0, 0, 0.25))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                borderRadius: 24,
                padding: '12px 18px',
                color: 'var(--text-main, #fff)',
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
