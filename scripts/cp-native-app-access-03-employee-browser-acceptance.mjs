#!/usr/bin/env node
/**
 * CP-NATIVE-APP-ACCESS-03 — genuine signed-employee cold-start and recovery acceptance.
 *
 * Usage:
 *   node scripts/cp-native-app-access-03-employee-browser-acceptance.mjs --cdp-url=http://127.0.0.1:<port>
 *
 * Uses an already-authenticated employee tab. It does not automate login, inspect
 * cookies/tokens/storage, submit forms, or write business data. Catalog outages
 * are simulated only by ephemeral Playwright response overrides for wm_list_boards.
 * The user's browser and session remain open; only the original URL is restored.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
const cdpUrl = process.argv
  .find((value) => value.startsWith("--cdp-url="))
  ?.slice("--cdp-url=".length);
const catalogRpc = "wm_list_boards";
const applications = [
  {
    route: "#/time-tracker",
    label: "TimeTracker",
    moduleId: "time-tracker",
    boardId: "46bf4ee7-368a-4c35-842c-8593ea1f6ac3",
    domainRpcs: [
      "timetracker_ot_snapshot",
      "timetracker_attendance_capabilities",
    ],
    visible: "TimeTracker Attendance",
  },
  {
    route: "#/fund-tracker",
    label: "Fund Tracker",
    moduleId: "fund-released-tracker",
    boardId: "f36da8fe-8d9d-4629-9938-12533cb3ca39",
    domainRpcs: [
      "frt_bootstrap",
      "frt_board_dashboard_safe",
      "frt_board_list_safe",
    ],
    visible: "Fund Tracker",
  },
  {
    route: "#/fueltrack",
    label: "FuelTrack+",
    moduleId: "fueltrack-plus",
    boardId: "7af78b3f-67bf-4600-9aa1-9006d19d486e",
    domainRpcs: ["fueltrack_v3_read"],
    visible: "FuelTrack+",
  },
  {
    route: "#/tradelink/documents",
    label: "TradeLink",
    moduleId: "tradelink",
    boardId: "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88",
    domainRpcs: ["tl03_assigned_documents"],
    visible: "TradeLink",
  },
];
const overview = { route: "#/overview", label: "Overview" };
const statuses = [403, 503];
const rpcName = (url) => new URL(url).pathname.split("/").pop();
const waitForRpc = (page, rpc, status, postDataIncludes = "") =>
  page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/rpc/" + rpc) &&
        response.status() === status &&
        (!postDataIncludes ||
          (response.request().postData() || "").includes(postDataIncludes))
      );
    },
    { timeout: 35000 },
  );
const visibleText = (page) => page.locator("body").innerText();

if (!cdpUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdpUrl)) {
  console.error(
    "BLOCKED: provide --cdp-url=http://127.0.0.1:<existing-port> for an already signed employee browser.",
  );
  process.exitCode = 2;
} else {
  const browser = await chromium.connectOverCDP(cdpUrl);
  let page = null,
    originalUrl = null,
    catalogFailureStatus = null,
    signedUserId = null,
    signedWorkspaceId = null;
  const pageErrors = [],
    failedRequests = [],
    unexpectedHttpErrors = [],
    rpcResponses = [];
  const report = {
    milestone: "CP-NATIVE-APP-ACCESS-03",
    mode: "genuine-signed-employee-read-only",
    catalogFailureStatuses: statuses,
    overview: [],
    applications: [],
    recovery: null,
    productionDataWritten: false,
    workflowActionsSubmitted: false,
    productionPoliciesChanged: false,
  };
  let failure = null;
  try {
    const candidates = browser.contexts().flatMap((context) => context.pages());
    for (const candidate of candidates) {
      if (!candidate.url().startsWith(BASE)) continue;
      const body = await visibleText(candidate).catch(() => "");
      if (
        body.includes("Secure session") &&
        body.includes("Workspace member") &&
        body.includes("Sign out")
      ) {
        page = candidate;
        break;
      }
    }
    assert.ok(
      page,
      "BLOCKED: open an existing signed employee APSYNTRA CRM tab; login is never automated.",
    );
    originalUrl = page.url();
    const initial = await visibleText(page);
    assert.match(initial, /Secure session/);
    assert.match(initial, /Workspace member/);
    assert.doesNotMatch(initial, /Sign in with your existing work account/);

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes("/rest/v1/"))
        failedRequests.push({
          path: url.pathname,
          reason: request.failure()?.errorText,
        });
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (!url.pathname.includes("/rest/v1/rpc/")) return;
      const rpc = rpcName(response.url()),
        status = response.status();
      rpcResponses.push({ rpc, status });
      if (
        status >= 400 &&
        !(rpc === catalogRpc && status === catalogFailureStatus)
      )
        unexpectedHttpErrors.push({ rpc, status });
    });

    await page.route("**/rest/v1/rpc/wm_list_boards", async (route) => {
      if (catalogFailureStatus === null) return route.continue();
      await route.fulfill({
        status: catalogFailureStatus,
        contentType: "application/json",
        body: JSON.stringify({
          message: `CP-NATIVE-APP-ACCESS-03 ephemeral catalog outage ${catalogFailureStatus}`,
        }),
      });
    });

    for (const status of statuses) {
      catalogFailureStatus = status;
      await page.goto(BASE + overview.route, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      let catalogPromise = waitForRpc(page, catalogRpc, status);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await catalogPromise;
      await page.waitForFunction(
        () =>
          document.body.innerText.includes(
            "Board catalog temporarily unavailable",
          ),
        null,
        { timeout: 25000 },
      );
      const overviewText = await visibleText(page);
      for (const name of [
        "TimeTracker",
        "Fund Tracker",
        "FuelTrack+",
        "TradeLink",
      ])
        assert.ok(
          overviewText.includes(name),
          `Overview must retain ${name} navigation during ${status}`,
        );
      report.overview.push({
        status,
        result: "PASS",
        catalogFailureObserved: true,
        nativeNavigationRetained: true,
      });

      for (const app of applications) {
        await page.goto(BASE + app.route, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page.waitForFunction(
          (label) => document.body.innerText.includes(label),
          app.visible,
          { timeout: 35000 },
        );
        const resolverPromise = waitForRpc(
          page,
          "native_application_board_context",
          200,
          app.moduleId,
        );
        const domainPromises = app.domainRpcs.map((rpc) =>
          waitForRpc(page, rpc, 200),
        );
        catalogPromise = waitForRpc(page, catalogRpc, status);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
        const [resolverResponse] = await Promise.all([
          resolverPromise,
          catalogPromise,
          ...domainPromises,
        ]);
        const payload = await resolverResponse.json();
        const context = Array.isArray(payload) ? payload[0] : payload;
        assert.equal(
          resolverResponse.status(),
          200,
          `${app.label} native resolver`,
        );
        assert.equal(
          context?.moduleId,
          app.moduleId,
          `${app.label} module identity`,
        );
        assert.equal(
          context?.board?.id,
          app.boardId,
          `${app.label} canonical board`,
        );
        assert.ok(context?.userId, `${app.label} signed user identity`);
        assert.ok(context?.workspaceId, `${app.label} workspace context`);
        if (signedUserId === null) {
          signedUserId = context.userId;
          signedWorkspaceId = context.workspaceId;
        }
        assert.equal(
          context.userId,
          signedUserId,
          `${app.label} must retain the same signed employee`,
        );
        assert.equal(
          context.workspaceId,
          signedWorkspaceId,
          `${app.label} must retain the same workspace`,
        );
        await page.waitForFunction(
          () =>
            document.body.innerText.includes("Secure session") &&
            document.body.innerText.includes("Workspace member"),
          null,
          { timeout: 20000 },
        );
        if (app.moduleId === "time-tracker")
          assert.equal(
            context?.role,
            "Employee",
            "TimeTracker module role confirms employee acceptance",
          );
        await page.waitForFunction(
          (label) => document.body.innerText.includes(label),
          app.visible,
          { timeout: 35000 },
        );
        const body = await visibleText(page);
        assert.doesNotMatch(
          body,
          /existing .* board was not found|existing attendance board unavailable/i,
          app.label,
        );
        if (app.moduleId === "time-tracker")
          assert.match(
            body,
            /START SESSION|END SESSION/i,
            "TimeTracker clock control",
          );
        if (app.moduleId === "fund-released-tracker")
          assert.match(
            body,
            /New Fund Request/i,
            "Fund Tracker request entry point",
          );
        if (app.moduleId === "fueltrack-plus")
          assert.match(
            body,
            /New Fuel Request/i,
            "FuelTrack+ request entry point",
          );
        if (app.moduleId === "tradelink")
          assert.match(
            body,
            /All Documents/i,
            "TradeLink assigned-document navigation",
          );
        const domainObserved = app.domainRpcs.map((rpc) => ({
          rpc,
          status:
            rpcResponses.findLast((event) => event.rpc === rpc)?.status ?? null,
        }));
        for (const item of domainObserved)
          assert.equal(item.status, 200, `${app.label} ${item.rpc}`);
        const denied = rpcResponses.findLast(
          (event) => event.rpc === catalogRpc && event.status === status,
        );
        assert.ok(
          denied,
          `${app.label} must cold-start while ${catalogRpc} returns ${status}`,
        );
        report.applications.push({
          application: app.label,
          catalogStatus: status,
          resolverStatus: 200,
          moduleId: context.moduleId,
          canonicalBoardId: context.board.id,
          workspaceResolved: true,
          domainReads: domainObserved,
          nativeInterfaceVisible: true,
          result: "PASS",
        });
      }
    }

    // Re-enter Overview while the 503 is still active so the degraded notice
    // is genuinely present. Then remove only the browser override and use the
    // existing non-mutating retry action to prove that recovery clears it.
    const degradedCatalog = waitForRpc(page, catalogRpc, 503);
    await page.goto(BASE + overview.route, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await degradedCatalog;
    await page.waitForFunction(
      () =>
        document.body.innerText.includes(
          "Board catalog temporarily unavailable",
        ),
      null,
      { timeout: 25000 },
    );
    catalogFailureStatus = null;
    await page.unroute("**/rest/v1/rpc/wm_list_boards");
    const recoveredCatalog = waitForRpc(page, catalogRpc, 200);
    await page.getByRole("button", { name: "Retry workspace refresh" }).click();
    await recoveredCatalog;
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes(
          "Board catalog temporarily unavailable",
        ),
      null,
      { timeout: 30000 },
    );
    report.recovery = {
      catalogStatus: 200,
      degradedNoticeCleared: true,
      result: "PASS",
    };

    assert.deepEqual(pageErrors, [], "No JavaScript page errors");
    assert.deepEqual(failedRequests, [], "No failed network requests");
    assert.deepEqual(unexpectedHttpErrors, [], "No unexpected HTTP errors");
    report.pageErrors = pageErrors.length;
    report.failedRequests = failedRequests.length;
    report.unexpectedHttpErrors = unexpectedHttpErrors.length;
    report.outcome = "PASS";
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    failure = error;
  } finally {
    if (page && originalUrl && !page.isClosed()) {
      await page.unroute("**/rest/v1/rpc/wm_list_boards").catch(() => {});
      await page
        .goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
        .catch(() => {});
    }
  }
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
  await new Promise((resolve) => process.stdout.write("", resolve));
  await new Promise((resolve) => process.stderr.write("", resolve));
  process.exit(process.exitCode || 0);
}
