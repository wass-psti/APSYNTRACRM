import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { motionPresets, motionSprings } from '../../motion/presets';

export function ButtonLink({ to, children, secondary = false }: { to: string; children: ReactNode; secondary?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Link className={`button motion-button ${secondary ? 'button-secondary' : 'button-primary'}`} to={to}>
      <m.span
        className="motion-button-inner"
        {...(reduced ? {} : { whileHover: motionPresets.buttonHover, whileTap: motionPresets.buttonPress })}
        transition={motionSprings.interactive}
      >
        {children}
      </m.span>
    </Link>
  );
}
