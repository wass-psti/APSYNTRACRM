import { getCourtNumber } from '../../utils/courtUtils';

interface CourtIllustrationProps {
  courtId: string;
  large?: boolean;
}

/** Decorative CSS court drawings, not photographs of the venue. */
export function CourtIllustration({ courtId, large = false }: CourtIllustrationProps) {
  const number = getCourtNumber(courtId);
  return (
    <div className={`card-art card-art-${Number(number)} ${large ? 'court-art-large' : ''}`} aria-hidden="true">
      <span className="card-index">COURT {number} / 03</span>
      <span className="court-mini" />
      <span className="art-disclaimer">ILLUSTRATIVE COURT ART</span>
    </div>
  );
}
