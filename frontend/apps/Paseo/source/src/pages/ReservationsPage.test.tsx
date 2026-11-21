import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ReservationsPage } from './ReservationsPage';

function LocationOutput() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}{location.search}{location.hash}</div>;
}

function renderReservations() {
  return render(
    <MemoryRouter initialEntries={['/reservations']}>
      <ReservationsPage />
      <LocationOutput />
    </MemoryRouter>,
  );
}

describe('Reservations customer dashboard', () => {
  it('shows an honest empty state with no fabricated reservation inventory', () => {
    renderReservations();
    expect(screen.getByRole('heading', { level: 1, name: 'My bookings.' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Reservation history unavailable here');
    expect(screen.getByRole('heading', { level: 2, name: 'Your reservations' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No reservation list available.');
    expect(screen.getByRole('link', { name: /explore courts and times/i })).toHaveAttribute('href', '/book');
    expect(screen.queryByText(/DEMO-PAST|DEMO-UPCOMING|Sample reservation examples/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show sample reservations/i })).not.toBeInTheDocument();
  });

  it('enables guest receipt navigation only when both existing input rules pass', () => {
    renderReservations();
    const reservationId = screen.getByRole('textbox', { name: 'Reservation ID' });
    const accessCode = screen.getByLabelText('Private receipt access code');
    const submit = screen.getByRole('button', { name: /retrieve receipt/i });
    expect(submit).toBeDisabled();

    fireEvent.change(reservationId, { target: { value: 'short' } });
    fireEvent.change(accessCode, { target: { value: 'private-access-code-1234' } });
    expect(submit).toBeDisabled();

    fireEvent.change(reservationId, { target: { value: 'BOOKING_123' } });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest('form')!);
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/reservation/receipt/BOOKING_123#access=private-access-code-1234',
    );
  });

  it('preserves receipt lookup guidance and secure password input semantics', () => {
    renderReservations();
    expect(screen.getByText(/Live reservation receipts are not yet connected/)).toBeInTheDocument();
    expect(screen.getByLabelText('Private receipt access code')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Reservation ID')).toHaveAttribute('minLength', '8');
    expect(screen.getByLabelText('Private receipt access code')).toHaveAttribute('minLength', '16');
  });
});
