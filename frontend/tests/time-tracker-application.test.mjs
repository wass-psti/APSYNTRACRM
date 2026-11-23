import test from "node:test";
import { workspaceApplicationsForNavigation } from "../workspace-application-routing.js";
import { WORK_MANAGEMENT_WORKSPACE_ID } from "../workspace-identity.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findTimeTrackerAttendanceBoard,
  TIMETRACKER_APPLICATION_ROUTE,
  TIMETRACKER_ATTENDANCE_BOARD_ID,
} from "../time-tracker-application.js";
import { renderTimeTrackerNative } from "../time-tracker-ui.js";
import {
  renderBoardLoading,
  renderBoardLoadingError,
} from "../board/presentation/loading.js";

const app = readFileSync("frontend/app.js", "utf8");
const sidebar = readFileSync("frontend/sidebar-visuals.js", "utf8");
const shellCss = readFileSync("frontend/time-tracker-application.css", "utf8");
const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const htmlEntry = readFileSync("index.html", "utf8");
const pagesSmoke = readFileSync("scripts/pages-smoke.mjs", "utf8");
const moduleResolver = (name) =>
  name === "TimeTracker Attendance" ? { key: "timetracker" } : null;

const verifiedResult = {
  status: "VERIFIED_READ",
  access: {
    moduleRole: "Employee",
    platformRole: "employee",
    name: "Signed employee",
    attendanceWritesAccepted: false,
  },
  records: [],
  active: null,
  otRequests: [],
};

test("TimeTracker route resolves only the existing attendance board and never provisions one", () => {
  const existing = {
    id: TIMETRACKER_ATTENDANCE_BOARD_ID,
    name: "TimeTracker Attendance",
    status: "active",
  };
  assert.equal(
    findTimeTrackerAttendanceBoard(
      [existing, { id: "other", name: "Contacts" }],
      moduleResolver,
    ),
    existing,
  );
  assert.equal(
    findTimeTrackerAttendanceBoard(
      [{ id: "other", name: "Contacts" }],
      moduleResolver,
    ),
    null,
  );
  assert.equal(findTimeTrackerAttendanceBoard(null, moduleResolver), null);
  assert.equal(findTimeTrackerAttendanceBoard([existing], null), null);
  assert.equal(
    findTimeTrackerAttendanceBoard(
      [
        { id: "legacy-board", name: "TimeTracker", status: "active" },
        { ...existing, id: "wrong-board" },
        existing,
      ],
      (name) =>
        ["TimeTracker", "TimeTracker Attendance"].includes(name)
          ? { key: "timetracker" }
          : null,
    ),
    existing,
  );
  assert.equal(
    findTimeTrackerAttendanceBoard(
      [{ ...existing, status: "trashed" }],
      moduleResolver,
    ),
    null,
  );
  assert.equal(TIMETRACKER_APPLICATION_ROUTE, "#/time-tracker");
});

test("TimeTracker renders as an FM1-aligned application with the existing attendance views", () => {
  const html = renderTimeTrackerNative({
    result: verifiedResult,
    view: "clock",
  });
  assert.match(html, /data-tt-application-root/);
  assert.match(html, /class="tt-native"/);
  assert.match(html, /class="fm1-app tt-application"/);
  assert.match(html, /class="tt-app-header fm1-app-header"/);
  assert.match(html, /class="tt-navigation fm1-tabs"/);
  assert.match(html, /class="fm1-page-heading tt-application-heading"/);
  assert.match(html, /class="fm1-app-footer tt-application-footer"/);
  assert.match(html, /TimeTracker <span>Attendance<\/span>/);
  assert.match(html, /data-action="tt-refresh"/);
  assert.match(html, /data-action="tt-tab" data-target="overview"/);
  assert.match(html, /data-action="tt-tab" data-target="clock"/);
  assert.match(html, /data-action="tt-tab" data-target="log"/);
  assert.match(html, /data-action="tt-tab" data-target="reports"/);
  assert.match(html, /data-action="tt-tab" data-target="calendar"/);
  assert.match(html, /data-action="tt-tab" data-target="hours"/);
  assert.match(html, /tt-clock-form/);
  assert.match(html, /Asia\/Manila \(UTC\+8\)/);
});

test("existing Team and GPS navigation eligibility is preserved without adding new gates", () => {
  const ordinary = renderTimeTrackerNative({
    result: verifiedResult,
    view: "clock",
  });
  assert.doesNotMatch(ordinary, /data-target="team"/);
  assert.doesNotMatch(ordinary, /data-target="gps"/);
  const eligible = renderTimeTrackerNative({
    result: verifiedResult,
    view: "clock",
    teamEligible: true,
    gpsEligible: true,
  });
  assert.match(eligible, /data-target="team"/);
  assert.match(eligible, /data-target="gps"/);
});

test("all legacy TimeTracker board URLs resolve to the dedicated application route", () => {
  assert.match(
    app,
    /workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/,
  );
  const timeTracker = workspaceApplicationsForNavigation(
    WORK_MANAGEMENT_WORKSPACE_ID,
    [],
  ).find((application) => application.id === "timetracker");
  assert.equal(timeTracker?.href, "#/time-tracker");
  assert.equal(timeTracker?.icon, "clock");
  assert.match(app, /if\(parts\[0\]==='time-tracker'\)/);
  assert.match(app, /db\.nativeApplicationBoardContext\('time-tracker'\)/);
  assert.match(
    app,
    /const timeTrackerBoard=state\.boards\.find\(b=>b\.id===parts\[1\]&&moduleByBoardName\(b\.name\)\?\.key==='timetracker'\)/,
  );
  assert.match(
    app,
    /history\.replaceState\(null,'',location\.pathname\+location\.search\+TIMETRACKER_APPLICATION_ROUTE\)/,
  );
  assert.match(
    app,
    /if\(moduleByBoardName\(b\.name\)\?\.key==='timetracker'\)return renderTimeTrackerApplication\(\)/,
  );
  assert.match(
    app,
    /root\.querySelector\('\.main'\)\?\.classList\.toggle\('aps-time-tracker-shell',state\.ttStandalone===true\)/,
  );
  const routeStart = app.indexOf("if(parts[0]==='time-tracker')");
  const routeEnd = app.indexOf(
    "if(parts[0]==='boards'&&validUuid(parts[1]))",
    routeStart,
  );
  const route = app.slice(routeStart, routeEnd);
  assert.doesNotMatch(route, /roleVerified|adminVerified|roleConfig/);
});

test("TimeTracker loading and error states use application language rather than board language", () => {
  const loading = renderBoardLoading({ application: "TimeTracker" });
  assert.match(loading, /Loading TimeTracker/);
  assert.match(loading, /Preparing your timetracker attendance workspace/i);
  assert.match(loading, /existing attendance board and records/);
  const error = renderBoardLoadingError("Existing board is unavailable", {
    application: "TimeTracker",
  });
  assert.match(error, /TimeTracker unavailable/);
  assert.match(error, /Existing board is unavailable/);
});

test("FM1 design tokens, responsive layout, focus visibility and reduced motion are registered", () => {
  assert.match(shellCss, /var\(--fm1-ink/);
  assert.match(shellCss, /var\(--fm1-accent/);
  assert.match(shellCss, /@media\s*\(max-width:\s*720px\)/);
  assert.match(shellCss, /@media\s*\(max-width:\s*440px\)/);
  assert.match(shellCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(shellCss, /focus-visible/);
  assert.match(manifest, /frontend\/time-tracker-application\.css/);
  assert.match(htmlEntry, /frontend\/time-tracker-application\.css/);
  assert.match(sidebar, /clock:'<circle cx="12" cy="12" r="9"/);
});

test("live Pages smoke verification includes the dedicated TimeTracker route and renderer assets", () => {
  assert.match(pagesSmoke, /frontend\/time-tracker-application\.js/);
  assert.match(pagesSmoke, /frontend\/time-tracker-ui\.js/);
  assert.match(pagesSmoke, /frontend\/time-tracker-application\.css/);
  assert.match(pagesSmoke, /frontend\/apsyntra-styles\.bundle\.css/);
});

test("TimeTracker stays in the existing CRM module graph without a new frontend framework", () => {
  assert.match(
    app,
    /import \{findTimeTrackerAttendanceBoard,TIMETRACKER_APPLICATION_ROUTE\} from '\.\/time-tracker-application\.js'/,
  );
  assert.match(
    app,
    /function renderTimeTrackerApplication\(\)\s*\{\s*return renderTimeTrackerNative\(/,
  );
  assert.match(
    app,
    /if\(state\.ttStandalone\)stopTimeTrackerPixi\(\);\s*else mountTimeTrackerPixi\(root\)/,
  );
  assert.doesNotMatch(
    readFileSync("frontend/time-tracker-application.js", "utf8"),
    /supabase|rpc\(|fetch\(|create board|insert into/i,
  );
});
