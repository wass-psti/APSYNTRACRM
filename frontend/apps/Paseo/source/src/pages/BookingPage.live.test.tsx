import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDraftProvider } from "../booking/BookingDraftContext";

vi.mock("../guest/guestReservation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../guest/guestReservation")>();
  return {
    ...actual,
    configuredGuestApiBase: "https://example.test/functions/v1/pdl-guest-api",
    guestSubmissionConfigured: true,
  };
});

import { BookingPage } from "./BookingPage";

function renderBooking() {
  render(
    <BookingDraftProvider>
      <MemoryRouter initialEntries={["/book?court=court-1"]}>
        <Routes>
          <Route path="/book" element={<BookingPage />} />
        </Routes>
      </MemoryRouter>
    </BookingDraftProvider>,
  );
}

function availabilityResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe("Paseo live operating-hour availability", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("displays saved operating-hour slots without making an unapproved court bookable", async () => {
    vi.mocked(fetch).mockResolvedValue(
      availabilityResponse({
        source: "server",
        bookingEnabled: false,
        availabilityReason: "court_not_enabled",
        slots: [
          { startMinute: 480, status: "unavailable" },
          { startMinute: 510, status: "unavailable" },
          { startMinute: 540, status: "unavailable" },
        ],
      }) as Response,
    );

    renderBooking();

    const firstSlot = await screen.findByRole("button", {
      name: "8:00 AM, unavailable",
    });
    expect(firstSlot).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "8:30 AM, unavailable" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        /saved operating hours are shown, but booking remains unavailable/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Court not enabled for booking")).toBeInTheDocument();
    expect(
      screen.queryByText("Checking available times"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue to customer details/i }),
    ).toBeDisabled();
  });

  it("stops the loading state when the server reports no valid schedule", async () => {
    vi.mocked(fetch).mockResolvedValue(
      availabilityResponse(
        {
          error: "invalid_schedule",
        },
        false,
      ) as Response,
    );

    renderBooking();

    expect(
      await screen.findByText(
        "No operating schedule is available for this court and date.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Start times could not be loaded. Retry the availability check.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Checking available times for this court…"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry availability" }),
    ).toBeInTheDocument();
  });

  it("retries a failed availability lookup and displays the returned start times", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        availabilityResponse({ error: "invalid_schedule" }, false) as Response,
      )
      .mockResolvedValueOnce(
        availabilityResponse({
          source: "server",
          bookingEnabled: true,
          availabilityReason: null,
          slots: [{ startMinute: 480, status: "available" }],
        }) as Response,
      );

    renderBooking();

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry availability" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "8:00 AM, available" }),
      ).toBeEnabled();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
