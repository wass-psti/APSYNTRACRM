/** Runtime acceptance for the preserved additive mobile launcher. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const css = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const mobileScript = readFileSync("frontend/mobile-home.js", "utf8");
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
        <div class="workspace-switcher"><span class="workspace-name">Main Workspace</span></div>
        <nav class="nav-list" aria-label="Primary">
          <a class="nav-link" href="#/overview"><span class="nav-label">Dashboard</span></a>
          <a class="nav-link" href="#/boards"><span class="nav-label">My boards</span></a>
          <a class="nav-link" href="#/settings"><span class="nav-label">Settings</span></a>
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
          <div class="top-actions">
            <span class="top-avatar"><span data-avatar-initials>AL</span></span>
            <button type="button" data-global-search-open>Search</button>
          </div>
        </header>
        <div class="main-content"><h1>Existing CRM destination content</h1></div>
      </main>
    </div>
  </div>
  <script>document.querySelector('[data-global-search-open]').addEventListener('click',()=>{window.searchOpened=true;});</script>
  <script type="module" src="/frontend/mobile-home.js"></script>
</body>
</html>`;

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (path === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (path === "/frontend/apsyntra-styles.bundle.css") {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(css);
    return;
  }
  if (path === "/frontend/mobile-home.js") {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
    });
    response.end(mobileScript);
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/#/overview", { waitUntil: "networkidle" });
  await page.waitForSelector(".apsm-home");

  check(
    await page
      .locator(".shell")
      .evaluate((element) => element.classList.contains("apsm-home-route")),
    "mobile home route was not mounted",
  );
  check(
    await page.locator(".apsm-bottom-nav").isVisible(),
    "mobile bottom navigation is hidden",
  );
  check(
    await page.locator(".aps-sidebar").isHidden(),
    "desktop sidebar was not hidden on mobile",
  );
  check(
    (await page.locator(".apsm-home-search").count()) === 0,
    "unexpected duplicate search input",
  );
  check(
    await page.locator("#apsm-home-search").isVisible(),
    "mobile catalog search is missing",
  );
  check(
    (await page.locator(".apsm-applications .apsm-list-row").count()) === 2,
    "signed application navigation catalog was not rendered",
  );
  check(
    (await page.locator(".apsm-boards .apsm-list-row").count()) === 1,
    "recent board navigation catalog was not rendered",
  );

  await page.locator("#apsm-home-search").fill("trade");
  check(
    (await page
      .locator(".apsm-applications .apsm-list-row:not([hidden])")
      .count()) === 1,
    "local search did not filter applications",
  );
  check(
    (await page
      .locator(".apsm-boards .apsm-list-row:not([hidden])")
      .count()) === 0,
    "local search did not filter board results",
  );
  await page.locator("#apsm-home-search").fill("");

  const boardFavorite = page
    .locator('[data-apsm-favorite="#/boards/operations-board"]')
    .first();
  await boardFavorite.click();
  check(
    (await page
      .locator(
        '.apsm-favorites .apsm-card-open[href="#/boards/operations-board"]',
      )
      .count()) === 1,
    "favorite toggle did not add the board shortcut",
  );
  await page.locator('.apsm-bottom-nav a[aria-label="Favorites"]').click();
  await page.waitForFunction(
    () => location.hash === "#/overview?section=favorites",
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('.apsm-bottom-nav a[aria-label="Favorites"]')
        ?.getAttribute("aria-current") === "page",
  );
  check(
    await page.locator(".apsm-applications").isHidden(),
    "favorites-only route did not scope the home list",
  );
  check(
    (await page
      .locator(
        '.apsm-favorites .apsm-card-open[href="#/boards/operations-board"]',
      )
      .count()) === 1,
    "favorite shortcut did not survive favorites navigation",
  );

  await page.locator(".apsm-bottom-nav button[data-apsm-open-search]").click();
  check(
    await page.evaluate(() => window.searchOpened === true),
    "bottom navigation did not invoke existing global search",
  );

  await page.locator('.apsm-bottom-nav a[aria-label="Home"]').click();
  await page.waitForFunction(() => location.hash === "#/overview");
  await page.waitForFunction(
    () =>
      document
        .querySelector('.apsm-bottom-nav a[aria-label="Home"]')
        ?.getAttribute("aria-current") === "page",
  );
  await page
    .locator('.apsm-boards .apsm-list-link[href="#/boards/operations-board"]')
    .click();
  await page.waitForFunction(
    () => location.hash === "#/boards/operations-board",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("[data-apsm-route-title]")?.textContent ===
      "Operations Board",
  );
  check(
    (await page.locator("[data-apsm-route-title]").textContent()) ===
      "Operations Board",
    "destination header did not resolve the selected board title",
  );
  check(
    await page.locator(".main-content h1").isVisible(),
    "mobile destination shell replaced existing application content",
  );
  await page.locator(".apsm-back").click();
  await page.waitForFunction(() => location.hash === "#/overview");
  await page.waitForFunction(
    () =>
      document
        .querySelector('.apsm-bottom-nav a[aria-label="Home"]')
        ?.getAttribute("aria-current") === "page",
  );
  await page.locator(".workspace-name").evaluate((element) => {
    element.textContent = "Second Workspace";
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".apsm-identity p")?.textContent ===
      "Second Workspace",
  );
  check(
    (await page
      .locator(
        '.apsm-favorites .apsm-card-open[href="#/boards/operations-board"]',
      )
      .count()) === 0,
    "workspace change retained previous workspace favorites",
  );

  const mobileMetrics = await page.evaluate(() => ({
    width: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    bottomNavigation: getComputedStyle(
      document.querySelector(".apsm-bottom-nav"),
    ).display,
    shellBackground: getComputedStyle(document.querySelector(".shell"))
      .backgroundColor,
  }));
  check(
    mobileMetrics.pageWidth <= mobileMetrics.width + 1,
    "mobile launcher caused horizontal overflow",
  );
  await page.close();

  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await desktop.goto(origin + "/#/overview", { waitUntil: "networkidle" });
  check(
    await desktop.locator(".aps-sidebar").isVisible(),
    "desktop sidebar was changed by mobile-only launcher",
  );
  check(
    await desktop.locator(".apsm-bottom-nav").isHidden(),
    "mobile bottom navigation rendered on desktop",
  );
  check(
    await desktop.locator(".apsm-home").isHidden(),
    "mobile home replaced the desktop Overview route",
  );
  await desktop.close();

  assert.deepEqual(errors, [], "mobile launcher runtime errors");
  console.log(
    `CP_CRM_UI_RESTORE_01_MOBILE_BROWSER_PASS ${checks} runtime checks (mobile navigation, search, favorites, workspace reset, desktop isolation)`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
