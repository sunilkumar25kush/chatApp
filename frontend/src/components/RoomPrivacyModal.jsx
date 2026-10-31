import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { animateModalEnter } from '../utils/animations';
import api from '../services/api';

export default function RoomPrivacyModal({ isOpen, onClose, room, currentUser, onRoomUpdated, onToast }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmingPrivate, setConfirmingPrivate] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (isOpen && cardRef.current) {
      animateModalEnter(cardRef.current);
    }
    if (isOpen) {
      setError('');
      setConfirmingPrivate(false);
    }
  }, [isOpen]);

  if (!isOpen || !room) return null;

  const roomId = room._id || room.id;
  const userId = currentUser?._id || currentUser?.id;
  const ownerId = room.owner?._id || room.owner?.id || room.owner;
  const isOwner = String(userId) === String(ownerId);
  const isAdmin = isOwner || (room.admins || []).some((a) => String(a?._id || a?.id || a) === String(userId));
  const isPrivate = Boolean(room.isPrivate) || room.visibility === 'private';

  const handleToggleVisibility = async (targetVisibility) => {
    try {
      setLoading(true);
      setError('');
      const response = await api.put(`/rooms/${roomId}/visibility`, { visibility: targetVisibility });
      const updatedRoom = response.data;
      onRoomUpdated?.(updatedRoom);
      onToast?.(
        targetVisibility === 'private'
          ? 'Room converted to Private. Non-members have been disconnected.'
          : 'Room converted to Public. Anyone can now discover and join.',
        'success'
      );
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update room privacy setting.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="room-privacy-title">
      <div
        className="modal-card"
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 500, width: '90%' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <h2 id="room-privacy-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700 }}>
            {isPrivate ? (
              <svg width="20" height="20" viewBox="0 0 16 16" fill="#f59e0b" style={{ flexShrink: 0 }}>
                <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 16 16" fill="#10b981" style={{ flexShrink: 0 }}>
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m7.5-6.923c-.67.204-1.335.82-1.887 1.855A8 8 0 0 0 5.145 4H7.5zM4.09 4a9.3 9.3 0 0 1 .64-1.539 7 7 0 0 1 .597-.933A7.03 7.03 0 0 0 2.255 4zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a7 7 0 0 0-.656 2.5zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5zM8.5 5v2.5h2.99a12.5 12.5 0 0 0-.337-2.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5zM5.145 12q.208.58.468 1.068c.552 1.035 1.218 1.65 1.887 1.855V12zm.18 2.472a6.7 6.7 0 0 1-.597-.933A9.3 9.3 0 0 1 4.09 12H2.255a7 7 0 0 0 3.07 2.472M1.674 8.5c.123.987.355 1.857.656 2.5h2.146a13 13 0 0 1-.312-2.5zm10.608 2.5h2.146c.301-.643.533-1.513.656-2.5h-2.49a13 13 0 0 1-.312 2.5m1.58-3.5a7 7 0 0 0-.656-2.5H12.28c.174.782.282 1.623.312 2.5zM12.49 4h2.146a7.03 7.03 0 0 0-3.07-2.472q.328.45.597.933c.24.478.455 1.02.639 1.539M8.5 4h2.355a8 8 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077zM11.887 13.068c.26-.487.468-1.068.468-1.068H8.5v2.923c.67-.204 1.335-.82 1.887-1.855M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1" />
              </svg>
            )}
            Room Privacy Settings
          </h2>
          <button className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

          {/* Current Status Box */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: isPrivate ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              border: isPrivate ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>CURRENT VISIBILITY</span>
              <span
                className={`header-status-badge ${isPrivate ? 'badge-private' : 'badge-published'}`}
                style={{ fontSize: 12, padding: '3px 10px' }}
              >
                {isPrivate ? 'Private Room' : 'Public Room'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-main)', lineHeight: 1.5 }}>
              {isPrivate
                ? 'This room is hidden from public room listings and global search. Non-members cannot join using the room code alone. Only members invited or added by the owner can participate.'
                : 'This room is publicly discoverable in the room directory and search results. Anyone can join using the room code and participate in messages.'}
            </p>
          </div>

          {/* Permission Notice if Non-Admin */}
          {!isAdmin && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)',
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🔒</span>
              <span>Only the room owner or administrators can change room visibility settings.</span>
            </div>
          )}

          {/* Confirmation Warning when converting to Private */}
          {isAdmin && confirmingPrivate && (
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontWeight: 700, fontSize: 14 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Confirm Public to Private Conversion
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-main)', lineHeight: 1.6 }}>
                <li>This room will be immediately removed from public room listings and search.</li>
                <li>Any active connected users who are not authorized members will be disconnected immediately.</li>
                <li>The public room code will no longer grant automatic joining access to non-members.</li>
                <li>Authorized existing members will retain access.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={confirmingPrivate ? () => setConfirmingPrivate(false) : onClose}
            disabled={loading}
          >
            Cancel
          </button>

          {isAdmin && (
            <>
              {isPrivate ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleToggleVisibility('public')}
                  disabled={loading}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}
                >
                  {loading ? 'Converting...' : '🌐 Convert to Public'}
                </button>
              ) : confirmingPrivate ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleToggleVisibility('private')}
                  disabled={loading}
                  style={{ background: '#ef4444', border: 'none', color: '#fff', fontWeight: 600 }}
                >
                  {loading ? 'Converting...' : '🔒 Confirm & Convert to Private'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setConfirmingPrivate(true)}
                  disabled={loading}
                  style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', border: 'none' }}
                >
                  🔒 Convert to Private...
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

RoomPrivacyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  room: PropTypes.object,
  currentUser: PropTypes.object,
  onRoomUpdated: PropTypes.func,
  onToast: PropTypes.func
};

