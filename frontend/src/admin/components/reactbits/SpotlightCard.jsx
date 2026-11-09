'use client';

import { useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * SpotlightCard — React Bits Component
 * Creates a subtle interactive cursor-following spotlight effect on cards.
 *
 * Designed for dark SaaS interfaces:
 * - Subtle violet/indigo glow (default 12-16% opacity)
 * - Zero heavy libraries (pure CSS custom property tracking)
 * - Fully accessible and responsive
 */
export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(99, 102, 241, 0.16)',
  spotlightSize = 340,
  style = {},
  onClick,
  ...rest
}) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`admin-spotlight-card ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {/* Dynamic Cursor Spotlight Layer */}
      <div
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 250ms ease',
          background: `radial-gradient(${spotlightSize}px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
          zIndex: 1,
        }}
      />
      {/* Content wrapper sitting above the spotlight */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}

SpotlightCard.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  spotlightColor: PropTypes.string,
  spotlightSize: PropTypes.number,
  style: PropTypes.object,
  onClick: PropTypes.func,
};
