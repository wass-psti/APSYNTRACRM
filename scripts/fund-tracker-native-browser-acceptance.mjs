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
  agingStatus: "PASS",
  aging: {
    pending_total: 4,
    awaiting_bank_execution: 1,
    on_track: 1,
    due_soon: 1,
    overdue: 1,
    completed: 2,
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

  const agingPanel = page.locator(".frt-exec-aging");
  const agingGrid = page.locator(".frt-exec-aging-grid");
  const agingCards = page.locator(".frt-exec-aging-card");
  const columnCount = () => agingGrid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(/\s+/).length,
  );
  assert.equal(await agingPanel.count(), 1);
  assert.equal(await agingCards.count(), 5);
  assert.equal(await columnCount(), 3, "Desktop aging cards use three columns");
  assert.equal(
    await agingCards.first().evaluate((element) => getComputedStyle(element).marginTop),
    "0px",
    "Aging cards do not inherit the generic settings-detail vertical margin",
  );
  assert.equal(
    await page.locator(".frt-exec-aging-label").first().evaluate((element) => getComputedStyle(element).color),
    "rgb(99, 116, 138)",
    "Metric labels retain readable light-mode contrast",
  );
  assert.equal(
    await page.locator(".frt-exec-aging-disclosure").evaluate((element) => getComputedStyle(element).color),
    "rgb(89, 107, 130)",
    "The financial disclosure retains readable light-mode contrast",
  );

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

  await page.setViewportSize({ width: 768, height: 900 });
  assert.equal(await columnCount(), 3, "Tablet aging cards use three columns");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await columnCount(), 2, "Mobile aging cards use two columns");
  assert.equal(
    await page.locator(".frt-app-header").evaluate((element) => getComputedStyle(element).flexDirection),
    "column",
  );
  assert.equal(
    await page.locator(".frt-app-context").evaluate((element) => getComputedStyle(element).flexDirection),
    "column",
  );

  await page.setViewportSize({ width: 360, height: 844 });
  assert.equal(await columnCount(), 1, "Narrow mobile aging cards stack in one column");
  await page.locator("html").evaluate((element) =>
    element.setAttribute("data-aps-monday-theme", "dark"),
  );
  assert.equal(
    await agingCards.first().evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(46, 53, 66)",
    "Aging cards use the dark native surface",
  );
  assert.equal(
    await page.locator(".frt-exec-aging-label").first().evaluate((element) => getComputedStyle(element).color),
    "rgb(192, 202, 219)",
    "Metric labels remain readable in dark appearance",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.locator(".frt-app-header").evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  assert.ok(reducedMotion.endsWith("s"));
  assert.ok(Number.parseFloat(reducedMotion) <= 0.00001, `Unexpected reduced-motion duration: ${reducedMotion}`);

  console.log("Fund Tracker native Chromium acceptance: PASS");
} finally {
  await browser.close();
}
