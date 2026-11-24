import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = require("axe-core").source;
const executablePath =
  process.env.CHROMIUM_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Chromium.app/Contents/MacOS/Chromium"
    : chromium.executablePath());
const testPort = process.env.TT_TEST_PORT || "5189";
const baseUrl =
  process.env.TT_TEST_URL ||
  `http://127.0.0.1:${testPort}/frontend/tests/fixtures/time-tracker-component.html`;
const verifiedResult = {
  status: "VERIFIED_READ",
  access: { moduleRole: "Employee", attendanceWritesAccepted: false },
  records: [],
  active: null,
  otRequests: [],
};

let devServer = null;
let browser = null;

async function ensureViteServer() {
  try {
    const response = await fetch(baseUrl);
    if (
      response.ok &&
      (await response.text()).includes(
        "<title>TimeTracker Application Fixture</title>",
      )
    )
      return;
  } catch {
    // Start Vite when no local server is already available.
  }
  if (process.env.TT_TEST_URL) {
    throw new Error(
      "TT_TEST_URL is not reachable; refusing to start another test server.",
    );
  }
  devServer = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      testPort,
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (devServer.exitCode !== null) {
      throw new Error("Vite exited before the TimeTracker fixture loaded.");
    }
    try {
      const response = await fetch(baseUrl);
      if (
        response.ok &&
        (await response.text()).includes(
          "<title>TimeTracker Application Fixture</title>",
        )
      )
        return;
    } catch {
      // Wait for Vite to become ready.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the TimeTracker Vite fixture.");
}

try {
  await ensureViteServer();
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__timeTrackerFixtureReady === true);
  // The reference-led header shows “TimeTracker”; the Clock page uses its
  // live greeting as the prominent heading rather than a redundant "Clock".
  await page
    .getByRole("heading", { level: 1, name: "TimeTracker", exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "Clock" }).waitFor();
  await page
    .getByRole("heading", { name: /^Good (morning|afternoon|evening),$/ })
    .waitFor();
  await page.locator("#tt-clock-hours").waitFor();
  // CP-TT-OT-UX-01: native time controls retain HH:mm values while the
  // browser locale handles the visible clock format and the preview stays live.
  const twelveHour = await page.evaluate(async () => {
    const { formatTimeTrackerClock, formatTimeTrackerDateTime } =
      await import("/frontend/time-tracker-time-format.js");
    const { renderTimeTrackerOvertime, updateTimeTrackerOvertimePreview } =
      await import("/frontend/time-tracker-overtime.js");
    const { renderTimeTrackerAdminEditor } =
      await import("/frontend/time-tracker-record-management.js");
    const host = document.createElement("div");
    host.innerHTML = renderTimeTrackerOvertime({
      now: new Date("2026-11-20T04:00:00Z"),
      modalOpen: true,
      requests: [
        {
          id: "test-ot",
          name: "Test Employee",
          date: "2026-11-20",
          status: "Submitted",
          start: "18:00",
          end: "20:00",
          durationMinutes: 120,
          task: "Acceptance fixture",
        },
      ],
    });
    const otStart = host.querySelector("#tt-ot-start");
    const otEnd = host.querySelector("#tt-ot-end");
    const otReason = host.querySelector("#tt-ot-reason");
    const otForm = host.querySelector("#tt-ot-form");
    const otDetails = host.querySelector(".tt-ot-detail")?.textContent;
    otStart.value = "18:00";
    otEnd.value = "20:00";
    otReason.value = "Emergency maintenance work";
    updateTimeTrackerOvertimePreview(otForm);
    const otDuration = host.querySelector(
      "[data-tt-ot-duration-value]",
    )?.textContent;
    const otProgress = host.querySelector(
      "[data-tt-ot-duration-progress]",
    )?.value;
    const otReasonCount = host.querySelector(
      "[data-tt-ot-reason-count]",
    )?.textContent;
    const otStartType = otStart?.type;
    const otStartValue = otStart?.value;
    host.innerHTML = renderTimeTrackerAdminEditor({
      timeOnly: true,
      editor: {
        mode: "single",
        records: [
          {
            ownerId: "cloud:fixture",
            ownerName: "Test Employee",
            clockIn: { timestamp: "2026-11-20T10:05:00.000Z" },
            clockOut: null,
          },
        ],
      },
    });
    const adminInput = host.querySelector('input[name="clockInAt"]');
    return {
      midnight: formatTimeTrackerClock("2026-11-20T16:00:00Z"),
      noon: formatTimeTrackerClock("2026-11-20T04:00:00Z"),
      date: formatTimeTrackerDateTime("2026-11-20T10:05:00Z"),
      otStartType,
      otStartValue,
      otDetails,
      otDuration,
      otProgress,
      otReasonCount,
      adminType: adminInput?.type,
      adminValue: adminInput?.value,
    };
  });
  assert.equal(twelveHour.midnight, "12:00 AM");
  assert.equal(twelveHour.noon, "12:00 PM");
  assert.equal(twelveHour.date, "Nov 20, 2026, 06:05 PM");
  assert.equal(twelveHour.otStartType, "time");
  assert.equal(twelveHour.otStartValue, "18:00");
  assert.match(twelveHour.otDetails, /06:00 PM/);
  assert.equal(twelveHour.otDuration, "2 hr 00 min");
  assert.equal(twelveHour.otProgress, 120);
  assert.equal(twelveHour.otReasonCount, "26 / 500");
  assert.equal(twelveHour.adminType, "text");
  assert.equal(twelveHour.adminValue, "2026-11-20 06:05 PM");

  const desktopLayout = await page.evaluate(() => {
    const app = document.querySelector(".fm1-app");
    const header = document.querySelector(".tt-app-header");
    const navScroll = document.querySelector(".tt-navigation-scroll");
    const clockLayout = document.querySelector(".tt-command-layout");
    const sessionCard = document.querySelector(".tt-attendance-console");
    const clockFace = document.querySelector(".tt-clock-face");
    const brandIcon = header.querySelector(".tt-brand-icon");
    const shortcut = header.querySelector(".tt-header-link");
    const activeTab = document.querySelector(".tt-nav-tab.is-current");
    return {
      appDisplay: getComputedStyle(app).display,
      headerRadius: getComputedStyle(header).borderRadius,
      brandColor: getComputedStyle(brandIcon).backgroundColor,
      roleLabel: header.querySelector(".tt-header-role").textContent,
      roleInitials: header.querySelector(".tt-header-avatar").textContent,
      refreshText: header.querySelector(".tt-header-refresh").textContent,
      shortcutColor: getComputedStyle(shortcut).backgroundColor,
      activeUnderline: getComputedStyle(activeTab).borderBottomColor,
      headerBackground: getComputedStyle(header).backgroundColor,
      navOverflow: getComputedStyle(navScroll).overflowX,
      clockLayout: getComputedStyle(clockLayout).flexDirection,
      sessionCardBackground: getComputedStyle(sessionCard).backgroundColor,
      clockSize: getComputedStyle(clockFace).fontSize,
      clockWeight: getComputedStyle(clockFace).fontWeight,
      statsCount: document.querySelector(".tt-session-summary").children.length,
      badges: clockLayout.querySelectorAll(".tt-idle-badge").length,
      compact: clockLayout.classList.contains("tt-clock-compact"),
      root: document.querySelector(".tt-native")?.className,
    };
  });
  // These assertions intentionally validate the new white, centered,
  // accessible TimeTracker layout instead of the retired gradient dashboard.
  assert.equal(desktopLayout.appDisplay, "flex");
  assert.equal(desktopLayout.headerRadius, "16px 16px 0px 0px");
  assert.equal(desktopLayout.brandColor, "rgb(83, 74, 183)");
  assert.equal(desktopLayout.roleLabel, "Employee");
  assert.equal(desktopLayout.roleInitials, "E");
  assert.equal(desktopLayout.refreshText, "");
  assert.equal(desktopLayout.shortcutColor, "rgb(238, 235, 252)");
  assert.equal(desktopLayout.activeUnderline, "rgb(83, 74, 183)");
  assert.equal(desktopLayout.headerBackground, "rgb(255, 255, 255)");
  assert.equal(desktopLayout.navOverflow, "auto");
  assert.equal(desktopLayout.clockLayout, "column");
  assert.equal(desktopLayout.sessionCardBackground, "rgb(230, 241, 251)");
  assert.equal(desktopLayout.clockSize, "52px");
  assert.equal(desktopLayout.clockWeight, "600");
  assert.equal(desktopLayout.statsCount, 2);
  assert.equal(desktopLayout.badges, 1);
  assert.equal(desktopLayout.compact, true);
  assert.equal(desktopLayout.root, "tt-native");

  await page.addScriptTag({ content: axeSource });
  const checkAccessibility = async (label) => {
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    assert.equal(
      result.violations.length,
      0,
      label +
        " accessibility violations: " +
        JSON.stringify(
          result.violations.map((item) => ({
            id: item.id,
            impact: item.impact,
            nodes: item.nodes.map((node) => ({
              target: node.target,
              html: node.html,
              summary: node.failureSummary,
              checks: node.any.map((check) => ({
                message: check.message,
                data: check.data,
              })),
            })),
          })),
        ),
    );
  };
  await checkAccessibility("TimeTracker clock view");

  // CP-TT-CLOCK-STATE: exercise both actual responsive Clock layouts with
  // a synthetic signed snapshot, without issuing any attendance writes.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() =>
    window.__timeTrackerRender({
      result: {
        status: "VERIFIED_READ",
        access: {
          moduleRole: "Employee",
          employeeDepartment: "Engineering",
          attendanceWritesAccepted: true,
        },
        records: [],
        active: null,
        otRequests: [],
      },
      now: new Date("2026-11-24T06:07:00Z"),
      locationPreference: "Office-Base Duty",
    }),
  );
  const noteField = page.locator("#tt-note");
  const badge = page.locator(".tt-idle-badge");
  const clockFace = page.locator(".tt-clock-face");
  const readClockSize = (el) => parseFloat(getComputedStyle(el).fontSize);
  assert.equal(await noteField.isVisible(), false);
  assert.equal(await page.locator("#tt-session-progress").count(), 0);
  assert.equal(await badge.textContent(), "Not clocked in");
  const idleClockSize = await clockFace.evaluate(readClockSize);
  await page.evaluate(() =>
    window.__timeTrackerRender({
      result: {
        status: "VERIFIED_READ",
        access: {
          moduleRole: "Employee",
          employeeDepartment: "Engineering",
          attendanceWritesAccepted: true,
        },
        records: [],
        active: null,
        otRequests: [],
      },
      locationPreference: "Offsite (Home)",
    }),
  );
  assert.equal(await noteField.isVisible(), true);
  assert.equal(await noteField.evaluate((el) => el.required), true);
  assert.equal(
    await noteField.evaluate((el) => el.validity.valueMissing),
    true,
  );
  await page.evaluate(() => {
    const active = {
      id: "clock-state-fixture",
      clockIn: "2026-11-24T00:53:06Z",
      clockOut: null,
      status: "Active",
      creditedMs: null,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: "Offsite development",
    };
    window.__timeTrackerRender({
      result: {
        status: "VERIFIED_READ",
        access: {
          moduleRole: "Employee",
          employeeDepartment: "Engineering",
          attendanceWritesAccepted: true,
        },
        records: [active],
        active,
        otRequests: [],
      },
      now: new Date("2026-11-24T06:07:00Z"),
    });
  });
  assert.equal(await badge.textContent(), "Active");
  assert.equal(
    await page.locator("#tt-session-elapsed").textContent(),
    "04:13:54",
  );
  assert.equal(await page.locator(".tt-session-ring > svg").isVisible(), true);
  const activeClockSize = await clockFace.evaluate(readClockSize);
  assert.ok(activeClockSize < idleClockSize);
  assert.equal(await noteField.inputValue(), "Offsite development");
  assert.equal(await noteField.evaluate((el) => el.readOnly), true);
  const activeLayout = await page.evaluate(() => {
    const ring = document.querySelector(".tt-session-ring");
    const summary = document.querySelector(".tt-session-summary");
    const context = document.querySelector(".tt-active-session-context");
    const note = document.querySelector("#tt-note");
    return {
      ring: ring.getBoundingClientRect().width,
      ringTop: ring.getBoundingClientRect().top,
      summaryTop: summary.getBoundingClientRect().top,
      summary: getComputedStyle(summary.querySelector("div")).backgroundColor,
      context: getComputedStyle(context).backgroundColor,
      note: getComputedStyle(note).backgroundColor,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.ok(activeLayout.ring >= 170);
  assert.ok(activeLayout.ringTop < activeLayout.summaryTop);
  for (const surface of ["summary", "context", "note"]) {
    assert.equal(activeLayout[surface], "rgb(230, 241, 251)");
  }
  assert.ok(activeLayout.overflow <= 0, "Clock card overflows at 360px");
  await checkAccessibility("TimeTracker active mobile Clock");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.__timeTrackerRender());

  // CP-TT-FLOW-01C: Browser-level, isolated two-tab reload acceptance. No live
  // user account, actual attendance write or production data is involved.
  const peer = await context.newPage();
  try {
    await peer.goto(baseUrl, { waitUntil: "networkidle" });
    await peer.waitForFunction(() => window.__timeTrackerFixtureReady === true);
    await peer.evaluate(() => {
      window.__ttStorageNotifications = [];
      window.addEventListener("storage", (event) => {
        if (event.key?.startsWith("apsyntra.tt.clock-pending.v1:")) {
          window.__ttStorageNotifications.push(event.key);
        }
      });
    });
    const scope = {
      userId: "20000000-0000-4000-8000-000000000001",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      boardId: "30000000-0000-4000-8000-000000000001",
    };
    const pending = {
      ...scope,
      action: "clock-in",
      recordId: null,
      baselineRevision: 4,
      previousRecordIds: ["existing-session"],
      location: "Office-Base Duty",
      department: "Information Technology",
      receiptVerified: false,
      workNote: "private-not-to-persist",
      geo: { latitude: 10.2, longitude: 123.9 },
    };
    await page.evaluate(async (context) => {
      const { createTimeTrackerPendingRecovery } =
        await import("/frontend/time-tracker-pending-recovery.js");
      const repo = createTimeTrackerPendingRecovery(localStorage);
      if (!repo.save(context))
        throw new Error("Fixture pending marker save failed");
    }, pending);
    await peer.waitForFunction(
      () => window.__ttStorageNotifications.length === 1,
    );
    await peer.reload({ waitUntil: "networkidle" });
    const reloaded = await peer.evaluate(async (signedScope) => {
      const { createTimeTrackerPendingRecovery } =
        await import("/frontend/time-tracker-pending-recovery.js");
      const { attendanceSnapshotOutcome } =
        await import("/frontend/time-tracker-clock-recovery.js");
      const repo = createTimeTrackerPendingRecovery(localStorage);
      const marker = repo.read(signedScope);
      const before = localStorage.getItem(
        Object.keys(localStorage).find((key) =>
          key.startsWith("apsyntra.tt.clock-pending.v1:"),
        ),
      );
      const foreign = repo.read({
        ...signedScope,
        workspaceId: "40000000-0000-4000-8000-000000000001",
      });
      const newRecord = {
        id: "new-session",
        status: "Active",
        clockIn: "2026-11-17T07:00:00Z",
        clockOut: null,
        location: "Office-Base Duty",
        department: "Information Technology",
      };
      const snapshot = {
        status: "VERIFIED_READ",
        access: { ...signedScope },
        revision: 5,
        active: newRecord,
        records: [newRecord],
      };
      const outcome = attendanceSnapshotOutcome(snapshot, marker);
      repo.clear(signedScope);
      return {
        marker,
        markerRaw: before,
        foreign,
        outcome,
        cleared: repo.read(signedScope),
      };
    }, scope);
    assert.equal(reloaded.marker.action, "clock-in");
    assert.equal(reloaded.foreign, null);
    assert.equal(reloaded.outcome, "CONFIRMED");
    assert.equal(reloaded.cleared, null);
    assert.doesNotMatch(
      reloaded.markerRaw,
      /latitude|longitude|private-not-to-persist|accessToken/,
    );
  } finally {
    await peer.close();
  }

  // Existing signed OT capability controls the actual button state; this
  // fixture never makes an authenticated write or manufactures a server receipt.
  const otFixture = {
    ...verifiedResult,
    access: {
      ...verifiedResult.access,
      otContractActive: true,
      bootstrapApprover: false,
    },
  };
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        otModalOpen: true,
      }),
    otFixture,
  );
  assert.equal(
    await page.locator('#tt-ot-form button[type="submit"]').isDisabled(),
    false,
  );
  await checkAccessibility("Signed-contract OT submit fixture");

  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        otModalOpen: true,
      }),
    {
      ...otFixture,
      access: { ...otFixture.access, otContractActive: false },
    },
  );
  assert.equal(
    await page.locator('#tt-ot-form button[type="submit"]').isDisabled(),
    true,
  );
  const submittedOt = {
    id: "50000000-0000-4000-8000-000000000006",
    ownerId: "cloud:20000000-0000-4000-8000-000000000002",
    name: "Test Employee",
    status: "Submitted",
    date: "2026-11-17",
    start: "18:00",
    end: "20:00",
    durationMinutes: 120,
    task: "System acceptance test overtime request",
  };
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        now: new Date("2026-11-17T12:00:00Z"),
        otFilters: { status: "Submitted" },
      }),
    {
      ...otFixture,
      access: { ...otFixture.access, bootstrapApprover: true },
      otRequests: [submittedOt],
    },
  );
  assert.equal(
    await page.locator('[data-action="tt-ot-approve"]').isDisabled(),
    false,
  );
  assert.equal(
    await page.locator('[data-action="tt-ot-reject"]').isDisabled(),
    false,
  );
  await checkAccessibility("Bootstrap signed OT review fixture");
  // Bootstrap self-submitted requests must expose the same review controls.
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        now: new Date("2026-11-17T12:00:00Z"),
        otFilters: { status: "Submitted" },
      }),
    {
      ...otFixture,
      access: {
        ...otFixture.access,
        userId: "20000000-0000-4000-8000-000000000001",
        bootstrapApprover: true,
      },
      otRequests: [
        {
          ...submittedOt,
          ownerId: "cloud:20000000-0000-4000-8000-000000000001",
        },
      ],
    },
  );
  assert.equal(await page.locator('[data-action="tt-ot-approve"]').count(), 1);
  assert.equal(await page.locator('[data-action="tt-ot-reject"]').count(), 1);
  assert.equal(
    await page.locator('[data-action="tt-ot-approve"]').isDisabled(),
    false,
  );
  await checkAccessibility("Bootstrap self-submitted OT review fixture");

  const manualOt = {
    ...submittedOt,
    id: "50000000-0000-4000-8000-000000000007",
    submissionSource: "manual_admin",
    submittedBy: "20000000-0000-4000-8000-000000000001",
    submittedByName: "System Admin",
  };
  const manualAdminFixture = {
    ...otFixture,
    access: {
      ...otFixture.access,
      moduleRole: "System Admin",
      manualOtManager: true,
      bootstrapApprover: false,
      overviewDirectory: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          status: "active",
          display_name: "System Admin",
        },
        {
          id: "20000000-0000-4000-8000-000000000002",
          status: "active",
          display_name: "Test Employee",
        },
      ],
    },
    otRequests: [manualOt],
  };
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        now: new Date("2026-11-17T12:00:00Z"),
        otFilters: { status: "Submitted" },
        otModalOpen: "manual",
      }),
    manualAdminFixture,
  );
  assert.equal(await page.locator("#tt-ot-manual-form").count(), 1);
  assert.equal(await page.locator("#tt-ot-manual-employee option").count(), 3);
  assert.equal(
    await page.locator("#tt-ot-manual-form button[type=submit]").isDisabled(),
    false,
  );
  assert.equal(await page.locator(".tt-ot-manual-badge").count(), 1);
  assert.equal(await page.locator('[data-action="tt-ot-approve"]').count(), 1);
  assert.equal(await page.locator('[data-action="tt-ot-reject"]').count(), 1);
  assert.equal(await page.locator("#tt-ot-week-jump-form").count(), 1);
  await checkAccessibility("System Admin manual OT entry and review fixture");

  await page.setViewportSize({ width: 390, height: 844 });
  const manualSectionBox = await page
    .locator(".tt-ot-manual-section")
    .boundingBox();
  assert.ok(
    manualSectionBox && manualSectionBox.width <= 390,
    "Manual OT section fits mobile viewport",
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        now: new Date("2026-11-17T12:00:00Z"),
        otFilters: { status: "Submitted" },
      }),
    {
      ...manualAdminFixture,
      access: {
        ...manualAdminFixture.access,
        moduleRole: "Employee",
        manualOtManager: false,
      },
    },
  );
  assert.equal(await page.locator(".tt-ot-manual-section").count(), 0);
  assert.equal(await page.locator("#tt-ot-manual-form").count(), 0);
  assert.equal(
    await page.locator('[data-action="tt-ot-manual-open"]').count(),
    0,
  );
  assert.equal(await page.locator(".tt-ot-review-actions").count(), 0);

  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "ot",
        result,
        now: new Date("2026-11-17T12:00:00Z"),
        otFilters: { status: "Submitted" },
      }),
    {
      ...otFixture,
      access: { ...otFixture.access, bootstrapApprover: false },
      otRequests: [submittedOt],
    },
  );
  assert.equal(await page.locator(".tt-ot-review-actions").count(), 0);

  await page.evaluate(() => window.__timeTrackerRender({ view: "log" }));
  await page
    .getByRole("heading", { name: "Attendance Log", exact: true })
    .first()
    .waitFor();
  await checkAccessibility("TimeTracker attendance log");
  const checkAccessibilityWithin = async (selector, label) => {
    const result = await page.evaluate(
      async (target) =>
        window.axe.run(document.querySelector(target), {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        }),
      selector,
    );
    assert.equal(
      result.violations.length,
      0,
      label +
        " accessibility violations: " +
        JSON.stringify(
          result.violations.map((item) => ({
            id: item.id,
            impact: item.impact,
            nodes: item.nodes.map((node) => ({
              target: node.target,
              html: node.html,
              summary: node.failureSummary,
            })),
          })),
        ),
    );
  };

  const adminRecordId = "50000000-0000-4000-8000-000000000001";
  const adminEmployeeId = "20000000-0000-4000-8000-000000000002";
  const adminRawRecord = {
    id: adminRecordId,
    ownerId: "cloud:" + adminEmployeeId,
    ownerName: "Test Employee",
    clockIn: {
      timestamp: "2026-11-14T00:00:00Z",
      location: "Office-Base Duty",
      department: "Information Technology",
      geo: { latitude: 10.3, longitude: 123.9, accuracy: 15 },
    },
    clockOut: {
      timestamp: "2026-11-14T09:00:00Z",
      location: "Office-Base Duty",
      department: "Information Technology",
      geo: { latitude: 10.31, longitude: 123.91, accuracy: 16 },
    },
  };
  const adminProjectedRecord = {
    id: adminRecordId,
    ownerId: adminRawRecord.ownerId,
    name: "Test Employee",
    clockIn: adminRawRecord.clockIn.timestamp,
    clockOut: adminRawRecord.clockOut.timestamp,
    location: "Office-Base Duty",
    department: "Information Technology",
    classification: "On time",
    status: "Completed",
    creditedMs: 32400000,
  };
  const adminResult = {
    ...verifiedResult,
    access: { ...verifiedResult.access, moduleRole: "System Admin" },
    records: [adminProjectedRecord],
    log: { scope: "AUTHORIZED_WORKSPACE_TEAM", rows: [adminProjectedRecord] },
  };
  const adminDirectory = [
    { id: adminEmployeeId, displayName: "Test Employee" },
    { id: "20000000-0000-4000-8000-000000000001", displayName: "Test Admin" },
  ];
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({ view: "log", result, adminEligible: false }),
    adminResult,
  );
  assert.equal(await page.locator("[data-tt-log-select]").count(), 0);
  assert.equal(await page.locator("[data-action^='tt-log-admin-']").count(), 0);
  await page.evaluate(
    ({ result, directory }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDirectory: directory,
      }),
    { result: adminResult, directory: adminDirectory },
  );
  const toolbar = page.getByRole("region", {
    name: "System Admin attendance record management",
  });
  await toolbar.waitFor();
  const selectVisible = toolbar.getByRole("checkbox", {
    name: "Select visible standard employee records",
  });
  await selectVisible.waitFor();
  assert.equal(await selectVisible.getAttribute("aria-checked"), "false");
  await page.locator(".tt-log-row-summary").waitFor();
  const rowCheckbox = page.getByRole("checkbox", {
    name: "Select Test Employee",
  });
  await rowCheckbox.waitFor();
  assert.equal(await rowCheckbox.getAttribute("aria-checked"), "false");
  await page.getByRole("button", { name: "Add Log", exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit selected" }).waitFor();
  await page.getByRole("button", { name: "Delete selected" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Edit selected" }).isDisabled(),
    true,
  );
  assert.deepEqual(
    await page.locator(".tt-log-table thead th").allTextContents(),
    [
      "",
      "Clock In",
      "Employee",
      "Working Location",
      "Department",
      "Clock Out",
      "Status",
    ],
  );
  assert.match(
    await page.locator(".tt-log-row-clock").textContent(),
    /08:00:00/,
  );
  assert.match(
    await page.locator(".tt-log-row-department").textContent(),
    /Information Technology/,
  );
  assert.equal(
    await page.locator(".tt-log-row-status").textContent(),
    "Completed",
  );
  assert.doesNotMatch(
    await page.locator(".tt-log-row-out").textContent(),
    /Completed|Active/,
  );
  const logGeometry = await page.locator(".tt-log-table").evaluate((table) => {
    const headers = [...table.querySelectorAll("thead th")].slice(1);
    const cells = [...table.querySelectorAll(".tt-log-row-summary > span")];
    return {
      deltas: headers.map((header, index) =>
        Math.abs(
          header.getBoundingClientRect().left -
            cells[index].getBoundingClientRect().left,
        ),
      ),
      clockSize: getComputedStyle(cells[0].querySelector("strong")).fontSize,
      bodySize: getComputedStyle(cells[2]).fontSize,
    };
  });
  assert.ok(logGeometry.deltas.every((delta) => delta <= 2));
  assert.equal(logGeometry.clockSize, logGeometry.bodySize);
  await page.evaluate(async () => {
    const { startSearchExperience } = await import(
      "/frontend/search-experience.js"
    );
    window.__stopLogSearchTest = startSearchExperience(
      document.querySelector(".tt-log-reference-header"),
    );
  });
  await page.locator(".tt-log-search .aps-search-mark").waitFor();
  assert.equal(await page.locator(".tt-log-search > svg").isVisible(), false);
  await page.evaluate(() => window.__stopLogSearchTest());
  await page.locator(".tt-log-filter-trigger").click();
  await page.locator(".tt-log-filter-panel").waitFor();
  for (const id of ["period", "status", "location", "department", "sort"]) {
    await page.locator("#tt-log-" + id).waitFor();
  }
  await page.getByRole("button", { name: "Reset", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .waitFor();
  await page.locator(".tt-log-filter-trigger").click();
  assert.equal(await page.locator(".tt-log-filter-panel").isVisible(), false);
  const managementSurface = await toolbar.evaluate((element) => {
    const toolbarStyle = getComputedStyle(element);
    const action = getComputedStyle(
      element.querySelector(".tt-log-admin-toolbar-actions button"),
    );
    const selection = getComputedStyle(
      element.querySelector(".tt-log-admin-selection-status"),
    );
    return {
      display: toolbarStyle.display,
      borderRadius: toolbarStyle.borderRadius,
      background: toolbarStyle.backgroundImage,
      actionsDisplay: getComputedStyle(
        element.querySelector(".tt-log-admin-toolbar-actions"),
      ).display,
      actionBackground: action.backgroundImage,
      actionBorderRadius: action.borderRadius,
      selectionBorderRadius: selection.borderRadius,
    };
  });
  assert.equal(managementSurface.display, "flex");
  assert.equal(managementSurface.borderRadius, "0px");
  assert.equal(managementSurface.background, "none");
  assert.equal(managementSurface.actionsDisplay, "flex");
  assert.equal(managementSurface.actionBackground, "none");
  assert.equal(managementSurface.actionBorderRadius, "50%");
  assert.equal(managementSurface.selectionBorderRadius, "0px");
  await page.evaluate(
    ({ result, directory, recordId }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDirectory: directory,
        adminSelectedIds: [recordId],
        logExpandedRecordIds: [recordId],
      }),
    { result: adminResult, directory: adminDirectory, recordId: adminRecordId },
  );
  await page.getByRole("dialog", { name: "Test Employee" }).waitFor();
  await page.getByRole("button", { name: "Close details" }).waitFor();
  await page.getByRole("button", { name: "Edit record" }).waitFor();
  await page.getByRole("button", { name: "Delete record" }).waitFor();
  const selectedRow = page.locator(".tt-log-filterable.is-selected");
  assert.match(await selectedRow.getAttribute("class"), /board-row-selected/);
  await checkAccessibilityWithin(
    ".tt-log-admin-toolbar",
    "System Admin attendance toolbar",
  );
  await checkAccessibilityWithin(
    ".tt-log-details-dialog",
    "System Admin attendance details popup",
  );

  await page.evaluate(
    ({ result, directory, record }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDirectory: directory,
        adminEditor: {
          mode: "single",
          recordIds: [record.id],
          records: [record],
          directory,
          revision: 1,
          actorId: "20000000-0000-4000-8000-000000000001",
          workspaceId: "10000000-0000-4000-8000-000000000001",
          boardId: "30000000-0000-4000-8000-000000000001",
        },
      }),
    { result: adminResult, directory: adminDirectory, record: adminRawRecord },
  );
  await page.getByRole("dialog", { name: "Edit attendance record" }).waitFor();
  for (const selector of [
    '#tt-attendance-admin-form select[name="employeeId"]',
    '#tt-attendance-admin-form select[name="location"]',
    '#tt-attendance-admin-form select[name="department"]',
    '#tt-attendance-admin-form select[name="status"]',
    '#tt-attendance-admin-form input[name="clockInAt"]',
    '#tt-attendance-admin-form input[name="clockOutAt"]',
    '#tt-attendance-admin-form input[name="clockInGeolatitude"]',
    '#tt-attendance-admin-form input[name="clockInGeolongitude"]',
    '#tt-attendance-admin-form input[name="clockInGeoaccuracy"]',
    '#tt-attendance-admin-form input[name="durationHours"]',
  ]) {
    await page.locator(selector).waitFor();
  }
  assert.equal(
    await page
      .locator('#tt-attendance-admin-form select[name="employeeId"] option')
      .count(),
    2,
  );
  await checkAccessibilityWithin(
    ".tt-admin-editor",
    "System Admin individual attendance editor",
  );

  await page.evaluate(
    ({ result, directory, record }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDirectory: directory,
        adminSelectedIds: [record.id],
        adminEditor: {
          mode: "bulk",
          recordIds: [record.id, "50000000-0000-4000-8000-000000000002"],
          records: [record, record],
          directory,
          revision: 1,
          actorId: "20000000-0000-4000-8000-000000000001",
          workspaceId: "10000000-0000-4000-8000-000000000001",
          boardId: "30000000-0000-4000-8000-000000000001",
        },
      }),
    { result: adminResult, directory: adminDirectory, record: adminRawRecord },
  );
  await page.getByRole("dialog", { name: "Bulk edit attendance" }).waitFor();
  assert.equal(
    await page
      .locator(
        '#tt-attendance-admin-form select[name="employeeId"] option[value=""]',
      )
      .count(),
    1,
  );
  await checkAccessibilityWithin(
    ".tt-admin-editor",
    "System Admin bulk attendance editor",
  );

  await page.evaluate(
    ({ result, record }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDeleteConfirm: {
          recordIds: [record.id],
          records: [{ id: record.id, name: record.ownerName }],
        },
      }),
    { result: adminResult, record: adminRawRecord },
  );
  await page
    .getByRole("alertdialog", { name: "Delete attendance record" })
    .waitFor();
  await page.getByRole("button", { name: "Delete record" }).waitFor();
  await checkAccessibilityWithin(
    ".tt-admin-delete-dialog",
    "System Admin individual deletion confirmation",
  );

  await page.evaluate(
    ({ result, record }) =>
      window.__timeTrackerRender({
        view: "log",
        result,
        adminEligible: true,
        adminDeleteConfirm: {
          recordIds: [record.id, "50000000-0000-4000-8000-000000000002"],
          records: [
            { id: record.id, name: record.ownerName },
            {
              id: "50000000-0000-4000-8000-000000000002",
              name: "Second Employee",
            },
          ],
        },
      }),
    { result: adminResult, record: adminRawRecord },
  );
  await page
    .getByRole("alertdialog", { name: "Delete selected attendance records" })
    .waitFor();
  await page.getByRole("button", { name: "Delete 2 records" }).waitFor();
  await checkAccessibilityWithin(
    ".tt-admin-delete-dialog",
    "System Admin bulk deletion confirmation",
  );

  await page.setViewportSize({ width: 360, height: 800 });
  const mobileDeleteDialog = await page.evaluate(() => {
    const dialog = document.querySelector(".tt-admin-delete-dialog");
    const bounds = dialog.getBoundingClientRect();
    return {
      width: bounds.width,
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  assert.ok(mobileDeleteDialog.width <= mobileDeleteDialog.viewport);
  assert.ok(mobileDeleteDialog.scrollWidth <= mobileDeleteDialog.viewport);
  await checkAccessibilityWithin(
    ".tt-admin-delete-dialog",
    "System Admin mobile bulk deletion confirmation",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const [view, title] of [
    ["overview", "Overview"],
    ["reports", "Reports"],
    ["calendar", "Calendar"],
    ["ot", "Overtime"],
    ["hours", "My Hours"],
    ["monitor", "Monitor"],
  ]) {
    await page.evaluate(
      (selected) => window.__timeTrackerRender({ view: selected }),
      view,
    );
    await page
      .getByRole("heading", { name: title, exact: true })
      .first()
      .waitFor();
    await checkAccessibility("TimeTracker " + view + " view");
  }

  await page.evaluate(() =>
    window.__timeTrackerRender({
      view: "clock",
      teamEligible: true,
      gpsEligible: true,
    }),
  );
  await page.getByRole("tab", { name: "Team" }).waitFor();
  await page.getByRole("tab", { name: "GPS" }).waitFor();

  const teamResult = {
    ...verifiedResult,
    access: {
      ...verifiedResult.access,
      bootstrapTeamEligible: true,
      workspaceId: "workspace-fixture",
      userId: "actor-fixture",
    },
  };
  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "team",
        result,
        teamEligible: true,
        teamDirectory: {
          scope: "BOOTSTRAP_WORKSPACE_DIRECTORY",
          workspaceId: "workspace-fixture",
          actorId: "actor-fixture",
          members: [],
        },
      }),
    teamResult,
  );
  await page
    .getByRole("heading", { name: "Team", exact: true })
    .first()
    .waitFor();
  await checkAccessibility("TimeTracker Team Directory");

  await page.evaluate(
    (result) =>
      window.__timeTrackerRender({
        view: "gps",
        result,
        gpsEligible: true,
        gpsData: {
          events: [],
          from: "2026-11-10",
          to: "2026-11-16",
          truncated: false,
        },
        gpsFilters: { from: "2026-11-10", to: "2026-11-16" },
      }),
    verifiedResult,
  );
  await page.getByRole("heading", { name: "GPS & Location Hub" }).waitFor();
  await checkAccessibility("TimeTracker GPS evidence view");

  await page.setViewportSize({ width: 768, height: 900 });
  const tabletOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(
    tabletOverflow <= 0,
    "tablet layout overflows by " + tabletOverflow + "px",
  );

  await page.setViewportSize({ width: 360, height: 800 });
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(
    mobileOverflow <= 0,
    "mobile layout overflows by " + mobileOverflow + "px",
  );
  await checkAccessibility("TimeTracker mobile view");

  // Render the real standalone shell with production CSS, not just the
  // isolated legacy component. Catch missing styles, horizontal overflow,
  // duplicate headers, and a fallback font before this redesign is merged.
  await page.setViewportSize({ width: 1440, height: 960 });
  const referenceLayout = await page.evaluate(async () => {
    const { renderTimeTrackerNative, syncTimeTrackerSidebar } =
      await import("/frontend/time-tracker-ui.js");
    const app = document.querySelector("#app");
    app.innerHTML =
      '<div class="shell"><aside class="sidebar aps-sidebar"><div class="sidebar-nav-scroll"><nav class="nav-list"><a class="nav-link active" href="#/time-tracker">TimeTracker</a></nav></div></aside><main class="main aps-board-shell aps-time-tracker-shell"><header class="topbar"><div class="breadcrumb"><strong>TimeTracker</strong></div></header><div class="main-content"></div></main></div>';
    const shell = app.querySelector(".shell");
    shell.querySelector(".main-content").innerHTML = renderTimeTrackerNative({
      result: {
        status: "VERIFIED_READ",
        access: { moduleRole: "Employee", attendanceWritesAccepted: false },
        records: [],
        active: null,
        otRequests: [],
      },
      referenceShell: true,
      displayName: "Example Employee",
      now: new Date("2026-11-24T09:15:00Z"),
    });
    syncTimeTrackerSidebar(shell, { enabled: true, expanded: true });
    const faces = await document.fonts.load("600 38px Montserrat");
    const nav = shell.querySelector(".aps-sidebar .tt-navigation-scroll");
    const tabs = [...nav.querySelectorAll(".tt-nav-tab")];
    const greeting = shell.querySelector(".tt-reference-welcome");
    const card = shell.querySelector(".tt-clock-compact");
    const main = shell.querySelector("main");
    const bounds = (node) => node.getBoundingClientRect();
    const center = (node) => bounds(node).left + bounds(node).width / 2;
    const positions = tabs.map((tab) => bounds(tab).top);
    return {
      header: Boolean(shell.querySelector(".tt-app-header")),
      greeting: greeting.textContent,
      font: getComputedStyle(greeting).fontFamily,
      loadedFont: faces.some((face) => face.status === "loaded"),
      textAlign: getComputedStyle(greeting).textAlign,
      navDisplay: getComputedStyle(nav).display,
      overflow: nav.scrollWidth - nav.clientWidth,
      vertical: positions.every((top, i) => i === 0 || top > positions[i - 1]),
      cardWidth: bounds(card).width,
      centerOffset: Math.abs(center(card) - center(main)),
      employeeTab: tabs.some((tab) => tab.dataset.target === "employees"),
    };
  });
  assert.equal(referenceLayout.header, false);
  assert.equal(referenceLayout.greeting, "Good evening, Example!");
  assert.match(referenceLayout.font, /^Montserrat/);
  assert.equal(referenceLayout.loadedFont, true);
  assert.equal(referenceLayout.textAlign, "center");
  assert.equal(referenceLayout.navDisplay, "grid");
  assert.ok(referenceLayout.overflow <= 1);
  assert.equal(referenceLayout.vertical, true);
  assert.ok(Math.abs(referenceLayout.cardWidth - 462) <= 1);
  assert.ok(referenceLayout.centerOffset <= 2);
  assert.equal(referenceLayout.employeeTab, false);

  const sidebarStates = await page.evaluate(async () => {
    const { syncTimeTrackerSidebar } =
      await import("/frontend/time-tracker-ui.js");
    const shell = document.querySelector("#app .shell");
    const sidebar = shell.querySelector(".aps-sidebar");
    const parent = sidebar.querySelector('a[href="#/time-tracker"]');
    const nav = sidebar.querySelector(".tt-navigation");
    const measure = () => ({
      width: sidebar.getBoundingClientRect().width,
      background: getComputedStyle(sidebar).backgroundColor,
      radius: getComputedStyle(parent).borderRadius,
      fontSize: getComputedStyle(parent).fontSize,
      grid: getComputedStyle(shell).gridTemplateColumns,
    });
    const open = measure();
    syncTimeTrackerSidebar(shell, {
      enabled: true,
      expanded: true,
      submenuOpen: false,
    });
    const closed = measure();
    const hidden = getComputedStyle(nav).display === "none";
    const expanded = parent.getAttribute("aria-expanded");
    syncTimeTrackerSidebar(shell, {
      enabled: true,
      expanded: true,
      submenuOpen: true,
    });
    const reopened = getComputedStyle(nav).display !== "none";
    syncTimeTrackerSidebar(shell, { enabled: false, expanded: true });
    const outside = measure();
    syncTimeTrackerSidebar(shell, { enabled: true, expanded: true });
    return { open, closed, outside, hidden, expanded, reopened };
  });
  assert.deepEqual(sidebarStates.open, sidebarStates.closed);
  assert.deepEqual(sidebarStates.open, sidebarStates.outside);
  assert.equal(sidebarStates.hidden, true);
  assert.equal(sidebarStates.expanded, "false");
  assert.equal(sidebarStates.reopened, true);

  await page.evaluate(async () => {
    const { syncTimeTrackerSidebar } =
      await import("/frontend/time-tracker-ui.js");
    syncTimeTrackerSidebar(document.querySelector("#app .shell"), {
      enabled: true,
      expanded: false,
    });
  });
  assert.equal(
    await page.locator(".main-content .tt-navigation").count(),
    1,
    "headerless Clock must retain navigation when the sidebar collapses",
  );

  assert.deepEqual(
    pageErrors,
    [],
    "TimeTracker browser console/page errors: " + pageErrors.join(" | "),
  );
  console.log("TIMETRACKER_BROWSER_ACCEPTANCE_PASS");
  console.log(
    "FM1-aligned shell, existing attendance views, System Admin-only Log controls, individual/bulk editor fields, desktop/tablet/mobile layout, and WCAG 2.2 AA axe checks passed.",
  );
} finally {
  if (browser) await browser.close();
  if (devServer && devServer.exitCode === null) {
    const exited = new Promise((resolve) => devServer.once("exit", resolve));
    devServer.kill("SIGTERM");
    await exited;
  }
}
