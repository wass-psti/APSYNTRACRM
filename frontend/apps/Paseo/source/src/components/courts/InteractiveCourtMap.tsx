import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { Link } from 'react-router-dom';
import { courts } from '../../mocks/courts';
import { motionSprings } from '../../motion/presets';

const courtColors = ['#2b7969', '#3c8271', '#357d76'] as const;

function CourtDrawing({
  index,
  selected,
}: {
  index: number;
  selected: boolean;
}) {
  const court = courts[index]!;
  const x = 47 + index * 278;

  return (
    <g className="interactive-court-target" data-court-id={court.id}>
      <rect className="interactive-court-frame" x={x - 12} y="46" width="248" height="299" rx="18" />
      <rect className="interactive-court-surface" x={x} y="70" width="224" height="246" rx="4" fill={courtColors[index]} />
      <rect x={x + 16} y="84" width="192" height="216" fill="none" stroke="#e3eddb" strokeWidth="3" />
      <line x1={x + 16} y1="192" x2={x + 208} y2="192" stroke="#f5f8e9" strokeWidth="5" />
      <line x1={x + 16} y1="164" x2={x + 208} y2="164" stroke="#e3eddb" strokeWidth="2" />
      <line x1={x + 16} y1="220" x2={x + 208} y2="220" stroke="#e3eddb" strokeWidth="2" />
      <line x1={x + 112} y1="84" x2={x + 112} y2="164" stroke="#e3eddb" strokeWidth="2" />
      <line x1={x + 112} y1="220" x2={x + 112} y2="300" stroke="#e3eddb" strokeWidth="2" />
      <text aria-hidden="true" className="interactive-court-number" x={x + 112} y="32" textAnchor="middle">{`0${index + 1}`}</text>
      <text className="interactive-court-label" x={x + 112} y="333" textAnchor="middle">{"Preview " + court.name}</text>
      {selected && (
        <g aria-hidden="true">
          <circle cx={x + 206} cy="91" r="17" fill="#d7ef69" />
          <path d={`M ${x + 198} 91 l 5 5 l 10 -12`} fill="none" stroke="#12372e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

/**
 * FE-IMM-03: presentation-only SVG selector.
 * The diagrams are conceptual and do not represent the venue's measured layout.
 * Selection is local; only the existing court-specific links navigate to booking.
 */
export function InteractiveCourtMap() {
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const selectedCourt = courts.find((court) => court.id === selectedCourtId);

  return (
    <section className="interactive-court-explorer" aria-labelledby="interactive-court-title" aria-describedby="interactive-court-footnote">
      <div className="interactive-court-intro">
        <div>
          <div className="eyebrow eyebrow-dark">COURT DISCOVERY / INTERACTIVE MAP</div>
          <h2 id="interactive-court-title">Choose your <em>playing ground.</em></h2>
        </div>
        <p>Explore each court in the interactive illustration. Select a court to see its details and continue into the existing booking journey.</p>
      </div>

      <div className="interactive-court-surface-wrap">
        <div className="interactive-court-topline">
          <span>THREE COURTS / ONE PLACE TO PLAY</span>
          <span aria-hidden="true">◉ INTERACTIVE VIEW</span>
        </div>
        <div className="interactive-court-canvas">
          <svg
            className="interactive-court-svg"
            viewBox="0 0 900 380"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width="900" height="380" rx="16" fill="#123e35" />
            <path d="M 0 0 L 900 380 M 900 0 L 0 380" stroke="#e4f2d0" strokeOpacity=".07" strokeWidth="2" />
            {courts.map((court, index) => (
              <CourtDrawing key={court.id} index={index} selected={selectedCourtId === court.id} />
            ))}
          </svg>
          {courts.map((court, index) => (
            <button
              key={court.id}
              type="button"
              className="interactive-court-overlay"
              data-court-id={court.id}
              style={{
                left: `${(35 + index * 278) / 900 * 100}%`,
                top: `${46 / 380 * 100}%`,
                width: `${248 / 900 * 100}%`,
                height: `${299 / 380 * 100}%`,
              }}
              aria-label={`Preview ${court.name}`}
              aria-pressed={selectedCourtId === court.id}
              aria-controls="interactive-court-selection"
              onClick={() => setSelectedCourtId(court.id)}
            />
          ))}
        </div>
        <p className="interactive-court-footnote" id="interactive-court-footnote">
          Conceptual illustration only — not a surveyed venue layout. Rates and live availability have not been verified.
        </p>
      </div>

      <div className="interactive-court-detail" id="interactive-court-selection" aria-live="polite" aria-atomic="true">
        {selectedCourt ? (
          <m.div
            key={selectedCourt.id}
            className="interactive-court-selected"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionSprings.gentle}
          >
            <div className="interactive-court-summary">
              <span className="interactive-court-selected-tag">SELECTED / DEMONSTRATION</span>
              <h3>{selectedCourt.name}</h3>
              <p>{selectedCourt.description}</p>
              <small>Price: Confirm at booking · Availability: Check schedule</small>
            </div>
            <div className="interactive-court-actions">
              <Link className="button button-secondary" to={`/courts/${selectedCourt.id}`}>View court details</Link>
              <Link className="button button-primary" to={`/book?court=${encodeURIComponent(selectedCourt.id)}`}>
                Continue with {selectedCourt.name} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </m.div>
        ) : (
          <p className="interactive-court-prompt">Select a court in the illustration above to preview its booking entry.</p>
        )}
      </div>
    </section>
  );
}
