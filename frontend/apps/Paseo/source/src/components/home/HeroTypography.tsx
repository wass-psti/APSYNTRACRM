import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { ButtonLink } from '../ui/ButtonLink';

const enter = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

export function HeroTypography() {
  const reduced = useReducedMotion();
  return (
    <m.div
      className="hero-copy immersive-hero-copy"
      initial={reduced ? false : 'hidden'}
      animate="visible"
      transition={{ staggerChildren: reduced ? 0 : 0.1, delayChildren: reduced ? 0 : 0.08 }}
    >
      <m.div className="eyebrow hero-eyebrow" variants={enter} transition={{ duration: 0.45 }}>
        <span className="eyebrow-dot" aria-hidden="true" />
        YOUR NEXT GAME STARTS HERE
      </m.div>
      <m.h1 variants={enter} transition={{ duration: 0.65, ease: 'easeOut' }}>
        Good games.<br /><em>Great company.</em>
      </m.h1>
      <m.p variants={enter} transition={{ duration: 0.5 }}>
        Three courts. Endless rallies. Pick your court, gather your people,
        and make every match count at Paseo de Lomboy.
      </m.p>
      <m.div variants={enter} transition={{ duration: 0.5 }} className="hero-actions">
        <ButtonLink to="/courts">Explore courts <span aria-hidden="true">↗</span></ButtonLink>
        <ButtonLink to="/how-it-works" secondary>How booking works</ButtonLink>
      </m.div>
      <m.div variants={enter} transition={{ duration: 0.5 }} className="hero-stat">
        <span className="stat-number">03</span>
        <span>Dedicated pickleball courts<br /><strong>One place to play.</strong></span>
      </m.div>
    </m.div>
  );
}
