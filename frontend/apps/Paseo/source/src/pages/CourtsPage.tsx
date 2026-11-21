import { useState } from 'react';
import { CourtCatalog } from '../components/courts/CourtCatalog';
import { courts } from '../mocks/courts';
import { matchesCourtSearch } from '../utils/courtUtils';

export function CourtsPage() {
  const [searchText, setSearchText] = useState('');
  const matchingCount = courts.filter((court) => matchesCourtSearch(court, searchText)).length;

  return (
    <section className="container section courts-page">
      <header className="courts-page-intro">
        <div className="courts-page-copy">
          <div className="eyebrow eyebrow-dark">EXPLORE / COURTS</div>
          <h1 className="page-title">Find your court.</h1>
          <p className="page-lede">
            Three courts. One place to play. Explore the court previews, compare their features,
            and choose where your next game begins.
          </p>
        </div>
        <div className="courts-page-summary" role="group" aria-label="Venue overview">
          <div><strong>03</strong><span>Independent courts</span></div>
          <span className="courts-summary-divider" aria-hidden="true" />
          <div><strong>01</strong><span>Simple booking journey</span></div>
        </div>
      </header>

      <section className="courts-catalog" aria-labelledby="courts-catalog-title">
        <div className="courts-catalog-heading">
          <div>
            <div className="eyebrow eyebrow-dark">THE COURT DIRECTORY</div>
            <h2 id="courts-catalog-title">Choose your side of the game.</h2>
          </div>
          <p>Every court has its own details and booking entry. Select a court to continue with the existing reservation flow.</p>
        </div>

        <div className="catalog-controls" role="search" aria-label="Search the court directory">
          <label htmlFor="court-search">Find a court</label>
          <div className="catalog-search-field">
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 5 5" />
            </svg>
            <input
              id="court-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by court or feature"
              aria-describedby="court-result-count"
              autoComplete="off"
            />
            {searchText && (
              <button className="catalog-search-clear" type="button" onClick={() => setSearchText('')}>
                Clear
              </button>
            )}
          </div>
          <span id="court-result-count" className="catalog-result-count" role="status" aria-live="polite" aria-atomic="true">
            Showing {matchingCount} of {courts.length} courts
          </span>
        </div>

        <CourtCatalog searchText={searchText} />
      </section>
    </section>
  );
}
