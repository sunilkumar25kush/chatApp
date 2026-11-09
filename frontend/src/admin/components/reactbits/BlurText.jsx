'use client';

import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

/**
 * BlurText — React Bits Component
 * Elegant blur-to-focus text reveal animation using Framer Motion.
 *
 * @param {string} text - Text to animate
 * @param {number} delay - Stagger delay in ms between elements
 * @param {string} className - Additional CSS class names
 * @param {'words'|'letters'} animateBy - Split by words or letters
 * @param {'top'|'bottom'} direction - Direction of movement
 * @param {number} blur - Initial blur in px
 * @param {number} distance - Movement distance in px
 */
export default function BlurText({
  text = '',
  delay = 120,
  className = '',
  animateBy = 'words',
  direction = 'top',
  blur = 8,
  distance = 16,
  onAnimationComplete,
}) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: delay / 1000,
      },
    },
  };

  const itemVariants = {
    hidden: {
      filter: `blur(${blur}px)`,
      opacity: 0,
      y: direction === 'top' ? -distance : distance,
    },
    visible: {
      filter: 'blur(0px)',
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1], // ease-out cubic
      },
    },
  };

  return (
    <motion.span
      className={`admin-blur-text ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      onAnimationComplete={onAnimationComplete}
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: animateBy === 'words' ? '0.3em' : '0' }}
    >
      {elements.map((segment, index) => (
        <motion.span
          key={index}
          variants={itemVariants}
          style={{ display: 'inline-block' }}
        >
          {segment}
        </motion.span>
      ))}
    </motion.span>
  );
}

BlurText.propTypes = {
  text: PropTypes.string.isRequired,
  delay: PropTypes.number,
  className: PropTypes.string,
  animateBy: PropTypes.oneOf(['words', 'letters']),
  direction: PropTypes.oneOf(['top', 'bottom']),
  blur: PropTypes.number,
  distance: PropTypes.number,
  onAnimationComplete: PropTypes.func,
};
