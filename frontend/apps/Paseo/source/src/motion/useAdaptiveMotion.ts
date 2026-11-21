import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Decorative-only motion policy: preserve interactions and UI state on all devices.
 * Avoid continuous scroll tracking on compact or coarse-pointer devices.
 * React's external-store API handles viewport changes without global polling.
 */
const constrainedMediaQuery = '(max-width: 760px), (pointer: coarse)';

function subscribe(onChange: () => void) {
  // jsdom, some embedded browsers, and SSR may not provide matchMedia.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(constrainedMediaQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isConstrained() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(constrainedMediaQuery).matches;
}

export function useAdaptiveMotion() {
  const constrained = useSyncExternalStore(subscribe, isConstrained, () => true);
  const reduced = useReducedMotion();
  return !constrained && !reduced;
}
