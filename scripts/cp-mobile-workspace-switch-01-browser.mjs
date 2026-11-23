import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { chromium } from "playwright";

const html = `<!doctype html>
<html lang="en" data-aps-monday-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css">
</head>
<body>
  <div id="app">
    <div class="shell">
      <aside class="aps-sidebar">
        <div class="sidebar-brand-wrap"><a class="brand" href="#/overview">APSYNTRA CRM</a></div>
        <div class="workspace-switcher">
          <button type="button" class="ws01-switcher-button" data-action="ws01-open">
            <span class="workspace-name">Main Workspace</span>
          </button>
        </div>
        <nav class="nav-list" aria-label="Primary">
          <a class="nav-link" href="#/overview"><span class="nav-label">Overview</span></a>
          <a class="nav-link" href="#/boards"><span class="nav-label">My boards</span></a>
          <a class="nav-link" href="#/time-tracker"><span class="nav-label">TimeTracker Attendance</span></a>
          <a class="nav-link" href="#/tradelink"><span class="nav-label">TradeLink</span></a>
        </nav>
        <div class="sidebar-recent-list">
          <a class="sidebar-recent-link" href="#/boards/operations-board">Operations Board</a>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb"><strong>Overview</strong></div>
          <div class="top-actions"><span class="top-avatar"><span data-avatar-initials>AL</span></span></div>
        </header>
        <div class="main-content"><h1>Existing CRM destination content</h1></div>
      </main>
    </div>
  </div>
  <script type="module" src="/frontend/mobile-home.js"></script>
  <script type="module" src="/scripts/fixtures/cp-mobile-workspace-switch-01-harness.js"></script>
</body>
</html>`;

const vite = await createViteServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
});
const server = createHttpServer((request, response) => {
  if (request.url === "/__cp-mobile-workspace-switch-01") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  vite.middlewares(request, response, (error) => {
    response.writeHead(error ? 500 : 404);
    response.end(error ? String(error) : "Not found");
  });
});
const browser = await chromium.launch({ headless: true });
const checks = [];
const check = (condition, message) => {
  assert.ok(condition, message);
  checks.push(message);
};

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  const browserConsole = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) =>
    browserConsole.push(message.type() + ": " + message.text()),
  );
  page.on("requestfailed", (request) =>
    browserConsole.push(
      "requestfailed: " + request.url() + " " + request.failure()?.errorText,
    ),
  );
  await page.goto(origin + "/__cp-mobile-workspace-switch-01#/overview", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".apsm-home");

  check(
    await page.locator(".apsm-workspace-switch-home").isVisible(),
    "mobile home exposes the workspace switcher",
  );
  check(
    (await page
      .locator(".apsm-workspace-switch-home")
      .getAttribute("data-action")) === "ws01-open",
    "mobile home uses the existing workspace action",
  );
  check(
    (
      await page
        .locator(".apsm-workspace-switch-home")
        .getAttribute("aria-label")
    ).includes("Main Workspace"),
    "mobile home announces the active workspace accessibly",
  );

  await page.locator(".apsm-workspace-switch-home").click();
  await page.waitForTimeout(750);
  if (
    !(await page
      .locator('.ws01-menu .ws01-menu-card[role="dialog"]')
      .isVisible()
      .catch(() => false))
  ) {
    throw new Error(
      "Workspace selector did not open: " +
        JSON.stringify({
          errors,
          browserConsole,
          body: (await page.locator("body").innerText()).slice(0, 1200),
        }),
    );
  }
  await page.waitForSelector(
    '[data-ws01-workspace="20000000-0000-4000-8000-000000000002"]',
  );
  check(
    await page.locator(".ws01-menu").isVisible(),
    "mobile home opens the existing workspace selector dialog",
  );
  await page
    .locator('[data-ws01-workspace="20000000-0000-4000-8000-000000000002"]')
    .click();
  await page.waitForSelector('.ws01-details-card [data-ws01-action="select"]');
  check(
    await page
      .locator('.ws01-details-card [data-ws01-action="select"]')
      .isVisible(),
    "existing selector exposes its signed switch action",
  );
  await page.locator('.ws01-details-card [data-ws01-action="select"]').click();
  await page.waitForFunction(() => window.__workspaceSwitchResult?.count === 1);
  await page.waitForFunction(
    () =>
      document.querySelector(".apsm-identity p")?.textContent ===
      "Operations Workspace",
  );
  check(
    (await page.locator(".apsm-identity p").textContent()) ===
      "Operations Workspace",
    "home workspace identity refreshes after the existing switch callback",
  );

  await page.evaluate(() => {
    location.hash = "#/time-tracker";
  });
  await page.waitForSelector(".apsm-destination-route .apsm-app-header");
  const headerButton = page.locator(
    ".apsm-app-header .apsm-workspace-switch-header",
  );
  check(
    await headerButton.isVisible(),
    "mobile application header exposes workspace switching",
  );
  check(
    (await headerButton.getAttribute("aria-label")).includes(
      "Operations Workspace",
    ),
    "application header reflects the active workspace",
  );
  await headerButton.click();
  await page.waitForSelector('.ws01-menu .ws01-menu-card[role="dialog"]');
  await page.waitForSelector(
    '[data-ws01-workspace="20000000-0000-4000-8000-000000000001"]',
  );
  check(
    await page.locator(".ws01-menu").isVisible(),
    "application header opens the same existing selector",
  );
  await page
    .locator('[data-ws01-workspace="20000000-0000-4000-8000-000000000001"]')
    .click();
  await page.waitForSelector('.ws01-details-card [data-ws01-action="select"]');
  await page.locator('.ws01-details-card [data-ws01-action="select"]').click();
  await page.waitForFunction(() => window.__workspaceSwitchResult?.count === 2);
  await page.waitForFunction(() =>
    document
      .querySelector(".apsm-app-header .apsm-workspace-switch-header")
      ?.getAttribute("aria-label")
      ?.includes("Main Workspace"),
  );
  check(
    (
      await page
        .locator(".apsm-app-header .apsm-workspace-switch-header")
        .getAttribute("aria-label")
    ).includes("Main Workspace"),
    "application header stays synchronized after switching back",
  );

  const mobileWidths = [320, 360, 390, 430, 768, 810];
  await page.evaluate(() => {
    location.hash = "#/overview";
  });
  await page.waitForFunction(() =>
    document.querySelector(".shell")?.classList.contains("apsm-home-route"),
  );
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const button = document.querySelector(".apsm-workspace-switch-home");
      const rect = button?.getBoundingClientRect();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        button: rect ? { width: rect.width, height: rect.height } : null,
        visible:
          !!button &&
          getComputedStyle(button).display !== "none" &&
          button.getClientRects().length > 0,
      };
    });
    check(
      layout.documentWidth <= width,
      "mobile home at " + width + "px has no document horizontal overflow",
    );
    check(
      layout.visible,
      "mobile home at " + width + "px displays its workspace control",
    );
    check(
      layout.button.height >= 44,
      "mobile home at " + width + "px preserves a 44px touch target",
    );
  }

  await page.evaluate(() => {
    location.hash = "#/time-tracker";
  });
  await page.waitForFunction(() =>
    document
      .querySelector(".shell")
      ?.classList.contains("apsm-destination-route"),
  );
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const header = document.querySelector(".apsm-app-header");
      const button = header?.querySelector(".apsm-workspace-switch-header");
      const rect = button?.getBoundingClientRect();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        headerWidth: header?.clientWidth || 0,
        headerScrollWidth: header?.scrollWidth || 0,
        button: rect ? { width: rect.width, height: rect.height } : null,
        visible:
          !!button &&
          getComputedStyle(button).display !== "none" &&
          button.getClientRects().length > 0,
      };
    });
    check(
      layout.documentWidth <= width,
      "application page at " + width + "px has no document horizontal overflow",
    );
    check(
      layout.headerScrollWidth <= layout.headerWidth,
      "application header at " + width + "px has no horizontal overflow",
    );
    check(
      layout.visible,
      "application header at " + width + "px displays its workspace control",
    );
    check(
      layout.button.height >= 44,
      "application header at " + width + "px preserves a 44px touch target",
    );
  }

  await page.setViewportSize({ width: 811, height: 900 });
  const desktop = await page.evaluate(() => ({
    sidebarVisible:
      getComputedStyle(document.querySelector(".aps-sidebar")).display !==
      "none",
    sidebarSwitcherVisible:
      document
        .querySelector(".aps-sidebar .ws01-switcher-button")
        ?.getClientRects().length > 0,
    mobileHomeSwitcherVisible:
      document.querySelector(".apsm-workspace-switch-home")?.getClientRects()
        .length > 0,
    mobileHeaderSwitcherVisible:
      document.querySelector(".apsm-workspace-switch-header")?.getClientRects()
        .length > 0,
  }));
  check(
    desktop.sidebarVisible && desktop.sidebarSwitcherVisible,
    "811px desktop breakpoint preserves the original sidebar selector",
  );
  check(
    !desktop.mobileHomeSwitcherVisible && !desktop.mobileHeaderSwitcherVisible,
    "811px desktop breakpoint does not duplicate mobile controls",
  );
  check(
    errors.length === 0,
    "browser runtime has no uncaught JavaScript errors: " + errors.join("; "),
  );

  console.log(
    "CP_MOBILE_WORKSPACE_SWITCH_01_BROWSER_PASS " + checks.length + " checks",
  );
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        viewportWidths: [320, 360, 390, 430, 768, 810, 811],
        workspaceSwitches: 2,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
}
