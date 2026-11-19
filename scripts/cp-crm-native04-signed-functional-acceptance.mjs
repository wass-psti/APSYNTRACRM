/**
 * CP-CRM-NATIVE-04: read-only functional navigation in an already signed
 * production employee Chromium profile. Never collects credentials, cookies,
 * tokens or user records, and never submits application business mutations.
 *
 * Run locally: node scripts/cp-crm-native04-signed-functional-acceptance.mjs
 *   --cdp-url=http://127.0.0.1:9225
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "https://wass-psti.github.io/APSYNTRACRM/";
const cdp = process.argv.find((arg) => arg.startsWith("--cdp-url="))?.slice(10);
if (!cdp || !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp))
  throw new Error("Specify an existing local --cdp-url=http://127.0.0.1:PORT");
const browser = await chromium.connectOverCDP(cdp);
const result = {
  milestone: "CP-CRM-NATIVE-04",
  scope: "existing signed employee, read-only",
  applications: {},
  networkErrors: [],
  pageErrors: [],
  businessWrites: 0,
};
let page, originalUrl;
try {
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((p) => p.url().startsWith(base) && !p.url().includes("#/boards/"));
  assert.ok(
    page,
    "An existing employee tab is required; no login is performed",
  );
  // The CRM's in-memory/sessionStorage authentication does not transfer to a
  // new tab. Reuse the existing signed tab and restore its original route.
  originalUrl = page.url();
  await page.goto(base + "#/overview", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page
    .getByText("CRM Employee", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 30000 });
  const initial = await page.locator("body").innerText();
  assert.match(initial, /Secure session/);
  assert.match(initial, /CRM Employee/);
  assert.match(initial, /Workspace member/);
  page.on("pageerror", (e) => result.pageErrors.push(e.message));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === "https://jtlusodorfnyzgyuewkz.supabase.co")
      result.networkErrors.push({
        path: url.pathname,
        reason: request.failure()?.errorText,
      });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === "https://jtlusodorfnyzgyuewkz.supabase.co" &&
      response.status() >= 400
    )
      result.networkErrors.push({
        path: url.pathname,
        status: response.status(),
      });
  });
  const visit = async (route, phrases) => {
    await page.goto(base + route, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    try {
      await page.waitForFunction(
        (expected) =>
          expected.every((phrase) => document.body.innerText.includes(phrase)),
        phrases,
        { timeout: 18000 },
      );
    } catch (error) {
      const observed = await page.evaluate(
        (expected) => ({
          route: location.hash,
          expected: expected.map((phrase) => ({
            phrase,
            present: document.body.innerText.includes(phrase),
          })),
          errorBanner: !!document.querySelector('[role="alert"]'),
        }),
        phrases,
      );
      throw new Error(
        "Signed workflow assertion failed: " + JSON.stringify(observed),
        { cause: error },
      );
    }
    const body = await page.locator("body").innerText();
    assert.match(body, /Secure session/);
    assert.doesNotMatch(
      body,
      /existing .* board was not found|existing attendance board unavailable/i,
    );
    assert.equal(
      await page.evaluate(() => window.__APSYNTRA_STARTUP?.state),
      "AUTHENTICATED",
    );
  };
  const tab = async (target, phrase) => {
    const control = page.locator(
      '[data-action="tt-tab"][data-target="' + target + '"]',
    );
    await control.waitFor({ state: "visible", timeout: 15000 });
    assert.equal(
      await control.isDisabled(),
      false,
      "TimeTracker " + target + " should be enabled",
    );
    await control.click();
    await page
      .getByText(phrase, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
  };
  await visit("#/time-tracker", [
    "TimeTracker Attendance",
    "Signed Clock writes active",
  ]);
  await tab("log", "Attendance Log");
  await tab("hours", "My Hours");
  await tab("reports", "Reports");
  await tab("calendar", "Calendar");
  await tab("ot", "Overtime");
  result.applications.TimeTracker = {
    status: "PASS",
    views: 6,
    clockWrites: 0,
  };
  await visit("#/fund-tracker", [
    "Fund Release Management",
    "Signed financial data connected",
  ]);
  await page
    .locator('[data-action="frt-finance-view"][data-view="executive"]')
    .click({ timeout: 15000 });
  await page
    .getByText("Executive Dashboard", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  result.applications.FundTracker = {
    status: "PASS",
    views: 2,
    financialWrites: 0,
  };
  const fuelViews = [
    ["#/fueltrack", ["Verified signed FuelTrack operations", "Dashboard"]],
    ["#/fueltrack/analytics", ["Consumption Trend"]],
    ["#/fueltrack/requests", ["Request Log"]],
    ["#/fueltrack/new-request", ["Select Refuel Type"]],
    ["#/fueltrack/approvals", ["Approvals"]],
    [
      "#/fueltrack/activity",
      ["Activity", "signed FuelTrack module Admin session is required"],
    ],
  ];
  for (const [route, phrases] of fuelViews) {
    console.log("CHECKING_FUEL_VIEW", route);
    await visit(route, phrases);
  }
  result.applications.FuelTrack = {
    status: "PASS",
    views: fuelViews.length,
    fuelWrites: 0,
    adminOnlyActivity: "expected non-admin unavailable state (no denied RPC)",
  };
  const tradeViews = [
    ["#/tradelink/documents", ["My Assigned Documents"]],
    ["#/tradelink/activity", ["Signed application audit"]],
    ["#/tradelink/analytics", ["Analytics"]],
  ];
  for (const [route, phrases] of tradeViews) await visit(route, phrases);
  result.applications.TradeLink = {
    status: "PASS",
    views: tradeViews.length,
    documentWrites: 0,
    assignedOnly: true,
  };
  assert.deepEqual(
    result.pageErrors,
    [],
    "JavaScript errors in employee workflow",
  );
  assert.deepEqual(
    result.networkErrors,
    [],
    "Unexpected failing production network reads",
  );
  result.status = "VERIFIED_READ_ONLY_FUNCTIONAL_ACCEPTANCE";
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (page && originalUrl && !page.isClosed())
    await page
      .goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
      .catch(() => {});
  await browser.close();
}
