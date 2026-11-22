import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../guest/guestReservation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../guest/guestReservation")>();
  return {
    ...actual,
    guestSubmissionConfigured: true,
    fetchGuestReceipt: vi.fn(),
  };
});

import { fetchGuestReceipt } from "../guest/guestReservation";
import { GuestReservationReceiptPage } from "./GuestReservationReceiptPage";

const receipt = {
  reservationId: "12345678-1234-4234-8234-123456789abc",
  receiptAccessToken: "receipt-access-token-123456",
  createdAt: "2026-12-01T08:15:00+08:00",
  courtId: "court-1",
  date: "2026-12-01",
  startMinute: 480,
  durationMinutes: 90,
  fullName: "Sample Guest",
  email: "guest@example.com",
  phone: "09171234567",
  amountMinor: 22500,
  currency: "PHP" as const,
  paymentMethod: "gcash" as const,
  bookingStatus: "pending_verification" as const,
  paymentStatus: "submitted" as const,
};

beforeEach(() => {
  window.location.hash = "#access=receipt-access-token-123456";
  vi.mocked(fetchGuestReceipt).mockResolvedValue(receipt);
});

describe("guest reservation confirmation duration", () => {
  it("shows the hour duration first and retains the minute equivalent from the server receipt", async () => {
    render(
      <MemoryRouter
        initialEntries={[`/reservation/receipt/${receipt.reservationId}`]}
      >
        <Routes>
          <Route
            path="/reservation/receipt/:reservationId"
            element={<GuestReservationReceiptPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("1.5 hours")).toBeInTheDocument();
    expect(screen.getByText("(90 minutes)")).toBeInTheDocument();
    expect(fetchGuestReceipt).toHaveBeenCalledWith(
      receipt.reservationId,
      "receipt-access-token-123456",
    );
  });
});
