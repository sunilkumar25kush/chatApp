import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import PrivateRoomPreviewModal from '../components/PrivateRoomPreviewModal';
import ChatWindow from '../components/ChatWindow';
import ErrorBoundary from '../components/ErrorBoundary';
import CallHistoryPage from './CallHistoryPage';
import FriendsPage from './FriendsPage';
import DirectChatWindow from '../components/DirectChatWindow';
import conversationService from '../services/conversationService';
import api from '../services/api';
import { socket } from '../services/socket';
import { useAuth } from '../context/useAuth';
import { requestNotificationPermission, showDesktopNotification } from '../utils/desktopNotifications';
import { animateEmptyState } from '../utils/animations';
import { toast } from '../utils/toast';

export default function Chat() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState(null);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [recentRooms, setRecentRooms] = useState([]);
  const [directConversations, setDirectConversations] = useState([]);
  const [activeDirectConversation, setActiveDirectConversation] = useState(null);
  const emptyCardRef = useRef(null);

  useEffect(() => {
    if (!activeRoom && emptyCardRef.current) {
      animateEmptyState(emptyCardRef.current);
    }
  }, [activeRoom]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await conversationService.getConversations();
      setDirectConversations(res.conversations || []);
    } catch (err) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const handleConvUpdated = () => fetchConversations();
    const handleDmReceived = (data) => {
      fetchConversations();
      if (data?.message && (!activeDirectConversation || activeDirectConversation._id !== data.conversationId)) {
        const senderName = data.message.sender?.fullName || data.message.sender?.username || 'A friend';
        showDesktopNotification(`New message from ${senderName}`, {
          body: data.message.content || 'Sent an attachment'
        });
      }
    };

    socket.on('conversation_updated', handleConvUpdated);
    socket.on('direct_message_received', handleDmReceived);

    return () => {
      socket.off('conversation_updated', handleConvUpdated);
      socket.off('direct_message_received', handleDmReceived);
    };
  }, [fetchConversations, activeDirectConversation]);

  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'public' | 'private' | 'joined' | 'calls'
  const [searchQuery, setSearchQuery] = useState('');
  const selectedCategory = 'All';

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  // Room that triggered the join-code modal (private room without access)
  const [pendingJoinRoom, setPendingJoinRoom] = useState(null);
  const [previewRoomId, setPreviewRoomId] = useState(null);

  // Unread counts per room (roomId -> count) for badges + document.title
  const [unreadCounts, setUnreadCounts] = useState({});

  // Responsive UI state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Instagram-style: mobile chat screen open (rooms list slides left, chat slides in from right)
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const mobileChatOpenRef = useRef(false);
  mobileChatOpenRef.current = mobileChatOpen;

  // When the viewport crosses back to desktop, reset the mobile chat screen
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768 && mobileChatOpenRef.current) {
        setMobileChatOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Browser back button / mobile back gesture support:
  // We push a history entry when the mobile chat opens (same URL), so that
  // pressing back pops OUR entry, fires popstate, and closes the chat instead
  // of navigating away from the app.
  useEffect(() => {
    const onPopState = () => {
      if (window.innerWidth < 768 && mobileChatOpenRef.current) {
        setMobileChatOpen(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Open the mobile chat screen, pushing a history entry so browser-back
  // closes the chat instead of leaving the app.
  const openMobileChat = useCallback(() => {
    if (!mobileChatOpenRef.current) {
      try {
        window.history.pushState({ chatAppChatOpen: true }, '');
      } catch {
        /* history API unavailable — chat still opens, back exits the app */
      }
    }
    setMobileChatOpen(true);
  }, []);

  // Close the mobile chat screen. If we pushed a history entry, pop it so
  // the history stack stays consistent with the visible screen.
  const closeMobileChat = useCallback(() => {
    setMobileChatOpen(false);
    if (window.history.state?.chatAppChatOpen) {
      try {
        window.history.back();
      } catch {
        /* noop */
      }
    }
  }, []);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2400);
  }, []);

  // Fetch all rooms from backend API
  const fetchRooms = async () => {
    try {
      setRoomsLoading(true);
      const response = await api.get('/rooms');
      // Backend returns { rooms: [...], total, page, hasMore } — unwrap defensively
      const data = response.data;
      setRooms(Array.isArray(data) ? data : data?.rooms || []);
    } catch (err) {
      console.error('[Rooms Error] Failed to fetch rooms:', err);
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // ── Unread tracking + desktop notifications ────────────────────────
  // Request notification permission once on first user gesture
  useEffect(() => {
    const requestOnce = () => {
      requestNotificationPermission();
      window.removeEventListener('pointerdown', requestOnce);
    };
    window.addEventListener('pointerdown', requestOnce);
    return () => window.removeEventListener('pointerdown', requestOnce);
  }, []);

  // Count unread messages for rooms that aren't the active, visible one
  useEffect(() => {
    const onReceive = (newMsg) => {
      const roomKey = newMsg.room;
      if (!roomKey) return;
      const senderId = newMsg.sender?._id || newMsg.sender?.id;
      const myId = user?._id || user?.id;
      if (senderId === myId) return; // never count your own messages

      const isActiveRoom = activeRoom && (activeRoom._id || activeRoom.id) === roomKey;
      // On mobile the active room only counts as "being read" while the chat screen is open
      const chatVisible = window.innerWidth >= 768 || mobileChatOpenRef.current;
      const isVisible = !document.hidden && document.hasFocus();

      if (isActiveRoom && chatVisible && isVisible) return; // reading it right now

      setUnreadCounts((prev) => ({ ...prev, [roomKey]: (prev[roomKey] || 0) + 1 }));

      // Desktop notification only while the tab is backgrounded
      if (!isVisible) {
        showDesktopNotification(
          'ChatApp — New Message',
          `${newMsg.sender?.username || 'Someone'}: ${newMsg.content || 'Sent a file'}`,
          roomKey
        );
      }
    };
    socket.on('receive_message', onReceive);
    return () => socket.off('receive_message', onReceive);
  }, [activeRoom, user]);

  // Reflect unread totals in the tab title
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) ChatApp` : 'ChatApp';
  }, [unreadCounts]);

  // When the tab regains focus, clear unread for the open room (only while the
  // chat screen is actually visible — on mobile, that means mobileChatOpen)
  useEffect(() => {
    const onVisible = () => {
      const chatVisible = window.innerWidth >= 768 || mobileChatOpenRef.current;
      if (!document.hidden && activeRoom && chatVisible) {
        const roomKey = activeRoom._id || activeRoom.id;
        if (roomKey) {
          setUnreadCounts((prev) => {
            if (!prev[roomKey]) return prev;
            const next = { ...prev };
            delete next[roomKey];
            return next;
          });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [activeRoom]);

  // Handle Select Room — must be declared BEFORE any ref/hook that uses it
  const handleSelectRoom = useCallback((room) => {
    // Private room: user must be a member OR the creator to enter directly.
    // Otherwise, open the join-code modal so they can enter the room code.
    if (room.isPrivate) {
      const userId = user?._id || user?.id;
      const memberIds = (room.members || []).map(m => (m._id || m.id || m).toString());
      const isCreator = room.owner && (userId === room.owner._id || userId === room.owner);
      const isMember = room.isMember === true || memberIds.includes(userId?.toString());

      if (!isMember && !isCreator) {
        setPreviewRoomId(room._id || room.id);
        return;
      }
    }

    setActiveDirectConversation(null);
    setActiveRoom(room);
    // On mobile, open the full-screen chat (Instagram-style slide)
    if (window.innerWidth < 768) {
      openMobileChat();
    }
    // Opening a room clears its unread count
    const roomKey = room._id || room.id;
    if (roomKey) {
      setUnreadCounts((prev) => {
        if (!prev[roomKey]) return prev;
        const next = { ...prev };
        delete next[roomKey];
        return next;
      });
    }

    setRecentRooms((prev) => {
      const filtered = prev.filter((r) => (r._id || r.id) !== (room._id || room.id));
      return [room, ...filtered].slice(0, 10);
    });

    setJoinedRooms((prev) => {
      if (prev.some((r) => (r._id || r.id) === (room._id || room.id))) return prev;
      return [...prev, room];
    });
  }, [user, openMobileChat]);

  // Start or open a direct chat conversation with an accepted friend
  const handleStartDirectChatWithFriend = useCallback(async (friend) => {
    try {
      const res = await conversationService.getOrCreateConversation({
        friendPublicId: friend.publicId,
        friendId: friend._id || friend.id
      });
      if (res.conversation) {
        setActiveDirectConversation(res.conversation);
        setActiveRoom(null);
        setActiveTab('chats');
        if (window.innerWidth < 768) {
          openMobileChat();
        }
      }
    } catch (err) {
      console.error('Failed to open direct conversation:', err);
    }
  }, [openMobileChat]);

  const handleSelectDirectConversation = useCallback((conv) => {
    setActiveDirectConversation(conv);
    setActiveRoom(null);
    if (window.innerWidth < 768) {
      openMobileChat();
    }
  }, [openMobileChat]);

  // Desktop notification click → navigate to the room
  const handleSelectRoomRef = useRef();
  handleSelectRoomRef.current = handleSelectRoom;

  useEffect(() => {
    const onNavigate = (e) => {
      const { roomId } = e.detail || {};
      if (!roomId) return;
      const target = rooms.find((r) => (r._id || r.id) === roomId) || joinedRooms.find((r) => (r._id || r.id) === roomId);
      if (target) {
        handleSelectRoomRef.current(target);
      }
    };
    window.addEventListener('chat-navigate', onNavigate);
    return () => window.removeEventListener('chat-navigate', onNavigate);
  }, [rooms, joinedRooms]);

  const handleNavigateNotification = useCallback((link, notif) => {
    if (!link) return;
    if (link.screen === 'friends') {
      setActiveRoom(null);
      setActiveDirectConversation(null);
      setActiveTab('friends');
      if (window.innerWidth < 768) {
        openMobileChat();
      }
    } else if (link.screen === 'direct') {
      const friendPublicId = link.id || notif?.data?.friendPublicId;
      if (friendPublicId) {
        conversationService.getOrCreateConversation({ friendPublicId }).then((res) => {
          if (res.conversation) {
            setActiveDirectConversation(res.conversation);
            setActiveRoom(null);
            setActiveTab('chats');
            if (window.innerWidth < 768) openMobileChat();
          }
        }).catch(() => {
          setActiveTab('friends');
        });
      } else {
        setActiveTab('friends');
      }
    } else if (link.screen === 'room') {
      const targetId = link.id || notif?.data?.roomId;
      if (targetId) {
        const target = rooms.find((r) => (r._id || r.id) === targetId) || joinedRooms.find((r) => (r._id || r.id) === targetId);
        if (target) {
          handleSelectRoom(target);
        } else {
          setPreviewRoomId(targetId);
        }
      }
    }
  }, [rooms, joinedRooms, handleSelectRoom, openMobileChat]);

  // Handle Create Room
  const handleCreateRoom = async (newRoomData) => {
    try {
      const response = await api.post('/rooms', newRoomData);
      const createdRoom = response.data;
      setRooms((prev) => [createdRoom, ...prev]);
      handleSelectRoom(createdRoom);
      showToast(`Room "${createdRoom.name}" created! Tap "Show code" in the header to share it.`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create room';
      showToast(`Error: ${msg}`);
    }
  };

  // Handle Join Room
  const handleJoinRoom = async (roomCode) => {
    try {
      const response = await api.post('/rooms/join', { code: roomCode });
      const joinedRoom = response.data;
      setRooms((prev) => {
        const exists = prev.some((r) => (r._id || r.id) === (joinedRoom._id || joinedRoom.id));
        return exists ? prev : [joinedRoom, ...prev];
      });
      setPendingJoinRoom(null);
      handleSelectRoom(joinedRoom);
      showToast(`Joined room "${joinedRoom.name}"!`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid room code';
      showToast(`Error: ${msg}`);
    }
  };

  // Handle Leave Room
  const handleLeaveRoom = async (roomId) => {
    try {
      await api.post(`/rooms/${roomId}/leave`);
      setJoinedRooms((prev) => prev.filter((r) => (r._id || r.id) !== roomId));
      setRecentRooms((prev) => prev.filter((r) => (r._id || r.id) !== roomId));
      setActiveRoom(null);
      // Mobile: return to the rooms list screen after leaving
      if (window.innerWidth < 768) {
        setMobileChatOpen(false);
      }
      fetchRooms();
      showToast('You have left the room.');
    } catch (err) {
      console.error('[Leave Error] Failed to leave room:', err);
    }
  };

  // Filtered Rooms List
  const displayedRooms = (activeTab === 'joined' ? (joinedRooms.length > 0 ? joinedRooms : recentRooms) : rooms).filter((room) => {
    const matchesSearch =
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.description && room.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (room.code && room.code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || room.category === selectedCategory;
    const matchesTab =
      activeTab === 'public' ? !room.isPrivate :
      activeTab === 'private' ? Boolean(room.isPrivate) :
      true;
    return matchesSearch && matchesCategory && matchesTab;
  });

  return (
    <div className={`gajim-window ${mobileChatOpen ? 'mobile-chat-open' : ''}`}>
      <div className="gajim-body">

        {/* Sidebar (Rooms list) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onOpenJoinModal={() => setIsJoinModalOpen(true)}
          recentRooms={recentRooms}
          rooms={displayedRooms}
          activeRoom={activeRoom}
          directConversations={directConversations}
          activeDirectConversation={activeDirectConversation}
          onSelectDirectConversation={handleSelectDirectConversation}
          onSelectRoom={handleSelectRoom}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          unreadCounts={unreadCounts}
          roomsLoading={roomsLoading}
          isMobileSidebarOpen={isMobileSidebarOpen}
          setIsMobileSidebarOpen={setIsMobileSidebarOpen}
          onNavigateNotification={handleNavigateNotification}
        />

        {/* Main workspace (Chat screen) */}
        <main className="chat-panel">
          {activeTab === 'calls' ? (
            <CallHistoryPage />
          ) : activeTab === 'friends' ? (
            <FriendsPage
              onStartChat={handleStartDirectChatWithFriend}
              onBack={() => {
                if (window.innerWidth < 768) {
                  closeMobileChat();
                } else {
                  setActiveTab('chats');
                }
              }}
            />
          ) : activeDirectConversation ? (
            <DirectChatWindow
              conversation={activeDirectConversation}
              onBack={() => {
                if (window.innerWidth < 768) {
                  closeMobileChat();
                } else {
                  setActiveDirectConversation(null);
                }
              }}
              onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
            />
          ) : (
            <>
              {/* Active room */}
              {activeRoom ? (
                <ErrorBoundary>
                  <ChatWindow
                    room={activeRoom}
                    onLeaveRoom={handleLeaveRoom}
                    onBack={() => {
                      // Mobile: return to rooms list (keep chat state, don't unmount)
                      if (window.innerWidth < 768) {
                        closeMobileChat();
                      } else {
                        setActiveRoom(null);
                      }
                    }}
                    onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
                    onRoomUpdated={(updated) => {
                      setRooms((prev) =>
                        prev.map((r) =>
                          (r._id || r.id) === (updated._id || updated.id) ? { ...r, ...updated } : r
                        )
                      );
                      setActiveRoom((prev) =>
                        prev && (prev._id || prev.id) === (updated._id || updated.id)
                          ? { ...prev, ...updated }
                          : prev
                      );
                    }}
                  />
                </ErrorBoundary>
              ) : (
                /* Empty state */
                <div className="empty-chat-state">
                  <div className="empty-chat-card" ref={emptyCardRef}>
                    <div className="empty-chat-glow" aria-hidden="true" />
                    <div className="empty-chat-illustration">
                      <div className="empty-chat-icon-ring">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="empty-chat-icon-svg">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                      </div>
                    </div>
                    <h3 className="empty-chat-title">No Conversation Selected</h3>
                    <p className="empty-chat-sub">Choose a room from the channel list, or start a new public or private discussion space.</p>
                    <div className="empty-chat-actions">
                      <button
                        type="button"
                        className="btn-empty-action primary"
                        onClick={() => setIsCreateModalOpen(true)}
                      >
                        <span>+ Create New Room</span>
                      </button>
                      <button
                        type="button"
                        className="btn-empty-action secondary"
                        onClick={() => setIsJoinModalOpen(true)}
                      >
                        <span>🔑 Join with Code</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateRoom={handleCreateRoom}
      />
      <JoinRoomModal
        isOpen={isJoinModalOpen}
        onClose={() => { setPendingJoinRoom(null); setIsJoinModalOpen(false); }}
        onJoinRoom={handleJoinRoom}
        roomName={pendingJoinRoom?.name}
        onRequestJoin={pendingJoinRoom ? () => {
          const rId = pendingJoinRoom._id || pendingJoinRoom.id;
          setIsJoinModalOpen(false);
          setPendingJoinRoom(null);
          setPreviewRoomId(rId);
        } : undefined}
      />
      <PrivateRoomPreviewModal
        isOpen={Boolean(previewRoomId)}
        onClose={() => setPreviewRoomId(null)}
        roomId={previewRoomId}
        onEnterRoom={(roomObj) => {
          setPreviewRoomId(null);
          fetchRooms();
          if (roomObj) handleSelectRoom(roomObj);
        }}
        onToast={(msg, type) => {
          if (type === 'error') toast.error(msg);
          else if (type === 'success') toast.success(msg);
          else toast.info(msg);
        }}
      />
    </div>
  );
}
