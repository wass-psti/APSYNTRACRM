import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { motionDurations } from './presets';

const loadFeatures = () => import('./domFeatures').then((module) => module.default);

/**
 * Only one Motion runtime. Use m components with LazyMotion for a smaller bundle.
 * Respect OS reduced-motion preferences, including at runtime.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: motionDurations.standard }}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
