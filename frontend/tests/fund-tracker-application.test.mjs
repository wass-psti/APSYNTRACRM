import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findFundTrackerBoard,
  fundTrackerRecordHref,
  FUND_TRACKER_APPLICATION_ROUTE,
  parseFundTrackerRecordRoute,
} from "../fund-tracker-application.js";
import { renderFundTrackerNative } from "../fund-tracker-ui.js";

const boardId = "f36da8fe-8d9d-4629-9938-12533cb3ca39";
const requestId = "33333333-3333-4333-8333-333333333333";
const board = {
  id: boardId,
  name: "Fund Released Tracker",
  status: "active",
  description: "[APSYNTRA:MODULE:frt:v1] Existing Fund Tracker board",
};
const report = {
  status: "PASS",
  role: "GENERAL_MANAGER",
  companyCode: "WASS",
  companies: [
    { code: "WAO", name: "Watchdog Automation OPC" },
    { code: "WASS", name: "Watchdog Automation Sales & Services" },
    { code: "PSTI", name: "PLC Systems Technik, Inc." },
  ],
  summary: {
    total_requests: 40,
    pending: 9,
    in_progress: 18,
    completed: 13,
    pending_liquidation_count: 7,
  },
  analytics: {
    companyCode: "WASS",
    requestedTotal: "1234567.89",
    spentTotal: "456789.12",
    topCategories: [
      { category: "Office Supplies", requestedAmount: "750000.00" },
      { category: "Equipment", requestedAmount: "500000.00" },
    ],
    monthlyTrend: ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map(
      (month, index) => ({
        month,
        requestedAmount: (100000 + index * 10000).toFixed(2),
        spentAmount: (50000 + index * 5000).toFixed(2),
      }),
    ),
  },
  requests: [
    {
      requestId,
      title: "Operating Supplies",
      voucher: "DV-WASS-202611-009",
      status: "PENDING_APPROVAL",
      dateNeeded: "2026-11-13",
      filingStatus: "NOT_FILED",
    },
  ],
};

const app = readFileSync("frontend/app.js", "utf8");
const sidebarIcons = readFileSync("frontend/sidebar-visuals.js", "utf8");
const css = readFileSync("frontend/fund-tracker-application.css", "utf8");
const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const htmlEntry = readFileSync("index.html", "utf8");
const pagesSmoke = readFileSync("scripts/pages-smoke.mjs", "utf8");
const native = readFileSync("frontend/fund-tracker-native.js", "utf8");
const routeModule = readFileSync("frontend/fund-tracker-application.js", "utf8");

test("Fund Tracker resolves only the existing authoritative board and never provisions a replacement", () => {
  assert.equal(findFundTrackerBoard([board, { id: "other", name: "Contacts" }]), board);
  assert.equal(findFundTrackerBoard([{ id: "other", name: "Contacts" }]), null);
  assert.equal(findFundTrackerBoard(null), null);
  assert.equal(
    findFundTrackerBoard([{ ...board, id: "other" }]),
    null,
  );
  assert.equal(
    findFundTrackerBoard([{ ...board, status: "archived" }]),
    null,
  );
  assert.equal(
    findFundTrackerBoard([{ ...board, description: "unmapped board" }]),
    null,
  );
  assert.equal(FUND_TRACKER_APPLICATION_ROUTE, "#/fund-tracker");
  assert.doesNotMatch(routeModule, /insert into|create board|create table|\.rpc\(/i);
});

test("Fund Tracker request deep links validate company code and request UUID", () => {
  assert.deepEqual(
    parseFundTrackerRecordRoute(["fund-tracker", "record", "WASS", requestId]),
    { companyCode: "WASS", requestId },
  );
  assert.equal(
    fundTrackerRecordHref("WASS", requestId),
    "#/fund-tracker/record/WASS/" + requestId,
  );
  assert.equal(parseFundTrackerRecordRoute(["fund-tracker", "record", "WASS", "bad"]), null);
  assert.equal(parseFundTrackerRecordRoute(["fund-tracker", "record", "../WASS", requestId]), null);
  assert.equal(fundTrackerRecordHref("WASS", "bad"), FUND_TRACKER_APPLICATION_ROUTE);
});

test("native adapter composes the existing signed FRT domain APIs instead of introducing a parallel backend", () => {
  assert.match(native, /loadFRTFinanceReadOnly/);
  assert.match(native, /searchFRTRequestsReadOnly/);
  assert.match(native, /class FundTrackerNativeClient/);
  assert.match(native, /snapshot\(/);
  assert.match(native, /searchRequests\(/);
  assert.doesNotMatch(native, /createClient|create table|insert into|\.rpc\(/i);
});

test("native renderer keeps semantic application structure and existing FRT delegated actions", () => {
  const html = renderFundTrackerNative({ result: report, view: "tracker" });
  assert.match(html, /data-fund-tracker-root/);
  assert.match(html, /<header class="frt-app-header">/);
  assert.match(html, /<main class="frt-app-content">/);
  assert.match(html, /<footer class="frt-app-footer">/);
  assert.match(html, /Fund Tracker/);
  assert.match(html, /GENERAL_MANAGER/);
  assert.match(html, /Watchdog Automation Sales &amp; Services/);
  assert.match(html, /data-action="frt-finance-view" data-view="tracker"/);
  assert.match(html, /data-action="frt-finance-view" data-view="executive"/);
  assert.match(html, /data-action="frt-finance-refresh"/);
  assert.match(html, /data-frt-section="new"/);
  assert.match(html, /data-frt-section="archive"/);
  assert.match(html, /data-frt-section="activity"/);
  assert.match(html, /data-frt-section="discussion"/);
});

test("Fund Tracker route reuses the existing board host, adapter, renderer and delegated event state", () => {
  assert.match(app, /import \{FundTrackerNativeClient\} from '\.\/fund-tracker-native\.js'/);
  assert.match(app, /import \{renderFundTrackerNative\} from '\.\/fund-tracker-ui\.js'/);
  assert.match(app, /findFundTrackerBoard\\(state\\.boards\\)/);
  assert.match(app, /if\(parts\[0\]==='fund-tracker'\)/);
  assert.match(app, /await loadBoard\(fundTrackerBoard\.id,'finance'\)/);
  assert.match(app, /const fundTracker=new FundTrackerNativeClient\(\{auth,api:db\}\)/);
  assert.match(app, /fundTracker\.snapshot\(/);
  assert.match(app, /fundTracker\.searchRequests\(query,\{limit\}\)/);
  assert.match(app, /getHref:row=>fundTrackerRecordHref\(row\.companyCode,row\.requestId\)/);
  assert.match(app, /sidebarNav\('#\/fund-tracker','Fund Tracker','finance'/);
  assert.match(app, /case 'frt-finance-view':/);
  assert.match(app, /case 'frt-finance-detail':/);
  assert.match(app, /case 'frt-finance-action':/);
  assert.match(app, /state\.frtFinanceView/);
  assert.match(app, /if\(state\.tab==='finance'&&moduleByBoardName\(b\.name\)\?\.key==='frt'\)return renderFundTrackerApplication\(\)/);
  assert.doesNotMatch(app, /loadFRTFinanceReadOnly\(/);
});

test("Fund Tracker application styles are scoped and registered in the generated stylesheet pipeline", () => {
  assert.match(css, /\.frt-native/);
  assert.match(css, /--fm1-ink/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /focus-visible/);
  assert.match(manifest, /frontend\/fund-tracker-application\.css/);
  assert.match(htmlEntry, /frontend\/fund-tracker-application\.css/);
  assert.match(pagesSmoke, /frontend\/fund-tracker-application\.js/);
  assert.match(pagesSmoke, /frontend\/fund-tracker-native\.js/);
  assert.match(pagesSmoke, /frontend\/fund-tracker-ui\.js/);
  assert.match(pagesSmoke, /frontend\/fund-tracker-application\.css/);
  assert.match(sidebarIcons, /finance:/);
});
