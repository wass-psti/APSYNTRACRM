/** CP-CRM-BOARDS-OVERHAUL-01: responsive board catalog and data-grid acceptance. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { boardTable } from "../frontend/board/presentation/presentation.js";

const previous = execFileSync(
  "git",
  ["show", "origin/main:frontend/apsyntra-styles.bundle.css"],
  {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);
const current = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const destination = "docs/visual/cp-crm-ui-restore-01";
mkdirSync(destination, { recursive: true });

const columns = [
  { key: "record", title: "Item" },
  { key: "status", title: "Status" },
  { key: "owner", title: "Owner" },
  { key: "due", title: "Due date" },
  ...Array.from({ length: 7 }, (_, i) => ({
    key: `col:${i + 1}`,
    title: `Custom field ${i + 1}`,
  })),
];
const rows = Array.from({ length: 14 }, (_, i) => ({
  itemId: `row-${i + 1}`,
  search: `work item ${i + 1}`,
  cells: {
    record: `<button type="button" class="board-item-open" data-action="board-item-detail" data-id="row-${i + 1}">Work item ${i + 1}</button>`,
    status: `<span class="board-configured-status board-status-color-${i % 3 === 0 ? "green" : i % 3 === 1 ? "amber" : "blue"}">${i % 3 === 0 ? "Complete" : i % 3 === 1 ? "In progress" : "Planned"}</span>`,
    owner: `<span class="board-member-cell"><span class="board-member-initials">${["LM", "JD", "AR"][i % 3]}</span><span class="board-member-name">${["Lex Morgan", "Jamie Doe", "Alex Rivera"][i % 3]}</span></span>`,
    due: `<time class="board-friendly-date ${i % 3 === 0 ? "is-upcoming" : "is-soon"}">Nov ${22 + (i % 7)}, 2026</time>`,
    ...Object.fromEntries(
      Array.from({ length: 7 }, (_, j) => [
        `col:${j + 1}`,
        `Value ${i + 1}.${j + 1}`,
      ]),
    ),
  },
}));
const tableHtml = boardTable({
  columns,
  rows,
  groupId: "overhaul-fixture",
  selection: { enabled: true, selected: new Set(["row-2"]) },
  footer:
    '<form class="board-inline-add-form"><input aria-label="New item title" placeholder="Add an item"/><button type="button" class="secondary">Add item</button></form>',
  summaries: Object.fromEntries(
    columns.map((column) => [
      column.key,
      column.key === "record" ? "14 items" : "—",
    ]),
  ),
  virtualize: false,
});
const cards = Array.from(
  { length: 9 },
  (_, i) =>
    `<article class="board-card" data-searchable="board ${i + 1}"><div class="board-card-top"><span class="board-symbol ${["", "green", "orange", "pink", "blue"][i % 5]}">${String.fromCharCode(65 + i)}</span><details class="board-card-actions"><summary aria-label="Board actions">···</summary><div class="board-card-actions-list"><button type="button">Edit board</button><button type="button" class="board-card-danger">Move to Trash</button></div></details></div><a class="board-card-main" href="#/boards/${i + 1}"><h3>Workspace board ${i + 1}</h3><p>Organize records, owners, dates, and team updates in one place.</p><div class="board-card-footer"><span>125 items</span><span>Nov 22, 2026</span></div></a></article>`,
).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app">
<main class="main aps-boards-shell"><header class="topbar"><div class="breadcrumb">Workspace / <strong>Boards</strong></div><div class="top-actions"><span class="top-pill">Secure session</span><button class="secondary">Account</button></div></header><div class="main-content"><div class="aps-boards"><section class="page-head boards-hero"><div class="boards-hero-copy"><span class="label-top">Workspace / Boards</span><h1>My boards<span class="boards-heading-stop">.</span></h1><p>Everything your team is working on, organized in one place.</p></div><button type="button" class="primary boards-create-button">＋ New board</button><button type="button" class="secondary" disabled id="disabled-board-control">Disabled</button></section><section class="boards-filter-panel"><div class="toolbar boards-toolbar"><div class="boards-status-picker"><span class="boards-control-label">BOARD STATUS</span><div class="segmented boards-status-segments" role="group"><button class="segment active" aria-pressed="true">Active</button><button class="segment" aria-pressed="false">Archived</button><button class="segment" aria-pressed="false">Trash</button></div></div><div class="boards-search-wrap"><label class="boards-control-label" for="board-search">FIND A BOARD</label><div class="search-wrap"><svg class="boards-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor"/><path d="m20 20-4-4" stroke="currentColor"/></svg><input id="board-search" type="search" placeholder="Search boards…" aria-label="Search boards"></div></div></div><div class="boards-filter-footer"><p class="board-search-result" role="status">255 active boards</p><span class="boards-selected-filter">Active boards</span></div></section><div class="card-grid boards-catalog-grid" id="boards-catalog-grid">${cards}</div></div></div></main>
<main class="main aps-board-shell"><header class="topbar"><div class="breadcrumb">Workspace / <strong>Board</strong></div><div class="top-actions"><span class="top-pill">Secure session</span><button class="secondary">Account</button></div></header><div class="main-content"><section class="page-head"><div><span class="label-top">Workspace / Board</span><h1>Operations Board</h1><p>Track work and team updates in one place.</p></div><div class="head-actions"><button class="secondary">Invite</button><details class="board-actions-menu"><summary>More</summary><div class="board-actions-popover"><button type="button">Activity history</button><button type="button">Refresh board</button></div></details></div></section><div class="tabs board-draggable-tabs" role="tablist"><div class="board-tab-slot"><a class="tab active" aria-selected="true">Main table</a></div><div class="board-tab-slot"><a class="tab">Issues</a></div></div><div class="toolbar board-customize-toolbar"><button class="primary" type="button">＋ New item</button><button class="secondary" type="button" aria-busy="true" id="loading-board-control">Saving…</button><div class="search-wrap"><input class="search-input" type="search" placeholder="Search" aria-label="Search board items"></div><details class="board-tool-menu"><summary>Person</summary><div class="board-tool-menu-panel"><label>Assigned person</label><select><option>All people</option></select></div></details><details class="board-tool-menu"><summary>Filter</summary><div class="board-tool-menu-panel"><label>Status</label><select><option>All statuses</option></select></div></details><details class="board-tool-menu"><summary>Sort</summary><div class="board-tool-menu-panel"><label>Sort rows</label><select><option>Board order</option></select></div></details><details class="board-column-menu"><summary>◉ Hide</summary><div class="board-column-menu-content"><strong>Hide columns</strong><label class="board-hide-columns-choice"><span>Owner</span><input type="checkbox" role="switch" checked></label></div></details></div><div class="group-heading"><button class="board-group-toggle" type="button">⌄</button><h3>Group 1</h3><small>14 items</small></div>${tableHtml}<div class="board-bulk-toolbar" hidden><strong>2 selected</strong><button class="secondary">Export selected</button><button class="secondary">Clear selection</button></div><div class="board-pagination"><span>Showing 14 items</span><button class="secondary">Load more</button></div></div></main>
</div></body></html>`;

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
const metrics = () => ({
  pageWidth: document.documentElement.scrollWidth,
  viewportWidth: innerWidth,
  catalogColumns: getComputedStyle(
    document.querySelector(".boards-catalog-grid"),
  ).gridTemplateColumns.split(" ").length,
  cardCount: document.querySelectorAll(".boards-catalog-grid .board-card")
    .length,
  cardRadius: getComputedStyle(
    document.querySelector(".boards-catalog-grid .board-card"),
  ).borderRadius,
  catalogHeroBackground: getComputedStyle(
    document.querySelector(".boards-hero"),
  ).backgroundImage,
  tableClientWidth: document.querySelector(".board-group-scroll").clientWidth,
  tableScrollWidth: document.querySelector(".board-group-scroll").scrollWidth,
  groupOverflow: getComputedStyle(document.querySelector(".board-group-scroll"))
    .overflowX,
  frozenHeader: {
    position: getComputedStyle(
      document.querySelector(
        ".board-table-custom thead th.board-frozen-column",
      ),
    ).position,
    left: getComputedStyle(
      document.querySelector(
        ".board-table-custom thead th.board-frozen-column",
      ),
    ).left,
  },
  frozenCell: {
    position: getComputedStyle(
      document.querySelector(
        ".board-table-custom tbody td.board-frozen-column",
      ),
    ).position,
    left: getComputedStyle(
      document.querySelector(
        ".board-table-custom tbody td.board-frozen-column",
      ),
    ).left,
  },
  headerBackground: getComputedStyle(
    document.querySelector(".board-table-custom thead th"),
  ).backgroundColor,
  bodyBackground: getComputedStyle(
    document.querySelector(".board-table-custom tbody td"),
  ).backgroundColor,
  selectedBackground: getComputedStyle(
    document.querySelector(".board-row-selected td"),
  ).backgroundColor,
  toolbarSearchHeight: document
    .querySelector(".board-customize-toolbar .search-input")
    .getBoundingClientRect().height,
  catalogSearchHeight: document
    .querySelector("#board-search")
    .getBoundingClientRect().height,
  menuButtonHeight: document
    .querySelector(".board-tool-menu > summary")
    .getBoundingClientRect().height,
  dark: getComputedStyle(document.querySelector(".aps-board-shell"))
    .getPropertyValue("--bo-page")
    .trim(),
  disabledOpacity: getComputedStyle(
    document.querySelector("#disabled-board-control"),
  ).opacity,
  disabledCursor: getComputedStyle(
    document.querySelector("#disabled-board-control"),
  ).cursor,
  loadingCursor: getComputedStyle(
    document.querySelector("#loading-board-control"),
  ).cursor,
  loadingOpacity: getComputedStyle(
    document.querySelector("#loading-board-control"),
  ).opacity,
});
try {
  for (const width of [390, 640, 768, 810, 1024, 1280, 1440, 1898]) {
    for (const theme of ["light", "dark"]) {
      for (const [version, css] of [
        ["before", previous],
        ["after", current],
      ]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
        });
        await page.setContent(html);
        await page.evaluate(
          (value) => (document.documentElement.dataset.apsMondayTheme = value),
          theme,
        );
        await page.addStyleTag({ content: css });
        await page.waitForTimeout(30);
        const data = await page.evaluate(metrics);
        if (version === "after") {
          check(
            data.pageWidth <= width + 1,
            `${theme} ${width}: document horizontal overflow ${data.pageWidth - width}px`,
          );
          check(
            data.cardCount === 9,
            `${theme} ${width}: catalog card count changed`,
          );
          check(
            data.catalogColumns === (width <= 640 ? 1 : width <= 1100 ? 2 : 3),
            `${theme} ${width}: unexpected catalog grid columns ${data.catalogColumns}`,
          );
          check(
            parseFloat(data.cardRadius) >= 10 &&
              parseFloat(data.cardRadius) <= 12,
            `${theme} ${width}: catalog card radius ${data.cardRadius}`,
          );
          check(
            data.tableScrollWidth > data.tableClientWidth,
            `${theme} ${width}: table no longer scrolls horizontally inside group`,
          );
          check(
            data.groupOverflow === "auto",
            `${theme} ${width}: group horizontal overflow is not scrollable`,
          );
          check(
            data.frozenHeader.position === "sticky" &&
              data.frozenHeader.left === "0px",
            `${theme} ${width}: frozen header column lost sticky positioning`,
          );
          check(
            data.frozenCell.position === "sticky" &&
              data.frozenCell.left === "0px",
            `${theme} ${width}: frozen body column lost sticky positioning`,
          );
          check(
            data.toolbarSearchHeight >= 36,
            `${theme} ${width}: board search target is too small`,
          );
          check(
            data.catalogSearchHeight >= 40,
            `${theme} ${width}: catalog search target is too small`,
          );
          check(
            data.menuButtonHeight >= 36,
            `${theme} ${width}: filter control target is too small`,
          );
          check(
            data.disabledOpacity === "0.48" &&
              data.disabledCursor === "not-allowed",
            `${theme} ${width}: disabled control state is missing`,
          );
          check(
            data.loadingCursor === "progress" && data.loadingOpacity === "0.78",
            `${theme} ${width}: loading control state is missing`,
          );
          check(
            data.selectedBackground !== data.bodyBackground,
            `${theme} ${width}: selected row state is not visually distinct`,
          );
          if (theme === "dark")
            check(
              data.dark === "#191c23",
              `${theme} ${width}: dark token not active (${data.dark})`,
            );
          if (width === 1440 && theme === "light") {
            await page.screenshot({
              path: `${destination}/boards-restored-1440.png`,
              fullPage: true,
            });
          }
          if (width === 390 && theme === "light") {
            await page.screenshot({
              path: `${destination}/boards-restored-390.png`,
              fullPage: true,
            });
          }
          // The horizontal scrollbar moves the table without widening the page.
          const scroll = await page
            .locator(".board-group-scroll")
            .evaluate((el) => {
              el.scrollLeft = 240;
              return {
                left: el.scrollLeft,
                pageWidth: document.documentElement.scrollWidth,
              };
            });
          check(
            scroll.left > 0,
            `${theme} ${width}: group horizontal scrolling did not move`,
          );
          check(
            scroll.pageWidth <= width + 1,
            `${theme} ${width}: horizontal scroll widened the page`,
          );
          // Existing native details, search and selection controls remain interactive.
          await page
            .locator(".board-tool-menu")
            .first()
            .locator("summary")
            .click();
          check(
            await page
              .locator(".board-tool-menu")
              .first()
              .evaluate((el) => el.open),
            `${theme} ${width}: toolbar menu no longer opens`,
          );
          await page
            .locator(".board-tool-menu")
            .first()
            .locator("summary")
            .click();
          await page.locator("#board-search").focus();
          const focus = await page.locator("#board-search").evaluate((el) => ({
            width: getComputedStyle(el).outlineWidth,
            style: getComputedStyle(el).outlineStyle,
          }));
          check(
            parseFloat(focus.width) >= 2 && focus.style === "solid",
            `${theme} ${width}: keyboard focus ring is missing`,
          );
          await page.locator("#board-search").fill("board 2");
          check(
            (await page.locator("#board-search").inputValue()) === "board 2",
            `${theme} ${width}: catalog search input is not editable`,
          );
          await page
            .locator(
              '.board-table-custom tbody tr[data-searchable="work item 1"]',
            )
            .hover();
          const hover = await page
            .locator(
              '.board-table-custom tbody tr[data-searchable="work item 1"] td',
            )
            .first()
            .evaluate((el) => getComputedStyle(el).backgroundColor);
          check(
            hover !== data.bodyBackground,
            `${theme} ${width}: row hover state is not distinct`,
          );
          await page.locator('[data-board-select-item="row-1"]').check();
          check(
            await page.locator('[data-board-select-item="row-1"]').isChecked(),
            `${theme} ${width}: row selection control is not interactive`,
          );
        } else if (width === 1440 && theme === "light") {
          await page.screenshot({
            path: `${destination}/boards-before-restoration-1440.png`,
            fullPage: true,
          });
        } else if (width === 390 && theme === "light") {
          await page.screenshot({
            path: `${destination}/boards-before-restoration-390.png`,
            fullPage: true,
          });
        }
        await page.close();
      }
    }
  }
  console.log(
    `CP_CRM_UI_RESTORE_01_BOARDS_BROWSER_PASS ${checks} checks across 8 viewport widths, 2 themes, and before/after stylesheets`,
  );
} finally {
  await browser.close();
}
