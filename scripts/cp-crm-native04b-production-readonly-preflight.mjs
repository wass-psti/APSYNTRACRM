/**
 * CP-CRM-NATIVE-04B — production read-only signed browser preflight.
 * Connects only to an existing local Chromium instance with an existing
 * authenticated employee tab; it does not access credentials, storage, API
 * response bodies, or submit any application business mutations.
 *
 * node scripts/cp-crm-native04b-production-readonly-preflight.mjs \
 *   --cdp-url=http://127.0.0.1:9225
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
const cdp = process.argv.find((arg) => arg.startsWith("--cdp-url="))?.slice(10);
if (!cdp || !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp)) {
  console.error("Provide --cdp-url=http://127.0.0.1:<existing-port>");
  process.exitCode = 2;
} else {
  const browser = await chromium.connectOverCDP(cdp);
  let page;
  let oldUrl;
  const results = [];
  const scenarios = [
    {
      route: "#/time-tracker",
      name: "TimeTracker",
      phrases: ["TimeTracker Attendance", "Signed Clock writes active"],
    },
    {
      route: "#/fund-tracker",
      name: "Fund Tracker",
      phrases: ["Fund Release Management", "Signed financial data connected"],
    },
    {
      route: "#/fueltrack",
      name: "FuelTrack+",
      phrases: ["Verified signed FuelTrack operations", "Dashboard"],
    },
    {
      route: "#/tradelink/documents",
      name: "TradeLink",
      phrases: ["My Assigned Documents", "Only documents assigned"],
    },
  ];
  try {
    const contexts = browser.contexts();
    const candidates = contexts
      .flatMap((context) => context.pages())
      .filter((p) => p.url().startsWith(BASE) && !p.isClosed());
    assert.ok(candidates.length > 0, "No existing signed CRM tab");
    // Prefer the already-open attendance interface to avoid using an admin
    // session or silently switching identity.
    for (const candidate of candidates) {
      const view = await candidate.evaluate(() => ({
        authenticated: window.__APSYNTRA_STARTUP?.state === "AUTHENTICATED",
        signed: document.body.innerText.includes("Secure session"),
        employee:
          document.body.innerText.includes("TimeTracker Attendance") &&
          document.body.innerText.includes("Employee"),
      }));
      if (view.authenticated && view.signed && view.employee) {
        page = candidate;
        break;
      }
    }
    assert.ok(page, "Signed employee TimeTracker tab not present");
    oldUrl = page.url();
    const failures = [];
    const pageErrors = [];
    page.on("requestfailed", (req) => {
      if (new URL(req.url()).hostname.endsWith("supabase.co"))
        failures.push({
          endpoint: new URL(req.url()).pathname.split("/").at(-1),
          kind: "request-failed",
        });
    });
    page.on("response", (res) => {
      const uri = new URL(res.url());
      if (uri.hostname.endsWith("supabase.co") && res.status() >= 400)
        failures.push({
          endpoint: uri.pathname.split("/").at(-1),
          status: res.status(),
        });
    });
    page.on("pageerror", (err) => pageErrors.push(err.name));
    for (const scenario of scenarios) {
      const beforeErrors = failures.length;
      const beforePageErrors = pageErrors.length;
      await page.goto(BASE + scenario.route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForFunction(
        (phrases) =>
          phrases.every((phrase) => document.body.innerText.includes(phrase)),
        scenario.phrases,
        { timeout: 25_000 },
      );
      const state = await page.evaluate(() => ({
        route: location.hash,
        authenticated: window.__APSYNTRA_STARTUP?.state === "AUTHENTICATED",
        signed: document.body.innerText.includes("Secure session"),
      }));
      assert.equal(state.route, scenario.route);
      assert.ok(state.authenticated && state.signed);
      await page.waitForTimeout(1000);
      const newFailures = failures.slice(beforeErrors);
      const newPageErrors = pageErrors.slice(beforePageErrors);
      results.push({
        application: scenario.name,
        session: "genuine-existing-employee",
        ui: "PASS",
        requestErrorCount: newFailures.length,
        javascriptErrorCount: newPageErrors.length,
        endpoints: newFailures,
      });
    }
    console.log(
      JSON.stringify(
        {
          milestone: "CP-CRM-NATIVE-04B",
          category: "read-only-production-preflight",
          result: results.every(
            (x) => x.requestErrorCount === 0 && x.javascriptErrorCount === 0,
          )
            ? "PASS"
            : "PARTIAL",
          results,
          productionBusinessWrites: 0,
          crossSessionTransactionReadback: "NOT_TESTED",
          productionWriteCertification:
            "PENDING_DESIGNATED_TEST_IDENTITIES_AND_RECORDS",
        },
        null,
        2,
      ),
    );
    if (
      results.some((r) => r.requestErrorCount > 0 || r.javascriptErrorCount > 0)
    )
      process.exitCode = 1;
  } finally {
    if (page && oldUrl && !page.isClosed()) {
      await page
        .goto(oldUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })
        .catch(() => {});
    }
    await browser.close();
  }
}
