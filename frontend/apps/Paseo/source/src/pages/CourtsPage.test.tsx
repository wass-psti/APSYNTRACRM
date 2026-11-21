import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CourtsPage } from './CourtsPage';
import { CourtDetailsPage } from './CourtDetailsPage';
import { HomePage } from './HomePage';

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/courts" element={<CourtsPage />} />
        <Route path="/courts/:courtId" element={<CourtDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FE-02 three-court catalog', () => {
  it('shows three independent courts with no invented rates or availability', () => {
    renderPage('/courts');
    const cards = document.querySelectorAll('.court-card');
    expect(document.querySelector('.interactive-court-explorer')).not.toBeInTheDocument();
    expect(cards).toHaveLength(3);
    for (let index = 0; index < cards.length; index++) {
      const card = within(cards[index] as HTMLElement);
      expect(card.getByRole('heading', { name: `Court ${index + 1}` })).toBeInTheDocument();
      expect(card.getByText('Awaiting venue approval')).toBeInTheDocument();
      expect(card.getByText('Check booking schedule')).toBeInTheDocument();
      expect(card.getByRole('link', { name: /select court/i })).toHaveAttribute('href', `/book?court=court-${index + 1}`);
    }
  });

  it('filters courts using a labeled search field and handles no matches', () => {
    renderPage('/courts');
    const search = screen.getByRole('searchbox', { name: 'Find a court' });
    fireEvent.change(search, { target: { value: 'Court 2' } });
    expect(document.querySelectorAll('.court-card')).toHaveLength(1);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Showing 1 of 3 courts');
    expect(screen.getByRole('heading', { name: 'Court 2' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nonexistent' } });
    expect(screen.getByText('No courts match your search.')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 3 courts')).toBeInTheDocument();
  });

  it('clears a court search and restores the full catalog', () => {
    renderPage('/courts');
    const search = screen.getByRole('searchbox', { name: 'Find a court' });
    fireEvent.change(search, { target: { value: 'Court 2' } });
    expect(document.querySelectorAll('.court-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(search).toHaveValue('');
    expect(document.querySelectorAll('.court-card')).toHaveLength(3);
    expect(screen.getByText('Showing 3 of 3 courts')).toBeInTheDocument();
  });

  it('supports selecting each court preview with a keyboard-operable button', () => {
    renderPage('/');
    const courtButton = screen.getByRole('button', { name: 'Preview Court 2' });
    expect(courtButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(courtButton);
    expect(courtButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('SELECTED / DEMONSTRATION')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue with court 2/i })).toHaveAttribute('href', '/book?court=court-2');
  });

  it.each([1, 2, 3])('shows the refined court %s detail and its matching booking destination', (courtNumber) => {
    const courtId = `court-${courtNumber}`;
    renderPage(`/courts/${courtId}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Court ${courtNumber}`);
    expect(document.querySelector('.court-details-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(`select court ${courtNumber}`, 'i') })).toHaveAttribute('href', `/book?court=${courtId}`);
    expect(screen.getByText(/No reservation has been made yet/i)).toBeInTheDocument();
  });

  it('does not claim a real court for an unknown detail URL', () => {
    renderPage('/courts/missing');
    expect(screen.getByRole('heading', { name: 'Court not found' })).toBeInTheDocument();
  });

  it('provides a homepage with court-specific links', () => {
    renderPage('/');
    expect(document.querySelector('.court-grid')).not.toBeInTheDocument();
    expect(document.querySelector('.interactive-court-explorer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /good games/i })).toBeInTheDocument();
  });
});
