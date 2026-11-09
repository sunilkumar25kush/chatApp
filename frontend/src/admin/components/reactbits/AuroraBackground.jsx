'use client';

import PropTypes from 'prop-types';

/**
 * AuroraBackground — React Bits Inspired Component
 * Serene, calm ambient violet-indigo gradient drift for SaaS headers.
 * Very low contrast, carefully controlled opacity, zero battery drain.
 */
export default function AuroraBackground({
  children,
  className = '',
  opacity = 0.45,
  style = {},
}) {
  return (
    <div
      className={`admin-aurora-wrap ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Subtle Aurora Ambient Glow Layer */}
      <div
        aria-hidden="true"
        className="admin-aurora-glow"
        style={{
          position: 'absolute',
          top: '-40%',
          left: '-20%',
          right: '-20%',
          height: '140%',
          pointerEvents: 'none',
          opacity,
          background: `
            radial-gradient(ellipse 65% 55% at 50% 10%, rgba(99, 102, 241, 0.22), transparent 70%),
            radial-gradient(ellipse 45% 40% at 20% 30%, rgba(79, 70, 229, 0.16), transparent 60%),
            radial-gradient(ellipse 50% 45% at 80% 25%, rgba(56, 189, 248, 0.12), transparent 65%)
          `,
          filter: 'blur(36px)',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

AuroraBackground.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  opacity: PropTypes.number,
  style: PropTypes.object,
};
