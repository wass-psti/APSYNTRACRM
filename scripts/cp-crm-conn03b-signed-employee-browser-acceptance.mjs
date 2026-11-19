/**
 * CP-CRM-CONN-03B — read-only acceptance of a *pre-existing* signed employee tab.
 *
 * Usage: node scripts/cp-crm-conn03b-signed-employee-browser-acceptance.mjs \
 *   --cdp-url=http://127.0.0.1:9225
 *
 * The script never accesses cookies, tokens, local/session storage, credentials,
 * document bodies or application mutation handlers. It only navigates existing
 * UI routes and observes response metadata plus visible interface assertions.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin = "https://wass-psti.github.io";
const base = `${origin}/APSYNTRACRM/`;
const cdp = process.argv
  .find((arg) => arg.startsWith("--cdp-url="))
  ?.slice("--cdp-url=".length);

if (!cdp || !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp)) {
  console.error(
    "Provide --cdp-url=http://127.0.0.1:<existing-debug-port> for a signed employee browser.",
  );
  process.exitCode = 2;
} else {
  const browser = await chromium.connectOverCDP(cdp);
  let page;
  let originalUrl;
  const responses = [];
  const failed = [];
  const errors = [];
  const observedBoards = new Set();

  try {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith(base + "#/overview"));
    assert.ok(
      page,
      "An existing signed employee Overview tab must be open; no login will be automated.",
    );
    originalUrl = page.url();

    const initial = await page.locator("body").innerText();
    assert.match(initial, /Secure session/);
    assert.match(initial, /CRM Employee/);
    assert.match(initial, /Workspace member/);
    assert.doesNotMatch(initial, /Sign in with your existing work account/);

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => {
      const path = new URL(request.url()).pathname;
      failed.push({ path, reason: request.failure()?.errorText });
    });
    page.on("response", async (response) => {
      const path = new URL(response.url()).pathname;
      const status = response.status();
      if (status >= 400) responses.push({ path, status });
      if (path !== "/rest/v1/rpc/wm_list_boards" || status !== 200) return;
      try {
        const records = await response.json();
        if (Array.isArray(records)) {
          for (const record of records) {
            if (typeof record?.name === "string")
              observedBoards.add(record.name);
          }
        }
      } catch {
        errors.push("Signed board list response was not valid JSON.");
      }
    });

    const scenarios = [
      {
        route: "#/time-tracker",
        label: "TimeTracker",
        expected: ["TimeTracker Attendance", "Signed Clock writes active"],
      },
      {
        route: "#/fund-tracker",
        label: "Fund Tracker",
        expected: [
          "Fund Release Management",
          "Signed financial data connected",
        ],
      },
      {
        route: "#/fueltrack",
        label: "FuelTrack+",
        expected: ["Verified signed FuelTrack operations", "Dashboard"],
      },
      {
        route: "#/tradelink/documents",
        label: "TradeLink",
        expected: ["My Assigned Documents", "Only documents assigned"],
      },
    ];

    const results = [];
    for (const scenario of scenarios) {
      await page.goto(base + scenario.route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForFunction(
        (expected) =>
          expected.every((value) => document.body.innerText.includes(value)),
        scenario.expected,
        { timeout: 30_000 },
      );
      const text = await page.locator("body").innerText();
      assert.match(text, /Secure session/, scenario.label);
      assert.doesNotMatch(
        text,
        /existing .* board was not found|existing attendance board unavailable/i,
        scenario.label,
      );
      results.push({ application: scenario.label, result: "PASS" });
    }

    assert.deepEqual(errors, [], "Unexpected JavaScript or board-list error.");
    assert.deepEqual(failed, [], "Unexpected failed request.");
    assert.deepEqual(responses, [], "Unexpected HTTP error response.");
    assert.ok(
      [
        "TimeTracker Attendance",
        "Fund Released Tracker",
        "FuelTrack+ v3",
        "TradeLink",
      ].every((name) => observedBoards.has(name)),
      "The employee board-list RPC did not return all four canonical applications.",
    );

    console.log(
      JSON.stringify(
        {
          milestone: "CP-CRM-CONN-03B",
          outcome: "VERIFIED_READ_ONLY_EMPLOYEE_RUNTIME",
          applications: results,
          canonicalBoardsObserved: 4,
          failedRequests: 0,
          httpErrors: 0,
          pageErrors: 0,
          mutationsSubmitted: 0,
          domainWritesTested: false,
        },
        null,
        2,
      ),
    );
  } finally {
    if (page && originalUrl && !page.isClosed()) {
      await page
        .goto(originalUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        })
        .catch(() => {});
    }
    await browser.close();
  }
}
