import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import conversationService from '../services/conversationService';
import { socket } from '../services/socket';
import { useAuth } from '../context/useAuth';
import { toast } from '../utils/toast';

export default function DirectChatWindow({
  conversation,
  onBack,
  onToggleMobileSidebar
}) {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?._id || currentUser?.id;

  const friend = conversation?.friend;
  const conversationId = conversation?._id;

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

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

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

        // Mark incoming messages as read
        await conversationService.markAsRead(conversationId);
      } catch (err) {
        console.error('Failed to load direct messages:', err);
        toast.error('Failed to load message history');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();

    // Join authorized conversation room
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
          // Avoid duplicate messages
          if (prev.some((m) => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
        scrollToBottom(true);

        // If the message is from the friend, mark as read
        const senderId = data.message.sender?._id || data.message.sender?.id || data.message.sender;
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
            const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
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
      if (data?.conversationId === conversationId && data?.userId !== currentUserId) {
        setFriendTyping(Boolean(data.isTyping));
      }
    };

    socket.on('direct_message_received', handleMessageReceived);
    socket.on('direct_messages_read', handleMessagesRead);
    socket.on('direct_message_edited', handleMessageEdited);
    socket.on('direct_message_deleted', handleMessageDeleted);
    socket.on('direct_user_typing', handleUserTyping);

    return () => {
      socket.off('direct_message_received', handleMessageReceived);
      socket.off('direct_messages_read', handleMessagesRead);
      socket.off('direct_message_edited', handleMessageEdited);
      socket.off('direct_message_deleted', handleMessageDeleted);
      socket.off('direct_user_typing', handleUserTyping);
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
    } catch (err) {
      toast.error('Failed to load older messages');
    } finally {
      setLoadingMore(false);
    }
  };

  // 4. Send Message (Socket + REST fallback)
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    const clientMsgId = 'dm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    try {
      setSending(true);
      setInputText('');

      // Stop typing indicator immediately
      socket.emit('direct_typing', { conversationId, isTyping: false });

      // Send via REST for persistent confirmation
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
      setInputText(trimmed); // restore on failure
    } finally {
      setSending(false);
    }
  };

  // 5. Typing Handler
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    // Emit typing indicator
    socket.emit('direct_typing', { conversationId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('direct_typing', { conversationId, isTyping: false });
    }, 2000);
  };

  // 6. Edit Message
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

  // 7. Delete Message
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await conversationService.deleteMessage(messageId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete message');
    }
  };

  const isFriendOnline = friend?.status === 'online';

  return (
    <div className="direct-chat-window" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--theme-chat-bg, #181a20)', color: '#f3f4f6' }}>
      
      {/* ── Direct Chat Header ───────────────────────────────────────── */}
      <div className="direct-chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'var(--theme-sidebar-bg, #1a1c23)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="btn-icon"
              style={{ width: 36, height: 36, borderRadius: 8, background: '#222530', border: '1px solid #3f4657', color: '#f3f4f6', cursor: 'pointer' }}
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

          {/* Friend Avatar with Presence Dot */}
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
              <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                {friend?.publicId}
              </span>
              <span>•</span>
              <span style={{ color: isFriendOnline ? '#10b981' : '#9ca3af' }}>
                {isFriendOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Security Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--theme-primary, #a78bfa)', background: 'rgba(124, 58, 237, 0.1)', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
          🔒 Direct Message
        </div>
      </div>

      {/* ── Message History Stream ──────────────────────────────────── */}
      <div className="direct-messages-stream" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        
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
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', background: 'rgba(255,255,255,0.02)', borderRadius: 16, margin: 'auto' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>👋</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f3f4f6', margin: '0 0 6px' }}>
              Say hello to {friend?.fullName || friend?.username}!
            </h3>
            <p style={{ fontSize: 13, margin: 0 }}>This is the beginning of your direct conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderId = msg.sender?._id || msg.sender?.id || msg.sender;
            const isMe = String(senderId) === String(currentUserId);
            const isEditing = editingMessageId === msg._id;

            return (
              <div
                key={msg._id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  marginBottom: 4
                }}
              >
                <div
                  style={{
                    maxWidth: '75%',
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
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(msg._id)}
                          style={{ padding: '2px 8px', borderRadius: 4, background: '#10b981', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(null)}
                          style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}
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
                        <div>{msg.content}</div>
                      )}

                      {/* Metadata Row: Timestamp, Edited tag, Read Receipts */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4, fontSize: 11, opacity: 0.75 }}>
                        {msg.isEdited && <span>(edited)</span>}
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {isMe && !msg.isDeleted && (
                          <span title={msg.isRead ? 'Read' : 'Delivered'} style={{ color: msg.isRead ? '#38bdf8' : 'inherit', marginLeft: 2, fontWeight: 700 }}>
                            {msg.isRead ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Edit / Delete Actions for Author */}
                {isMe && !msg.isDeleted && !isEditing && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, marginRight: 4, fontSize: 11, opacity: 0.6 }}>
                    <button
                      type="button"
                      onClick={() => { setEditingMessageId(msg._id); setEditText(msg.content); }}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0 }}
                    >
                      Edit
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg._id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Typing Indicator */}
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

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ──────────────────────────────────────────────── */}
      <form onSubmit={handleSendMessage} style={{ padding: '16px 20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: 'var(--theme-sidebar-bg, #1a1c23)', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
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

        <button
          type="submit"
          disabled={!inputText.trim() || sending}
          style={{
            padding: '10px 20px',
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
    </div>
  );
}

DirectChatWindow.propTypes = {
  conversation: PropTypes.object.isRequired,
  onBack: PropTypes.func,
  onToggleMobileSidebar: PropTypes.func
};

