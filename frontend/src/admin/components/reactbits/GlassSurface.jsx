'use client';

import PropTypes from 'prop-types';

/**
 * GlassSurface — React Bits Inspired Component
 * Layered dark SaaS surface with controlled glassmorphism:
 * - Backdrop blur (14px)
 * - Soft specular border highlight
 * - Deep layered background
 */
export default function GlassSurface({
  children,
  className = '',
  intensity = 'medium',
  glow = false,
  style = {},
  ...rest
}) {
  const intensities = {
    subtle: {
      background: 'rgba(16, 21, 34, 0.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
    },
    medium: {
      background: 'rgba(16, 21, 34, 0.75)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    },
    strong: {
      background: 'rgba(16, 21, 34, 0.90)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
    },
  };

  const selectedIntensity = intensities[intensity] || intensities.medium;

  return (
    <div
      className={`admin-glass-surface ${glow ? 'admin-glass-surface--glow' : ''} ${className}`}
      style={{
        borderRadius: 'var(--admin-radius-lg)',
        boxShadow: glow
          ? 'var(--admin-shadow-lg), var(--admin-shadow-glow)'
          : 'var(--admin-shadow-md)',
        ...selectedIntensity,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

GlassSurface.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  intensity: PropTypes.oneOf(['subtle', 'medium', 'strong']),
  glow: PropTypes.bool,
  style: PropTypes.object,
};
