import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { backendAdminFetch } = vi.hoisted(() => ({
  backendAdminFetch: vi.fn(),
}));

vi.mock("../admin/staging/StagingAdminGate", () => ({
  sharedSupabaseAdminEnabled: true,
  backendAdminEnabled: true,
  stagingAdminEnabled: false,
  backendAdminFetch,
  StagingAdminGate: ({ children }: { children: import("react").ReactNode }) =>
    children,
}));

import { AdminCalendarPage } from "./AdminCalendarPage";

const courts = [
  {
    courtId: "court-1",
    name: "Court 1",
    enabled: false,
    openMinute: 480,
    closeMinute: 1320,
  },
  {
    courtId: "court-2",
    name: "Court 2",
    enabled: false,
    openMinute: 480,
    closeMinute: 1320,
  },
  {
    courtId: "court-3",
    name: "Court 3",
    enabled: false,
    openMinute: 480,
    closeMinute: 1320,
  },
];

const initialCalendar = {
  weekdays: [
    {
      courtId: "court-1",
      weekday: 0,
      enabled: true,
      openMinute: 480,
      closeMinute: 1320,
    },
    {
      courtId: "court-2",
      weekday: 2,
      enabled: false,
      openMinute: 600,
      closeMinute: 1200,
    },
  ],
  blocks: [
    {
      id: "block-1",
      courtId: "court-1",
      date: "2026-11-24",
      startMinute: 600,
      endMinute: 720,
    },
    {
      id: "block-2",
      courtId: "court-3",
      date: "2027-01-15",
      startMinute: 780,
      endMinute: 900,
    },
  ],
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderCalendar() {
  return render(
    <MemoryRouter>
      <AdminCalendarPage />
    </MemoryRouter>,
  );
}

describe("Paseo saved court calendar", () => {
  let calendar: typeof initialCalendar;

  beforeEach(() => {
    calendar = structuredClone(initialCalendar);
    backendAdminFetch.mockReset();
    backendAdminFetch.mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (
          path === "/v1/admin/calendar" &&
          (!options.method || options.method === "GET")
        ) {
          return response(calendar);
        }
        if (path === "/v1/admin/courts") return response({ courts });
        if (options.method === "PUT") {
          const match = path.match(
            /calendar\/(court-[1-9][0-9]*)\/weekdays\/([0-6])$/,
          );
          const body = JSON.parse(String(options.body)) as {
            enabled: boolean;
            openMinute: number;
            closeMinute: number;
          };
          const targetCourt = match?.[1];
          const targetWeekday = Number(match?.[2]);
          if (!targetCourt) throw new Error("Invalid test schedule route.");
          const existing = calendar.weekdays.find(
            (item) =>
              item.courtId === targetCourt && item.weekday === targetWeekday,
          );
          if (existing) Object.assign(existing, body);
          else
            calendar.weekdays.push({
              courtId: targetCourt,
              weekday: targetWeekday,
              ...body,
            });
          return response({ updated: true });
        }
        if (
          options.method === "POST" &&
          path === "/v1/admin/calendar/maintenance"
        ) {
          const body = JSON.parse(String(options.body)) as {
            courtId: string;
            date: string;
            startMinute: number;
            endMinute: number;
          };
          const id = "block-created";
          calendar.blocks.push({ id, ...body });
          return response({ created: true, id });
        }
        if (options.method === "DELETE") {
          const id = path.split("/").at(-1);
          calendar.blocks = calendar.blocks.filter((block) => block.id !== id);
          return response({ removed: true });
        }
        return response({ error: "not_found" }, 404);
      },
    );
  });

  it("shows three court tabs and isolates saved weekly schedules by selected court", async () => {
    renderCalendar();

    const tablist = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    const tabs = within(tablist).getAllByRole("tab");
    const [courtOneTab, courtTwoTab, courtThreeTab] = tabs;
    if (!courtOneTab || !courtTwoTab || !courtThreeTab) {
      throw new Error("All three court tabs must be available.");
    }
    expect(tabs).toHaveLength(3);
    expect(courtOneTab).toHaveAccessibleName("Court 1 schedules, 1 saved");
    expect(courtTwoTab).toHaveAccessibleName("Court 2 schedules, 1 saved");
    expect(courtThreeTab).toHaveAccessibleName("Court 3 schedules, 0 saved");
    expect(courtOneTab).toHaveAttribute("aria-selected", "true");

    const courtOneList = await screen.findByRole("list", {
      name: "Saved weekly schedules",
    });
    expect(within(courtOneList).getByText("Sunday")).toBeInTheDocument();
    expect(within(courtOneList).queryByText("Tuesday")).not.toBeInTheDocument();
    expect(within(courtOneList).queryByText("Closed")).not.toBeInTheDocument();
    expect(
      within(courtOneList).getByText("8:00 AM – 10:00 PM"),
    ).toBeInTheDocument();

    fireEvent.click(courtTwoTab);
    await waitFor(() => {
      expect(courtTwoTab).toHaveAttribute("aria-selected", "true");
      expect(courtOneTab).toHaveAttribute("aria-selected", "false");
    });
    const courtTwoList = screen.getByRole("list", {
      name: "Saved weekly schedules",
    });
    expect(within(courtTwoList).getByText("Tuesday")).toBeInTheDocument();
    expect(within(courtTwoList).getByText("Closed")).toBeInTheDocument();
    expect(within(courtTwoList).queryByText("Sunday")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Weekly operating hours · Court 2" }),
    ).toBeInTheDocument();

    fireEvent.click(courtThreeTab);
    await screen.findByText(
      "No weekly operating schedules have been saved for Court 3.",
    );
    expect(
      screen.queryByRole("list", { name: "Saved weekly schedules" }),
    ).not.toBeInTheDocument();
    expect(courtThreeTab).toHaveAttribute("aria-selected", "true");

    const maintenanceList = screen.getByRole("list", {
      name: "Saved maintenance blocks",
    });
    expect(within(maintenanceList).getByText("Court 1")).toBeInTheDocument();
    expect(within(maintenanceList).getByText("Court 3")).toBeInTheDocument();
    expect(
      within(maintenanceList).getByText("10:00 AM – 12:00 PM"),
    ).toBeInTheDocument();
    expect(
      within(maintenanceList).getByText("1:00 PM – 3:00 PM"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Maintenance court" }),
    ).toHaveValue("court-1");
  });

  it("keeps maintenance targeting independent from the selected weekly schedule tab", async () => {
    renderCalendar();
    const tablist = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    fireEvent.click(
      within(tablist).getByRole("tab", {
        name: "Court 3 schedules, 0 saved",
      }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Maintenance court" }),
      { target: { value: "court-2" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add maintenance block" }),
    );

    await screen.findByText("Changes saved.");
    const maintenanceWrite = backendAdminFetch.mock.calls.find(
      ([path, options]) =>
        path === "/v1/admin/calendar/maintenance" && options?.method === "POST",
    );
    expect(maintenanceWrite).toBeDefined();
    expect(JSON.parse(String(maintenanceWrite?.[1]?.body))).toMatchObject({
      courtId: "court-2",
    });
    expect(
      within(
        screen.getByRole("list", { name: "Saved maintenance blocks" }),
      ).getByText("Court 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Weekly operating hours · Court 3" }),
    ).toBeInTheDocument();
  });

  it("supports arrow-key court tab navigation and keeps the active panel synchronized", async () => {
    renderCalendar();
    const tablist = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    const tabs = within(tablist).getAllByRole("tab");
    const [courtOneTab, courtTwoTab, courtThreeTab] = tabs;
    if (!courtOneTab || !courtTwoTab || !courtThreeTab) {
      throw new Error("All three court tabs must be available.");
    }

    courtOneTab.focus();
    fireEvent.keyDown(courtOneTab, { key: "ArrowRight" });
    await waitFor(() => {
      expect(courtTwoTab).toHaveAttribute("aria-selected", "true");
      expect(courtTwoTab).toHaveFocus();
    });
    expect(
      screen.getByRole("heading", { name: "Weekly operating hours · Court 2" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(courtTwoTab, { key: "End" });
    await waitFor(() => {
      expect(courtThreeTab).toHaveAttribute("aria-selected", "true");
      expect(courtThreeTab).toHaveFocus();
    });
  });

  it("edits the selected court record and preserves another court's saved hours", async () => {
    renderCalendar();
    const tablist = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    const courtTwoTab = within(tablist).getByRole("tab", {
      name: "Court 2 schedules, 1 saved",
    });
    fireEvent.click(courtTwoTab);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 2 Tuesday schedule",
      }),
    );
    await waitFor(() => {
      expect(courtTwoTab).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("combobox", { name: "Operating weekday" }),
      ).toHaveValue("2");
      expect(
        screen.getByRole("combobox", { name: "Opening time" }),
      ).toHaveValue("600");
      expect(
        screen.getByRole("combobox", { name: "Closing time" }),
      ).toHaveValue("1200");
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Opening time" }), {
      target: { value: "630" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Update weekday schedule" }),
    );
    await screen.findByText("Changes saved.");

    expect(backendAdminFetch).toHaveBeenCalledWith(
      "/v1/admin/calendar/court-2/weekdays/2",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(
      calendar.weekdays.find(
        (item) => item.courtId === "court-2" && item.weekday === 2,
      ),
    ).toMatchObject({ openMinute: 630, closeMinute: 1200, enabled: false });
    expect(
      calendar.weekdays.find(
        (item) => item.courtId === "court-1" && item.weekday === 0,
      ),
    ).toMatchObject({ openMinute: 480, closeMinute: 1320, enabled: true });
  });

  it("creates a schedule for the selected court without changing another court", async () => {
    const view = renderCalendar();
    const tablist = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    const tabs = within(tablist).getAllByRole("tab");
    const courtThreeTab = tabs[2];
    if (!courtThreeTab) throw new Error("Court 3 tab is not available.");

    fireEvent.click(courtThreeTab);
    await screen.findByText(
      "No weekly operating schedules have been saved for Court 3.",
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Operating weekday" }),
      {
        target: { value: "3" },
      },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Opening time" }), {
      target: { value: "720" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Closing time" }), {
      target: { value: "1080" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save weekday schedule" }),
    );

    await screen.findByText("Changes saved.");
    expect(backendAdminFetch).toHaveBeenCalledWith(
      "/v1/admin/calendar/court-3/weekdays/3",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(
      within(
        screen.getByRole("list", { name: "Saved weekly schedules" }),
      ).getByText("Wednesday"),
    ).toBeInTheDocument();
    expect(
      calendar.weekdays.find(
        (item) => item.courtId === "court-1" && item.weekday === 0,
      ),
    ).toMatchObject({ openMinute: 480, closeMinute: 1320 });

    view.unmount();
    renderCalendar();
    const refreshedTabs = await screen.findByRole("tablist", {
      name: "Court schedule tabs",
    });
    fireEvent.click(
      within(refreshedTabs).getByRole("tab", {
        name: "Court 3 schedules, 1 saved",
      }),
    );
    expect(await screen.findByText("12:00 PM – 6:00 PM")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Saved weekly schedules" }),
      ).getByText("Wednesday"),
    ).toBeInTheDocument();
  });

  it("loads, updates, and retrieves a saved weekday after a page refresh", async () => {
    const view = renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 1 Sunday schedule",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Court 1 schedules, 1 saved" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("combobox", { name: "Operating weekday" }),
      ).toHaveValue("0");
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Opening time" }), {
      target: { value: "540" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Update weekday schedule" }),
    );

    await screen.findByText("Changes saved.");
    const weeklyList = screen.getByRole("list", {
      name: "Saved weekly schedules",
    });
    expect(
      within(weeklyList).getByText("9:00 AM – 10:00 PM"),
    ).toBeInTheDocument();
    expect(backendAdminFetch).toHaveBeenCalledWith(
      "/v1/admin/calendar/court-1/weekdays/0",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(backendAdminFetch).toHaveBeenCalledWith(
      "/v1/admin/calendar",
      expect.objectContaining({ cache: "no-store" }),
    );

    view.unmount();
    renderCalendar();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 1 Sunday schedule",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Opening time" }),
      ).toHaveValue("540");
      expect(
        screen.getByRole("combobox", { name: "Closing time" }),
      ).toHaveValue("1320");
    });
  });

  it("reloads persisted values when editing the already selected schedule again", async () => {
    renderCalendar();

    const editButton = await screen.findByRole("button", {
      name: "Edit Court 1 Sunday schedule",
    });
    fireEvent.click(editButton);
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Opening time" }),
      ).toHaveValue("480");
      expect(
        screen.getByRole("combobox", { name: "Closing time" }),
      ).toHaveValue("1320");
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Opening time" }), {
      target: { value: "540" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Closing time" }), {
      target: { value: "1260" },
    });

    fireEvent.click(editButton);

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Opening time" }),
      ).toHaveValue("480");
      expect(
        screen.getByRole("combobox", { name: "Closing time" }),
      ).toHaveValue("1320");
    });
  });

  it("rejects an invalid opening and closing range before sending an update", async () => {
    renderCalendar();
    // Use the actual persisted Sunday schedule, after the initial readback
    // and editor hydration have completed, rather than the default weekday.
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 1 Sunday schedule",
      }),
    );
    const opening = screen.getByRole("combobox", { name: "Opening time" });
    const closing = screen.getByRole("combobox", { name: "Closing time" });
    const update = screen.getByRole("button", { name: "Update weekday schedule" });
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Operating weekday" })).toHaveValue("0");
      expect(opening).toHaveValue("480");
      expect(closing).toHaveValue("1320");
      expect(update).toBeEnabled();
    });
    fireEvent.change(opening, { target: { value: "780" } });
    expect(opening).toHaveValue("780");
    fireEvent.change(closing, { target: { value: "720" } });
    await waitFor(() => {
      expect(opening).toHaveValue("780");
      expect(closing).toHaveValue("720");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Closing time must be later than opening time.",
      );
      expect(update).toBeDisabled();
    });
    fireEvent.click(update);
    // Also exercise the form handler directly, independently of the button.
    const form = update.closest("form");
    if (!form) throw new Error("Expected the weekday schedule form.");
    fireEvent.submit(form);
    expect(
      backendAdminFetch.mock.calls.some(
        ([, options]) => options?.method === "PUT",
      ),
    ).toBe(false);
    expect(
      within(
        screen.getByRole("list", { name: "Saved weekly schedules" }),
      ).getByText("8:00 AM – 10:00 PM"),
    ).toBeInTheDocument();
  });

  it("shows the backend validation reason without changing the saved schedule", async () => {
    const originalFetch = backendAdminFetch.getMockImplementation();
    if (!originalFetch)
      throw new Error("Calendar test fetch was not configured.");
    backendAdminFetch.mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (options.method === "PUT") {
          return response({ error: "invalid_weekday_schedule" }, 422);
        }
        return originalFetch(path, options);
      },
    );

    renderCalendar();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 1 Sunday schedule",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update weekday schedule" }),
    );

    expect(
      await screen.findByText(
        "Choose an opening time earlier than the closing time.",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Saved weekly schedules" }),
      ).getByText("8:00 AM – 10:00 PM"),
    ).toBeInTheDocument();
  });

  it("explains a backend booking conflict and keeps the saved schedule visible", async () => {
    const originalFetch = backendAdminFetch.getMockImplementation();
    if (!originalFetch)
      throw new Error("Calendar test fetch was not configured.");
    backendAdminFetch.mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (options.method === "PUT") {
          return response({ error: "weekday_booking_conflict" }, 422);
        }
        return originalFetch(path, options);
      },
    );

    renderCalendar();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit Court 1 Sunday schedule",
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Opening time" }), {
      target: { value: "540" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Update weekday schedule" }),
    );

    expect(
      await screen.findByText(
        "This change conflicts with an existing pending or confirmed booking. Choose hours that keep the booking within the schedule.",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Saved weekly schedules" }),
      ).getByText("8:00 AM – 10:00 PM"),
    ).toBeInTheDocument();
  });

  it("allows a refresh retry after the initial calendar readback fails", async () => {
    const originalFetch = backendAdminFetch.getMockImplementation();
    if (!originalFetch)
      throw new Error("Calendar test fetch was not configured.");
    let failFirstCalendarRead = true;
    backendAdminFetch.mockImplementation(
      async (path: string, options: RequestInit = {}) => {
        if (path === "/v1/admin/calendar" && failFirstCalendarRead) {
          failFirstCalendarRead = false;
          return response({ error: "temporary_unavailable" }, 503);
        }
        return originalFetch(path, options);
      },
    );

    renderCalendar();

    await screen.findByText("Calendar could not be loaded. Please refresh.");
    expect(
      screen.getByText(
        "Saved schedules could not be loaded. Refresh to try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Maintenance blocks could not be loaded. Refresh to try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No weekly operating schedules have been saved."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No maintenance blocks have been saved."),
    ).not.toBeInTheDocument();
    const refreshButton = screen.getByRole("button", {
      name: "Refresh saved schedules",
    });
    expect(refreshButton).toBeEnabled();
    fireEvent.click(refreshButton);

    await screen.findByText("Calendar refreshed.");
    const weeklyList = screen.getByRole("list", {
      name: "Saved weekly schedules",
    });
    expect(within(weeklyList).getByText("Sunday")).toBeInTheDocument();
  });

  it("refreshes the complete calendar snapshot and removes a saved block from the list", async () => {
    renderCalendar();

    const maintenanceList = await screen.findByRole("list", {
      name: "Saved maintenance blocks",
    });
    fireEvent.click(
      within(maintenanceList).getByRole("button", {
        name: "Remove Court 1 maintenance on 2026-11-24",
      }),
    );

    await waitFor(() => {
      expect(
        within(
          screen.getByRole("list", { name: "Saved maintenance blocks" }),
        ).queryByText("10:00 AM – 12:00 PM"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("Changes saved.")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh saved schedules" }),
    );
    await screen.findByText("Calendar refreshed.");
    expect(
      backendAdminFetch.mock.calls.filter(
        ([path]) => path === "/v1/admin/calendar",
      ),
    ).toHaveLength(3);
  });
});
