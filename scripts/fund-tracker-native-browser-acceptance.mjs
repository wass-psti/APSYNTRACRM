import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { renderFundTrackerNative } from "../frontend/fund-tracker-ui.js";

const requestId = "33333333-3333-4333-8333-333333333333";
const report = {
  status: "PASS",
  role: "GENERAL_MANAGER",
  companyCode: "WASS",
  companies: [{ code: "WASS", name: "Watchdog Automation Sales & Services" }],
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
    topCategories: [{ category: "Operating Expenses", requestedAmount: "1234567.89" }],
    monthlyTrend: [{ month: "2026-11", requestedAmount: "1234567.89", spentAmount: "456789.12" }],
  },
  requests: [{
    requestId,
    title: "Operating Supplies",
    voucher: "DV-WASS-202611-009",
    status: "PENDING_APPROVAL",
    dateNeeded: "2026-11-13",
    filingStatus: "NOT_FILED",
  }],
};
const styles = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const html = renderFundTrackerNative({ result: report, view: "tracker" });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
      '<div id="app"><div class="aps-board-shell">' + html + "</div></div>" +
      "</body></html>",
    { waitUntil: "domcontentloaded" },
  );
  await page.addStyleTag({ content: styles });

  const heading = page.locator(".frt-app-header h1");
  await heading.waitFor({ state: "visible" });
  assert.match(await heading.innerText(), /Fund Tracker/);
  assert.equal(await page.locator(".frt-app-role").innerText(), "GENERAL_MANAGER");
  assert.equal(
    await page.locator(".frt-app-context strong").innerText(),
    "Watchdog Automation Sales & Services",
  );
  assert.ok(await page.locator('[data-action="frt-finance-view"]').count() >= 4);
  assert.ok(await page.locator('[data-action="frt-finance-refresh"]').count() >= 1);
  assert.ok(await page.locator('[data-frt-section="archive"]').count() >= 1);

  await page.evaluate(() => {
    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      window.__fundTrackerAction = action.dataset.action;
      window.__fundTrackerView = action.dataset.view || null;
    });
  });
  await page.locator('[data-action="frt-finance-view"][data-view="executive"]').click();
  assert.equal(await page.evaluate(() => window.__fundTrackerAction), "frt-finance-view");
  assert.equal(await page.evaluate(() => window.__fundTrackerView), "executive");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.locator(".frt-app-header").evaluate((element) => getComputedStyle(element).flexDirection),
    "column",
  );
  assert.equal(
    await page.locator(".frt-app-context").evaluate((element) => getComputedStyle(element).flexDirection),
    "column",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.locator(".frt-app-header").evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  assert.equal(reducedMotion, "1e-05s");

  console.log("Fund Tracker native Chromium acceptance: PASS");
} finally {
  await browser.close();
}
