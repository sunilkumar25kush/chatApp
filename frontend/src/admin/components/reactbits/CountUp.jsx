'use client';

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * CountUp — React Bits Component
 * Smooth high-performance number animation for dashboard KPI metrics.
 * Uses requestAnimationFrame with cubic ease-out.
 */
export default function CountUp({
  to = 0,
  from = 0,
  duration = 1.2,
  separator = ',',
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) {
  const [value, setValue] = useState(from);
  const startTimeRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    const endValue = Number(to) || 0;
    const startValue = Number(from) || 0;
    const durationMs = duration * 1000;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / durationMs, 1);
      const easedProgress = easeOutCubic(progress);
      const current = startValue + (endValue - startValue) * easedProgress;

      setValue(current);

      if (progress < 1) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    startTimeRef.current = null;
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [to, from, duration]);

  const formattedValue = Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`admin-countup ${className}`}>
      {prefix}
      {separator ? formattedValue : formattedValue.replace(/,/g, '')}
      {suffix}
    </span>
  );
}

CountUp.propTypes = {
  to: PropTypes.number.isRequired,
  from: PropTypes.number,
  duration: PropTypes.number,
  separator: PropTypes.string,
  decimals: PropTypes.number,
  prefix: PropTypes.string,
  suffix: PropTypes.string,
  className: PropTypes.string,
};
