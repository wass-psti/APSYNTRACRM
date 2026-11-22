/** CP-CRM-BOARDS-UIVERSE-OVERHAUL-03: complete shell and Boards visual acceptance. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { boardTable } from "../frontend/board/presentation/presentation.js";
import { STYLE_BUNDLE } from "./priority5-style-manifest.mjs";

const css = readFileSync(STYLE_BUNDLE, "utf8");
const destination = "docs/visual/cp-crm-boards-uiverse-overhaul-03";
mkdirSync(destination, { recursive: true });

const sidebar = `
<aside class="sidebar aps-sidebar" aria-label="Workspace sidebar">
  <div class="sidebar-brand-wrap">
    <a class="brand" href="#/overview"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-text">APSYNTRA <span class="csp-u043">CRM</span></span></a>
    <span class="sidebar-brand-subtitle">WORKSPACE OPERATIONS</span>
    <button class="sidebar-layout-toggle" type="button" aria-label="Collapse navigation"><span class="sidebar-layout-toggle-glyph">‹</span></button>
  </div>
  <div class="workspace-switcher"><span class="workspace-icon">W</span><div class="sidebar-workspace-copy"><div class="workspace-name">Work Management</div><div class="workspace-sub"><span class="sidebar-workspace-dot"></span>Connected workspace</div></div></div>
  <div class="ws01-context-relation">Workspace member</div>
  <div class="sidebar-nav-scroll">
    <div class="side-section">Workspace</div>
    <nav class="nav-list"><a class="nav-link" href="#/overview"><span class="nav-ico">⌂</span><span class="nav-label">Overview</span></a><a class="nav-link active" href="#/boards" aria-current="page"><span class="nav-ico">▦</span><span class="nav-label">My boards</span><span class="nav-count">255</span></a></nav>
    <div class="side-section sidebar-nav-section">Applications</div>
    <nav class="nav-list"><a class="nav-link" href="#/time-tracker"><span class="nav-ico">◷</span><span class="nav-label">TimeTracker</span></a><a class="nav-link" href="#/fund-tracker"><span class="nav-ico">▤</span><span class="nav-label">Fund Tracker</span></a><a class="nav-link" href="#/tradelink"><span class="nav-ico">⇄</span><span class="nav-label">TradeLink</span></a></nav>
    <div class="side-section sidebar-recent-heading">Boards <span class="sidebar-recent-count">255</span></div>
    <nav class="nav-list sidebar-recent-list"><a class="nav-link sidebar-recent-link" href="#/boards/1"><span class="sidebar-board-initial">T</span><span class="nav-label">Trade-Link</span></a><a class="nav-link sidebar-recent-link" href="#/boards/2"><span class="sidebar-board-initial sidebar-tone-teal">F</span><span class="nav-label">Fund-Released Tracker</span></a></nav>
  </div>
  <div class="side-bottom"><div class="profile"><span class="avatar">LM</span><div class="sidebar-profile-text"><div class="name">Lex Morgan</div><div class="role">Workspace administrator</div></div></div><button class="sign-out"><span class="sidebar-signout-icon">↗</span><span>Sign out</span></button></div>
</aside>`;

const topbar = `
<header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>›</span><strong>My boards</strong></div><div class="top-actions"><button class="aps-global-search-trigger"><span class="aps-global-search-trigger-icon">⌕</span><span class="aps-global-search-trigger-label">Search</span><kbd>⌘ K</kbd></button><button class="secondary">Invite members</button><span class="top-pill"><span class="online-dot"></span>Secure session</span><button class="aps-sync" data-sync-state="synced"><span class="aps-sync-caption">Live synced</span></button><a class="avatar top-avatar">LM</a></div></header>`;

const cards = Array.from(
  { length: 9 },
  (_, i) => `
<article class="board-card"><div class="board-card-top"><span class="board-symbol ${["", "green", "orange", "pink", "blue"][i % 5]}">${String.fromCharCode(65 + i)}</span><details class="board-card-actions"><summary aria-label="Board actions">···</summary><div class="board-card-actions-list"><button type="button">Open board</button><button type="button">Edit board</button></div></details></div><a class="board-card-main" href="#/boards/${i + 1}"><h3>${["Trade-Link", "Inventory Material Requests", "Fund-Released Tracker", "TimeTracker Attendance", "Employee Evaluation", "Toolbox Issues", "Order Intake", "Charter Navigator", "APS AIMS"][i]}</h3><p>Organize records, owners, dates, and team updates in one place.</p><div class="board-card-footer"><span>${125 + i * 8} items</span><span>Nov 22, 2026</span></div></a></article>`,
).join("");

const columns = [
  { key: "record", title: "Item" },
  { key: "status", title: "Status" },
  { key: "owner", title: "Owner" },
  { key: "due", title: "Due date" },
  ...Array.from({ length: 6 }, (_, i) => ({
    key: `field:${i + 1}`,
    title: `Field ${i + 1}`,
  })),
];
const rows = Array.from({ length: 12 }, (_, i) => ({
  itemId: `record-${i + 1}`,
  search: `Work item ${i + 1}`,
  cells: {
    record: `<button type="button" class="board-item-open" aria-label="Open item details">▥</button><button type="button" class="board-inline-cell-trigger"><span class="board-wrap-cell">Work item ${i + 1}</span></button>`,
    status: `<span class="status ${["completed", "in-progress", "planned"][i % 3]}">${["Complete", "In progress", "Planned"][i % 3]}</span>`,
    owner: `<span class="board-member-name">${["Jamie Doe", "Alex Rivera", "Taylor Lee"][i % 3]}</span>`,
    due: `<time>Nov ${22 + i}, 2026</time>`,
    ...Object.fromEntries(
      Array.from({ length: 6 }, (_, j) => [
        `field:${j + 1}`,
        `Value ${i + 1}.${j + 1}`,
      ]),
    ),
  },
}));
const table = boardTable({
  columns,
  rows,
  groupId: "uiverse-03",
  selection: { enabled: true, selected: new Set(["record-2"]) },
  footer:
    '<form class="board-inline-add-form"><input aria-label="New item title" placeholder="Add an item"/><button type="button" class="secondary">Add item</button></form>',
  summaries: Object.fromEntries(
    columns.map((column) => [
      column.key,
      column.key === "record" ? "12 items" : "—",
    ]),
  ),
  virtualize: false,
});

const catalogHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell">${sidebar}<main class="main aps-boards-shell">${topbar}<div class="main-content"><div class="aps-boards"><section class="page-head boards-hero"><div class="boards-hero-copy"><span class="label-top">Workspace / Boards</span><h1>My boards<span class="boards-heading-stop">.</span></h1><p>Everything your team is working on, organized in one place.</p></div><button type="button" class="primary boards-create-button">＋ New board</button><svg class="boards-hero-decor" viewBox="0 0 500 220" aria-hidden="true"><circle cx="397" cy="30" r="130" stroke="currentColor"/><circle cx="397" cy="30" r="190" stroke="currentColor"/></svg></section><section class="boards-filter-panel"><div class="toolbar boards-toolbar"><div class="boards-status-picker"><span class="boards-control-label">BOARD STATUS</span><div class="segmented boards-status-segments"><button class="segment active" aria-pressed="true">Active</button><button class="segment">Archived</button><button class="segment">Trash</button></div></div><div class="boards-search-wrap"><label class="boards-control-label" for="board-search">FIND A BOARD</label><div class="search-wrap"><svg class="boards-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor"/><path d="m20 20-4-4" stroke="currentColor"/></svg><input id="board-search" type="search" placeholder="Search boards…"/></div></div></div><div class="boards-filter-footer"><p class="board-search-result">255 active boards</p><span class="boards-selected-filter">Active boards</span></div></section><div class="card-grid boards-catalog-grid">${cards}</div></div></div></main></div></div></body></html>`;

const overlayPreview = `
<div class="aps-global-search-backdrop" hidden><section class="aps-global-search-dialog" role="dialog"><div class="aps-global-search-heading"><div><h2>Search APSYNTRA CRM</h2><p>Find modules, boards, records and workspace content.</p></div><button class="aps-global-search-close">×</button></div><div class="aps-global-search-input-wrap"><span class="aps-global-search-glyph">⌕</span><input class="aps-global-search-input" placeholder="Search modules, boards and records…"/><kbd class="aps-global-search-shortcut">⌘ K</kbd></div><p class="aps-global-search-status">3 results</p><div class="aps-global-search-results"><button class="aps-global-search-option" aria-selected="true"><span class="aps-global-search-option-copy"><strong class="aps-global-search-option-title">Trade-Link</strong><span class="aps-global-search-option-subtitle">Board · Workspace</span></span></button></div><div class="aps-global-search-footer"><kbd>↑</kbd> Navigate <kbd>↵</kbd> Open <kbd>Esc</kbd> Close</div></section></div>
<div class="modal-backdrop board-detail-backdrop" hidden><aside class="board-item-drawer" role="dialog" aria-modal="true"><div class="board-item-drawer-header"><span class="label-top">APSYNTRA CRM / Board item</span><button class="modal-close">×</button></div><div class="mrh-detail-identity"><h2>Work item 1</h2></div><p class="muted">Read-only item details from the signed board response.</p></aside></div>`;

const boardHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell">${sidebar}<main class="main aps-board-shell">${topbar.replace("My boards", "Trade-Link")}<div class="main-content"><section class="page-head"><div><span class="label-top">Workspace / Board</span><h1>Trade-Link</h1><p>Track your team's work and updates.</p></div><div class="head-actions"><button class="secondary">Invite members</button><button class="primary">New item</button></div></section><div class="tabs board-draggable-tabs"><div class="board-tab-slot"><a class="tab active" aria-selected="true">Main table</a></div><div class="board-tab-slot"><a class="tab">Issues</a></div></div><div class="toolbar board-customize-toolbar"><button class="primary">＋ New item</button><div class="search-wrap board-toolbar-search"><input class="search-input" type="search" placeholder="Search items"/><svg class="board-toolbar-search-icon" viewBox="0 0 24 24" width="16" height="16"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor"/><path d="m16 16 5 5" stroke="currentColor"/></svg></div><details class="board-tool-menu"><summary>Person</summary><div class="board-tool-menu-panel"><label>Assigned person</label><select><option>All people</option></select></div></details><details class="board-tool-menu"><summary>Filter</summary><div class="board-tool-menu-panel"><label>Status</label><select><option>All statuses</option></select></div></details><details class="board-tool-menu"><summary>Sort</summary><div class="board-tool-menu-panel"><label>Sort rows</label><select><option>Board order</option></select></div></details></div><div class="group-heading"><h3>Active work</h3><small>12 items</small></div>${table}<div class="board-bulk-toolbar"><strong>1 selected</strong><button class="secondary">Export selected CSV</button><button class="secondary">Clear selection</button></div></div></main></div></div>${overlayPreview}</body></html>`;

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

async function prepare(page, html, theme, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate((value) => {
    document.documentElement.dataset.apsMondayTheme = value;
  }, theme);
  await page.addStyleTag({ content: css });
  await page.waitForTimeout(25);
}

try {
  for (const width of [390, 640, 768, 810, 1024, 1280, 1440, 1898]) {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      await prepare(page, catalogHtml, theme, width, 900);
      const catalog = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        shellColumns: getComputedStyle(document.querySelector(".shell"))
          .gridTemplateColumns,
        sidebarBackground: getComputedStyle(
          document.querySelector(".aps-sidebar"),
        ).backgroundColor,
        sidebarWidth: document
          .querySelector(".aps-sidebar")
          .getBoundingClientRect().width,
        topbarHeight: document.querySelector(".topbar").getBoundingClientRect()
          .height,
        topbarPosition: getComputedStyle(document.querySelector(".topbar"))
          .position,
        heroRadius: getComputedStyle(document.querySelector(".boards-hero"))
          .borderRadius,
        cardRadius: getComputedStyle(document.querySelector(".board-card"))
          .borderRadius,
        cardColumns: getComputedStyle(
          document.querySelector(".boards-catalog-grid"),
        ).gridTemplateColumns.split(" ").length,
        activeNavCurrent: document
          .querySelector(".nav-link.active")
          .getAttribute("aria-current"),
        activeNavColor: getComputedStyle(
          document.querySelector(".nav-link.active"),
        ).color,
        backgroundToken: getComputedStyle(document.querySelector(".shell"))
          .getPropertyValue("--crm-canvas")
          .trim(),
        cardCount: document.querySelectorAll(".board-card").length,
        overflowing: [...document.querySelectorAll("body *")]
          .filter(
            (element) =>
              element.clientWidth > 0 &&
              element.scrollWidth > element.clientWidth + 1,
          )
          .map((element) => ({
            tag: element.tagName,
            className: String(element.className || ""),
            id: element.id,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            rect: Math.round(element.getBoundingClientRect().right),
          }))
          .slice(0, 12),
      }));
      check(
        catalog.pageWidth <= width + 1,
        `${theme} ${width}: catalog page overflowed by ${catalog.pageWidth - width}px; elements=${JSON.stringify(catalog.overflowing)}`,
      );
      check(
        catalog.cardCount === 9,
        `${theme} ${width}: board cards were lost`,
      );
      check(
        catalog.topbarPosition === "sticky",
        `${theme} ${width}: top bar is not sticky`,
      );
      check(
        catalog.heroRadius === "18px",
        `${theme} ${width}: catalog hero radius ${catalog.heroRadius}`,
      );
      check(
        catalog.cardRadius === "14px",
        `${theme} ${width}: board card redesign did not apply`,
      );
      check(
        catalog.cardColumns === (width <= 600 ? 1 : width <= 1180 ? 2 : 3),
        `${theme} ${width}: unexpected catalog columns ${catalog.cardColumns}`,
      );
      check(
        catalog.sidebarWidth ===
          (width <= 810 ? 69 : width <= 1180 ? 238 : 264),
        `${theme} ${width}: sidebar width ${catalog.sidebarWidth}`,
      );
      check(
        catalog.activeNavCurrent === "page",
        `${theme} ${width}: active navigation route state was lost`,
      );
      check(
        catalog.backgroundToken.length > 0,
        `${theme} ${width}: shell theme tokens missing`,
      );
      if (theme === "dark")
        check(
          catalog.backgroundToken === "#111925",
          `${theme} ${width}: dark shell token ${catalog.backgroundToken}`,
        );
      if (width === 1440)
        await page.screenshot({
          path: `${destination}/catalog-${theme}-1440.png`,
          fullPage: true,
        });
      if (width === 390)
        await page.screenshot({
          path: `${destination}/catalog-${theme}-390.png`,
          fullPage: true,
        });
      await page.close();

      const boardPage = await browser.newPage({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      await prepare(boardPage, boardHtml, theme, width, 900);
      await boardPage.evaluate(() => {
        document.body.classList.add("aps-global-search-open");
        document.querySelector(".aps-global-search-backdrop").hidden = false;
        document.querySelector(".board-detail-backdrop").hidden = false;
      });
      const board = await boardPage.evaluate(() => {
        const scroll = document.querySelector(".board-group-scroll");
        const frozenHeader = document.querySelector(
          ".board-table-custom thead th.board-frozen-column",
        );
        const frozenCell = document.querySelector(
          ".board-table-custom tbody td.board-frozen-column",
        );
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          toolbarRadius: getComputedStyle(
            document.querySelector(".board-customize-toolbar"),
          ).borderRadius,
          groupRadius: getComputedStyle(
            document.querySelector(".board-group-panel"),
          ).borderRadius,
          groupOverflow: getComputedStyle(scroll).overflowX,
          groupClientWidth: scroll.clientWidth,
          groupScrollWidth: scroll.scrollWidth,
          stickyHeader: getComputedStyle(frozenHeader).position,
          stickyHeaderLeft: getComputedStyle(frozenHeader).left,
          stickyCell: getComputedStyle(frozenCell).position,
          stickyCellLeft: getComputedStyle(frozenCell).left,
          selectedRow: getComputedStyle(
            document.querySelector(".board-row-selected td"),
          ).backgroundColor,
          boardBackground: getComputedStyle(
            document.querySelector(".aps-board-shell"),
          ).backgroundColor,
          searchDialogRadius: getComputedStyle(
            document.querySelector(".aps-global-search-dialog"),
          ).borderRadius,
          searchDialogSurface: getComputedStyle(
            document.querySelector(".aps-global-search-dialog"),
          ).backgroundColor,
          drawerRadius: getComputedStyle(
            document.querySelector(".board-item-drawer"),
          ).borderRadius,
          drawerWidth: document
            .querySelector(".board-item-drawer")
            .getBoundingClientRect().width,
          completedStatusColor: getComputedStyle(
            document.querySelector(".status.completed"),
          ).color,
          progressStatusColor: getComputedStyle(
            document.querySelector(".status.in-progress"),
          ).color,
          primaryButtonText: document.querySelector(
            ".board-inline-cell-trigger",
          ).textContent,
        };
      });
      if (width === 1440 && theme === "light") {
        check(
          board.primaryButtonText === "Work item 1",
          "board primary title action text changed",
        );
      }
      check(
        board.searchDialogRadius === "16px",
        `${theme} ${width}: command search dialog radius ${board.searchDialogRadius}`,
      );
      check(
        board.drawerRadius === "15px 0px 0px 15px",
        `${theme} ${width}: item drawer radius ${board.drawerRadius}`,
      );
      check(
        board.drawerWidth === Math.min(540, width),
        `${theme} ${width}: item drawer width ${board.drawerWidth}`,
      );
      check(
        board.completedStatusColor !== board.progressStatusColor,
        `${theme} ${width}: status colors lost their meaning`,
      );
      check(
        board.pageWidth <= width + 1,
        `${theme} ${width}: board page overflowed by ${board.pageWidth - width}px`,
      );
      check(
        board.toolbarRadius === "12px",
        `${theme} ${width}: board toolbar radius ${board.toolbarRadius}`,
      );
      check(
        board.groupRadius === (width <= 600 ? "9px" : "12px"),
        `${theme} ${width}: board group radius ${board.groupRadius}`,
      );
      check(
        board.groupOverflow === "auto",
        `${theme} ${width}: horizontal group scrolling changed`,
      );
      check(
        board.groupScrollWidth > board.groupClientWidth,
        `${theme} ${width}: horizontal table scrolling missing`,
      );
      check(
        board.stickyHeader === "sticky" && board.stickyHeaderLeft === "0px",
        `${theme} ${width}: sticky header column changed`,
      );
      check(
        board.stickyCell === "sticky" && board.stickyCellLeft === "0px",
        `${theme} ${width}: sticky first column changed`,
      );
      check(
        board.selectedRow !== "rgba(0, 0, 0, 0)",
        `${theme} ${width}: selected row highlight missing`,
      );
      if (width === 1440) {
        await boardPage.evaluate(() => {
          document.querySelector(".aps-global-search-backdrop").hidden = true;
        });
        await boardPage.screenshot({
          path: `${destination}/item-drawer-${theme}-1440.png`,
          fullPage: false,
        });
        await boardPage.evaluate(() => {
          document.querySelector(".board-detail-backdrop").hidden = true;
          document.querySelector(".aps-global-search-backdrop").hidden = false;
        });
        await boardPage.waitForTimeout(220);
        await boardPage.screenshot({
          path: `${destination}/command-search-${theme}-1440.png`,
          fullPage: false,
        });
        await boardPage.evaluate(() => {
          document.querySelector(".aps-global-search-backdrop").hidden = true;
          document.body.classList.remove("aps-global-search-open");
        });
        await boardPage.screenshot({
          path: `${destination}/board-${theme}-1440.png`,
          fullPage: true,
        });
      }
      if (width === 390)
        await boardPage.screenshot({
          path: `${destination}/board-${theme}-390.png`,
          fullPage: true,
        });
      await boardPage.close();
    }
  }
  console.log(
    `CP_CRM_BOARDS_UIVERSE_OVERHAUL_03_BROWSER_ACCEPTANCE: PASS (${checks} checks, 8 viewport widths, 2 themes, catalog and board workspace)`,
  );
} finally {
  await browser.close();
}
