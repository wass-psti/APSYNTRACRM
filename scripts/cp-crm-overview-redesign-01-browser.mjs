import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { overviewIcon } from "../frontend/overview-visuals.js";

const root = process.cwd();
const appSource = readFileSync(join(root, "frontend/app.js"), "utf8");
const bundlePath = join(root, "frontend/apsyntra-styles.bundle.css");
const cssBundle = readFileSync(bundlePath, "utf8");
const previewStart = appSource.indexOf("function overviewBoardPreview(");
const overviewStart = appSource.indexOf("function overview(){");
const overviewEnd = appSource.indexOf("function boardsPage(){", overviewStart);
const cardStart = appSource.indexOf("function boardCard(board,index){");
const emptyStart = appSource.indexOf("function empty(", cardStart);
const previewAndOverview = appSource.slice(previewStart, overviewEnd);
const boardCardSource = appSource.slice(cardStart, emptyStart);
const emptySource = appSource.slice(emptyStart, previewStart);

if (
  previewStart < 0 ||
  overviewStart < previewStart ||
  overviewEnd < overviewStart
) {
  throw new Error("Actual Overview renderer was not found in frontend/app.js");
}

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
  state,
  new Set(),
  (board) => board.description,
  () => "Nov 22, 2026",
  () => "blue",
);

const empty = new Function("e", emptySource + "\nreturn empty;")(escapeHtml);

function renderOverview(currentState) {
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

const shell = (markup, theme) => `<!doctype html>
<html lang="en" data-aps-monday-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>APSYNTRA CRM Overview Acceptance</title>
  <link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css">
</head>
<body>
  <div id="app">
    <div class="shell">
      <aside class="aps-sidebar">
        <div class="sidebar-brand-wrap"><a class="brand" href="#/overview">APSYNTRA CRM</a></div>
        <div class="sidebar-nav-scroll">
          <div class="side-section">WORKSPACE</div>
          <nav class="nav-list">
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/") {
    const currentState = {
      ...state,
      roleVerified: url.searchParams.get("foundation") !== "off",
    };
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      shell(
        renderOverview(currentState),
        url.searchParams.get("theme") ?? "light",
      ),
    );
    return;
  }

  if (url.pathname === "/frontend/apsyntra-styles.bundle.css") {
    response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    response.end(cssBundle);
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

const destination = join(root, "docs/visual/cp-crm-overview-redesign-01");
mkdirSync(destination, { recursive: true });

const widths = [320, 390, 640, 768, 810, 1024, 1440, 1898];
const themes = ["light", "dark"];
const browser = await chromium.launch({ headless: true });
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function contrastRatio(foreground, background) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => {
    const values = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
    return (
      0.2126 * channel(values[0]) +
      0.7152 * channel(values[1]) +
      0.0722 * channel(values[2])
    );
  };
  const first = luminance(foreground);
  const second = luminance(background);
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

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
      await page.goto(origin + "/?theme=" + theme, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(".aps-overview.overview-dashboard");

      const result = await page.evaluate(() => {
        const statGrid = document.querySelector(".overview-stat-grid");
        const boardGrid = document.querySelector(".overview-board-list");
        const statCards = [
          ...document.querySelectorAll(".overview-stat-grid .stat-card"),
        ];
        const boardCards = [
          ...document.querySelectorAll(".overview-board-list .board-card"),
        ];
        const refresh = document.querySelector('[data-action="refresh"]');
        const hero = document.querySelector(".overview-hero");
        const statSurface = document.querySelector(".overview-stat-grid");
        const firstStat = statCards[0];
        const firstBoard = boardCards[0];
        const label = firstStat?.querySelector(".stat-label");
        const boardTitle = firstBoard?.querySelector("h3");
        const boardDescription = firstBoard?.querySelector("p");
        const metricIcon = firstStat?.querySelector(".overview-svg-icon");
        const metricStyles = getComputedStyle(statGrid);
        const boardStyles = getComputedStyle(boardGrid);
        const heroStyles = getComputedStyle(hero);
        const statStyles = getComputedStyle(firstStat);
        const boardItemStyles = getComputedStyle(firstBoard);
        const solidIcon = metricIcon?.querySelector(".icon-solid");
        const outlineIcon = metricIcon?.querySelector(".icon-outline");

        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          statColumns: metricStyles.gridTemplateColumns.split(" ").length,
          boardColumns: boardStyles.gridTemplateColumns.split(" ").length,
          statCount: statCards.length,
          statCardBorderBottoms: statCards.map(
            (element) => getComputedStyle(element).borderBottomWidth,
          ),
          boardCount: boardCards.length,
          foundationVisible: Boolean(
            document.querySelector(".overview-foundation-section"),
          ),
          refreshHeight: refresh?.getBoundingClientRect().height ?? 0,
          heroBackgroundImage: heroStyles.backgroundImage,
          statCardBackground: statStyles.backgroundColor,
          boardCardBackground: boardItemStyles.backgroundColor,
          statSurfaceBackground: metricStyles.backgroundColor,
          solidIconDisplay: solidIcon
            ? getComputedStyle(solidIcon).display
            : "missing",
          outlineIconDisplay: outlineIcon
            ? getComputedStyle(outlineIcon).display
            : "missing",
          labelColor: label ? getComputedStyle(label).color : "",
          surfaceColor: metricStyles.backgroundColor,
          boardTitleColor: boardTitle ? getComputedStyle(boardTitle).color : "",
          boardDescriptionColor: boardDescription
            ? getComputedStyle(boardDescription).color
            : "",
          boardSurfaceColor: getComputedStyle(
            document.querySelector(".aps-overview-shell"),
          ).backgroundColor,
          actionCount: document.querySelectorAll(
            ".overview-header-actions button",
          ).length,
          boardHref: firstBoard
            ?.querySelector(".board-card-main")
            ?.getAttribute("href"),
          hasBoardMenu: Boolean(
            firstBoard?.querySelector(".board-card-actions > summary"),
          ),
          menuTriggerSize: firstBoard
            ?.querySelector(".board-card-actions > summary")
            ?.getBoundingClientRect()
            .toJSON(),
          foundationItemBackground: getComputedStyle(
            document.querySelector(".overview-essentials .activity-item"),
          ).backgroundColor,
          foundationItemRadius: getComputedStyle(
            document.querySelector(".overview-essentials .activity-item"),
          ).borderRadius,
          foundationItemShadow: getComputedStyle(
            document.querySelector(".overview-essentials .activity-item"),
          ).boxShadow,
          foundationAvatarBackgrounds: [
            ...document.querySelectorAll(
              ".overview-essentials .activity-avatar",
            ),
          ].map((element) => getComputedStyle(element).backgroundColor),
        };
      });

      check(
        result.pageWidth <= result.viewportWidth + 1,
        theme + " " + width + ": horizontal overflow",
      );
      check(
        result.statCount === 4,
        theme + " " + width + ": expected four live statistics",
      );
      check(
        result.boardCount === 6,
        theme + " " + width + ": expected six recent board entries",
      );
      check(
        result.foundationVisible,
        theme + " " + width + ": verified foundation section missing",
      );
      check(
        result.actionCount === 2,
        theme + " " + width + ": refresh/new-board actions missing",
      );
      check(
        result.refreshHeight >= 43 && result.refreshHeight <= 52,
        theme +
          " " +
          width +
          ": header action target is outside the compact touch range",
      );
      check(
        result.heroBackgroundImage === "none",
        theme + " " + width + ": legacy hero gradient remains",
      );
      check(
        result.statCardBackground === "rgba(0, 0, 0, 0)",
        theme + " " + width + ": metric card is still a nested surface",
      );
      check(
        result.boardCardBackground === "rgba(0, 0, 0, 0)",
        theme + " " + width + ": board entry is still a card",
      );
      check(
        result.solidIconDisplay === "inline",
        theme + " " + width + ": solid icon is not visible",
      );
      check(
        result.outlineIconDisplay === "none",
        theme + " " + width + ": outline icon remains visible",
      );
      check(
        result.hasBoardMenu,
        theme + " " + width + ": board management menu missing",
      );
      check(
        result.boardHref?.startsWith("#/boards/"),
        theme + " " + width + ": board navigation missing",
      );
      check(
        width <= 810
          ? result.menuTriggerSize.width >= 44 &&
              result.menuTriggerSize.height >= 44
          : result.menuTriggerSize.width >= 29 &&
              result.menuTriggerSize.height >= 29,
        theme + " " + width + ": board menu target is too small",
      );
      check(
        result.foundationItemBackground === "rgba(0, 0, 0, 0)",
        theme + " " + width + ": foundation item has a nested background",
      );
      check(
        result.foundationItemRadius === "0px",
        theme + " " + width + ": foundation item retains a card radius",
      );
      check(
        result.foundationItemShadow === "none",
        theme + " " + width + ": foundation item retains a card shadow",
      );
      check(
        new Set(result.foundationAvatarBackgrounds).size === 1,
        theme + " " + width + ": foundation icon surfaces are inconsistent",
      );

      const expectedStatColumns = width <= 360 ? 1 : width <= 1180 ? 2 : 4;
      const expectedBoardColumns = width <= 810 ? 1 : 2;
      const expectedMetricBorders =
        width <= 360
          ? ["1px", "1px", "1px", "0px"]
          : width <= 1180
            ? ["1px", "1px", "0px", "0px"]
            : ["0px", "0px", "0px", "0px"];
      check(
        JSON.stringify(result.statCardBorderBottoms) ===
          JSON.stringify(expectedMetricBorders),
        theme +
          " " +
          width +
          ": metric divider rows are inconsistent " +
          JSON.stringify(result.statCardBorderBottoms),
      );
      check(
        result.statColumns === expectedStatColumns,
        theme + " " + width + ": unexpected metric columns",
      );
      check(
        result.boardColumns === expectedBoardColumns,
        theme + " " + width + ": unexpected board list columns",
      );

      const labelContrast = contrastRatio(
        result.labelColor,
        result.surfaceColor,
      );
      const titleContrast = contrastRatio(
        result.boardTitleColor,
        result.boardSurfaceColor,
      );
      const descriptionContrast = contrastRatio(
        result.boardDescriptionColor,
        result.boardSurfaceColor,
      );
      check(
        labelContrast >= 4.5,
        theme +
          " " +
          width +
          ": metric label contrast " +
          labelContrast.toFixed(2),
      );
      check(
        titleContrast >= 4.5,
        theme +
          " " +
          width +
          ": board title contrast " +
          titleContrast.toFixed(2),
      );
      check(
        descriptionContrast >= 4.5,
        theme +
          " " +
          width +
          ": board description contrast " +
          descriptionContrast.toFixed(2),
      );

      await page.locator('[data-action="refresh"]').focus();
      const focusOutline = await page
        .locator('[data-action="refresh"]')
        .evaluate((element) => ({
          style: getComputedStyle(element).outlineStyle,
          width: getComputedStyle(element).outlineWidth,
        }));
      check(
        focusOutline.style !== "none" &&
          Number.parseFloat(focusOutline.width) >= 2,
        theme + " " + width + ": visible keyboard focus missing",
      );

      const menu = page
        .locator(".overview-board-list .board-card-actions")
        .first();
      await menu.locator("summary").click();
      check(
        (await menu.getAttribute("open")) !== null,
        theme + " " + width + ": board menu did not open",
      );

      await menu.locator("summary").click();
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.mouse.move(1, 1);
      if (width === 1440) {
        await page.screenshot({
          path: join(destination, "overview-" + theme + "-1440.png"),
          fullPage: true,
        });
      }
      if (width === 390) {
        await page.screenshot({
          path: join(destination, "overview-" + theme + "-390.png"),
          fullPage: false,
        });
      }

      await page.emulateMedia({ reducedMotion: "reduce" });
      const transition = await page
        .locator('[data-action="refresh"]')
        .evaluate((element) => getComputedStyle(element).transitionDuration);
      check(
        transition === "0s",
        theme + " " + width + ": reduced motion was not respected",
      );

      assert.deepEqual(
        errors,
        [],
        theme + " " + width + ": browser runtime errors",
      );
      await page.close();

      console.log(
        "OVERVIEW_BROWSER_PASS " + JSON.stringify({ theme, ...result }),
      );
    }
  }

  const employeePage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await employeePage.goto(origin + "/?theme=light&foundation=off", {
    waitUntil: "networkidle",
  });
  check(
    (await employeePage.locator(".overview-foundation-section").count()) === 0,
    "foundation section visibility changed when the existing verified-state gate is false",
  );
  check(
    (await employeePage.locator(".overview-board-list .board-card").count()) ===
      6,
    "board preview was affected by the foundation display gate",
  );
  await employeePage.close();

  console.log(
    "CP_CRM_OVERVIEW_REDESIGN_01_BROWSER_ACCEPTANCE: PASS (" +
      checks +
      " checks, " +
      widths.length +
      " viewport widths, " +
      themes.length +
      " themes, live renderer and reduced-motion coverage)",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
