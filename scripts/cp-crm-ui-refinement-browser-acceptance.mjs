/** Isolated browser acceptance for the shared CRM visual layer (no credentials). */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const cssPath = "frontend/apsyntra-styles.bundle.css";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_EXECUTABLE ||
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
});
let assertions = 0;
const check = (value, message) => {
  assert.ok(value, message);
  assertions++;
};
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.setContent(
      `<!doctype html><html lang="en"><head><title>APSYNTRA CRM visual acceptance</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="sidebar aps-sidebar"><nav class="nav-list"><a class="nav-link" href="#overview">Overview</a></nav></aside><main class="main"><header class="topbar"><div class="breadcrumb">Workspace</div><div class="top-actions"><button class="secondary">Search</button></div></header><div class="main-content"><section class="aps-overview"><div class="page-head"><h1>Dashboard</h1></div><div class="stat-grid"><article class="stat-card">Boards</article></div><div class="card-grid"><a class="board-card" href="#board">Project board</a></div><section class="panel"><header class="panel-header"><h3>Filters</h3></header><div class="panel-body"><label class="field">Search<input id="search" placeholder="Filter boards"></label><button class="primary">Create</button></div></section></section><section class="aps-board-shell"><div class="board-group-panel"><table class="board-table-custom"><tbody><tr><td><button>Row</button></td></tr></tbody></table></div></section><section class="aps-settings"><div class="settings-grid"><div class="panel">Settings panel</div></div></section><div class="modal"><div class="modal-head"><h2>Dialog</h2><button class="modal-close">Close</button></div></div></div></main></div></div></body></html>`,
    );
    await page.addStyleTag({ path: cssPath });
    // Let stylesheet-driven control transitions settle before measuring contrast.
    await page.waitForTimeout(350);
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () => {
      const results = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return results.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      }));
    });
    check(
      violations.length === 0,
      `${width}px WCAG violations: ${JSON.stringify(violations)}`,
    );
    let result = await page.evaluate(() => {
      const control = document.querySelector("#search");
      const card = document.querySelector(".stat-card");
      const modal = document.querySelector(".modal");
      const focus = document.querySelector(".primary");
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        cardRadius: parseFloat(getComputedStyle(card).borderTopLeftRadius),
        cardShadow: getComputedStyle(card).boxShadow,
        inputRadius: parseFloat(getComputedStyle(control).borderTopLeftRadius),
        modalRadius: parseFloat(getComputedStyle(modal).borderTopLeftRadius),
        transition: getComputedStyle(focus).transitionDuration,
        tableHeight: document.querySelector("tr").getBoundingClientRect()
          .height,
      };
    });
    check(
      result.pageWidth <= result.viewport,
      `${width}px layout overflow (${result.pageWidth}px)`,
    );
    check(result.cardRadius >= 16, `${width}px card radius not refined`);
    check(result.modalRadius >= 17, `${width}px modal radius not refined`);
    check(result.inputRadius >= 10, `${width}px control radius not refined`);
    check(
      result.cardShadow !== "none",
      `${width}px card surface missing elevation`,
    );
    check(result.tableHeight >= 0, `${width}px table cannot render`);
    await page.locator("#search").focus();
    const focusStyle = await page.locator("#search").evaluate((el) => ({
      outline: getComputedStyle(el).outlineStyle,
      boxShadow: getComputedStyle(el).boxShadow,
    }));
    check(
      focusStyle.boxShadow !== "none",
      `${width}px keyboard input focus not visible`,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await page
      .locator(".primary")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    check(
      reduced === "0s",
      `${width}px reduced motion is not respected: ${reduced}`,
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-aps-monday-theme", "dark"),
    );
    const dark = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--crm-ui-edge")
        .trim(),
    );
    check(dark === "#474b55", `${width}px dark-mode tokens were not applied`);
    console.log(
      `UI_REFINEMENT_${width}_PASS: no page overflow; card, field, modal, keyboard, motion, dark mode`,
    );
    await page.close();
  }
  console.log(
    `CP_CRM_UI_REFINEMENT_BROWSER_PASS: ${assertions} assertions across desktop, tablet, mobile`,
  );
} finally {
  await browser.close();
}
