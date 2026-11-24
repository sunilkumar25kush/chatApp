import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Deterministic vibrant backgrounds for user initials
const AVATAR_COLORS = [
  'linear-gradient(135deg, #4f46e5, #7c3aed)',
  'linear-gradient(135deg, #059669, #10b981)',
  'linear-gradient(135deg, #d97706, #f59e0b)',
  'linear-gradient(135deg, #e11d48, #f43f5e)',
  'linear-gradient(135deg, #0284c7, #38bdf8)',
  'linear-gradient(135deg, #7c2d12, #ea580c)',
  'linear-gradient(135deg, #701a75, #c026d3)',
  'linear-gradient(135deg, #0f766e, #14b8a6)'
];

function getAvatarBackground(name = '') {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name = '') {
  if (!name || typeof name !== 'string') return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Universal UserAvatar component:
 * - Guarantees 100% circular geometry (aspect-ratio 1:1, flex-shrink 0, overflow hidden).
 * - Never distorts into horizontal ovals when images fail to load.
 * - Handles Google CDN and external avatars safely with referrerPolicy="no-referrer".
 * - Gracefully falls back to vibrant user initials on any network or image load error.
 * - Supports optional online/offline status badge without clipping.
 */
export default function UserAvatar({
  src,
  name = '',
  size = 40,
  showStatus = false,
  isOnline = false,
  statusTitle,
  className = '',
  style = {},
  onClick
}) {
  const [imageError, setImageError] = useState(false);

  // Reset error state whenever the source URL changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const initials = getInitials(name);
  const background = getAvatarBackground(name);
  const statusSize = Math.max(9, Math.round(size * 0.26));
  const fontSize = Math.max(11, Math.round(size * 0.38));

  const avatarCircle = (
    <div
      className="user-avatar-circle"
      style={{
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        minHeight: size,
        maxHeight: size,
        aspectRatio: '1 / 1',
        borderRadius: '50%',
        clipPath: 'circle(50% at 50% 50%)',
        isolation: 'isolate',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background,
        userSelect: 'none',
        boxSizing: 'border-box'
      }}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      ) : (
        <span
          style={{
            color: '#ffffff',
            fontWeight: 700,
            fontSize,
            lineHeight: 1,
            letterSpacing: '0.02em',
            textTransform: 'uppercase'
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );

  if (!showStatus) {
    return (
      <div
        className={`user-avatar-wrap ${className}`}
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: onClick ? 'pointer' : undefined,
          ...style
        }}
      >
        {avatarCircle}
      </div>
    );
  }

  return (
    <div
      className={`user-avatar-wrap ${className}`}
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : undefined,
        ...style
      }}
    >
      {avatarCircle}
      <span
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: statusSize,
          height: statusSize,
          borderRadius: '50%',
          background: isOnline ? '#10b981' : '#6b7280',
          border: '2px solid var(--theme-sidebar-bg, #1a1c23)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 2
        }}
        title={statusTitle || (isOnline ? 'Online' : 'Offline')}
      />
    </div>
  );
}

UserAvatar.propTypes = {
  src: PropTypes.string,
  name: PropTypes.string,
  size: PropTypes.number,
  showStatus: PropTypes.bool,
  isOnline: PropTypes.bool,
  statusTitle: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
  onClick: PropTypes.func
};
