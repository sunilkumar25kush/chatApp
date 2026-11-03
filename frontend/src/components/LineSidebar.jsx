import { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import './LineSidebar.css';

/**
 * LineSidebar — Animated vertical navigation with cursor proximity physics and line markers.
 * Compatible with React Bits spec.
 */
export default function LineSidebar({
  items = [],
  accentColor = '#A855F7',
  textColor = '#c4c4c4',
  markerColor = '#6c6c6c',
  showIndex = false,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 30,
  falloff = 'smooth',
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 20,
  fontSize = 1.1,
  smoothing = 100,
  defaultActive = 0,
  activeItem,
  onItemClick,
  className = ''
}) {
  const [internalActive, setInternalActive] = useState(defaultActive);
  const activeIndex = activeItem !== undefined ? activeItem : internalActive;

  const containerRef = useRef(null);
  const itemRefs = useRef([]);
  const [shifts, setShifts] = useState([]);
  const animFrameRef = useRef(null);

  // Sync internal active if defaultActive changes
  useEffect(() => {
    setInternalActive(defaultActive);
  }, [defaultActive]);

  // Reset itemRefs length
  itemRefs.current = itemRefs.current.slice(0, items.length);

  const calculateFalloff = useCallback((distance, radius, type) => {
    if (distance >= radius) return 0;
    const r = distance / radius; // 0 to 1
    if (type === 'linear') {
      return 1 - r;
    }
    if (type === 'gaussian') {
      return Math.exp(-0.5 * Math.pow(r / 0.45, 2));
    }
    // 'smooth' cosine falloff
    return 0.5 * (1 + Math.cos(r * Math.PI));
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!containerRef.current || !items.length) return;
        const mouseY = e.clientY;

    const newShifts = itemRefs.current.map((el) => {
      if (!el) return { shiftX: 0, scale: 1 };
      const rect = el.getBoundingClientRect();
      const itemCenterY = rect.top + rect.height / 2;
      const dist = Math.abs(mouseY - itemCenterY);

      if (dist < proximityRadius) {
        const factor = calculateFalloff(dist, proximityRadius, falloff);
        return {
          shiftX: factor * maxShift,
          scale: scaleTick ? 1 + factor * tickScale : 1
        };
      }
      return { shiftX: 0, scale: 1 };
    });

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      setShifts(newShifts);
    });
  }, [items.length, proximityRadius, falloff, maxShift, scaleTick, tickScale, calculateFalloff]);

  const handlePointerLeave = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setShifts([]);
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleClick = (index, label) => {
    if (activeItem === undefined) {
      setInternalActive(index);
    }
    onItemClick?.(index, label);
  };

  return (
    <nav
      className={`line-sidebar-container ${className}`}
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      role="tablist"
      style={{
        '--accent-color': accentColor,
        '--text-color': textColor,
        '--marker-color': markerColor,
        '--font-size': typeof fontSize === 'number' ? `${fontSize}rem` : fontSize
      }}
    >
      <ul className="line-sidebar-list" style={{ gap: `${itemGap}px` }}>
        {items.map((item, index) => {
          const isObject = typeof item === 'object' && item !== null;
          const label = isObject ? item.label || item.name || item.title : String(item);
          const badge = isObject ? item.badge || item.count : null;
          const isActive = index === activeIndex;

          const shiftData = shifts[index] || { shiftX: 0, scale: 1 };
          const shiftX = shiftData.shiftX;
          const tickScaleVal = shiftData.scale;

          const currentMarkerLength = isActive ? markerLength : Math.max(12, markerLength * 0.4);
          const currentMarkerColor = isActive ? accentColor : markerColor;
          const currentTextColor = isActive ? accentColor : textColor;

          return (
            <li key={isObject && item.id ? item.id : `${index}-${label}`} style={{ margin: 0, padding: 0 }}>
              <button
                type="button"
                ref={(el) => (itemRefs.current[index] = el)}
                className={`line-sidebar-item ${isActive ? 'is-active' : ''}`}
                onClick={() => handleClick(index, label)}
                role="tab"
                aria-selected={isActive}
                style={{
                  transform: `translateX(${shiftX}px)`,
                  transitionDuration: `${smoothing}ms`,
                  fontSize: `var(--font-size)`
                }}
              >
                {/* Marker Line */}
                {showMarker && (
                  <span
                    className="line-sidebar-marker-wrapper"
                    style={{
                      marginRight: `${markerGap + 10}px`,
                      width: `${currentMarkerLength * tickScaleVal}px`
                    }}
                  >
                    <span
                      className="line-sidebar-marker"
                      style={{
                        width: '100%',
                        backgroundColor: currentMarkerColor,
                        opacity: isActive ? 1 : 0.6
                      }}
                    />
                  </span>
                )}

                {/* Optional Index */}
                {showIndex && (
                  <span
                    className="line-sidebar-index"
                    style={{ color: isActive ? accentColor : textColor }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                )}

                {/* Item Label */}
                <span
                  className="line-sidebar-label"
                  style={{ color: currentTextColor }}
                >
                  {label}
                </span>

                {/* Optional Badge */}
                {badge !== null && badge !== undefined && (
                  <span
                    className="line-sidebar-badge"
                    style={{
                      backgroundColor: isActive ? accentColor : 'rgba(255, 255, 255, 0.1)',
                      color: isActive ? '#fff' : textColor
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

LineSidebar.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        label: PropTypes.string,
        name: PropTypes.string,
        title: PropTypes.string,
        count: PropTypes.number,
        badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
      })
    ])
  ).isRequired,
  accentColor: PropTypes.string,
  textColor: PropTypes.string,
  markerColor: PropTypes.string,
  showIndex: PropTypes.bool,
  showMarker: PropTypes.bool,
  proximityRadius: PropTypes.number,
  maxShift: PropTypes.number,
  falloff: PropTypes.oneOf(['smooth', 'linear', 'gaussian']),
  markerLength: PropTypes.number,
  markerGap: PropTypes.number,
  tickScale: PropTypes.number,
  scaleTick: PropTypes.bool,
  itemGap: PropTypes.number,
  fontSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  smoothing: PropTypes.number,
  defaultActive: PropTypes.number,
  activeItem: PropTypes.number,
  onItemClick: PropTypes.func,
  className: PropTypes.string
};

