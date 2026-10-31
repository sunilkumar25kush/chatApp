import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { animateModalEnter } from '../utils/animations';
import api from '../services/api';
import { socket } from '../services/socket';

export default function PrivateRoomPreviewModal({ isOpen, onClose, roomId, onEnterRoom, onToast }) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  const fetchPreview = useCallback(async () => {
    if (!roomId) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/rooms/${roomId}/preview`);
      setPreview(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load room preview.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      if (cardRef.current) animateModalEnter(cardRef.current);
      fetchPreview();
    } else {
      setPreview(null);
      setError('');
    }
  }, [isOpen, fetchPreview]);

  // Real-time socket events for request updates
  useEffect(() => {
    if (!isOpen || !roomId) return;

    const handleApproved = (data) => {
      if (String(data.roomId) === String(roomId)) {
        onToast?.(`Your request to join "${data.roomName || preview?.name || 'the room'}" was approved!`, 'success');
        fetchPreview();
      }
    };

    const handleRejected = (data) => {
      if (String(data.roomId) === String(roomId)) {
        onToast?.(`Your request to join "${data.roomName || preview?.name || 'the room'}" was declined.`, 'error');
        fetchPreview();
      }
    };

    socket.on('room_join_request_approved', handleApproved);
    socket.on('room_join_request_rejected', handleRejected);

    return () => {
      socket.off('room_join_request_approved', handleApproved);
      socket.off('room_join_request_rejected', handleRejected);
    };
  }, [isOpen, roomId, preview?.name, onToast, fetchPreview]);

  if (!isOpen) return null;

  const handleRequestJoin = async () => {
    try {
      setActionLoading(true);
      setError('');
      const res = await api.post(`/rooms/${roomId}/join-requests`);
      setPreview((prev) => ({
        ...prev,
        userRequest: res.data
      }));
      onToast?.('Join request sent to the room owner.', 'success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit join request.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!preview?.userRequest?._id) return;
    try {
      setActionLoading(true);
      setError('');
      await api.delete(`/rooms/${roomId}/join-requests/${preview.userRequest._id}`);
      setPreview((prev) => ({
        ...prev,
        userRequest: { ...prev.userRequest, status: 'cancelled' }
      }));
      onToast?.('Join request cancelled.', 'info');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to cancel request.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const userReq = preview?.userRequest;
  const isPending = userReq?.status === 'pending';
  const isApproved = preview?.isMember || userReq?.status === 'approved';
  const isRejected = userReq?.status === 'rejected';

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="room-preview-title">
      <div
        className="modal-card"
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, width: '92%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="room-preview-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="#f59e0b" style={{ flexShrink: 0 }}>
              <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2" />
            </svg>
            Private Room Preview
          </h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              Loading room preview...
            </div>
          ) : preview ? (
            <>
              {/* Room Card Banner */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--color-bg-card, rgba(255, 255, 255, 0.04))',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 20,
                    flexShrink: 0
                  }}
                >
                  {preview.name ? preview.name.slice(0, 2).toUpperCase() : 'PR'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {preview.name}
                    </span>
                    <span className="header-status-badge badge-private" style={{ flexShrink: 0, padding: '2px 8px', fontSize: 11 }}>
                      Private
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {preview.category} · {preview.membersCount} member{preview.membersCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {preview.description && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {preview.description}
                </p>
              )}

              {/* Status Notice */}
              {isApproved ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span>✓</span>
                  <span>You are an approved member of this room!</span>
                </div>
              ) : isPending ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#f59e0b',
                    fontSize: 13,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span>⏳</span>
                    <span>Join Request Pending</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>
                    Your request was submitted and is awaiting approval from the room owner.
                  </div>
                </div>
              ) : isRejected ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: 13,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <span>✕</span>
                    <span>Previous Request Declined</span>
                  </div>
                  {userReq?.rejectionReason && (
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      Reason: &ldquo;{userReq.rejectionReason}&rdquo;
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    fontSize: 12,
                    color: 'var(--text-muted)'
                  }}
                >
                  This space is private. Messages and content are protected until your join request is approved by the room owner.
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={actionLoading}>
            Close
          </button>

          {isApproved ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onEnterRoom?.(preview);
              }}
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}
            >
              Enter Room →
            </button>
          ) : isPending ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancelRequest}
              disabled={actionLoading}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              {actionLoading ? 'Cancelling...' : 'Cancel Request'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRequestJoin}
              disabled={actionLoading || loading}
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', border: 'none' }}
            >
              {actionLoading ? 'Submitting...' : 'Request to Join Space'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

PrivateRoomPreviewModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  roomId: PropTypes.string,
  onEnterRoom: PropTypes.func,
  onToast: PropTypes.func
};

