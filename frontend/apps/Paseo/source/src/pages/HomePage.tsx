import { BookingSteps } from '../components/home/BookingSteps';
import { InteractiveCourtMap } from '../components/courts/InteractiveCourtMap';
import { CinematicHero } from '../components/home/CinematicHero';
import { MotionReveal } from '../motion/MotionReveal';

export function HomePage() {
  return (
    <>
      <CinematicHero />
      <div className="intro-band"><div className="container intro-inner"><span>BUILT FOR THE LOVE OF THE GAME</span><span>COME FOR THE MATCH. STAY FOR THE MOMENTS.</span><span aria-hidden="true">✳</span></div></div>
      <MotionReveal className="home-discovery-reveal"><section className="container section courts-section" aria-labelledby="home-courts-title">
        <div className="section-heading"><div><div className="eyebrow eyebrow-dark">01 / FIND YOUR COURT</div><h2 id="home-courts-title">Three courts.<br /><em>All yours to explore.</em></h2></div><p>Explore each court and continue to booking. Availability and approved rates are confirmed by the reservation service.</p></div>
        <InteractiveCourtMap />
      </section></MotionReveal>
      <BookingSteps />
    </>
  );
}
