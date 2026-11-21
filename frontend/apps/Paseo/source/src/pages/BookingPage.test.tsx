import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BookingPage } from './BookingPage';
import { BookingDraftProvider } from '../booking/BookingDraftContext';

function renderBooking(path = '/book') {
  render(<BookingDraftProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/book" element={<BookingPage />} /></Routes></MemoryRouter></BookingDraftProvider>);
}
describe('FE-01 booking entry', () => {
  it('recognizes each of the three courts', () => {
    renderBooking();
    const selector = screen.getByRole('combobox', { name: /select court/i });
    expect(selector.querySelectorAll('option')).toHaveLength(4);
    fireEvent.change(selector, { target: { value: 'court-3' } });
    expect(screen.getByText('Court 3 selected')).toBeInTheDocument();
  });
  it.each(['court-1', 'court-2', 'court-3'])('preselects the court from the %s booking URL', (courtId) => {
    renderBooking(`/book?court=${courtId}`);
    expect(screen.getByRole('combobox', { name: 'Select court' })).toHaveValue(courtId);
    expect(screen.getByText(`Court ${courtId.slice(-1)} selected`)).toBeInTheDocument();
    expect(document.querySelector('.booking-page')).toBeInTheDocument();
  });

  it('does not allow booking to proceed without a validated schedule', () => {
    renderBooking('/book?court=court-1');
    expect(screen.getByRole('button', { name: /continue to customer details/i })).toBeDisabled();
    expect(screen.getByText(/live availability, checkout/i)).toBeInTheDocument();
  });
  it('ignores unrecognized court query values', () => {
    renderBooking('/book?court=unknown');
    expect(screen.getByText('No court selected')).toBeInTheDocument();
  });
});

describe('FE-03 interactive mock scheduling', () => {
  it('shows 14 demo dates and three duration choices', () => {
    renderBooking('/book?court=court-2');
    expect(screen.getByRole('group', { name: 'Demo booking dates' }).querySelectorAll('button')).toHaveLength(14);
    expect(screen.getByRole('group', { name: 'Booking duration' }).querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByRole('note')).toHaveTextContent('Demonstration schedule only');
  });

  it('supports a mock selection and clears the selected time when duration changes', () => {
    renderBooking('/book?court=court-1');
    fireEvent.click(screen.getByRole('button', { name: '8:00 AM, mock available' }));
    expect(screen.getByText(/Valid mock selection — not reserved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to customer details/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '90 minutes' }));
    expect(screen.getByText(/Incomplete mock selection/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to customer details/i })).toBeDisabled();
  });

  it('disables occupied demo periods rather than presenting them as bookable', () => {
    renderBooking('/book?court=court-1');
    expect(screen.getByRole('button', { name: '10:00 AM, mock unavailable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '9:30 AM, mock unavailable' })).toBeDisabled();
  });

  it('clears time selection when changing courts', () => {
    renderBooking('/book?court=court-1');
    fireEvent.click(screen.getByRole('button', { name: '8:00 AM, mock available' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Select court' }), { target: { value: 'court-3' } });
    expect(screen.getByText('Court 3 selected')).toBeInTheDocument();
    expect(screen.getByText(/Incomplete mock selection/i)).toBeInTheDocument();
  });
});
