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
const baseUrl =
  process.env.TT_TEST_URL ||
  "http://127.0.0.1:5173/frontend/tests/fixtures/time-tracker-component.html";
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
    if (response.ok) return;
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
      "5173",
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
      if (response.ok) return;
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__timeTrackerFixtureReady === true);
  await page
    .getByRole("heading", { level: 1, name: "TimeTracker Attendance" })
    .waitFor();
  await page.getByRole("tab", { name: "Clock" }).waitFor();
  await page.getByRole("heading", { name: "Clock", exact: true }).waitFor();

  const desktopLayout = await page.evaluate(() => {
    const app = document.querySelector(".fm1-app");
    const header = document.querySelector(".tt-app-header");
    const nav = document.querySelector(".tt-navigation");
    return {
      appDisplay: getComputedStyle(app).display,
      headerRadius: getComputedStyle(header).borderRadius,
      headerBackground: getComputedStyle(header).backgroundImage,
      navOverflow: getComputedStyle(nav).overflowX,
      root: document.querySelector(".tt-native")?.className,
    };
  });
  assert.equal(desktopLayout.appDisplay, "grid");
  assert.ok(desktopLayout.headerRadius.includes("22px"));
  assert.ok(desktopLayout.headerBackground.includes("linear-gradient"));
  assert.equal(desktopLayout.navOverflow, "auto");
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
      label + " accessibility violations: " + JSON.stringify(
        result.violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })) })),
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
    (result) => window.__timeTrackerRender({ view: "log", result, adminEligible: false }),
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
  await page.getByText("Attendance record management", { exact: true }).waitFor();
  await page.locator("#tt-log-select-all").waitFor();
  await page.locator("#tt-log-select-" + adminRecordId).waitFor();
  await page.getByRole("button", { name: "Edit selected" }).waitFor();
  await page.getByRole("button", { name: "Delete selected" }).waitFor();
  await page.locator(".tt-log-row-summary").click();
  await page.getByRole("button", { name: "Edit record" }).waitFor();
  await page.getByRole("button", { name: "Delete record" }).waitFor();
  await checkAccessibilityWithin(".tt-log-admin-toolbar", "System Admin attendance toolbar");
  await checkAccessibilityWithin(".tt-log-admin-row-actions", "System Admin row actions");

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
  assert.equal(await page.locator('#tt-attendance-admin-form select[name="employeeId"] option').count(), 2);
  await checkAccessibilityWithin(".tt-admin-editor", "System Admin individual attendance editor");

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
  assert.equal(await page.locator('#tt-attendance-admin-form select[name="employeeId"] option[value=""]').count(), 1);
  await checkAccessibilityWithin(".tt-admin-editor", "System Admin bulk attendance editor");

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
