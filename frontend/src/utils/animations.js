import gsap from 'gsap';

/**
 * Checks whether user has enabled prefers-reduced-motion in system settings.
 */
export const isReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Orchestrates hero page load reveal with deliberate timing.
 * Adheres to the frontend-design skill: a single orchestrated reveal rather than scattered effects.
 */
export const animateHeroReveal = (container) => {
  if (isReducedMotion() || !container) return null;

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.fromTo(
    container.querySelector('.hero-telemetry-strip'),
    { opacity: 0, y: -8 },
    { opacity: 1, y: 0, duration: 0.55 }
  )
  .fromTo(
    container.querySelector('.home-hero-headline'),
    { opacity: 0, y: 28 },
    { opacity: 1, y: 0, duration: 0.8 },
    '-=0.35'
  )
  .fromTo(
    container.querySelector('.home-hero-subhead'),
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.7 },
    '-=0.55'
  )
  .fromTo(
    container.querySelectorAll('.hero-action-btn'),
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 },
    '-=0.45'
  )
  .fromTo(
    container.querySelector('.home-mockup-frame'),
    { opacity: 0, y: 36, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: 0.95, ease: 'power2.out' },
    '-=0.4'
  );

  return tl;
};

/**
 * Animate incoming or outgoing chat message arrival
 */
export const animateMessageArrival = (element) => {
  if (isReducedMotion() || !element) return;
  gsap.fromTo(
    element,
    { opacity: 0, y: 10, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: 0.26, ease: 'power2.out' }
  );
};

/**
 * Modal dialog reveal animation
 */
export const animateModalEnter = (cardElement) => {
  if (isReducedMotion() || !cardElement) return;
  gsap.fromTo(
    cardElement,
    { opacity: 0, scale: 0.94, y: 14 },
    { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: 'power3.out' }
  );
};

/**
 * Empty chat state card reveal
 */
export const animateEmptyState = (cardElement) => {
  if (isReducedMotion() || !cardElement) return;
  gsap.fromTo(
    cardElement,
    { opacity: 0, scale: 0.96, y: 16 },
    { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'power3.out' }
  );
};
