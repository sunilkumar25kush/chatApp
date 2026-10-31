import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { animateModalEnter } from '../utils/animations';
import api from '../services/api';
import { socket } from '../services/socket';

export default function RoomJoinRequestsModal({ isOpen, onClose, roomId, roomName, onMemberAdded, onToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  const fetchRequests = useCallback(async () => {
    if (!roomId) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/rooms/${roomId}/join-requests?status=pending`);
      setRequests(res.data.requests || []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to fetch join requests.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      if (cardRef.current) animateModalEnter(cardRef.current);
      fetchRequests();
    } else {
      setRequests([]);
      setError('');
    }
  }, [isOpen, fetchRequests]);

  // Real-time Socket.IO listeners for incoming & cancelled requests
  useEffect(() => {
    if (!isOpen || !roomId) return;

    const handleNewRequest = (data) => {
      if (String(data.roomId) === String(roomId)) {
        onToast?.(`New join request from @${data.user?.username || 'user'}`, 'info');
        fetchRequests();
      }
    };

    const handleCancelledRequest = (data) => {
      if (String(data.roomId) === String(roomId)) {
        setRequests((prev) => prev.filter((r) => String(r._id) !== String(data.requestId)));
      }
    };

    socket.on('room_join_request_created', handleNewRequest);
    socket.on('room_join_request_cancelled', handleCancelledRequest);

    return () => {
      socket.off('room_join_request_created', handleNewRequest);
      socket.off('room_join_request_cancelled', handleCancelledRequest);
    };
  }, [isOpen, roomId, onToast, fetchRequests]);

  if (!isOpen) return null;

  const handleApprove = async (requestId, requester) => {
    try {
      setProcessingId(requestId);
      setError('');
      await api.post(`/rooms/${roomId}/join-requests/${requestId}/approve`);
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
      onToast?.(`Approved @${requester?.username || 'user'}. They are now a member!`, 'success');
      onMemberAdded?.();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to approve request.';
      setError(msg);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId, requester) => {
    try {
      setProcessingId(requestId);
      setError('');
      await api.post(`/rooms/${roomId}/join-requests/${requestId}/reject`);
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
      onToast?.(`Rejected join request from @${requester?.username || 'user'}.`, 'info');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reject request.';
      setError(msg);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="join-requests-title">
      <div
        className="modal-card"
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="join-requests-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700 }}>
            <span>👥</span>
            Join Requests {roomName ? `· #${roomName}` : ''}
          </h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div className="auth-error-alert" role="alert" style={{ marginBottom: 0 }}>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-error)', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading pending requests...
            </div>
          ) : requests.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32 }}>✨</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>No Pending Join Requests</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 300 }}>
                When users request to enter this private room, their profiles will appear here for your review.
              </p>
            </div>
          ) : (
            requests.map((req) => {
              const u = req.user || {};
              const isBusy = processingId === req._id;

              return (
                <div
                  key={req._id}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--color-bg-card, rgba(255, 255, 255, 0.04))',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    justifyContent: 'space-between'
                  }}
                >
                  {/* User Profile Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 16,
                        flexShrink: 0,
                        overflow: 'hidden'
                      }}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        (u.username || 'U').slice(0, 2).toUpperCase()
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.fullName || u.username}
                        </span>
                        {u.publicId && (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: 'var(--color-primary)'
                            }}
                          >
                            {u.publicId}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        @{u.username} {u.bio ? `· ${u.bio.slice(0, 40)}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.8 }}>
                        Requested {new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  {/* Approve / Reject Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleReject(req._id, u)}
                      disabled={isBusy}
                      title="Decline Request"
                      style={{ padding: '6px 12px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                      {isBusy ? '...' : 'Decline'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleApprove(req._id, u)}
                      disabled={isBusy}
                      title="Approve & Grant Membership"
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        fontWeight: 600
                      }}
                    >
                      {isBusy ? '...' : 'Approve'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

RoomJoinRequestsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  roomId: PropTypes.string,
  roomName: PropTypes.string,
  onMemberAdded: PropTypes.func,
  onToast: PropTypes.func
};

