/** CP-CRM-ITEM-DETAILS-OVERLAY-01: verify item drawer stacking and scrolling. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const css = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const output = "docs/visual/cp-crm-item-details-overlay-01";
mkdirSync(output, { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body>
  <div id="app">
    <main class="main aps-board-shell">
      <div class="main-content">
        <div class="toolbar board-customize-toolbar" id="board-toolbar">
          <button id="new-item" type="button">＋ New item</button>
          <input aria-label="Search board items" value="Search">
          <details class="board-tool-menu" open>
            <summary>Filter</summary>
            <div class="board-tool-menu-panel">Filter options</div>
          </details>
        </div>
        <div class="board-horizontal-rail-slot is-scrollable" id="horizontal-rail">
          <div class="board-horizontal-rail">Board horizontal rail</div>
        </div>
        <svg class="board-column-resize-guide" id="resize-guide" viewBox="0 0 10 10" aria-hidden="true"></svg>
      </div>
    </main>
  </div>
  <div class="modal-backdrop board-detail-backdrop" id="detail-backdrop">
    <aside class="board-item-drawer" id="detail-drawer" role="dialog" aria-modal="true">
      <header class="board-item-drawer-header">
        <span class="label-top">APSYNTRA CRM / Board item</span>
        <button type="button" class="modal-close" id="close-drawer" aria-label="Close item details">×</button>
      </header>
      <h2>PO-011226 - Xiamen leapdeng Import and Export Co., Ltd.</h2>
      <p>Read-only item details from the signed board response.</p>
      <div style="height:1200px;flex:0 0 1200px">Scrollable item detail fixture</div>
    </aside>
  </div>
</body>
</html>`;

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_EXECUTABLE ||
    (process.platform === "darwin"
      ? "/Applications/Chromium.app/Contents/MacOS/Chromium"
      : chromium.executablePath()),
});
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};

try {
  for (const viewport of [
    { width: 1440, height: 900, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html);
    await page.addStyleTag({
      content:
        css +
        "\n#app .aps-board-shell .board-customize-toolbar .board-tool-menu-panel { right: 0; left: auto; width: 140px; }",
    });

    const styles = await page.evaluate(() => {
      const get = (selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          zIndex: style.zIndex,
          position: style.position,
          overflowY: style.overflowY,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
        };
      };
      return {
        backdrop: get("#detail-backdrop"),
        drawer: get("#detail-drawer"),
        toolbar: get("#board-toolbar"),
        openToolbar: get("#board-toolbar:has(details[open])"),
        openMenu: get("#board-toolbar details[open]"),
        menuPanel: get("#board-toolbar .board-tool-menu-panel"),
        horizontalRail: get("#horizontal-rail"),
        resizeGuide: get("#resize-guide"),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        backdropHit: document.elementFromPoint(
          innerWidth > 600 ? innerWidth - 600 : 8,
          70,
        )?.id,
        drawerHit: document.elementFromPoint(innerWidth - 20, 70)?.id,
      };
    });

    check(
      Number(styles.backdrop.zIndex) > Number(styles.toolbar.zIndex),
      `${viewport.name}: backdrop must be above the board toolbar`,
    );
    check(
      Number(styles.backdrop.zIndex) > Number(styles.openToolbar.zIndex),
      `${viewport.name}: backdrop must be above the open toolbar stack`,
    );
    check(
      Number(styles.backdrop.zIndex) > Number(styles.openMenu.zIndex),
      `${viewport.name}: backdrop must be above open toolbar menus`,
    );
    check(
      Number(styles.backdrop.zIndex) > Number(styles.menuPanel.zIndex),
      `${viewport.name}: backdrop must be above menu panels`,
    );
    check(
      Number(styles.backdrop.zIndex) > Number(styles.resizeGuide.zIndex),
      `${viewport.name}: backdrop must be above the fixed resize guide`,
    );
    check(
      styles.backdrop.position === "fixed" &&
        styles.backdrop.width === viewport.width &&
        styles.backdrop.height === viewport.height,
      `${viewport.name}: backdrop must cover the full viewport`,
    );
    check(
      styles.drawer.position === "relative" &&
        styles.drawer.overflowY === "auto" &&
        styles.drawer.height === viewport.height,
      `${viewport.name}: drawer must fill and scroll independently`,
    );
    check(
      styles.drawer.width <= viewport.width &&
        Math.abs(styles.drawer.right - viewport.width) < 1,
      `${viewport.name}: drawer must stay inside the right viewport edge`,
    );
    check(
      styles.pageWidth === viewport.width,
      `${viewport.name}: overlay fixture must not introduce horizontal page overflow`,
    );
    if (viewport.name === "desktop") {
      check(
        styles.backdropHit === "detail-backdrop",
        `${viewport.name}: backdrop must intercept clicks over the board toolbar`,
      );
    } else {
      check(
        styles.drawerHit === "detail-drawer",
        `${viewport.name}: full-width mobile drawer must cover the toolbar`,
      );
    }
    check(
      styles.drawerHit === "detail-drawer",
      `${viewport.name}: drawer must receive clicks above the backdrop`,
    );
    const drawerScrollTop = await page
      .locator("#detail-drawer")
      .evaluate((element) => {
        element.scrollTop = 400;
        return element.scrollTop;
      });
    check(
      drawerScrollTop > 0,
      `${viewport.name}: drawer content must scroll independently`,
    );
    await page.locator("#detail-drawer").evaluate((element) => {
      element.scrollTop = 0;
    });

    if (viewport.name === "desktop") {
      await page.screenshot({
        path: `${output}/overlay-desktop.png`,
        fullPage: true,
      });
    } else {
      await page.screenshot({
        path: `${output}/overlay-mobile.png`,
        fullPage: true,
      });
    }
    await page.close();
    console.log(`PASS ${viewport.name}: ${JSON.stringify(styles)}`);
  }
  console.log(`PASS: ${checks} item-detail overlay browser checks`);
} finally {
  await browser.close();
}
