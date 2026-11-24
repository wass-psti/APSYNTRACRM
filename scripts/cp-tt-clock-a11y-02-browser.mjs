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
      activeAnimations: workPlan.getAnimations().length + ring.getAnimations().length,
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

  const visualStability = await page.evaluate(async () => {
    const workPlan = document.querySelector("#tt-note-wrap");
    const ring = document.querySelector(".tt-session-ring");
    const readRect = (element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) =>
        Number(value.toFixed(3)),
      );
    };
    const before = [readRect(workPlan), readRect(ring)];
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = [readRect(workPlan), readRect(ring)];
    return { before, after };
  });
  assert.deepEqual(
    visualStability.after,
    visualStability.before,
    "Work Plan and session ring geometry must remain fixed after initial render",
  );

  await page.setViewportSize({ width: 862, height: 522 });
  await page.evaluate(() => {
    document.body.style.minHeight = "1400px";
  });
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

  // A routine signed refresh must not move, replace, or re-animate either
  // component. Unrelated attendance changes must cause zero Clock DOM writes.
  const liveSyncStability = await page.evaluate(async () => {
    const { syncTimeTrackerClockView } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const stage = root.querySelector(".tt-clock-stage");
    const ring = root.querySelector(".tt-session-ring");
    const progress = root.querySelector("#tt-session-progress");
    const elapsed = root.querySelector("#tt-session-elapsed");
    const noteWrap = root.querySelector("#tt-note-wrap");
    const note = root.querySelector("#tt-note");
    const targets = [ring, progress, elapsed, noteWrap, note];
    const identities = targets.slice();
    let childListMutations = 0;
    let progressAttributeMutations = 0;
    let ringAnimations = 0;
    let noteAnimations = 0;
    const observer = new MutationObserver((records) => {
      childListMutations += records.filter(
        (record) => record.type === "childList",
      ).length;
    });
    observer.observe(stage, { childList: true, subtree: true });
    const progressObserver = new MutationObserver((records) => {
      progressAttributeMutations += records.filter(
        (record) => record.attributeName === "stroke-dashoffset",
      ).length;
    });
    progressObserver.observe(progress, {
      attributes: true,
      attributeFilter: ["stroke-dashoffset"],
    });
    ring.addEventListener("animationstart", () => ringAnimations++);
    noteWrap.addEventListener("animationstart", () => noteAnimations++);
    note.focus();
    note.setSelectionRange(2, 8);
    const selectionBefore = [note.selectionStart, note.selectionEnd];
    const valueBefore = note.value;
    const scrollBefore = window.scrollY;
    const active = {
      id: "clock-state-fixture",
      clockIn: elapsed.dataset.clockIn,
      clockOut: null,
      status: "Active",
      creditedMs: null,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: note.value,
    };
    const snapshot = {
      status: "VERIFIED_READ",
      access: {
        moduleRole: "Employee",
        employeeDepartment: "Engineering",
        attendanceWritesAccepted: true,
      },
      records: [
        active,
        {
          id: "unrelated-completed-session",
          clockIn: "2026-11-20T00:00:00Z",
          clockOut: "2026-11-20T08:00:00Z",
          status: "Completed",
          creditedMs: 25200000,
        },
      ],
      active,
      otRequests: [],
    };
    for (let index = 0; index < 3; index++) {
      syncTimeTrackerClockView(root, {
        result: snapshot,
        previousResult: snapshot,
        now: new Date("2026-11-24T06:07:00Z"),
        locationPreference: "Offsite (Home)",
        workPlanDraft: "must-not-overwrite-active-note",
      });
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    observer.disconnect();
    progressObserver.disconnect();
    return {
      identitiesRetained: targets.every(
        (node, index) => node === identities[index],
      ),
      childListMutations,
      progressAttributeMutations,
      ringAnimations,
      noteAnimations,
      focused: document.activeElement === note,
      selection: [note.selectionStart, note.selectionEnd],
      selectionBefore,
      value: note.value,
      valueBefore,
      scrollBefore,
      scrollAfter: window.scrollY,
      ringParent: progress.parentElement === ring.querySelector("svg"),
      animationNames: [
        getComputedStyle(ring).animationName,
        getComputedStyle(noteWrap).animationName,
      ],
    };
  });
  assert.equal(liveSyncStability.identitiesRetained, true);
  assert.equal(liveSyncStability.childListMutations, 0);
  assert.equal(liveSyncStability.progressAttributeMutations, 0);
  assert.equal(liveSyncStability.ringAnimations, 0);
  assert.equal(liveSyncStability.noteAnimations, 0);
  assert.equal(liveSyncStability.focused, true);
  assert.deepEqual(
    liveSyncStability.selection,
    liveSyncStability.selectionBefore,
  );
  assert.equal(liveSyncStability.value, liveSyncStability.valueBefore);
  assert.equal(liveSyncStability.scrollAfter, liveSyncStability.scrollBefore);
  assert.equal(liveSyncStability.ringParent, true);

  // The one-second timer ticker must also update its existing text node rather
  // than replacing the timer's children or remounting the SVG ring.
  const tickerStability = await page.evaluate(async () => {
    const { syncTimeTrackerClock } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const stage = root.querySelector(".tt-clock-stage");
    const elapsed = root.querySelector("#tt-session-elapsed");
    const ring = root.querySelector(".tt-session-ring");
    const progress = root.querySelector("#tt-session-progress");
    const elapsedTextNode = elapsed.firstChild;
    const before = elapsed.textContent;
    let childListMutations = 0;
    let characterDataMutations = 0;
    let ringAnimations = 0;
    const observer = new MutationObserver((records) => {
      childListMutations += records.filter(
        (record) => record.type === "childList",
      ).length;
      characterDataMutations += records.filter(
        (record) => record.type === "characterData",
      ).length;
    });
    observer.observe(stage, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    ring.addEventListener("animationstart", () => ringAnimations++);
    syncTimeTrackerClock(root, new Date("2026-11-24T06:07:01Z"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    observer.disconnect();
    return {
      elapsedChanged: elapsed.textContent !== before,
      elapsedNodeRetained: elapsed.firstChild === elapsedTextNode,
      ringRetained: root.querySelector(".tt-session-ring") === ring,
      progressRetained: root.querySelector("#tt-session-progress") === progress,
      childListMutations,
      characterDataMutations,
      ringAnimations,
    };
  });
  assert.equal(tickerStability.elapsedChanged, true);
  assert.equal(tickerStability.elapsedNodeRetained, true);
  assert.equal(tickerStability.ringRetained, true);
  assert.equal(tickerStability.progressRetained, true);
  assert.equal(tickerStability.childListMutations, 0);
  assert.ok(tickerStability.characterDataMutations > 0);
  assert.equal(tickerStability.ringAnimations, 0);

  const autoClockoutSync = await page.evaluate(async () => {
    const { syncTimeTrackerClockView } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const ring = root.querySelector(".tt-session-ring");
    const note = root.querySelector("#tt-note");
    const state = {
      id: "clock-state-fixture",
      clockIn: root.querySelector("#tt-session-elapsed").dataset.clockIn,
      clockOut: null,
      status: "Active",
      creditedMs: null,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: note.value,
    };
    const result = {
      status: "VERIFIED_READ",
      access: {
        moduleRole: "Employee",
        employeeDepartment: "Engineering",
        attendanceWritesAccepted: true,
      },
      records: [state],
      active: state,
      autoClockout: {
        recordId: state.id,
        status: "MONITORING",
        nextAt: "2026-11-24T09:53:06Z",
      },
      otRequests: [],
    };
    syncTimeTrackerClockView(root, { result });
    const label = root.querySelector("[data-tt-auto-clockout-label]");
    const countdown = root.querySelector("[data-tt-auto-clockout-countdown]");
    const deadlineGroup = root.querySelector(
      "[data-tt-auto-clockout-deadline-group]",
    );
    const monitoring = {
      label: label.textContent,
      deadline: countdown.dataset.deadline,
      deadlineVisible: !deadlineGroup.hidden,
      ringRetained: root.querySelector(".tt-session-ring") === ring,
      noteRetained: root.querySelector("#tt-note") === note,
    };
    result.autoClockout = {
      recordId: state.id,
      status: "PENDING_GPS",
      nextAt: null,
      cutoffAt: null,
    };
    syncTimeTrackerClockView(root, { result });
    return {
      ...monitoring,
      pendingLabel: label.textContent,
      deadlineHidden: !deadlineGroup || !deadlineGroup.isConnected,
      countdownDeadlineRemoved: !root.querySelector(
        "[data-tt-auto-clockout-countdown]",
      ),
      ringRetainedAfterPending: root.querySelector(".tt-session-ring") === ring,
      noteRetainedAfterPending: root.querySelector("#tt-note") === note,
    };
  });
  assert.match(autoClockoutSync.label, /Automatic clock-out monitoring/);
  assert.equal(autoClockoutSync.deadline, "2026-11-24T09:53:06Z");
  assert.equal(autoClockoutSync.deadlineVisible, true);
  assert.equal(autoClockoutSync.ringRetained, true);
  assert.equal(autoClockoutSync.noteRetained, true);
  assert.match(autoClockoutSync.pendingLabel, /fresh foreground GPS required/);
  assert.equal(autoClockoutSync.deadlineHidden, true);
  assert.equal(autoClockoutSync.countdownDeadlineRemoved, true);
  assert.equal(autoClockoutSync.ringRetainedAfterPending, true);
  assert.equal(autoClockoutSync.noteRetainedAfterPending, true);

  // A genuinely corrected remote Work Plan is deferred while focused and
  // applied after blur without replacing the textarea.
  const workPlanCorrection = await page.evaluate(async () => {
    const { syncTimeTrackerClockView } =
      await import("/frontend/time-tracker-ui.js");
    const root = document.querySelector("#app");
    const note = root.querySelector("#tt-note");
    const original = note.value;
    const identity = note;
    const corrected = {
      id: "clock-state-fixture",
      clockIn: root.querySelector("#tt-session-elapsed").dataset.clockIn,
      clockOut: null,
      status: "Active",
      creditedMs: null,
      location: "Offsite (Home)",
      department: "Engineering",
      workNote: "Corrected remote Work Plan",
    };
    const result = {
      status: "VERIFIED_READ",
      access: {
        moduleRole: "Employee",
        employeeDepartment: "Engineering",
        attendanceWritesAccepted: true,
      },
      records: [corrected],
      active: corrected,
      otRequests: [],
    };
    note.focus();
    syncTimeTrackerClockView(root, {
      result,
      previousResult: {
        ...result,
        active: { ...corrected, workNote: original },
      },
    });
    const preservedWhileFocused = note.value === original;
    note.blur();
    syncTimeTrackerClockView(root, {
      result,
      previousResult: {
        ...result,
        active: { ...corrected, workNote: original },
      },
    });
    return {
      preservedWhileFocused,
      correctedAfterBlur: note.value,
      sameNode: note === identity,
      syncedValue: note.dataset.ttSyncedWorkNote,
    };
  });
  assert.equal(workPlanCorrection.preservedWhileFocused, true);
  assert.equal(
    workPlanCorrection.correctedAfterBlur,
    "Corrected remote Work Plan",
  );
  assert.equal(workPlanCorrection.sameNode, true);
  assert.equal(workPlanCorrection.syncedValue, "Corrected remote Work Plan");

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

  console.log("CP_TT_CLOCK_A11Y_03_BROWSER_PASS");
  console.log(
    "WCAG 2.2 AA passed; Clock Work Plan and session ring run no entrance animations or progress transitions; both element bounds remain unchanged across 400ms; routine live refresh preserves DOM identity, focus, selection, textarea value, and scroll; remote Work Plan corrections apply after blur; active-to-idle reconciliation passed.",
  );
} finally {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
}
