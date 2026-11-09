'use client';

import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

/**
 * FadeContent — React Bits Component
 * Staggered entrance animation for dashboard containers and cards.
 */
export default function FadeContent({
  children,
  blur = false,
  duration = 0.5,
  delay = 0,
  distance = 18,
  direction = 'up',
  className = '',
  style = {},
  ...rest
}) {
  const directions = {
    up: { y: distance, x: 0 },
    down: { y: -distance, x: 0 },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
  };

  const initialOffset = directions[direction] || directions.up;

  return (
    <motion.div
      initial={{
        opacity: 0,
        ...initialOffset,
        ...(blur ? { filter: 'blur(6px)' } : {}),
      }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
        ...(blur ? { filter: 'blur(0px)' } : {}),
      }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`admin-fade-content ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

FadeContent.propTypes = {
  children: PropTypes.node,
  blur: PropTypes.bool,
  duration: PropTypes.number,
  delay: PropTypes.number,
  distance: PropTypes.number,
  direction: PropTypes.oneOf(['up', 'down', 'left', 'right']),
  className: PropTypes.string,
  style: PropTypes.object,
};
