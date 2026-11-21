import { HeroTypography } from './HeroTypography';
import { HeroVisual } from './HeroVisual';

export function CinematicHero() {
  return (
    <section className="hero immersive-hero">
      <div className="immersive-hero-grid" aria-hidden="true" />
      <div className="container hero-layout">
        <HeroTypography />
        <HeroVisual />
      </div>
      <div className="immersive-hero-bottom" aria-hidden="true">
        <span>COURT CULTURE / GOOD ENERGY / MORE RALLIES</span>
        <span>PASEO DE LOMBOY</span>
      </div>
    </section>
  );
}
