import { courts } from '../../mocks/courts';
import { CourtCard } from './CourtCard';
import { matchesCourtSearch } from '../../utils/courtUtils';

interface CourtCatalogProps {
  searchText?: string;
}

export function CourtCatalog({ searchText = '' }: CourtCatalogProps) {
  const matchingCourts = courts.filter((court) => matchesCourtSearch(court, searchText));
  return (
    <>
      <div className="court-grid">
        {matchingCourts.map((court) => <CourtCard court={court} key={court.id} />)}
      </div>
      {matchingCourts.length === 0 && (
        <div className="catalog-empty" role="status">
          <h2>No courts match your search.</h2>
          <p>Try Court 1, Court 2, Court 3, or a different keyword.</p>
        </div>
      )}
      <p className="mock-note">Court illustrations are conceptual, not venue photographs. Prices and available times must be confirmed by the reservation service before booking.</p>
    </>
  );
}
