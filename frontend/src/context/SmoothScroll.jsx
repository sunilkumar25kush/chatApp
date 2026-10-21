import { createContext, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import gsap from 'gsap';
import 'lenis/dist/lenis.css';

const SmoothScrollContext = createContext(null);

export function SmoothScrollProvider({ children }) {
  const lenisRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    // Check for user's reduced-motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    // Initialize Lenis with refined inertia settings
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential deceleration
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      autoResize: true,
    });

    lenisRef.current = lenis;

    // Sync Lenis with GSAP ticker for a single unified animation frame loop
    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Manage route changes: reset scroll to top on website page navigation
  // and manage window scroll state when entering the fixed desktop chat
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    if (location.pathname === '/chat') {
      // Chat is a full-screen app container with internal scrolling panes
      lenis.stop();
    } else {
      lenis.start();
      lenis.scrollTo(0, { immediate: true });
    }
  }, [location.pathname]);

  return (
    <SmoothScrollContext.Provider value={{ lenis: lenisRef.current }}>
      {children}
    </SmoothScrollContext.Provider>
  );
}

SmoothScrollProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useSmoothScroll() {
  return useContext(SmoothScrollContext);
}
