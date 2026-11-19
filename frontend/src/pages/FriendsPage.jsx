import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import friendService from '../services/friendService';
import { socket } from '../services/socket';
import { toast } from '../utils/toast';
import UserAvatar from '../components/common/UserAvatar';

export default function FriendsPage({ onStartChat, onBack }) {

  // Active sub-tab: 'all' | 'pending' | 'add'
  const [subTab, setSubTab] = useState('all');

  // Friends & Requests state
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Friend / Search state
  const [searchId, setSearchId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [relationshipStatus, setRelationshipStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState(null);

  // Fetch all friend data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
        friendService.getFriends(),
        friendService.getIncomingRequests(),
        friendService.getOutgoingRequests()
      ]);

      setFriends(friendsRes.friends || []);
      setIncomingRequests(incomingRes.requests || []);
      setOutgoingRequests(outgoingRes.requests || []);
    } catch (err) {
      console.error('Failed to load friends data:', err);
      toast.error('Failed to load friends list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    const handleRequestReceived = (data) => {
      const senderName = data?.sender?.username || 'A user';
      toast.info(`👋 Friend request received from ${senderName}!`);
      fetchData();
    };

    const handleRequestAccepted = (data) => {
      const friendName = data?.friend?.username || 'Your contact';
      toast.success(`🎉 ${friendName} accepted your friend request!`);
      fetchData();
    };

    const handleRequestRejected = () => {
      fetchData();
    };

    const handleRequestCancelled = () => {
      fetchData();
    };

    const handleFriendRemoved = () => {
      fetchData();
    };

    socket.on('friend_request_received', handleRequestReceived);
    socket.on('friend_request_accepted', handleRequestAccepted);
    socket.on('friend_request_rejected', handleRequestRejected);
    socket.on('friend_request_cancelled', handleRequestCancelled);
    socket.on('friend_removed', handleFriendRemoved);

    return () => {
      socket.off('friend_request_received', handleRequestReceived);
      socket.off('friend_request_accepted', handleRequestAccepted);
      socket.off('friend_request_rejected', handleRequestRejected);
      socket.off('friend_request_cancelled', handleRequestCancelled);
      socket.off('friend_removed', handleFriendRemoved);
    };
  }, [fetchData]);

  // Search User by Public ID
  const handleSearchUser = async (e) => {
    if (e) e.preventDefault();
    const query = searchId.trim().toUpperCase();
    if (!query) return;

    try {
      setSearching(true);
      setSearchResult(null);
      setRelationshipStatus(null);

      // Fetch user profile and relationship status concurrently
      const [lookupRes, statusRes] = await Promise.all([
        friendService.lookupUserByPublicId(query),
        friendService.getRelationshipStatus(query)
      ]);

      setSearchResult(lookupRes.user);
      setRelationshipStatus(statusRes.relationship);
    } catch (err) {
      const msg = err.response?.data?.message || 'User not found. Please verify the Public ID.';
      toast.error(msg);
      setSearchResult(null);
      setRelationshipStatus(null);
    } finally {
      setSearching(false);
    }
  };

  // Send Friend Request
  const handleSendRequest = async (publicId) => {
    try {
      setActionLoading(true);
      const res = await friendService.sendFriendRequest({ publicId });
      toast.success(res.message || 'Friend request sent!');
      setSearchId('');
      setSearchResult(null);
      setRelationshipStatus(null);
      fetchData();
      setSubTab('pending');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send friend request';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Accept Request
  const handleAcceptRequest = async (requestId) => {
    try {
      setActionLoading(true);
      // Optimistic update
      setIncomingRequests((prev) => prev.filter((r) => r._id !== requestId));
      await friendService.acceptRequest(requestId);
      toast.success('Friend request accepted!');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept request');
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Request
  const handleRejectRequest = async (requestId) => {
    try {
      setActionLoading(true);
      // Optimistic update
      setIncomingRequests((prev) => prev.filter((r) => r._id !== requestId));
      await friendService.rejectRequest(requestId);
      toast.info('Friend request rejected');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject request');
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Outgoing Request
  const handleCancelRequest = async (requestId) => {
    try {
      setActionLoading(true);
      // Optimistic update
      setOutgoingRequests((prev) => prev.filter((r) => r._id !== requestId));
      await friendService.cancelRequest(requestId);
      toast.info('Friend request cancelled');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel request');
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  // Remove Friend
  const handleRemoveFriend = async (friendId, friendName) => {
    if (!window.confirm(`Are you sure you want to remove ${friendName} from your friends?`)) {
      return;
    }

    try {
      setActionLoading(true);
      // Optimistically remove from state immediately
      setFriends((prev) => prev.filter((f) => 
        f.friendshipId !== friendId && 
        f.friend?.publicId !== friendId && 
        f.friend?._id !== friendId
      ));
      await friendService.removeFriend(friendId);
      toast.success(`${friendName} removed from friends`);
    } catch (err) {
      const errMsg = err.response?.data?.message || '';
      if (err.response?.status === 404 || errMsg.includes('already removed') || errMsg.includes('not found')) {
        toast.info(`${friendName} was already removed.`);
      } else {
        toast.error(errMsg || 'Failed to remove friend');
      }
    } finally {
      fetchData();
      setActionLoading(false);
    }
  };

  // Copy ID Helper
  const handleCopyId = async (id) => {
    let successful = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(id);
        successful = true;
      } catch {
        /* fallback below */
      }
    }

    if (!successful) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = id;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        successful = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        /* ignore */
      }
    }

    if (successful) {
      setCopiedId(id);
      toast.success('Public ID copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.error(`Please copy manually: ${id}`);
    }
  };

  const pendingTotal = incomingRequests.length + outgoingRequests.length;

  return (
    <div className="friends-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--theme-chat-bg, #181a20)', color: 'var(--text-main, #f3f4f6)', overflowY: 'auto' }}>
      
      {/* Header */}
      <div className="friends-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))', background: 'var(--theme-sidebar-bg, #1a1c23)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="btn-icon"
                style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bg-input, #222530)', border: '1px solid var(--border-color, #3f4657)', color: 'var(--text-main, #f3f4f6)', cursor: 'pointer' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
            )}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                👥 Friends
                <span style={{ fontSize: 13, background: 'rgba(124, 58, 237, 0.2)', color: 'var(--theme-primary, #a78bfa)', padding: '2px 10px', borderRadius: 12, fontWeight: 600 }}>
                  {friends.length}
                </span>
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>
                Connect with contacts using permanent Public IDs
              </p>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="ui-scroll-tabs" role="tablist" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`ui-tab-chip ${subTab === 'all' ? 'active' : ''}`}
              onClick={() => setSubTab('all')}
              role="tab"
              aria-selected={subTab === 'all'}
            >
              All Friends ({friends.length})
            </button>
            <button
              type="button"
              className={`ui-tab-chip ${subTab === 'pending' ? 'active' : ''}`}
              onClick={() => setSubTab('pending')}
              role="tab"
              aria-selected={subTab === 'pending'}
            >
              Pending {pendingTotal > 0 && <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', fontSize: 11, padding: '1px 6px', borderRadius: 10 }}>{pendingTotal}</span>}
            </button>
            <button
              type="button"
              className={`ui-tab-chip ${subTab === 'add' ? 'active' : ''}`}
              onClick={() => setSubTab('add')}
              role="tab"
              aria-selected={subTab === 'add'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span>+ Add Friend</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="friends-content" style={{ flex: 1, padding: 24, maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        
        {/* TAB 1: ALL FRIENDS */}
        {subTab === 'all' && (
          <div>
            {/* Prominent Incoming Requests Banner */}
            {incomingRequests.length > 0 && (
              <div
                className="incoming-requests-banner"
                style={{
                  marginBottom: 24,
                  padding: '16px 20px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(124, 58, 237, 0.08) 100%)',
                  border: '1.5px solid rgba(16, 185, 129, 0.35)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📥</span>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main, #f3f4f6)' }}>
                      Friend Requests Waiting for You
                    </h3>
                    <span style={{ background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                      {incomingRequests.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubTab('pending')}
                    style={{ background: 'none', border: 'none', color: 'var(--theme-primary, #a78bfa)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Manage all pending →
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {incomingRequests.map((req) => (
                    <div
                      key={req._id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-card, rgba(255, 255, 255, 0.04))',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <UserAvatar
                          src={req.requester?.avatar}
                          name={req.requester?.fullName || req.requester?.username}
                          size={44}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {req.requester?.fullName || req.requester?.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span>@{req.requester?.username}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                              {req.requester?.publicId}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleAcceptRequest(req._id)}
                          style={{
                            padding: '8px 18px',
                            borderRadius: 8,
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <span>✓</span>
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRejectRequest(req._id)}
                          style={{
                            padding: '8px 18px',
                            borderRadius: 8,
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          <span>✕</span>
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted, #9ca3af)' }}>
                <div className="spinner" style={{ margin: '0 auto 16px', width: 32, height: 32, border: '3px solid var(--border-color, rgba(255,255,255,0.1))', borderTopColor: 'var(--theme-primary, #a78bfa)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Loading your friends...
              </div>
            ) : friends.length === 0 ? (
              <div className="empty-friends-card" style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-input, rgba(255, 255, 255, 0.02))', border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))', borderRadius: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>No Friends Yet</h3>
                <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 14, maxWidth: 360, margin: '0 auto 20px' }}>
                  Share your Public ID with others or add friends using their unique ID to start chatting!
                </p>
                <button
                  type="button"
                  onClick={() => setSubTab('add')}
                  className="btn-primary"
                  style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--theme-primary, #7c3aed)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                >
                  + Add Friend by Public ID
                </button>
              </div>
            ) : (
              <div className="friends-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {friends.map(({ friendshipId, friend }) => {
                  const isOnline = friend.status === 'online';
                  return (
                    <div
                      key={friendshipId}
                      className="friend-card"
                      style={{
                        padding: 16,
                        background: 'var(--bg-input, rgba(255, 255, 255, 0.03))',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        borderRadius: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        transition: 'transform 0.2s, border-color 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <UserAvatar
                          src={friend.avatar}
                          name={friend.fullName || friend.username}
                          size={48}
                          showStatus={true}
                          isOnline={isOnline}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {friend.fullName || friend.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>@{friend.username}</div>
                        </div>
                      </div>

                      {/* Public ID Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-deep, rgba(0, 0, 0, 0.25))', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted, #9ca3af)' }}>ID:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--theme-primary, #a78bfa)' }}>
                          {friend.publicId}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(friend.publicId)}
                          title="Copy Public ID"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted, #9ca3af)', cursor: 'pointer', padding: 2 }}
                        >
                          {copiedId === friend.publicId ? '✓' : '📋'}
                        </button>
                      </div>

                      {/* Status / Bio */}
                      {friend.bio && (
                        <div style={{ fontSize: 12, color: 'var(--text-main, #d1d5db)', fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          &quot;{friend.bio}&quot;
                        </div>
                      )}

                      {/* Card Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))' }}>
                        {onStartChat && (
                          <button
                            type="button"
                            onClick={() => onStartChat(friend)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: 8,
                              background: 'var(--theme-primary, #7c3aed)',
                              color: '#fff',
                              border: 'none',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            💬 Chat
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRemoveFriend(friendshipId || friend.publicId || friend._id, friend.username)}
                          title="Remove Friend"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PENDING REQUESTS */}
        {subTab === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            
            {/* Incoming Requests */}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main, #f3f4f6)' }}>
                📥 Incoming Requests ({incomingRequests.length})
              </h2>

              {incomingRequests.length === 0 ? (
                <div style={{ padding: '24px', background: 'var(--bg-input, rgba(255, 255, 255, 0.02))', borderRadius: 12, color: 'var(--text-muted, #9ca3af)', textAlign: 'center', fontSize: 14 }}>
                  No incoming requests waiting.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {incomingRequests.map((req) => (
                    <div
                      key={req._id}
                      style={{
                        padding: 16,
                        background: 'var(--bg-input, rgba(255, 255, 255, 0.03))',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <UserAvatar
                          src={req.requester?.avatar}
                          name={req.requester?.fullName || req.requester?.username}
                          size={44}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {req.requester.fullName || req.requester.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span>@{req.requester.username}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                              {req.requester.publicId}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleAcceptRequest(req._id)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRejectRequest(req._id)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            background: 'var(--bg-input, rgba(255, 255, 255, 0.05))',
                            color: 'var(--text-muted, #9ca3af)',
                            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Requests */}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main, #f3f4f6)' }}>
                📤 Outgoing Requests ({outgoingRequests.length})
              </h2>

              {outgoingRequests.length === 0 ? (
                <div style={{ padding: '24px', background: 'var(--bg-input, rgba(255, 255, 255, 0.02))', borderRadius: 12, color: 'var(--text-muted, #9ca3af)', textAlign: 'center', fontSize: 14 }}>
                  No pending outgoing requests.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {outgoingRequests.map((req) => (
                    <div
                      key={req._id}
                      style={{
                        padding: 16,
                        background: 'var(--bg-input, rgba(255, 255, 255, 0.03))',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <UserAvatar
                          src={req.recipient?.avatar}
                          name={req.recipient?.fullName || req.recipient?.username}
                          size={44}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {req.recipient.fullName || req.recipient.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span>@{req.recipient.username}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--theme-primary, #a78bfa)', fontWeight: 600 }}>
                              {req.recipient.publicId}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: '#eab308', background: 'rgba(234, 179, 8, 0.1)', padding: '4px 10px', borderRadius: 12, fontWeight: 600 }}>
                          Pending
                        </span>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleCancelRequest(req._id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: ADD FRIEND BY PUBLIC ID */}
        {subTab === 'add' && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ background: 'var(--bg-input, rgba(255, 255, 255, 0.03))', border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-main, #f3f4f6)' }}>
                Add Friend by Public ID
              </h2>
              <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
                Enter your friend&apos;s permanent Public ID (e.g. <code style={{ color: 'var(--theme-primary, #a78bfa)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>SKY-XXXXXX</code>) to inspect their public profile and send a request.
              </p>

              {/* Search Form */}
              <form onSubmit={handleSearchUser} style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <input
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                  placeholder="e.g. SKY-7K9M2Q"
                  maxLength={12}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                    borderRadius: 10,
                    padding: '12px 16px',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: 15,
                    letterSpacing: '1px',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={searching || !searchId.trim()}
                  style={{
                    padding: '12px 20px',
                    background: 'var(--theme-primary, #7c3aed)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: 600,
                    cursor: searching || !searchId.trim() ? 'not-allowed' : 'pointer',
                    opacity: searching || !searchId.trim() ? 0.6 : 1
                  }}
                >
                  {searching ? 'Looking up...' : 'Search'}
                </button>
              </form>

              {/* User Profile Preview Card */}
              {searchResult && (
                <div style={{ background: 'var(--bg-deep, rgba(0, 0, 0, 0.25))', border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                    <UserAvatar
                      src={searchResult.avatar}
                      name={searchResult.fullName || searchResult.username}
                      size={56}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-main, #f3f4f6)' }}>
                        {searchResult.fullName || searchResult.username}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>@{searchResult.username}</div>
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', background: 'rgba(124, 58, 237, 0.2)', color: 'var(--theme-primary, #a78bfa)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                          {searchResult.publicId}
                        </span>
                      </div>
                    </div>
                  </div>

                  {searchResult.bio && (
                    <div style={{ fontSize: 13, color: 'var(--text-main, #d1d5db)', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-input, rgba(255,255,255,0.02))', borderRadius: 8 }}>
                      &quot;{searchResult.bio}&quot;
                    </div>
                  )}

                  {/* Contextual Action Button based on Relationship Status */}
                  <div>
                    {relationshipStatus?.status === 'self' ? (
                      <div style={{ padding: '10px', textAlign: 'center', background: 'var(--bg-input, rgba(255, 255, 255, 0.05))', borderRadius: 8, color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
                        ℹ️ This is your own Public ID
                      </div>
                    ) : relationshipStatus?.status === 'accepted' ? (
                      <div style={{ padding: '10px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 8, color: '#10b981', fontWeight: 600, fontSize: 13 }}>
                        ✓ You are already friends
                      </div>
                    ) : relationshipStatus?.status === 'pending_outgoing' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: 8 }}>
                        <span style={{ color: '#eab308', fontWeight: 600, fontSize: 13 }}>⏳ Request Pending</span>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleCancelRequest(relationshipStatus.requestId)}
                          style={{ padding: '4px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : relationshipStatus?.status === 'pending_incoming' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: 8 }}>
                        <span style={{ color: 'var(--theme-primary, #a78bfa)', fontWeight: 600, fontSize: 13 }}>Received Request Waiting</span>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleAcceptRequest(relationshipStatus.requestId)}
                          style={{ padding: '6px 14px', borderRadius: 6, background: '#10b981', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Accept
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleSendRequest(searchResult.publicId)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 10,
                          background: 'var(--theme-primary, #7c3aed)',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8
                        }}
                      >
                        {actionLoading ? 'Sending...' : '➕ Send Friend Request'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

FriendsPage.propTypes = {
  onStartChat: PropTypes.func,
  onBack: PropTypes.func
};

