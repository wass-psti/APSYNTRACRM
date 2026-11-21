import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HowItWorksPage } from './HowItWorksPage';

function renderPage() {
  return render(<MemoryRouter><HowItWorksPage /></MemoryRouter>);
}

describe('How It Works reservation journey', () => {
  it('presents the original five booking stages in their existing order', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'How booking works.' })).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '' });
    const cards = within(steps).getAllByRole('listitem');
    expect(cards).toHaveLength(5);
    expect(cards.map(card => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Explore courts',
      'Choose a schedule',
      'Enter details and review',
      'Choose payment',
      'Receive confirmation',
    ]);
  });

  it('presents accurate readiness without obsolete FE preview claims', () => {
    renderPage();
    expect(screen.getByText(/Bookable times depend on approved prices/)).toBeInTheDocument();
    expect(screen.getByText(/View your receipt using your private access code/)).toBeInTheDocument();
    expect(screen.getAllByText('CONFIRMATION REQUIRED')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Booking journey' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('complementary', { name: 'Reservation readiness' })).toHaveTextContent('Choosing a court does not reserve it or verify a payment');
    expect(screen.queryByText(/FE-02 PREVIEW|Planned for FE-/)).not.toBeInTheDocument();
  });

  it('keeps both court-discovery calls to action on the existing /courts route', () => {
    renderPage();
    const exploreLinks = screen.getAllByRole('link', { name: /explore the three courts/i });
    expect(exploreLinks).toHaveLength(2);
    exploreLinks.forEach(link => expect(link).toHaveAttribute('href', '/courts'));
  });

  it('provides a working in-page link to the five-step journey', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /see all five steps/i })).toHaveAttribute('href', '#how-booking-steps');
    expect(document.getElementById('how-booking-steps')).toBeInTheDocument();
  });
});
