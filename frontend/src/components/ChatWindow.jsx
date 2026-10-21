import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { socket, onSocketStatusChange, isSocketConnected, registerActiveRoom, unregisterActiveRoom } from '../services/socket';
import { useAuth } from '../context/useAuth';
import { useCall } from '../context/CallContext';
import { useAppearance } from '../context/AppearanceContext';
import { themeSoundManager } from '../utils/themeSoundManager';
import api from '../services/api';
import NotificationToast from './NotificationToast';
import PresenceBadge from './common/PresenceBadge';
import VoiceRecorder from './VoiceRecorder';
import AudioPlayer from './AudioPlayer';
import UserProfileModal from './profile/UserProfileModal';
import AppearanceStudioModal from './appearance/AppearanceStudioModal';
import WallpaperEffectsLayer from './appearance/WallpaperEffectsLayer';
import { SkeletonMessageList } from './SkeletonLoaders';

export default function ChatWindow({ room, onLeaveRoom, onBack, onToggleMobileSidebar }) {
  const { user } = useAuth();
  const { startCall } = useCall();
  const { getActiveWallpaperForRoom, appearanceState } = useAppearance();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Mobile More Dropdown State
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Mobile composer ⋮ (attachment menu) state
  const [isComposerMoreOpen, setIsComposerMoreOpen] = useState(false);

  // Real-Time Notifications State
  const [notifications, setNotifications] = useState([]);

  // Hover state for reactions
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  // Voice Notes State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Image Lightbox Preview State
  const [previewImageUrl, setPreviewImageUrl] = useState(null);

  // Profile Modal State
  const [targetProfileId, setTargetProfileId] = useState(null);

  // Chat Personality Studio State
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const lastSendTimeRef = useRef(0);
  // Message-feature refs: scroll container + per-message elements
  const chatFeedRef = useRef(null);
  const messageRefs = useRef({});

  // Jump-to-latest: shown when the user has scrolled up the feed
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // Multi-select mode (delete-for-me / star / copy in bulk)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Message info popover
  const [infoMessageId, setInfoMessageId] = useState(null);

  // Pagination guard (prevents overlapping "load older" requests)
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState(null);

  // Offline resilience: pending messages queued while disconnected
  const [pendingQueue, setPendingQueue] = useState([]);
  const [isOffline, setIsOffline] = useState(false);

  const roomId = room._id || room.id;
  const currentUserId = user?._id || user?.id;

  // Memory-leak guards: abort in-flight requests, clear pending timers,
  // and never setState after unmount
  const abortControllerRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Add Toast Notification
  const addNotification = (title, message, type = 'info') => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    setNotifications((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      // setState is safe here: React 18+ silently drops updates after unmount;
      // the timer is bounded (5s) and always fires.
      setNotifications((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const handleDismissNotification = (id) => {
    setNotifications((prev) => prev.filter((t) => t.id !== id));
  };

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchOlderMessages = async () => {
    if (loadingOlder || !hasMore) return;
    const nextPage = page + 1;
    setLoadingOlder(true);
    try {
      const response = await api.get(`/messages/${roomId}?page=${nextPage}&limit=50`);
      if (!isMountedRef.current) return; // unmounted mid-flight → drop result
      // Backend returns { messages: [...], page, limit, total, hasMore } — unwrap
      const payload = response.data;
      const newMsgs = Array.isArray(payload) ? payload : payload?.messages || [];
      if (newMsgs.length < 50) {
        setHasMore(false);
      }
      setMessages((prev) => [...newMsgs, ...prev]);
      setPage(nextPage);
    } catch (err) {
      console.error('[Messages Error] Failed to fetch older messages:', err);
    } finally {
      if (isMountedRef.current) setLoadingOlder(false);
    }
  };

  // ── Message feature helpers ─────────────────────────────────────────

  const isNearBottom = () => {
    const el = chatFeedRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 300;
  };

  const scrollToMessage = (messageId) => {
    const el = messageRefs.current[messageId];
    if (!el) {
      // Message not loaded yet — fetch page 1 and try again after render
      fetchOlderMessages();
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('msg-flash-highlight');
    // Force reflow so the animation restarts on repeat clicks
    void el.offsetWidth;
    el.classList.add('msg-flash-highlight');
    setTimeout(() => el.classList.remove('msg-flash-highlight'), 1800);
  };

  const copyMessage = async (msg) => {
    const text = msg.content || msg.fileUrl || '';
    try {
      await navigator.clipboard.writeText(text);
      addNotification('Copied', 'Message copied to clipboard.', 'success');
    } catch (err) {
      addNotification('Copy failed', 'Could not copy message.', 'error');
    }
  };

  const toggleStar = async (msg) => {
    try {
      await api.post(`/messages/${msg._id}/star`);
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== msg._id) return m;
          const starredBy = m.starredBy || [];
          return {
            ...m,
            starredBy: starredBy.includes(currentUserId)
              ? starredBy.filter((id) => id !== currentUserId)
              : [...starredBy, currentUserId],
          };
        })
      );
      addNotification('Starred', 'Message bookmarked.', 'success');
    } catch (err) {
      addNotification('Star failed', 'Could not update star.', 'error');
    }
  };

  const deleteForMe = async (msgId) => {
    try {
      await api.post(`/messages/${msgId}/delete-for-me`);
      setMessages((prev) => prev.filter((m) => m._id !== msgId));
    } catch (err) {
      addNotification('Delete failed', 'Could not delete message.', 'error');
    }
  };

  const handleDeleteRoom = async () => {
    const confirmed = window.confirm('Delete this room? This will permanently remove all messages and call history. Only the owner can do this.');
    if (!confirmed) return;
    try {
      await api.delete(`/rooms/${roomId}`);
      addNotification('Room Deleted', 'Room has been deleted.', 'success');
      onBack?.(); // navigate back to chat list
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete room';
      addNotification('Delete failed', msg, 'error');
    }
  };

  const toggleSelect = (msgId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    selectedIds.forEach((msgId) => deleteForMe(msgId));
    addNotification('Deleted', `${selectedIds.size} message(s) hidden.`, 'success');
    exitSelectionMode();
  };

  // ── Offline queue ──────────────────────────────────────────────────

  const queueMessage = (payload) => {
    const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    setPendingQueue((prev) => [...prev, { tempId, ...payload }]);
    return tempId;
  };

  // Ref mirror of pendingQueue so flushQueue stays referentially stable
  const pendingQueueRef = useRef([]);
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  const flushQueue = useCallback(() => {
    const queued = pendingQueueRef.current;
    if (queued.length === 0) return;
    queued.forEach((p) => {
      socket.emit('send_message', {
        roomId: p.roomId,
        content: p.content || '',
        fileUrl: p.fileUrl || null,
        fileType: p.fileType || null,
        fileName: p.fileName || null,
        replyToId: p.replyToId || null,
        tempId: p.tempId,
      });
    });
    pendingQueueRef.current = [];
    setPendingQueue([]);
    addNotification('Back online', `${queued.length} queued message(s) sent.`, 'success');
  }, []);

  // Track connection status for the offline banner + flush on online
  useEffect(() => {
    const unsubSocket = onSocketStatusChange((connected) => {
      setIsOffline(!connected);
      if (connected) flushQueue();
    });
    setIsOffline(!isSocketConnected());

    // Also listen to browser online/offline events
    const handleOnline = () => flushQueue();
    window.addEventListener('online', handleOnline);

    return () => {
      unsubSocket();
      window.removeEventListener('online', handleOnline);
    };
  }, [flushQueue]);

  // Track scroll position to reveal/hide the "jump to latest" button
  useEffect(() => {
    const el = chatFeedRef.current;
    if (!el) return undefined;
    const onScroll = () => setShowJumpToLatest(!isNearBottom());
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [roomId, messages.length]);

  // Load first page of messages (hoisted for retry from the error state)
  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    // Abort any in-flight request from a previous room/mount
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const response = await api.get(`/messages/${roomId}?page=1&limit=50`, { signal: controller.signal });
      // Backend returns { messages: [...], page, limit, total, hasMore } — unwrap
      const payload = response.data;
      const newMsgs = Array.isArray(payload) ? payload : payload?.messages || [];
      if (newMsgs.length < 50) setHasMore(false);
      setMessages(newMsgs);
      scrollTimerRef.current = setTimeout(scrollToBottom, 100);
    } catch (err) {
      // Aborted (room switched / unmounted) — not an error, just skip
      if (err?.code === 'ERR_CANCELED' || err?.message === 'canceled') return;
      console.error('[Messages Error] Failed to fetch messages:', err);
      setMessagesError('Could not load messages. Check your connection and try again.');
    } finally {
      if (abortControllerRef.current === controller) setMessagesLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    // Reset page and hasMore on room change
    setPage(1);
    setHasMore(true);

    loadMessages();

    // Socket Room Join
    registerActiveRoom(roomId);
    socket.emit('join_room', { roomId, user });

    // Socket Event Listeners
    const handleReceiveMessage = (newMsg) => {
      if (newMsg.room === roomId) {
        setMessages((prev) => {
          // Duplicate prevention: ignore messages already in the feed
          // (covers broadcast echoes of ack-confirmed sends).
          if (prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
        // Reconcile a queued (offline) message with its server copy
        if (newMsg.tempId) {
          setPendingQueue((prev) => prev.filter((p) => p.tempId !== newMsg.tempId));
        }
        // Only auto-scroll when the user is already near the bottom
        if (isNearBottom()) scrollToBottom();

        const senderId = newMsg.sender?._id || newMsg.sender?.id;
        const currentUserId = user?._id || user?.id;
        if (senderId !== currentUserId) {
          addNotification('New Message', `${newMsg.sender?.username || 'Someone'}: "${newMsg.content || 'Sent a file'}"`, 'message');
        }
      }
    };

    const handleMessageEdited = (editedMsg) => {
      if (editedMsg.room === roomId) {
        setMessages((prev) =>
          prev.map((msg) => (msg._id === editedMsg._id ? editedMsg : msg))
        );
      }
    };

    const handleMessageDeleted = (deletedMsg) => {
      if (deletedMsg.room === roomId) {
        setMessages((prev) =>
          prev.map((msg) => (msg._id === deletedMsg._id ? deletedMsg : msg))
        );
      }
    };

    const handleMessageReactionUpdated = (updatedMsg) => {
      if (updatedMsg.room === roomId) {
        setMessages((prev) =>
          prev.map((msg) => (msg._id === updatedMsg._id ? updatedMsg : msg))
        );
      }
    };

    const handleUserJoined = ({ user: joinedUser }) => {
      if (import.meta.env.DEV) {
        console.group('%c[Socket] 🟢 User Joined', 'color:#10b981;font-weight:bold');
        console.log('  username:', joinedUser?.username);
        console.log('  room:', room.name);
        console.groupEnd();
      }

      if (joinedUser?.username && joinedUser.username !== user?.username) {
        addNotification('User Joined', `${joinedUser.username} joined #${room.name}`, 'join');
      }
    };

    const handleUserLeft = ({ user: leftUser }) => {
      if (import.meta.env.DEV) {
        console.group('%c[Socket] 🔴 User Left', 'color:#ef4444;font-weight:bold');
        console.log('  username:', leftUser?.username);
        console.log('  room:', room.name);
        console.groupEnd();
      }

      if (leftUser?.username && leftUser.username !== user?.username) {
        addNotification('User Left', `${leftUser.username} left the room`, 'leave');
      }
    };

    const handleUserTyping = ({ username }) => {
      if (username !== user?.username) {
        setTypingUsers((prev) => new Set(prev).add(username));
      }
    };

    const handleUserStopTyping = ({ username }) => {
      setTypingUsers((prev) => {
        const updated = new Set(prev);
        updated.delete(username);
        return updated;
      });
    };

    const handleStatusUpdated = ({ userId, customStatus }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if ((msg.sender?._id || msg.sender?.id) === userId) {
            return {
              ...msg,
              sender: { ...msg.sender, customStatus },
            };
          }
          return msg;
        })
      );
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_reaction_updated', handleMessageReactionUpdated);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('status_updated', handleStatusUpdated);
    socket.on('room_access_denied', ({ message }) => {
      // User tried to join a private room they're not a member of
      addNotification('Access Denied', message || 'This is a private room. You need an invite to join.', 'error');
      // Navigate back to chat list
      onBack?.();
    });

    return () => {
      abortControllerRef.current?.abort();
      clearTimeout(scrollTimerRef.current);
      unregisterActiveRoom(roomId);
      socket.emit('leave_room', { roomId, user });
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_edited', handleMessageEdited);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_reaction_updated', handleMessageReactionUpdated);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('status_updated', handleStatusUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle typing indicator trigger
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (appearanceState?.soundControls?.enableSounds && appearanceState?.soundControls?.enableTypingSound) {
      themeSoundManager.playTypingSound();
    }

    socket.emit('typing_start', { roomId, username: user?.username });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', { roomId, username: user?.username });
    }, 1500);
  };

  // Submit text or file message
  const handleSubmitMessage = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!inputText.trim()) {
      textareaRef.current?.focus({ preventScroll: true });
      return;
    }

    if (appearanceState?.soundControls?.enableSounds && appearanceState?.soundControls?.enableSentSound) {
      themeSoundManager.playSentSound();
    }

    if (editingMessage) {
      socket.emit('edit_message', {
        messageId: editingMessage._id,
        roomId,
        newContent: inputText.trim(),
      });
      setEditingMessage(null);
    } else if (!isSocketConnected()) {
      // Offline — queue the message and deliver it on reconnect
      queueMessage({ roomId, content: inputText.trim(), replyToId: replyingTo ? replyingTo._id : null });
      addNotification('Offline', 'Connection lost — your message is queued.', 'warning');
      setReplyingTo(null);
    } else {
      socket.emit('send_message', {
        roomId,
        content: inputText.trim(),
        sender: user,
        replyToId: replyingTo ? replyingTo._id : null,
      });
      setReplyingTo(null);
    }

    setInputText('');
    setShowEmojiPicker(false);
    socket.emit('typing_stop', { roomId, username: user?.username });

    // Retain focus so mobile virtual keyboard stays open
    textareaRef.current?.focus({ preventScroll: true });
    setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 10);
  };

  const sendAndKeepFocus = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const now = Date.now();
    if (now - lastSendTimeRef.current < 250) return;
    lastSendTimeRef.current = now;

    handleSubmitMessage();
    textareaRef.current?.focus({ preventScroll: true });
    setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 10);
  };

  const handleToggleReaction = (messageId, emoji) => {
    socket.emit('toggle_reaction', { messageId, roomId, emoji });
  };

  // File Upload Handler (Multer + Cloudinary)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadingFile(true);

    try {
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { url, fileType, fileName } = response.data;

      if (!isSocketConnected()) {
        // Offline — queue the message with file info
        queueMessage({
          roomId,
          content: inputText.trim(),
          fileUrl: url,
          fileType,
          fileName,
          replyToId: replyingTo ? replyingTo._id : null,
        });
        addNotification('Offline', 'Connection lost — your file message is queued.', 'warning');
      } else {
        socket.emit('send_message', {
          roomId,
          content: inputText.trim(),
          fileUrl: url,
          fileType,
          fileName,
          sender: user,
          replyToId: replyingTo ? replyingTo._id : null,
        });
      }

      setUploadingFile(false);
      setInputText('');
      setReplyingTo(null);
    } catch (err) {
      console.error('[Upload Error] Failed to upload file:', err);
      alert('File upload failed. Please try again.');
      setUploadingFile(false);
    }
  };

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

      if (!isSocketConnected()) {
        // Offline — queue the voice note
        queueMessage({
          roomId,
          content: '',
          fileUrl: url,
          fileType: 'audio',
          fileName: 'Voice Note',
          replyToId: replyingTo ? replyingTo._id : null,
        });
        addNotification('Offline', 'Connection lost — your voice note is queued.', 'warning');
      } else {
        socket.emit('send_message', {
          roomId,
          content: '',
          fileUrl: url,
          fileType: 'audio',
          fileName: 'Voice Note',
          sender: user,
          replyToId: replyingTo ? replyingTo._id : null,
        });
      }

      setUploadingFile(false);
      setReplyingTo(null);
    } catch (err) {
      console.error('[Upload Error] Failed to upload voice note:', err);
      alert('Voice note upload failed.');
      setUploadingFile(false);
    }
  };

  const handleAddEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  const handleStartEdit = (msg) => {
    setEditingMessage(msg);
    setInputText(msg.content);
    setReplyingTo(null);
  };

  const handleDeleteMessage = (msgId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      socket.emit('delete_message', { messageId: msgId, roomId });
    }
  };

  const handleStartVoiceCall = () => {
    startCall(roomId, room.name, 'voice');
  };

  const handleStartVideoCall = () => {
    startCall(roomId, room.name, 'video');
  };

  const formatTime = (isoString) => {
    if (!isoString) return '16:01';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getUserInitials = (name) => {
    if (!name) return 'M';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // 🔒 SECURITY: room code is only shown to members/creator — never to
  // someone who just opened the room without joining it.
  const isRoomMember = (room, u) => {
    if (!room || !u) return false;
    // List API sends isMember flag; join/create responses send members array
    if (room.isMember === true) return true;
    const uid = String(u._id || u.id || '');
    return (room.members || []).some((m) => String(m._id || m.id || m) === uid);
  };
  const isRoomCreator = (room, u) => {
    if (!room || !u) return false;
    const uid = String(u._id || u.id || '');
    const owner = room.owner;
    if (!owner) return false;
    return String(owner._id || owner.id || owner) === uid;
  };

  const typingArray = Array.from(typingUsers);

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--theme-chat-bg)', minWidth: 0, fontFamily: 'var(--theme-font)', position: 'relative', overflow: 'hidden' }}>
      {/* Layer 0: Wallpaper Background Layer (position: absolute; inset: 0; z-index: 0;) */}
      {getActiveWallpaperForRoom(roomId) && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url(${getActiveWallpaperForRoom(roomId)})`,
            backgroundSize: appearanceState?.controls?.fitMode === 'contain' ? 'contain' : appearanceState?.controls?.fitMode === 'fill' ? '100% 100%' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: appearanceState?.controls?.opacity ?? 0.85,
            filter: `blur(${appearanceState?.controls?.blur || 0}px) brightness(${appearanceState?.controls?.brightness || 100}%) contrast(${appearanceState?.controls?.contrast || 100}%) saturate(${appearanceState?.controls?.saturation || 100}%)`,
            transform: `scale(${(appearanceState?.controls?.scale || 100) / 100})`,
            transformOrigin: 'center center',
            transition: 'all 0.15s ease',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Layer 1: GPU Animated Visual Effects Layer (position: absolute; inset: 0; z-index: 1;) */}
      <WallpaperEffectsLayer />

      {/* Layer 2: Overlay Layer (position: absolute; inset: 0; z-index: 2;) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          backgroundColor: appearanceState?.controls?.overlayColor || '#000000',
          opacity: appearanceState?.controls?.overlayOpacity ?? 0.2,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Notifications Toast */}
      <NotificationToast notifications={notifications} onDismiss={handleDismissNotification} />

      {/* Layer 4: Top Header Bar (Dedicated Multi-Header Architecture) */}
      <header className="chat-header" id="chat-header" style={{ position: 'relative', zIndex: 4, flexShrink: 0 }}>
          <div className="header-left">
              <button className="btn-icon back-to-list-btn" onClick={onBack} title="Back to Chat List" aria-label="Back to Chat List">
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              </button>

              <div className="avatar-container">
                  <div className="avatar" style={{ background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="avatar-text" style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{getUserInitials(room.name)}</span>
                  </div>
                  <span className="status-indicator status-online" id="header-status-dot"></span>
              </div>
              <div className="contact-details">
                  <div className="contact-name-row">
                      <h2 className="contact-name" id="header-contact-name" title={room.name || 'Chat'}>{room.name || 'Chat'}</h2>
                      {room.isPrivate ? (
                        <span className="header-status-badge badge-private" title="Private Space (Code Required)">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          <span>Private</span>
                        </span>
                      ) : (
                        <span className="header-status-badge badge-published" title="Published Public Channel">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span>Public</span>
                        </span>
                      )}
                  </div>
                  <p className="contact-status-text" id="header-status-text">
                    {room.code && (isRoomMember(room, user) || isRoomCreator(room, user)) 
                      ? `Code: ${room.code}` 
                      : (room.description || (room.isPrivate ? 'Private Space' : 'Active Channel'))}
                  </p>
              </div>
          </div>

          <div className="header-right-actions">
              <button className="btn-icon header-action-studio" onClick={() => setIsStudioOpen(true)} title="Chat Personality Studio" aria-label="Studio">
                  <span>✨</span>
              </button>
              <button className="btn-icon header-action-voice" onClick={handleStartVoiceCall} title="Start Audio Call" aria-label="Audio Call">
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              <button className="btn-icon header-action-video" onClick={handleStartVideoCall} title="Start Video Call" aria-label="Video Call">
                  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </button>
              <button className="btn-icon header-action-more" onClick={() => setIsMobileMoreOpen(!isMobileMoreOpen)} title="More options" aria-label="More options">
                  {/* Search icon (desktop) */}
                  <svg className="icon icon-more-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {/* Three-dot icon (mobile) */}
                  <svg className="icon icon-more-dots" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              <button
                className="btn-icon header-action-select"
                onClick={() => setSelectionMode((prev) => !prev)}
                title={selectionMode ? 'Exit multi-select mode' : 'Select messages'}
                aria-label="Toggle multi-select"
                style={selectionMode ? { color: 'var(--color-primary)', background: 'var(--primary-light)' } : undefined}
              >
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </button>
              <div className="action-divider header-action-divider"></div>
              {room.owner && (user?._id === room.owner._id || user?.id === room.owner._id || user?._id === room.owner || user?.id === room.owner) && (
                <button className="btn-icon header-action-delete" onClick={handleDeleteRoom} title="Delete Room" aria-label="Delete Room">
                    <span style={{ color: '#ef4444' }}>🗑️</span>
                </button>
              )}
              <button className="btn-icon header-action-leave" onClick={() => onLeaveRoom(roomId)} title="Leave Room" aria-label="Leave Room">
                  <span style={{ color: '#ef4444' }}>🚪</span>
              </button>
          </div>

          {/* Mobile ⋮ More Dropdown Menu */}
          {isMobileMoreOpen && (
            <div className="mobile-more-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 10, top: 50, background: 'var(--theme-sidebar-bg, #1c1f28)', border: '1px solid #2d3241', borderRadius: 10, padding: 6, zIndex: 100, minWidth: 170, boxShadow: 'var(--shadow-xl)' }}>
              <button className="mobile-more-dropdown-item" onClick={() => { setIsStudioOpen(true); setIsMobileMoreOpen(false); }} style={{ width: '100%', minHeight: 40, padding: '8px 12px', background: 'transparent', border: 'none', color: '#d1d5db', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>✨</span> Appearance Studio
              </button>
              <button className="mobile-more-dropdown-item mobile-menu-video-call" onClick={() => { handleStartVideoCall(); setIsMobileMoreOpen(false); }} style={{ width: '100%', minHeight: 40, padding: '8px 12px', background: 'transparent', border: 'none', color: '#d1d5db', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>📹</span> Start Video Call
              </button>
              <button className="mobile-more-dropdown-item" onClick={() => { setSelectionMode(true); setIsMobileMoreOpen(false); }} style={{ width: '100%', minHeight: 40, padding: '8px 12px', background: 'transparent', border: 'none', color: '#d1d5db', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>☑️</span> Select Messages
              </button>
              {room.owner && (user?._id === room.owner._id || user?.id === room.owner._id || user?._id === room.owner || user?.id === room.owner) && (
                <button className="mobile-more-dropdown-item" onClick={() => { handleDeleteRoom(); setIsMobileMoreOpen(false); }} style={{ width: '100%', minHeight: 40, padding: '8px 12px', background: 'transparent', border: 'none', color: '#ef4444', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span>🗑️</span> Delete Room
                </button>
              )}
              <button className="mobile-more-dropdown-item" onClick={() => { onLeaveRoom(roomId); setIsMobileMoreOpen(false); }} style={{ width: '100%', minHeight: 40, padding: '8px 12px', background: 'transparent', border: 'none', color: '#ef4444', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span>🚪</span> Leave Room
              </button>
            </div>
          )}
      </header>

      {/* ─── Messages Feed Area ──────────────────────────────────────── */}
      <div
        ref={chatFeedRef}
        className="messages-history-container scrollzone"
        id="messages-container"
        data-lenis-prevent
        role="log"
        aria-live="polite"
        aria-label="Message Stream"
        style={{ position: 'relative', zIndex: 3 }}
      >
        {/* Security notice banner */}
        {/* <div className="system-message security-notice">
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>Messages and calls in this conversation are secured in transit (TLS).</span>
        </div> */}

        {/* Load More Button */}
        {hasMore && messages.length > 0 && (
          <div className="day-divider">
            <button
              onClick={fetchOlderMessages}
              className="day-divider-label"
              style={{ cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-badge)' }}
            >
              Load Older Messages
            </button>
          </div>
        )}

        {messagesLoading ? (
          <SkeletonMessageList count={6} />
        ) : messagesError ? (
          <div className="messages-error" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }} aria-hidden="true">⚠️</span>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>{messagesError}</p>
            <button className="btn btn-primary" onClick={loadMessages} type="button">Retry</button>
          </div>
        ) : messages.length === 0 ? (
          <div className="room-welcome-hero">
            <div className="room-welcome-avatar" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <span>{getUserInitials(room.name || 'Room')}</span>
            </div>
            <h2 className="room-welcome-title">Welcome to #{room.name || 'Chat'}</h2>
            <p className="room-welcome-sub">
              {room.topic || `This is the start of the #${room.name || 'conversation'} channel. Messages are secured in transit.`}
            </p>
            <div className="room-starter-chips">
              <button
                type="button"
                className="starter-chip"
                onClick={() => setInputText('👋 Hello everyone!')}
              >
                👋 Say Hello
              </button>
              <button
                type="button"
                className="starter-chip"
                onClick={() => setInputText('🚀 Checking in with the team!')}
              >
                🚀 Check in
              </button>
              <button
                type="button"
                className="starter-chip"
                onClick={() => setInputText('✨ Excited to be here!')}
              >
                ✨ Say Hi
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const currentUserId = user?._id || user?.id;
            const msgSenderId = msg.sender?._id || msg.sender?.id;
            const isMe = Boolean(
              (currentUserId && msgSenderId && String(currentUserId) === String(msgSenderId)) ||
              (user?.username && msg.sender?.username && user.username === msg.sender.username)
            );
            const senderName = msg.sender?.username || (isMe ? 'Me' : 'Unknown');
            const initials = getUserInitials(senderName);

            return (
              <div
                key={msg._id}
                ref={(el) => { if (el) messageRefs.current[msg._id] = el; }}
                className={`message-row ${isMe ? 'message-row--me' : ''} ${selectedIds.has(msg._id) ? 'message-row--selected' : ''} ${hoveredMessageId === msg._id ? 'is-hovered' : ''}`}
                onClick={() => (selectionMode ? toggleSelect(msg._id) : setHoveredMessageId(hoveredMessageId === msg._id ? null : msg._id))}
                onMouseLeave={() => setHoveredMessageId(null)}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative', animation: 'message-appear 150ms ease-out' }}
              >
                {/* Selection checkbox (multi-select mode) */}
                {selectionMode && (
                  <div style={{ paddingTop: 8, flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(msg._id)}
                      onChange={() => toggleSelect(msg._id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select message from ${senderName}`}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                    />
                  </div>
                )}

                {/* Avatar */}
                <div style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setTargetProfileId(msg.sender?._id || msg.sender?.id)}>
                  <PresenceBadge userId={msg.sender?._id || msg.sender?.id}>
                    <div style={{ width: 34, height: 34, borderRadius: 6, background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, overflow: 'hidden' }}>
                      {msg.sender?.avatar ? (
                        <img src={msg.sender.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : initials}
                    </div>
                  </PresenceBadge>
                </div>

                {/* Message Content */}
                <div className="msg-content-wrap" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {/* Sender row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-sender-color, #60a5fa)' }}>{senderName}</span>
                    {msg.sender?.customStatus?.emoji && (
                      <span style={{ fontSize: 11 }} title={msg.sender?.customStatus?.text}>{msg.sender.customStatus.emoji}</span>
                    )}
                    <span className="chat-timestamp" title={new Date(msg.createdAt).toLocaleString()}>{formatTime(msg.createdAt)}</span>
                    {msg.isEdited && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(edited)</span>
                    )}
                    {(msg.starredBy || []).includes(currentUserId) && (
                      <span title="Starred by you">⭐</span>
                    )}
                  </div>

                  {/* Image Attachment */}
                  {msg.fileUrl && msg.fileType === 'image' && (
                    <div className="msg-image-container" style={{ marginTop: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <img src={msg.fileUrl} alt="Attachment" style={{ width: '100%', maxWidth: 320, display: 'block', cursor: 'pointer' }} onClick={() => setPreviewImageUrl(msg.fileUrl)} />
                    </div>
                  )}

                  {/* Audio Attachment */}
                  {msg.fileUrl && msg.fileType === 'audio' && (
                    <AudioPlayer src={msg.fileUrl} />
                  )}

                  {/* Generic File Attachment */}
                  {msg.fileUrl && msg.fileType !== 'image' && msg.fileType !== 'audio' && (
                    <div className="attachment-item" style={{ marginTop: 4, width: 'fit-content', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
                      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                      <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontSize: 13, textDecoration: 'none' }}>
                        {msg.fileName || 'Download File'}
                      </a>
                    </div>
                  )}

                  {/* Message Text */}
                  {msg.content && msg.fileType !== 'call' && (
                    <div
                      className={isMe ? 'msg-bubble msg-bubble-out' : 'msg-bubble msg-bubble-in'}
                      style={{ width: 'fit-content', maxWidth: 'min(85%, 680px)' }}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* Call History Message */}
                  {msg.fileType === 'call' && (
                    <div
                      className={`call-history-card ${isMe ? 'call-history-card--me' : 'call-history-card--them'}`}
                      style={{
                        justifyContent: 'flex-start',
                        maxWidth: 'fit-content',
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        margin: isMe ? '4px 0 4px auto' : '4px auto 4px 0',
                        background: isMe
                          ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.22) 0%, rgba(99, 102, 241, 0.16) 100%)'
                          : 'rgba(255, 255, 255, 0.05)',
                        border: isMe
                          ? '1px solid rgba(139, 92, 246, 0.35)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 14,
                        padding: '10px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 12,
                        marginTop: 4,
                        boxShadow: isMe ? '0 4px 14px rgba(79, 70, 229, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      {(() => {
                        try {
                          const callData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
                          const isVideo = callData.type === 'video';
                          const isMissed = callData.status === 'missed';
                          const isDeclined = callData.status === 'declined';
                          const isBusy = callData.status === 'busy';
                          const isGroup = callData.isGroup || (callData.participantsCount > 2);

                          let title = isVideo ? (isGroup ? 'Group Video Call' : 'Video Call') : (isGroup ? 'Group Voice Call' : 'Voice Call');
                          if (isMissed) title = isGroup ? 'Missed Group Call' : 'Missed Call';
                          else if (isDeclined) title = 'Declined Call';
                          else if (isBusy) title = 'Busy';

                          const icon = isMissed ? '📵' : isDeclined || isBusy ? '🚫' : isVideo ? '📹' : '📞';
                          const iconColor = isMissed || isDeclined || isBusy ? '#ef4444' : '#22c55e';
                          const durationStr = callData.duration ? `${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s` : '';

                          return (
                            <>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: isMissed || isDeclined || isBusy ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 18,
                                  color: iconColor,
                                  flexShrink: 0,
                                }}
                              >
                                {icon}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                  {title}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {isMissed
                                    ? 'No answer'
                                    : isDeclined
                                    ? 'Call was declined'
                                    : isBusy
                                    ? 'Recipient was busy'
                                    : durationStr
                                    ? `Ended · ${durationStr}`
                                    : 'Call ended'}
                                  {isGroup && callData.participantsCount && ` · ${callData.participantsCount} participants`}
                                </div>
                              </div>

                              {/* Quick Call Back button */}
                              <button
                                type="button"
                                onClick={() => startCall(roomId, room.name || 'Meeting', isVideo ? 'video' : 'voice')}
                                title={`Call back (${isVideo ? 'video' : 'voice'})`}
                                style={{
                                  marginLeft: 8,
                                  background: 'rgba(124, 58, 237, 0.15)',
                                  border: '1px solid rgba(124, 58, 237, 0.35)',
                                  color: '#c4b5fd',
                                  borderRadius: 8,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{isVideo ? '📹' : '📞'}</span>
                                <span>Call back</span>
                              </button>
                            </>
                          );
                        } catch (e) {
                          return <span>Call session</span>;
                        }
                      })()}
                    </div>
                  )}

                  {/* Floating Action toolbar (Reply / Copy / Star / Edit / Delete / Info) */}
                  <div className="msg-floating-actions" role="toolbar" aria-label="Message actions">
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => setReplyingTo(msg)}
                      title="Reply"
                      aria-label="Reply"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    </button>
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => copyMessage(msg)}
                      title="Copy text"
                      aria-label="Copy text"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button
                      type="button"
                      className={`msg-action-btn ${(msg.starredBy || []).includes(currentUserId) ? 'starred' : ''}`}
                      onClick={() => toggleStar(msg)}
                      title={(msg.starredBy || []).includes(currentUserId) ? 'Unstar' : 'Star message'}
                      aria-label="Star message"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={(msg.starredBy || []).includes(currentUserId) ? '#f59e0b' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>
                    {user?.username === senderName && (
                      <button
                        type="button"
                        className="msg-action-btn"
                        onClick={() => handleStartEdit(msg)}
                        title="Edit message"
                        aria-label="Edit message"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      </button>
                    )}
                    {user?.username === senderName && (
                      <button
                        type="button"
                        className="msg-action-btn danger"
                        onClick={() => handleDeleteMessage(msg._id)}
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => setInfoMessageId(infoMessageId === msg._id ? null : msg._id)}
                      title="Message Info"
                      aria-label="Message Info"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </button>
                  </div>

                  {/* Message Info popover */}
                  {infoMessageId === msg._id && (
                    <div
                      className="msg-info-popover"
                      style={{
                        marginTop: 6,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-popover)',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        maxWidth: 340,
                      }}
                    >
                      <div><strong style={{ color: 'var(--text-main)' }}>From:</strong> {senderName}</div>
                      <div><strong style={{ color: 'var(--text-main)' }}>Sent:</strong> {new Date(msg.createdAt).toLocaleString()}</div>
                      {msg.editedAt && <div><strong style={{ color: 'var(--text-main)' }}>Edited:</strong> {new Date(msg.editedAt).toLocaleString()}</div>}
                      {msg.fileType && <div><strong style={{ color: 'var(--text-main)' }}>Type:</strong> {msg.fileType === 'call' ? 'Call' : msg.fileType}</div>}
                      <div style={{ wordBreak: 'break-all' }}><strong style={{ color: 'var(--text-main)' }}>ID:</strong> {msg._id}</div>
                    </div>
                  )}

                  {/* Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {msg.reactions.map((reaction, i) => {
                        const hasReacted = reaction.users.includes(user?._id || user?.id);
                        return (
                          <button
                            key={i}
                            onClick={() => handleToggleReaction(msg._id, reaction.emoji)}
                            style={{
                              background: hasReacted ? 'rgba(88,101,242,0.2)' : 'var(--bg-input)',
                              border: `1px solid ${hasReacted ? '#5865F2' : 'var(--border-color)'}`,
                              borderRadius: 8,
                              padding: '2px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              color: hasReacted ? '#a5b4fc' : 'var(--text-muted)',
                              fontSize: 12
                            }}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Reaction Picker floating toolbar */}
                  {hoveredMessageId === msg._id && (
                    <div style={{ position: 'absolute', top: -12, right: 12, background: 'var(--bg-popover)', border: '1px solid var(--border-color)', borderRadius: 8, display: 'flex', gap: 2, padding: '4px 6px', boxShadow: 'var(--shadow-lg)', zIndex: 10 }}>
                      {['👍', '❤️', '😂', '🔥', '😮', '😢', '👏'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg._id, emoji); setHoveredMessageId(null); }}
                          className="emoji-btn"
                          style={{ fontSize: 15 }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Offline banner — shows queued messages while disconnected */}
        {isOffline && (
          <div className="typing-indicator-inline offline-banner" role="status">
            <span>
              📡 {pendingQueue.length > 0
                ? `Offline — ${pendingQueue.length} message${pendingQueue.length > 1 ? 's' : ''} queued, will send when back online`
                : 'Offline — reconnecting…'}
            </span>
          </div>
        )}

        {/* Uploading indicator */}
        {uploadingFile && (
          <div className="typing-indicator-inline">
            <div className="dots-pulse">
              <span className="dot"></span><span className="dot"></span><span className="dot"></span>
            </div>
            <span>Uploading attachment...</span>
          </div>
        )}

        {/* Typing Banner */}
        {typingArray.length > 0 && (
          <div className="typing-indicator-inline">
            <div className="dots-pulse">
              <span className="dot"></span><span className="dot"></span><span className="dot"></span>
            </div>
            <span>{typingArray.join(', ')} is typing...</span>
          </div>
        )}

        {/* Selection action bar (multi-select mode) */}
        {selectionMode && (
          <div
            className="selection-action-bar"
            style={{
              position: 'sticky',
              bottom: 12,
              alignSelf: 'center',
              zIndex: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
              fontSize: 12,
              color: 'var(--text-main)',
            }}
          >
            <span><strong>{selectedIds.size}</strong> selected</span>
            <button
              onClick={() => { selectedIds.forEach((id) => { const m = messages.find((x) => x._id === id); if (m) toggleStar(m); }); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}
            >
              ★ Star
            </button>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}
            >
              🗑️ Hide for me
            </button>
            <button
              onClick={exitSelectionMode}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '4px 10px', borderRadius: 999 }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Jump to latest floating button */}
        {showJumpToLatest && !selectionMode && (
          <button
            className="jump-to-latest-btn"
            onClick={() => { scrollToBottom(); setShowJumpToLatest(false); }}
            aria-label="Jump to latest messages"
            title="Jump to latest"
            style={{
              position: 'sticky',
              bottom: 16,
              alignSelf: 'flex-end',
              marginRight: 20,
              zIndex: 8,
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-elevated)',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            ↓
          </button>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt,.zip" />

      {/* ─── Composer ──────────────────────────────────────────────── */}
      <footer className="chat-composer-container" style={{ position: 'relative', zIndex: 4 }}>

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="emoji-picker-popover" id="emoji-picker" role="dialog" aria-label="Emoji Picker">
            <div className="emoji-picker-header">
              <input type="text" placeholder="Search emojis..." aria-label="Search emojis" style={{ color: 'var(--text-main)' }} />
            </div>
            <div className="emoji-grid" id="emoji-grid">
              {['👍','❤️','🔥','🚀','🎉','😊','😂','😎','💻','🔒','✅','✨','😮','😢','👏','🎨'].map(emoji => (
                <button key={emoji} type="button" className="emoji-btn" onClick={() => { handleAddEmoji(emoji); setShowEmojiPicker(false); }}>{emoji}</button>
              ))}
            </div>
          </div>
        )}

        {/* Reply Banner */}
        {replyingTo && (
          <div style={{ padding: '4px 8px', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              onClick={() => scrollToMessage(replyingTo._id)}
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
              title="Jump to original message"
            >
              Replying to <strong style={{ color: 'var(--color-primary)' }}>@{replyingTo.sender?.username}</strong>: &quot;{replyingTo.content}&quot;
            </span>
            <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>&times;</button>
          </div>
        )}

        {/* Editing Banner */}
        {editingMessage && (
          <div style={{ padding: '4px 8px', background: 'rgba(147,51,234,0.15)', borderRadius: 6, border: '1px solid #9333ea', fontSize: 11, color: '#a855f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✏️ Editing: &quot;{editingMessage.content}&quot;
            </span>
            <button onClick={() => { setEditingMessage(null); setInputText(''); }} style={{ background: 'transparent', border: 'none', color: '#a855f7', cursor: 'pointer', flexShrink: 0 }}>&times;</button>
          </div>
        )}

        {/* Main Composer Form */}
        {isRecordingVoice ? (
          <VoiceRecorder onCancel={() => setIsRecordingVoice(false)} onSend={handleSendVoiceNote} />
        ) : (
          <form className="composer-form" id="composer-form" onSubmit={sendAndKeepFocus} autoComplete="off">
            <div className="composer-toolbar-left">
              <button type="button" className="btn-icon composer-action-attach" onClick={() => fileInputRef.current?.click()} title="Add Attachment" aria-label="Add Attachment">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <button type="button" className="btn-icon encryption-toggle-btn active composer-action-encryption" title="OMEMO Encryption: Enabled" aria-label="Toggle OMEMO Encryption">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
              {/* Mobile-only: ⋮ opens the attachment menu (doc/img, voice, emoji) */}
              <button type="button" className="btn-icon composer-action-more" onClick={() => setIsComposerMoreOpen(!isComposerMoreOpen)} title="More options" aria-label="More options">
                <svg className="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              {isComposerMoreOpen && (
                <div className="composer-more-menu" role="menu" aria-label="Attachment options">
                  <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setIsComposerMoreOpen(false); }}>
                    <span className="composer-more-icon">📎</span> Photo / Document
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setIsRecordingVoice(true); setIsComposerMoreOpen(false); }}>
                    <span className="composer-more-icon">🎤</span> Voice Note
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setIsComposerMoreOpen(false); }}>
                    <span className="composer-more-icon">😊</span> Emoji
                  </button>
                </div>
              )}
            </div>

            <div className="composer-input-wrapper">
              <textarea
                ref={textareaRef}
                id="composer-textarea"
                className="composer-textarea"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAndKeepFocus(e);
                  }
                }}
                onFocus={() => {
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 300);
                }}
                placeholder={
                  editingMessage ? 'Edit message... (Enter to save)' :
                  replyingTo ? `Replying to @${replyingTo.sender?.username}... (Enter to send)` :
                  `Send a message... `
                }
                rows={1}
                maxLength={2000}
                aria-label="Message text composer"
              />
            </div>

            <div className="composer-toolbar-right">
              <button type="button" className="btn-icon composer-action-voice" title="Voice Note" aria-label="Voice Note" onMouseDown={() => setIsRecordingVoice(true)}>
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <button type="button" className="btn-icon composer-action-emoji" id="emoji-trigger-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Insert Emoji" aria-label="Insert Emoji">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <button
                type="submit"
                className="btn-send"
                id="btn-send-message"
                title="Send Message (Enter)"
                aria-label="Send Message"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  sendAndKeepFocus(e);
                }}
                onClick={sendAndKeepFocus}
              >
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </form>
        )}

        {/* Composer Bottom Info Bar — only rendered when someone is actively typing to save vertical space */}
        {typingArray.length > 0 && (
          <div className="composer-footer-bar">
            <div className="typing-status-indicator" id="remote-typing-status">
              {typingArray.join(', ')} is typing...
            </div>
          </div>
        )}
      </footer>

      {/* Lightbox Modal */}
      {previewImageUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setPreviewImageUrl(null)}>
          <img src={previewImageUrl} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}

      {/* User Profile Modal */}
      {targetProfileId && (
        <UserProfileModal 
          targetUserId={targetProfileId} 
          onClose={() => setTargetProfileId(null)} 
        />
      )}

      {/* Appearance Studio Modal */}
      <AppearanceStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        targetRoomId={roomId}
        roomName={room.name}
      />
    </div>
  );
}

ChatWindow.propTypes = {
  room: PropTypes.object.isRequired,
  onLeaveRoom: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired
};
