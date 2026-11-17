import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = require("axe-core").source;
const executablePath =
  process.env.CHROMIUM_PATH ||
  "/Applications/Chromium.app/Contents/MacOS/Chromium";
const baseUrl =
  process.env.FM1_TEST_URL ||
  "http://127.0.0.1:5173/frontend/tests/fixtures/fm1-component.html";
const scopeA = baseUrl + "?user=fm1-user-a&workspace=fm1-workspace-a";

let devServer = null;
let staticServer = null;
let browser = null;

async function startStaticServer() {
  const root = resolve(process.cwd());
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://127.0.0.1").pathname,
      );
      const filePath = resolve(root, "." + pathname);
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const content = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type":
          mimeTypes[extname(filePath)] || "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return {
    server,
    baseUrl: "http://127.0.0.1:" + address.port,
  };
}

async function ensureViteServer() {
  try {
    const response = await fetch(baseUrl);
    if (response.ok) return;
  } catch {
    // Start the local Vite server below when no server is already listening.
  }
  if (process.env.FM1_TEST_URL) {
    throw new Error(
      "FM1_TEST_URL is not reachable; refusing to start a different test server.",
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
      throw new Error(
        "Vite exited before the FM1 browser fixture became available.",
      );
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Wait for the local development server to become ready.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the FM1 Vite test server.");
}

try {
  await ensureViteServer();
  const staticFixture = await startStaticServer();
  staticServer = staticFixture.server;
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(scopeA, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByText("Awaiting acceptance").first().waitFor();

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
            nodes: item.nodes.map((node) => node.target),
          })),
        ),
    );
  };

  await checkAccessibility("FM1 overview");
  await page.getByRole("button", { name: "Tickets" }).click();
  await page
    .getByRole("heading", { name: "Authoritative ticket queue" })
    .waitFor();
  await page.locator('[data-fm1-action="new-ticket"]').first().click();
  await page.getByRole("heading", { name: "New service request" }).waitFor();

  await page.locator('input[name="requesterName"]').fill("FM1 Operator");
  await page.locator('input[name="callbackNumber"]').fill("+63 917 123 4567");
  await page.locator('input[name="subject"]').fill("WinCC station unavailable");
  await page.locator('select[name="priority"]').selectOption("P2");
  await page
    .locator('select[name="productionImpact"]')
    .selectOption("degraded");
  await page
    .locator('textarea[name="description"]')
    .fill(
      "Operator reports that the WinCC station is unavailable following a recent restart.",
    );
  await page.locator('input[name="assetReference"]').fill("FM1-WINCC-01");
  await page.locator('input[name="productionStopped"]').check();

  await checkAccessibility("FM1 intake form");
  await page.getByRole("button", { name: "Save local draft" }).click();
  await page.getByText("WinCC station unavailable").waitFor();
  await page.getByText(/LOCAL-DRAFT-/).waitFor();
  await page.getByText("Local draft · Not submitted").waitFor();
  const storedDraft = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("apsyntra-fm1-local-drafts", 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("intakeDrafts", "readonly");
          const request = transaction
            .objectStore("intakeDrafts")
            .index("scopeKey")
            .getAll("fm1-user-a::fm1-workspace-a");
          request.onsuccess = () => resolve(request.result[0] || null);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
  assert.equal(
    storedDraft?.productionStopped,
    true,
    "production-stopped checkbox must persist independently of the impact selector",
  );
  assert.equal(storedDraft?.scopeKey, "fm1-user-a::fm1-workspace-a");

  const replaceScope = async (userId, workspaceId) =>
    page.locator("#fm1-application-root").evaluate(
      (element, scope) => {
        const replacement = document.createElement("div");
        replacement.id = "fm1-application-root";
        element.replaceWith(replacement);
        window.__fm1Mount(replacement, scope);
      },
      { userId, workspaceId },
    );

  // Same-document remount simulates the CRM shell replacing the application after a workspace/account switch.
  await replaceScope("fm1-user-b", "fm1-workspace-b");
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByRole("button", { name: "Tickets" }).click();
  await page.getByRole("heading", { name: "No intake drafts yet" }).waitFor();

  await replaceScope("fm1-user-a", "fm1-workspace-a");
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByRole("button", { name: "Tickets" }).click();
  await page.getByText("WinCC station unavailable").waitFor();
  await page.getByText("Local draft · Not submitted").waitFor();

  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    app: document.querySelector(".fm1-app")?.scrollWidth || 0,
  }));
  assert.ok(
    overflow.document <= overflow.viewport,
    "FM1 mobile layout overflows horizontally: " + JSON.stringify(overflow),
  );

  await page.locator('[data-fm1-action="delete-draft"]').click();
  await page.getByRole("heading", { name: "No intake drafts yet" }).waitFor();
  assert.deepEqual(
    pageErrors,
    [],
    "browser console/page errors: " + pageErrors.join(" | "),
  );

  const workflowPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const workflowErrors = [];
  workflowPage.on("pageerror", (error) => workflowErrors.push(error.message));
  workflowPage.on("console", (message) => {
    if (message.type() === "error") workflowErrors.push(message.text());
  });
  await workflowPage.goto(baseUrl + "?mockServer=true", {
    waitUntil: "networkidle",
  });
  await workflowPage.getByRole("button", { name: "Tickets" }).click();
  await workflowPage
    .getByRole("heading", { name: "Authoritative ticket queue" })
    .waitFor();
  await workflowPage.waitForFunction(() =>
    document.querySelector(".fm1-ticket-table tbody tr"),
  );
  await checkAccessibility("FM1 server ticket queue");
  await workflowPage.waitForFunction(() => {
    const button = document.querySelector(
      '[data-fm1-action="ticket-page-next"]',
    );
    return button && !button.disabled;
  });
  await workflowPage.locator('[data-fm1-action="ticket-page-next"]').click();
  let queueCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast((call) => call.name === "fm1_list_tickets_v1"),
  );
  assert.equal(queueCall.args.p_offset, 50);
  await workflowPage.locator('[data-fm1-action="ticket-page-prev"]').click();
  await workflowPage
    .locator('[data-fm1-ticket-filter-form] input[name="search"]')
    .fill("Browser acceptance");
  await workflowPage
    .locator('[data-fm1-ticket-filter-form] select[name="status"]')
    .selectOption("In Progress");
  await workflowPage
    .locator('[data-fm1-ticket-filter-form] select[name="priority"]')
    .selectOption("P2");
  await workflowPage
    .locator('[data-fm1-ticket-filter-form] button[type="submit"]')
    .click();
  await workflowPage.getByText("Ticket filters applied.").waitFor();
  queueCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast((call) => call.name === "fm1_list_tickets_v1"),
  );
  assert.equal(queueCall.args.p_search, "Browser acceptance");
  assert.equal(queueCall.args.p_status, "In Progress");
  assert.equal(queueCall.args.p_priority, "P2");
  await workflowPage.locator('[data-fm1-action="refresh-server"]').click();
  await workflowPage.waitForFunction(() => {
    const call = window.__fm1Calls.findLast(
      (item) => item.name === "fm1_list_tickets_v1",
    );
    return (
      call?.args.p_search === "Browser acceptance" &&
      call?.args.p_status === "In Progress" &&
      call?.args.p_priority === "P2"
    );
  });
  queueCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast((call) => call.name === "fm1_list_tickets_v1"),
  );
  assert.equal(queueCall.args.p_search, "Browser acceptance");
  await workflowPage.getByRole("button", { name: "Reports" }).click();
  await workflowPage
    .getByRole("heading", { name: "Incident and service operations" })
    .waitFor();
  await workflowPage.getByRole("button", { name: "Tickets" }).click();
  assert.equal(
    await workflowPage
      .locator('[data-fm1-ticket-filter-form] input[name="search"]')
      .inputValue(),
    "Browser acceptance",
  );
  assert.equal(
    await workflowPage
      .locator('[data-fm1-ticket-filter-form] select[name="status"]')
      .inputValue(),
    "In Progress",
  );
  await workflowPage
    .locator('[data-fm1-action="clear-ticket-filters"]')
    .click();
  await workflowPage.locator('[data-fm1-action="view-ticket"]').first().click();
  await workflowPage
    .getByRole("heading", { name: "Browser acceptance incident" })
    .waitFor();
  await workflowPage
    .getByRole("heading", { name: "Record priority decision" })
    .waitFor();
  await workflowPage
    .getByRole("heading", { name: "Hold requests and review history" })
    .waitFor();
  await checkAccessibility("FM1 incident detail and edit form");

  await workflowPage.evaluate(() => {
    window.__fm1ForceNextTicketConflict = true;
  });
  await workflowPage
    .locator('[data-fm1-edit-ticket-form] input[name="requesterName"]')
    .fill("Edited Browser Operator");
  await workflowPage
    .locator('[data-fm1-edit-ticket-form] textarea[name="description"]')
    .fill(
      "Updated synthetic incident description for revision-safe editing acceptance.",
    );
  await workflowPage
    .locator('[data-fm1-edit-ticket-form] button[type="submit"]')
    .click();
  await workflowPage
    .getByText(
      /This ticket changed elsewhere\. The latest server revision has been loaded/,
    )
    .first()
    .waitFor();
  await workflowPage.getByText("Revision 2").waitFor();
  assert.equal(
    await workflowPage
      .locator('[data-fm1-edit-ticket-form] input[name="requesterName"]')
      .inputValue(),
    "Concurrent Server Operator",
  );
  const conflictCalls = await workflowPage.evaluate(() =>
    window.__fm1Calls.filter((call) => call.name === "fm1_update_ticket_v1"),
  );
  assert.equal(
    conflictCalls.length,
    1,
    "a stale revision must not be retried automatically",
  );

  await workflowPage
    .locator('[data-fm1-edit-ticket-form] input[name="requesterName"]')
    .fill("Edited Browser Operator");
  await workflowPage
    .locator('[data-fm1-edit-ticket-form] textarea[name="description"]')
    .fill(
      "Updated synthetic incident description for revision-safe editing acceptance.",
    );
  await workflowPage.locator("[data-fm1-edit-ticket-form]").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await workflowPage
    .getByText(/Incident details updated/)
    .first()
    .waitFor();
  const updateCallsAfterRecovery = await workflowPage.evaluate(() =>
    window.__fm1Calls.filter((call) => call.name === "fm1_update_ticket_v1"),
  );
  assert.equal(
    updateCallsAfterRecovery.length,
    2,
    "two submit events during one in-flight write must produce one RPC",
  );
  const editCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast((call) => call.name === "fm1_update_ticket_v1"),
  );
  assert.equal(editCall.args.p_expected_revision, 2);
  assert.equal(editCall.args.p_requester_name, "Edited Browser Operator");
  assert.equal(
    editCall.args.p_description,
    "Updated synthetic incident description for revision-safe editing acceptance.",
  );

  await workflowPage
    .locator('[data-fm1-assignment-form] select[name="assigneeId"]')
    .selectOption("00000000-0000-4000-8000-000000000004");
  await workflowPage
    .locator('[data-fm1-assignment-form] button[type="submit"]')
    .click();
  await workflowPage.getByText("Ticket assignment updated.").first().waitFor();

  await workflowPage
    .locator('[data-fm1-conversation-form] select[name="visibility"]')
    .selectOption("internal");
  await workflowPage
    .locator('[data-fm1-conversation-form] textarea[name="body"]')
    .fill("Browser acceptance note: technician acknowledged the incident.");
  await workflowPage
    .locator('[data-fm1-conversation-form] button[type="submit"]')
    .click();
  await workflowPage
    .getByText("Internal conversation recorded.")
    .first()
    .waitFor();

  await workflowPage
    .locator('select[name="requestedPriority"]')
    .selectOption("P1");
  await workflowPage
    .locator('select[name="effectivePriority"]')
    .selectOption("P1");
  await workflowPage
    .locator('[data-fm1-priority-form] input[name="reason"]')
    .fill("Synthetic priority escalation test");
  await workflowPage
    .locator('[data-fm1-priority-form] button[type="submit"]')
    .click();
  await workflowPage
    .getByText(/Priority event recorded/)
    .first()
    .waitFor();

  await workflowPage
    .locator('[data-fm1-hold-form] input[name="externalOwner"]')
    .fill("Synthetic OEM");
  await workflowPage
    .locator('[data-fm1-hold-form] input[name="requiredAction"]')
    .fill("Confirm replacement sensor dispatch");
  await workflowPage
    .locator('[data-fm1-hold-form] textarea[name="evidence"]')
    .fill("OEM case reference SYNTH-001 confirms pending shipment.");
  await workflowPage
    .locator('[data-fm1-hold-form] button[type="submit"]')
    .click();
  await workflowPage
    .getByText(/Dependency hold request recorded/)
    .first()
    .waitFor();

  await workflowPage
    .locator('[data-fm1-hold-review-form] select[name="decision"]')
    .first()
    .selectOption("validated");
  await workflowPage
    .locator('[data-fm1-hold-review-form] textarea[name="evidence"]')
    .first()
    .fill("Synthetic review confirms access dependency is valid.");
  await workflowPage
    .locator('[data-fm1-hold-review-form] input[name="diagnosisBlocked"]')
    .first()
    .check();
  await workflowPage
    .locator('[data-fm1-hold-review-form] button[type="submit"]')
    .first()
    .click();
  await workflowPage
    .getByText("Dependency hold review recorded.")
    .first()
    .waitFor();

  await workflowPage
    .locator('[data-fm1-hold-end-form] input[name="reason"]')
    .first()
    .fill("Synthetic dependency resolved");
  await workflowPage
    .locator('[data-fm1-hold-end-form] button[type="submit"]')
    .first()
    .click();
  await workflowPage
    .getByText(/Dependency hold ended/)
    .first()
    .waitFor();

  await workflowPage.getByRole("button", { name: "Reports" }).click();
  await workflowPage
    .getByRole("heading", { name: "Incident and service operations" })
    .waitFor();
  await workflowPage.getByText("Incident status distribution").waitFor();
  await checkAccessibility("FM1 operational reports");
  const queueCallCountBeforeReportRefresh = await workflowPage.evaluate(
    () =>
      window.__fm1Calls.filter((call) => call.name === "fm1_list_tickets_v1")
        .length,
  );
  const reportCallCountBeforeRefresh = await workflowPage.evaluate(
    () =>
      window.__fm1Calls.filter(
        (call) => call.name === "fm1_operational_report_v1",
      ).length,
  );
  await workflowPage.locator('[data-fm1-action="refresh-server"]').click();
  await workflowPage.waitForFunction(
    (before) =>
      window.__fm1Calls.filter(
        (call) => call.name === "fm1_operational_report_v1",
      ).length > before,
    reportCallCountBeforeRefresh,
  );
  const queueCallCountAfterReportRefresh = await workflowPage.evaluate(
    () =>
      window.__fm1Calls.filter((call) => call.name === "fm1_list_tickets_v1")
        .length,
  );
  assert.equal(
    queueCallCountAfterReportRefresh,
    queueCallCountBeforeReportRefresh,
  );
  const reportCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast(
      (call) => call.name === "fm1_operational_report_v1",
    ),
  );
  assert.equal(
    reportCall.args.p_workspace_id,
    "00000000-0000-4000-8000-000000000001",
  );

  await workflowPage.getByRole("button", { name: "Duty" }).click();
  await workflowPage.getByRole("heading", { name: "Duty dashboard" }).waitFor();
  await workflowPage.getByText("Unassigned P1 / P2 incidents").waitFor();
  await checkAccessibility("FM1 duty dashboard and warning policy");
  await workflowPage
    .locator('[data-fm1-warning-policy-form] input[name="enabled"]')
    .check();
  await workflowPage
    .locator(
      '[data-fm1-warning-policy-form] input[name="humanResponseMinutes"]',
    )
    .fill("15");
  await workflowPage
    .locator(
      '[data-fm1-warning-policy-form] input[name="engineeringStartMinutes"]',
    )
    .fill("30");
  await workflowPage
    .locator('[data-fm1-warning-policy-form] input[name="restorationMinutes"]')
    .fill("60");
  await workflowPage
    .locator('[data-fm1-warning-policy-form] button[type="submit"]')
    .click();
  await workflowPage
    .getByText("Approaching-deadline warning policy enabled.")
    .waitFor();
  const policyCall = await workflowPage.evaluate(() =>
    window.__fm1Calls.findLast(
      (call) => call.name === "fm1_update_deadline_warning_policy_v1",
    ),
  );
  assert.equal(policyCall.args.p_enabled, true);
  assert.equal(policyCall.args.p_human_response_before_seconds, 900);
  assert.equal(policyCall.args.p_engineering_start_before_seconds, 1800);
  assert.equal(policyCall.args.p_restoration_before_seconds, 3600);

  await workflowPage.getByRole("button", { name: "Notifications" }).click();
  await workflowPage
    .getByRole("heading", { name: "Notification inbox" })
    .waitFor();
  await workflowPage.getByText("New FM1 incident").waitFor();
  await workflowPage.getByRole("button", { name: "Mark read" }).click();
  await workflowPage.getByText("Read", { exact: true }).waitFor();
  await workflowPage.getByRole("button", { name: "Open incident" }).click();
  await workflowPage
    .getByRole("heading", { name: "Browser acceptance incident" })
    .waitFor();

  const calls = await workflowPage.evaluate(() =>
    window.__fm1Calls.map((call) => call.name),
  );
  for (const name of [
    "fm1_assign_ticket_v1",
    "fm1_update_ticket_v1",
    "fm1_operational_report_v1",
    "fm1_deadline_warning_policy_v1",
    "fm1_update_deadline_warning_policy_v1",
    "fm1_add_conversation_v1",
    "fm1_notification_inbox_v1",
    "fm1_notification_mark_read_v1",
    "fm1_record_priority_v1",
    "fm1_request_hold_v1",
    "fm1_validate_hold_v1",
    "fm1_end_hold_v1",
  ]) {
    assert.ok(calls.includes(name), "missing synthetic UI RPC call: " + name);
  }
  assert.deepEqual(
    workflowErrors,
    [],
    "FM1 operational workflow browser errors: " + workflowErrors.join(" | "),
  );
  await workflowPage.close();

  const staticPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const staticErrors = [];
  staticPage.on("pageerror", (error) => staticErrors.push(error.message));
  staticPage.on("console", (message) => {
    if (message.type() === "error") staticErrors.push(message.text());
  });
  await staticPage.goto(
    staticFixture.baseUrl +
      "/frontend/tests/fixtures/fm1-component.html?user=static-user&workspace=static-workspace&disableCustomElements=true",
    { waitUntil: "networkidle" },
  );
  await staticPage
    .getByRole("heading", { name: /FM1 SLA Ticketing/ })
    .waitFor();
  await staticPage.getByRole("button", { name: "Tickets" }).click();
  await staticPage
    .getByRole("heading", { name: "Authoritative ticket queue" })
    .waitFor();
  assert.deepEqual(
    staticErrors,
    [],
    "native static ES module browser errors: " + staticErrors.join(" | "),
  );
  await staticPage.close();

  console.log("FM1_BROWSER_ACCEPTANCE_PASS");
  console.log(
    "Vite and unbundled static-HTTP native ESM acceptance (including window.customElements=null), server-side ticket filters and pagination, stale-revision conflict refresh without retry, duplicate-submit suppression, revision-safe incident editing, server-backed reports, configurable warning policy, assignment, conversations, priority changes, dependency holds, notification inbox, scoped IndexedDB lifecycle, cross-user/workspace isolation, desktop/mobile layout and WCAG 2.2 AA axe checks passed.",
  );
} finally {
  if (browser) await browser.close();
  if (staticServer?.listening) {
    await new Promise((resolveClose, reject) =>
      staticServer.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
  if (devServer && devServer.exitCode === null) {
    const exited = new Promise((resolve) => devServer.once("exit", resolve));
    devServer.kill("SIGTERM");
    await exited;
  }
}
