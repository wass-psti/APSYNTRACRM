import type { ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { motionDurations, motionPresets } from './presets';

/** Optional section entrance; content remains semantic and keyboard accessible. */
export function MotionReveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className={className}
      data-motion-reveal=""
      initial={reduced ? false : motionPresets.revealHidden}
      whileInView={motionPresets.revealVisible}
      viewport={{ once: true, amount: 0.05 }}
      transition={{ duration: motionDurations.gentle, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  );
}
