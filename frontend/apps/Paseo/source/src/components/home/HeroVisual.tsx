import { useScroll, useTransform, type MotionValue } from 'motion/react';
import * as m from 'motion/react-m';
import { useRef } from 'react';
import { useAdaptiveMotion } from '../../motion/useAdaptiveMotion';

function CourtArtwork({ depth, animated }: { depth?: MotionValue<number>; animated: boolean }) {
  return (
    <m.div
      className="hero-art immersive-hero-art"
      role="img"
      aria-label="Stylized illustration of a pickleball court, not a real venue photo"
      {...(depth ? { style: { y: depth } } : {})}
      initial={animated ? { opacity: 0, scale: 0.95, rotate: -2 } : false}
      {...(animated ? { animate: { opacity: 1, scale: 1, rotate: 2 } } : {})}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <div className="art-label"><span className="art-label-dot" /> THE COURT IS CALLING</div>
      <div className="court-illustration">
        <div className="court-boundary">
          <div className="court-net" />
          <div className="court-center" />
          <div className="court-kitchen left" />
          <div className="court-kitchen right" />
        </div>
      </div>
      <div className="art-caption"><span>PLAY MORE.</span><span>SCROLL LESS. ↗</span></div>
      <span className="ball" aria-hidden="true" />
    </m.div>
  );
}

/** Scroll subscriptions are mounted only when the decorative parallax is enabled. */
function ParallaxArtwork() {
  const target = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target,
    offset: ['start end', 'end start'],
  });
  const depth = useTransform(scrollYProgress, [0, 1], [-10, 10]);

  return <div ref={target} className="hero-parallax-anchor" data-parallax="enabled">
    <CourtArtwork depth={depth} animated />
  </div>;
}

/** The court remains visible, accurate and operable without continuous scroll effects. */
export function HeroVisual() {
  const allowRichMotion = useAdaptiveMotion();

  return (
    <div className="immersive-hero-scene" data-motion-quality={allowRichMotion ? 'full' : 'balanced'}>
      <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
      <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
      {allowRichMotion ? <ParallaxArtwork /> : <CourtArtwork animated={false} />}
      <div className="hero-scene-note" aria-hidden="true">
        <span>THE GAME</span>
        <span>LOOKS GOOD FROM HERE.</span>
      </div>
    </div>
  );
}
