/** Headless fixture checks of real CSS and interactive menu semantics, no account data. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_EXECUTABLE ||
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
});
const css = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed++;
}
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM interactive visual acceptance</title></head><body><div id="app"><div class="shell"><aside class="sidebar aps-sidebar"><a class="nav-link" href="#overview">Overview</a></aside><main class="main"><div class="main-content"><h1>Application UI</h1><div class="aps-board-shell"><details class="board-tool-menu"><summary>Filter rows</summary><div class="board-tool-menu-panel"><button type="button">Reset filter</button></div></details><details class="aps-action-surface"><summary aria-label="Board actions">Board actions</summary><div class="aps-action-popover" role="menu"><button role="menuitem" data-action="export" type="button">Export CSV</button><button role="menuitem" data-action="delete" type="button">Delete</button></div></details><section class="board-group-panel"><table class="board-table-custom"><tbody><tr><td><button type="button">Board row</button></td></tr></tbody></table></section></div><section class="fm1-app"><button class="fm1-primary-button">New ticket</button><div class="fm1-panel"><label>Reference<input aria-label="Ticket reference" /></label></div></section><section class="tt-native"><div class="tt-app-header"><button class="tt-nav-tab">Clock</button></div><div class="tt-attendance-console">Current clock</div></section><section class="aps-tradelink-app tl-reference-portal"><div class="tl-reference-document-toolbar"><button>Save draft</button><button class="tl-reference-primary">Submit</button></div><div class="tl-draft-panel">Document form</div></section><section class="ft3-app"><div class="ft3-app-tabs"><button class="ft3-app-tab">FuelTrack</button></div><div class="ft3-panel">FuelTrack analytics</div></section><section class="tb-panel"><div class="tb-scroll"><table><tbody><tr><td><button>TalkBox</button></td></tr></tbody></table></div></section></div></main></div></div></body></html>`;
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.setContent(fixture);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    await page.waitForTimeout(250);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      expected: innerWidth,
      menu: document
        .querySelector(".aps-action-popover")
        ?.getBoundingClientRect().height,
      row: document
        .querySelector(".board-table-custom tr")
        ?.getBoundingClientRect().height,
      panelBorder: getComputedStyle(document.querySelector(".fm1-panel"))
        .borderColor,
    }));
    check(
      geometry.width <= geometry.expected,
      `${width}px body overflow: ${geometry.width}`,
    );
    check(geometry.row > 0, `${width}px row not rendered`);
    check(
      geometry.panelBorder !== "transparent",
      `${width}px panel border not present`,
    );
    const menu = page.locator(".aps-action-surface");
    await menu.locator("summary").focus();
    await page.keyboard.press("Enter");
    check(
      await menu.evaluate((el) => el.open),
      `${width}px menu not keyboard operable`,
    );
    const menuItem = page
      .locator('.aps-action-popover [role="menuitem"]')
      .first();
    await page.keyboard.press("Tab");
    const itemFocus = await menuItem.evaluate(
      (el) => getComputedStyle(el).outlineStyle,
    );
    check(itemFocus !== "none", `${width}px menuitem keyboard focus invisible`);
    const before = await menu.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    await page.keyboard.press("Escape");
    const after = await menu.evaluate((el) => el.getBoundingClientRect().width);
    check(
      Math.abs(before - after) < 1,
      `${width}px menu trigger geometry changed`,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await page
      .locator(".fm1-primary-button")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    check(
      parseFloat(motion) <= 0.001,
      `${width}px reduced motion ignored: ${motion}`,
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(
      () => (document.documentElement.dataset.apsMondayTheme = "dark"),
    );
    const dark = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--crm-ui-edge")
        .trim(),
    );
    check(dark === "#474b55", `${width}px dark appearance tokens missing`);
    await page.evaluate(
      () => delete document.documentElement.dataset.apsMondayTheme,
    );
    // Only the independent, non-overlay page is audited for contrast to avoid
    // conflating intentionally hidden menu contents with visible controls.
    await page.locator(".aps-action-surface summary").click();
    await page.waitForTimeout(500);
    const axeIssues = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
        details: v.nodes.map((n) => n.failureSummary),
      }));
    });
    check(
      axeIssues.length === 0,
      `${width}px accessibility issues ${JSON.stringify(axeIssues)}`,
    );
    console.log(
      `CRM_UI02_${width}_PASS menu keyboard, native panels, focus, responsive, reduced motion, accessibility`,
    );
    await page.close();
  }
  console.log(`CRM_UI02_ACCEPTANCE_PASS ${passed} assertions`);
} finally {
  await browser.close();
}
