/** Responsive browser acceptance for the approved APSYNTRA CRM UI baseline. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright";
import { overviewIcon } from "../frontend/overview-visuals.js";

const root = process.cwd();
const currentApp = readFileSync(join(root, "frontend/app.js"), "utf8");
const currentCss = readFileSync(
  join(root, "frontend/apsyntra-styles.bundle.css"),
  "utf8",
);
const previousApp = execFileSync(
  "git",
  ["show", "origin/main:frontend/app.js"],
  {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  },
);
const previousCss = execFileSync(
  "git",
  ["show", "origin/main:frontend/apsyntra-styles.bundle.css"],
  {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  },
);
const variants = {
  before: { app: previousApp, css: previousCss },
  restored: { app: currentApp, css: currentCss },
};

const boards = Array.from({ length: 7 }, (_, index) => ({
  id: "overview-board-" + index,
  name: [
    "Trade-Link",
    "Inventory Material Requests",
    "Fund-Released Tracker",
    "Employee Evaluation",
    "Order Intake",
    "Tool Traceability",
    "Charter Navigator",
  ][index],
  description: "Current workspace records and team updates",
  item_count: [299, 850, 126, 43, 68, 205, 17][index],
  updated_at: "2026-11-22T00:00:00.000Z",
  status: "active",
}));

const state = {
  boards,
  roleVerified: true,
  boardCatalogError: "",
  boardLifecycleBusy: false,
  crmRoleSnapshot: null,
  workspaceRelationSnapshot: null,
  context: {
    user_id: "overview-visual-qa",
    profile: { platform_role: "admin_general_manager" },
  },
};

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

function renderOverview(appSource, currentState) {
  const previewStart = appSource.indexOf("function overviewBoardPreview(");
  const overviewStart = appSource.indexOf("function overview(){");
  const overviewEnd = appSource.indexOf(
    "function boardsPage(){",
    overviewStart,
  );
  const cardStart = appSource.indexOf("function boardCard(board,index){");
  const emptyStart = appSource.indexOf("function empty(", cardStart);
  if (
    previewStart < 0 ||
    overviewStart < previewStart ||
    overviewEnd < overviewStart ||
    cardStart < 0 ||
    emptyStart < cardStart
  ) {
    throw new Error(
      "Actual Overview renderer was not found in frontend/app.js",
    );
  }

  const previewAndOverview = appSource.slice(previewStart, overviewEnd);
  const boardCardSource = appSource.slice(cardStart, emptyStart);
  const emptySource = appSource.slice(emptyStart, previewStart);
  const boardCardFactory = new Function(
    "boardCardActionState",
    "e",
    "BOARD_CARD_LIFECYCLE_ENABLED",
    "state",
    "trashBoardSelection",
    "publicBoardDescription",
    "displayDate",
    "iconColor",
    boardCardSource + "\nreturn boardCard;",
  );
  const boardCard = boardCardFactory(
    () => "MANAGE",
    escapeHtml,
    true,
    currentState,
    new Set(),
    (board) => board.description,
    () => "Nov 22, 2026",
    () => "blue",
  );
  const empty = new Function("e", emptySource + "\nreturn empty;")(escapeHtml);
  const render = new Function(
    "state",
    "name",
    "e",
    "overviewIcon",
    "boardCard",
    "empty",
    "signedCrmRoleLabel",
    "signedCrmIdentityLabel",
    "workspaceRelationLabel",
    "isStandaloneApplicationBoard",
    previewAndOverview + "\nreturn overview();",
  );
  return render(
    currentState,
    () => "Alex Morgan",
    escapeHtml,
    overviewIcon,
    boardCard,
    empty,
    () => "CRM Admin",
    () => "admin_general_manager",
    () => "Workspace member",
    () => false,
  );
}

function shell(markup, theme, variant) {
  return `<!doctype html>
<html lang="en" data-aps-monday-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>APSYNTRA CRM UI Restoration Acceptance</title>
  <link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css?variant=${variant}">
</head>
<body>
  <div id="app">
    <div class="shell">
      <aside class="aps-sidebar">
        <div class="sidebar-brand-wrap"><a class="brand" href="#/overview">APSYNTRA CRM</a></div>
        <div class="sidebar-nav-scroll">
          <div class="side-section">WORKSPACE</div>
          <nav class="nav-list" aria-label="Workspace navigation">
            <a class="nav-link active" href="#/overview" aria-current="page">Dashboard</a>
            <a class="nav-link" href="#/boards">My boards</a>
          </nav>
        </div>
      </aside>
      <main class="main aps-overview-shell">
        <header class="topbar">
          <div class="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
          <div class="top-actions">
            <span class="top-pill">Secure session</span>
            <button class="aps-sync" type="button">Live synced</button>
            <button class="topbar-signout" type="button">Sign out</button>
          </div>
        </header>
        <div class="main-content">${markup}</div>
      </main>
    </div>
  </div>
</body>
</html>`;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const variant =
    url.searchParams.get("variant") === "before" ? "before" : "restored";
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  if (url.pathname === "/") {
    const currentState = {
      ...state,
      roleVerified: url.searchParams.get("foundation") !== "off",
    };
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      shell(
        renderOverview(variants[variant].app, currentState),
        theme,
        variant,
      ),
    );
    return;
  }
  if (url.pathname === "/frontend/apsyntra-styles.bundle.css") {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(variants[variant].css);
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

const destination = join(root, "docs/visual/cp-crm-ui-restore-01");
mkdirSync(destination, { recursive: true });
const widths = [390, 640, 768, 810, 1024, 1280, 1440, 1898];
const themes = ["light", "dark"];
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;

  for (const theme of themes) {
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin + "/?variant=restored&theme=" + theme, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(".aps-overview");

      const result = await page.evaluate(() => {
        const statGrid = document.querySelector(".overview-stat-grid");
        const boardGrid = document.querySelector(".overview-board-grid");
        const statCards = [
          ...document.querySelectorAll(".overview-stat-grid .stat-card"),
        ];
        const boardCards = [
          ...document.querySelectorAll(".overview-board-grid .board-card"),
        ];
        const hero = document.querySelector(".overview-hero");
        const refresh = document.querySelector('[data-action="refresh"]');
        const menu = boardCards[0]?.querySelector(
          ".board-card-actions > summary",
        );
        return {
          viewportWidth: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          statCount: statCards.length,
          boardCount: boardCards.length,
          statColumns:
            getComputedStyle(statGrid).gridTemplateColumns.split(" ").length,
          boardColumns:
            getComputedStyle(boardGrid).gridTemplateColumns.split(" ").length,
          foundationCount: document.querySelectorAll(".overview-essentials")
            .length,
          actionCount: document.querySelectorAll(
            ".overview-hero .head-actions button",
          ).length,
          heroArtCount: document.querySelectorAll(".overview-hero-art").length,
          refreshHeight: refresh?.getBoundingClientRect().height ?? 0,
          refreshBackground: getComputedStyle(refresh).backgroundColor,
          overviewBackground: getComputedStyle(
            document.querySelector(".aps-overview-shell"),
          ).backgroundColor,
          boardHref: boardCards[0]
            ?.querySelector(".board-card-main")
            ?.getAttribute("href"),
          hasBoardMenu: Boolean(menu),
          menuWidth: menu?.getBoundingClientRect().width ?? 0,
          menuHeight: menu?.getBoundingClientRect().height ?? 0,
        };
      });

      check(
        result.pageWidth <= width + 1,
        `${theme} ${width}: document horizontal overflow`,
      );
      check(
        result.statCount === 4,
        `${theme} ${width}: expected four live workspace statistics`,
      );
      check(
        result.boardCount === 6,
        `${theme} ${width}: expected six recent board cards`,
      );
      check(
        result.foundationCount === 1,
        `${theme} ${width}: verified workspace essentials missing`,
      );
      check(
        result.actionCount === 2,
        `${theme} ${width}: refresh and create-board actions missing`,
      );
      check(
        result.heroArtCount === 1,
        `${theme} ${width}: original Overview hero artwork missing`,
      );
      check(
        result.boardHref?.startsWith("#/boards/"),
        `${theme} ${width}: board navigation link changed`,
      );
      check(
        result.hasBoardMenu,
        `${theme} ${width}: board management menu missing`,
      );
      check(
        result.refreshHeight >= 40,
        `${theme} ${width}: refresh control target too small`,
      );
      check(
        result.menuWidth >= 24 && result.menuHeight >= 24,
        `${theme} ${width}: board menu target too small`,
      );

      const expectedStatColumns = width <= 395 ? 1 : width <= 850 ? 2 : 4;
      const expectedBoardColumns = width <= 650 ? 1 : width <= 1090 ? 2 : 3;
      check(
        result.statColumns === expectedStatColumns,
        `${theme} ${width}: unexpected statistics grid columns ${result.statColumns}`,
      );
      check(
        result.boardColumns === expectedBoardColumns,
        `${theme} ${width}: unexpected board grid columns ${result.boardColumns}`,
      );

      await page.locator('[data-action="refresh"]').focus();
      const focus = await page
        .locator('[data-action="refresh"]')
        .evaluate((element) => ({
          style: getComputedStyle(element).outlineStyle,
          width: getComputedStyle(element).outlineWidth,
        }));
      check(
        focus.style !== "none" && Number.parseFloat(focus.width) >= 2,
        `${theme} ${width}: keyboard focus indicator missing`,
      );

      const menu = page
        .locator(".overview-board-grid .board-card-actions")
        .first();
      await menu.locator("summary").click();
      check(
        (await menu.getAttribute("open")) !== null,
        `${theme} ${width}: board menu did not open`,
      );
      await menu.locator("summary").click();

      await page.emulateMedia({ reducedMotion: "reduce" });
      const transition = await page
        .locator('[data-action="refresh"]')
        .evaluate((element) => getComputedStyle(element).transitionDuration);
      check(
        transition === "0s",
        `${theme} ${width}: reduced-motion preference was not respected`,
      );

      if (width === 1440 || width === 390) {
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        await page.mouse.move(1, 1);
        await page.screenshot({
          path: join(destination, `overview-restored-${theme}-${width}.png`),
          fullPage: width === 1440,
        });
        const beforePage = await browser.newPage({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
        });
        await beforePage.goto(origin + `/?variant=before&theme=${theme}`, {
          waitUntil: "networkidle",
        });
        await beforePage.waitForSelector(".aps-overview");
        await beforePage.screenshot({
          path: join(
            destination,
            `overview-before-restoration-${theme}-${width}.png`,
          ),
          fullPage: width === 1440,
        });
        await beforePage.close();
      }

      assert.deepEqual(errors, [], `${theme} ${width}: browser runtime errors`);
      await page.close();
    }
  }

  const employeePage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await employeePage.goto(
    origin + "/?variant=restored&theme=light&foundation=off",
    { waitUntil: "networkidle" },
  );
  check(
    (await employeePage.locator(".overview-essentials").count()) === 0,
    "workspace essentials gate changed when verified state is false",
  );
  check(
    (await employeePage.locator(".overview-board-grid .board-card").count()) ===
      6,
    "board preview changed when essentials are hidden",
  );
  await employeePage.close();

  console.log(
    `CP_CRM_UI_RESTORE_01_OVERVIEW_BROWSER_PASS ${checks} checks across ${widths.length} viewport widths and ${themes.length} themes`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
