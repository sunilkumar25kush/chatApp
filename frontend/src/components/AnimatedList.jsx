import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import './AnimatedList.css';

/**
 * AnimatedListItem
 * Individual animated wrapper for list/dropdown rows
 */
export const AnimatedListItem = ({
  children,
  className = '',
  index = 0,
  isSelected = false,
  onClick,
  ...props
}) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10, scale: 0.98 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1]
          }
        },
        exit: {
          opacity: 0,
          y: -8,
          scale: 0.98,
          transition: { duration: 0.15, ease: 'easeIn' }
        }
      }}
      className={`animated-list-item ${isSelected ? 'selected' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </motion.div>
  );
};

AnimatedListItem.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  index: PropTypes.number,
  isSelected: PropTypes.bool,
  onClick: PropTypes.func
};

/**
 * AnimatedList
 * React Bits Animated List Component
 * Provides staggered entrance, smooth spring transitions, keyboard navigation, and fading scroll masks.
 */
export const AnimatedList = forwardRef(function AnimatedList(
  {
    children,
    items,
    renderItem,
    className = '',
    style = {},
    showGradients = false,
    enableArrowNavigation = false,
    displayScrollbar = true,
    staggerDelay = 0.04,
    onItemSelect,
    selectedIndex: controlledSelectedIndex,
    role,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden,
    'data-lenis-prevent': dataLenisPrevent,
    ...props
  },
  forwardedRef
) {
  const localRef = useRef(null);
  const containerRef = forwardedRef || localRef;

  const [internalSelectedIndex, setInternalSelectedIndex] = useState(
    controlledSelectedIndex ?? -1
  );

  const selectedIndex = controlledSelectedIndex ?? internalSelectedIndex;

  const childElements = children
    ? React.Children.toArray(children).filter(Boolean)
    : [];

  const totalCount = items ? items.length : childElements.length;

  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 4);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 4);
  }, [containerRef]);

  useEffect(() => {
    handleScroll();
  }, [totalCount, handleScroll]);

  const handleKeyDown = (e) => {
    if (!enableArrowNavigation || totalCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setInternalSelectedIndex((prev) => {
        const next = prev < totalCount - 1 ? prev + 1 : 0;
        if (onItemSelect && items) onItemSelect(items[next], next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setInternalSelectedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : totalCount - 1;
        if (onItemSelect && items) onItemSelect(items[next], next);
        return next;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setInternalSelectedIndex(0);
      if (onItemSelect && items) onItemSelect(items[0], 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setInternalSelectedIndex(totalCount - 1);
      if (onItemSelect && items) onItemSelect(items[totalCount - 1], totalCount - 1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      if (onItemSelect && items) {
        e.preventDefault();
        onItemSelect(items[selectedIndex], selectedIndex);
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.01
      }
    }
  };

  return (
    <div
      className={`animated-list-wrapper ${showGradients ? 'with-gradients' : ''} ${className}`}
      style={style}
    >
      {showGradients && canScrollUp && (
        <div className="animated-list-gradient top" aria-hidden="true" />
      )}

      <motion.div
        ref={containerRef}
        className={`animated-list-scroll ${!displayScrollbar ? 'no-scrollbar' : ''}`}
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={enableArrowNavigation ? 0 : undefined}
        role={role}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
        data-lenis-prevent={dataLenisPrevent}
        {...props}
      >
        {items && renderItem ? (
          <AnimatePresence mode="popLayout">
            {items.map((item, idx) => (
              <AnimatedListItem
                key={item?.id ?? item?._id ?? idx}
                index={idx}
                isSelected={selectedIndex === idx}
                onClick={() => onItemSelect?.(item, idx)}
              >
                {renderItem(item, idx, selectedIndex === idx)}
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        ) : (
          <AnimatePresence mode="popLayout">
            {childElements.map((child, idx) => (
              <AnimatedListItem
                key={child.key ?? idx}
                index={idx}
                isSelected={selectedIndex === idx}
              >
                {child}
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        )}
      </motion.div>

      {showGradients && canScrollDown && (
        <div className="animated-list-gradient bottom" aria-hidden="true" />
      )}
    </div>
  );
});

AnimatedList.propTypes = {
  children: PropTypes.node,
  items: PropTypes.array,
  renderItem: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
  showGradients: PropTypes.bool,
  enableArrowNavigation: PropTypes.bool,
  displayScrollbar: PropTypes.bool,
  staggerDelay: PropTypes.number,
  onItemSelect: PropTypes.func,
  selectedIndex: PropTypes.number,
  role: PropTypes.string,
  'aria-label': PropTypes.string,
  'aria-hidden': PropTypes.bool,
  'data-lenis-prevent': PropTypes.oneOfType([PropTypes.bool, PropTypes.string])
};

export default AnimatedList;
