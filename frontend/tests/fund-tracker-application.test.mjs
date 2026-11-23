import test from "node:test";
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';
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
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const htmlEntry = readFileSync("index.html", "utf8");
const pagesSmoke = readFileSync("scripts/pages-smoke.mjs", "utf8");
const native = readFileSync("frontend/fund-tracker-native.js", "utf8");
const routeModule = readFileSync("frontend/fund-tracker-application.js", "utf8");

test("Fund Tracker resolves only the existing authoritative board and never provisions a replacement", () => {
  assert.equal(findFundTrackerBoard([board, { id: "other", name: "Contacts" }]), board);
  assert.equal(findFundTrackerBoard([{ id: "other", name: "Contacts" }]), null);
  assert.equal(findFundTrackerBoard(null), null);
  assert.equal(findFundTrackerBoard([{ ...board, id: "other" }]), null);
  assert.equal(findFundTrackerBoard([{ ...board, status: "archived" }]), null);
  assert.equal(findFundTrackerBoard([{ ...board, description: "unmapped board" }]), null);
  assert.equal(FUND_TRACKER_APPLICATION_ROUTE, "#/fund-tracker");
  assert.equal(routeModule.includes(".rpc("), false);
  assert.equal(routeModule.includes("create board"), false);
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
  assert.ok(native.includes("loadFRTFinanceReadOnly"));
  assert.ok(native.includes("searchFRTRequestsReadOnly"));
  assert.ok(native.includes("class FundTrackerNativeClient"));
  assert.ok(native.includes("snapshot("));
  assert.ok(native.includes("searchRequests("));
  assert.ok(native.includes("this.recipients = new FRTRecipientClient({ auth, api })"));
  for (const method of [
    "createRequest(", "updateFiling(", "updateRequestDate(",
    "loadPersonAssignment(", "savePersonAssignment(", "executeAction(",
    "loadLiquidation(", "submitLiquidation(", "loadBankExecution(",
    "recordBankExecution(", "loadComments(", "addComment(", "loadAuditPage(",
    "auditCsv(", "projectNotifications(", "loadDeadlineSnapshots(",
    "loadAgingSummary(", "loadArchive(", "restoreRequest(", "loadVoucher(",
    "loadRequestDetail(", "createIntercompanyObligation(",
    "recordIntercompanySettlement(", "loadCompanyProfile(",
    "saveCompanyProfileWithLogo(", "loadCompanyLogoDataUrl(",
    "mountAccountingEditor(",
  ]) assert.ok(native.includes(method), method);
  for (const projection of ["projectFRTAccountingSnapshot","projectFRTCompanyProfile","projectFRTWorkflowProgress","projectFRTVoucherSnapshot","validateFRTReceipts","describeFRTBankExecution"]) assert.ok(native.includes(projection), projection);
  assert.equal(native.includes("createClient"), false);
  assert.equal(native.includes(".rpc("), false);
});

test("native renderer keeps semantic application structure and existing FRT delegated actions", () => {
  const html = renderFundTrackerNative({ result: report, view: "tracker" });
  for (const fragment of [
    'data-fund-tracker-root',
    '<header class="frt-app-header">',
    '<main class="frt-app-content">',
    '<footer class="frt-app-footer">',
    "Fund Tracker",
    "GENERAL_MANAGER",
    "Watchdog Automation Sales &amp; Services",
    'data-action="frt-finance-view" data-view="tracker"',
    'data-action="frt-finance-view" data-view="executive"',
    'data-action="frt-finance-refresh"',
    'data-frt-section="new"',
    'data-frt-section="archive"',
    'data-frt-section="activity"',
    'data-frt-section="discussion"',
  ]) assert.ok(html.includes(fragment), fragment);
});

test("Fund Tracker route reuses the existing board host, adapter, renderer and delegated event state", () => {
  for (const fragment of [
    "import {FundTrackerNativeClient} from './fund-tracker-native.js'",
    "import {renderFundTrackerNative} from './fund-tracker-ui.js'",
    "db.nativeApplicationBoardContext('fund-released-tracker')",
    "if(parts[0]==='fund-tracker'){",
    "pendingNativeSearchSelection={applicationId:'frt',recordId:selectedRecord.requestId",
    "navigationScope:selectedRecord.companyCode",
    "await loadBoard(fundTrackerBoard.id,'finance',null,null,fundTrackerContext);",
    "const fundTracker=new FundTrackerNativeClient({auth,api:db})",
    "fundTracker.snapshot(",
    "fundTracker.searchRequests(query,{limit})",
    "getHref:row=>fundTrackerRecordHref(row.companyCode,row.requestId)",
    "workspaceApplicationsForNavigation(state.context?.workspace_id,state.boards)",
    "case 'frt-finance-view':",
    "case 'frt-finance-detail':",
    "case 'frt-finance-action':",
    "state.frtFinanceView",
    "return renderFundTrackerApplication()",
  ]) assert.ok(app.includes(fragment), fragment);
  const fundTracker = workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID, []).find((application) => application.id === 'frt');
  assert.equal(fundTracker?.href, '#/fund-tracker');
  assert.equal(fundTracker?.icon, 'finance');
  assert.equal(app.includes("loadFRTFinanceReadOnly("), false);
  assert.equal(app.includes("searchFRTRequestsReadOnly("), false);
  for (const call of [
    "fundTracker.createRequest(", "fundTracker.updateFiling(",
    "fundTracker.updateRequestDate(", "fundTracker.loadPersonAssignment(",
    "fundTracker.savePersonAssignment(", "fundTracker.executeAction(",
    "fundTracker.loadLiquidation(", "fundTracker.submitLiquidation(",
    "fundTracker.loadBankExecution(", "fundTracker.recordBankExecution(",
    "fundTracker.loadComments(", "fundTracker.addComment(",
    "fundTracker.loadAuditPage(", "fundTracker.loadDeadlineSnapshots(",
    "fundTracker.loadAgingSummary(", "fundTracker.loadArchive(",
    "fundTracker.restoreRequest(", "fundTracker.loadVoucher(",
    "fundTracker.loadRequestDetail(", "fundTracker.createIntercompanyObligation(",
    "fundTracker.recordIntercompanySettlement(", "fundTracker.loadCompanyProfile(",
    "fundTracker.saveCompanyProfileWithLogo(", "fundTracker.loadCompanyLogoDataUrl(",
    "fundTracker.mountAccountingEditor(", "fundTracker.recipients",
  ]) assert.ok(app.includes(call), call);
  for (const directImport of [
    "from './frt-filing-workflow.js'", "from './frt-board-date-edit.js'",
    "from './frt-board-person-assignment.js'", "from './frt-board-domain-actions.js'",
    "from './frt-liquidation.js'", "from './frt-bank-execution.js'",
    "from './frt-collaboration.js'", "from './frt-archive.js'",
    "from './frt-voucher.js'", "from './frt-intercompany-client.js'",
    "from './frt-recipient-client.js'", "from './frt-finance-workflow.js'",
    "from './frt-accounting.js'",
  ]) assert.equal(app.includes(directImport), false, directImport);
});

test("Fund Tracker application styles are scoped and registered in the generated stylesheet pipeline", () => {
  for (const fragment of [
    ".frt-native",
    "--fm1-ink",
    "@media (max-width: 720px)",
    "@media (prefers-reduced-motion: reduce)",
    "focus-visible",
  ]) assert.ok(css.includes(fragment), fragment);
  assert.ok(manifest.includes("frontend/fund-tracker-application.css"));
  assert.ok(bundle.includes("/* frontend/fund-tracker-application.css */"));
  assert.ok(bundle.includes("frt-app-header"));
  assert.ok(htmlEntry.includes("frontend/fund-tracker-application.css"));
  assert.ok(pagesSmoke.includes("frontend/fund-tracker-application.js"));
  assert.ok(pagesSmoke.includes("frontend/fund-tracker-native.js"));
  assert.ok(pagesSmoke.includes("frontend/fund-tracker-ui.js"));
  assert.ok(pagesSmoke.includes("frontend/fund-tracker-application.css"));
  assert.ok(sidebarIcons.includes("finance:"));
});
