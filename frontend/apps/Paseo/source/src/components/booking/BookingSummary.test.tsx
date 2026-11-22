import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingSummary } from "./BookingSummary";

describe("customer booking summary duration", () => {
  it.each([
    [60, "1 hour", "(60 minutes)"],
    [90, "1.5 hours", "(90 minutes)"],
    [120, "2 hours", "(120 minutes)"],
  ])(
    "shows %s minutes as %s with the exact minute value",
    (durationMinutes, hours, minutes) => {
      render(
        <BookingSummary
          schedule={{
            courtId: "court-1",
            date: "2026-12-01",
            startMinute: 480,
            durationMinutes,
          }}
        />,
      );
      const summary = screen.getByLabelText("Draft booking summary");
      expect(summary).toHaveTextContent(`Duration: ${hours} ${minutes}`);
    },
  );
});
