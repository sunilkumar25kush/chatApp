export default function NotificationToast({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;

  const TOAST_META = {
    join:        { icon: '👋', accent: 'var(--color-success, #22c55e)' },
    leave:       { icon: '🚪', accent: 'var(--text-muted, #9ca3af)' },
    message:     { icon: '💬', accent: 'var(--color-primary, #7c3aed)' },
    voice_call:  { icon: '📞', accent: 'var(--color-success, #22c55e)' },
    video_call:  { icon: '📹', accent: '#3b82f6' },
    mic_muted:   { icon: '🔇', accent: '#ef4444' },
    mic_unmuted: { icon: '🎙️', accent: 'var(--color-success, #22c55e)' },
    camera_off:  { icon: '🚫', accent: '#ef4444' },
    camera_on:   { icon: '📷', accent: '#3b82f6' },
    screenshare: { icon: '🖥️', accent: 'var(--color-primary, #7c3aed)' },
    warning:     { icon: '⚠️', accent: '#f59e0b' },
    error:       { icon: '❌', accent: '#ef4444' },
    success:     { icon: '✅', accent: 'var(--color-success, #22c55e)' },
    default:     { icon: '🔔', accent: 'var(--color-primary, #7c3aed)' },
  };

  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {notifications.map((toast) => {
        const meta = TOAST_META[toast.type] || TOAST_META.default;
        return (
          <div
            key={toast.id}
            className="toast-item"
            style={{ '--toast-accent': meta.accent }}
            role="status"
            aria-live="polite"
          >
            <span className="toast-icon-wrap">{meta.icon}</span>
            <div className="toast-body-wrap">
              <div className="toast-title">{toast.title || 'Notification'}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button
              className="btn-icon toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{ width: 26, height: 26, flexShrink: 0 }}
            >
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
