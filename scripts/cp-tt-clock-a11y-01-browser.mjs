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
const port = process.env.TT_CLOCK_A11Y_PORT || "5194";
const url = `http://127.0.0.1:${port}/frontend/tests/fixtures/time-tracker-component.html`;

let server;
let browser;

try {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      port,
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error("Vite exited before the Clock fixture loaded.");
    try {
      const response = await fetch(url);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait for the local fixture server.
    }
    await delay(100);
  }
  if (!ready) throw new Error("Timed out waiting for the Clock fixture.");

  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: 360, height: 800 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__timeTrackerFixtureReady === true);

  await page.evaluate(async () => {
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

  await page.addScriptTag({ content: axeSource });
  const activeAccessibility = await page.evaluate(async () => {
    const workPlan = document.querySelector("#tt-note-wrap");
    const ring = document.querySelector(".tt-session-ring");
    const progress = document.querySelector("#tt-session-progress");
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    const workPlanStyle = getComputedStyle(workPlan);
    const ringStyle = getComputedStyle(ring);
    const progressStyle = getComputedStyle(progress);
    return {
      workPlanAnimation: workPlanStyle.animationName,
      workPlanTransform: workPlanStyle.transform,
      ringAnimation: ringStyle.animationName,
      ringTransform: ringStyle.transform,
      ringProgressTransition: progressStyle.transitionProperty,
      ringProgressTransitionDuration: progressStyle.transitionDuration,
      activeAnimations:
        workPlan.getAnimations().length + ring.getAnimations().length,
      violations: result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    };
  });
  assert.equal(activeAccessibility.workPlanAnimation, "none");
  assert.equal(activeAccessibility.workPlanTransform, "none");
  assert.equal(activeAccessibility.ringAnimation, "none");
  assert.equal(activeAccessibility.ringTransform, "none");
  assert.equal(activeAccessibility.ringProgressTransition, "none");
  assert.equal(activeAccessibility.ringProgressTransitionDuration, "0s");
  assert.equal(activeAccessibility.activeAnimations, 0);
  assert.deepEqual(activeAccessibility.violations, []);

  const update = await page.evaluate(async () => {
    const { syncTimeTrackerClockView } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const selectors = [
      ".tt-native",
      ".tt-app-header",
      ".tt-navigation",
      ".tt-clock-stage",
      ".tt-command-layout",
      ".tt-time-dashboard",
      ".tt-clock-face",
      ".tt-clock-card",
      "#tt-clock-form",
      "#tt-session-elapsed",
      "#tt-session-progress",
      ".tt-start-button",
      "#tt-note",
    ];
    const before = Object.fromEntries(
      selectors.map((selector) => [selector, root.querySelector(selector)]),
    );
    const note = before["#tt-note"];
    note.focus();
    window.scrollTo(0, 80);
    const scrollBefore = window.scrollY;
    const stageBefore = before[".tt-clock-stage"].getBoundingClientRect();
    const corrected = {
      id: "clock-state-fixture",
      clockIn: "2026-11-24T00:48:06Z",
      clockOut: null,
      status: "Active",
      creditedMs: null,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: "Offsite development",
    };
    const patched = syncTimeTrackerClockView(root, {
      result: {
        status: "VERIFIED_READ",
        access: {
          moduleRole: "Employee",
          employeeDepartment: "Engineering",
          attendanceWritesAccepted: true,
        },
        records: [corrected],
        active: corrected,
        otRequests: [],
      },
      now: new Date("2026-11-24T06:07:00Z"),
      locationPreference: "Offsite (Home)",
      workPlanDraft: "Offsite development",
    });
    const after = Object.fromEntries(
      selectors.map((selector) => [selector, root.querySelector(selector)]),
    );
    const stageAfter = after[".tt-clock-stage"].getBoundingClientRect();
    return {
      patched,
      stable: selectors.every(
        (selector) => before[selector] === after[selector],
      ),
      focused: document.activeElement === note,
      scrollBefore,
      scrollAfter: window.scrollY,
      stageTopDelta: Math.abs(stageAfter.top - stageBefore.top),
      stageHeightDelta: Math.abs(stageAfter.height - stageBefore.height),
      elapsed: root.querySelector("#tt-session-elapsed")?.textContent,
      clockIn: root.querySelector("#tt-session-elapsed")?.dataset.clockIn,
      noteValue: note.value,
    };
  });
  assert.equal(update.patched, true);
  assert.equal(
    update.stable,
    true,
    "Background refresh must retain Clock DOM nodes",
  );
  assert.equal(
    update.focused,
    true,
    "Background refresh must preserve focused control",
  );
  assert.equal(update.scrollAfter, update.scrollBefore);
  assert.equal(update.stageTopDelta, 0);
  assert.equal(update.stageHeightDelta, 0);
  assert.equal(update.elapsed, "04:18:54");
  assert.equal(update.clockIn, "2026-11-24T00:48:06Z");
  assert.equal(update.noteValue, "Offsite development");

  const transition = await page.evaluate(async () => {
    const { syncTimeTrackerClockView } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const selectors = [
      ".tt-native",
      ".tt-app-header",
      ".tt-navigation",
      ".tt-clock-stage",
      ".tt-command-layout",
      ".tt-time-dashboard",
      ".tt-clock-card",
      "#tt-clock-form",
    ];
    const before = Object.fromEntries(
      selectors.map((selector) => [selector, root.querySelector(selector)]),
    );
    const completed = {
      id: "clock-state-fixture",
      clockIn: "2026-11-24T00:48:06Z",
      clockOut: "2026-11-24T06:07:00Z",
      status: "Completed",
      creditedMs: 15534000,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: "Offsite development",
    };
    const patched = syncTimeTrackerClockView(root, {
      result: {
        status: "VERIFIED_READ",
        access: {
          moduleRole: "Employee",
          employeeDepartment: "Engineering",
          attendanceWritesAccepted: true,
        },
        records: [completed],
        active: null,
        otRequests: [],
      },
      now: new Date("2026-11-24T06:07:00Z"),
      locationPreference: "Offsite (Home)",
      workPlanDraft: "Next work plan",
    });
    const after = Object.fromEntries(
      selectors.map((selector) => [selector, root.querySelector(selector)]),
    );
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      patched,
      stable: selectors.every(
        (selector) => before[selector] === after[selector],
      ),
      sessionState:
        root.querySelector(".tt-command-layout")?.dataset.sessionState,
      badge: root.querySelector(".tt-idle-badge")?.textContent,
      action: root.querySelector('[name="tt-action"]')?.value,
      ringCount: root.querySelectorAll("#tt-session-progress").length,
      violations: result.violations.map((item) => item.id),
    };
  });
  assert.equal(transition.patched, true);
  assert.equal(
    transition.stable,
    true,
    "Idle/active transition must retain the Clock shell",
  );
  assert.equal(transition.sessionState, "idle");
  assert.equal(transition.badge, "Not clocked in");
  assert.equal(transition.action, "clock-in");
  assert.equal(transition.ringCount, 0);
  assert.deepEqual(transition.violations, []);
  assert.deepEqual(pageErrors, []);

  console.log("CP_TT_CLOCK_A11Y_01_BROWSER_PASS");
  console.log(
    "WCAG 2.2 AA Clock checks passed; Work Plan text opacity stays constant; background refresh preserves Clock DOM, focus, scroll, and layout; active-to-idle reconciliation passed.",
  );
} finally {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
}
