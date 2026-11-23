import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLE_SOURCES } from "../../scripts/priority5-style-manifest.mjs";

const page = readFileSync("index.html", "utf8");
const css = readFileSync("frontend/board-overhaul-experience.css", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const app = readFileSync("frontend/app.js", "utf8");
const table = readFileSync(
  "frontend/board/presentation/presentation.js",
  "utf8",
);
const catalog = readFileSync("frontend/board-catalog-experience.css", "utf8");
const smoke = readFileSync("scripts/pages-smoke.mjs", "utf8");

test("approved board overhaul is the final active CRM visual layer", () => {
  assert.equal(STYLE_SOURCES.at(-1), "frontend/board-overhaul-experience.css");
  assert.equal(STYLE_SOURCES.at(-2), "frontend/dark-simplified-system.css");
  assert.match(
    page,
    /apsyntra-styles\.bundle\.css\?v=(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01)/,
  );
  assert.ok(page.includes("frontend/board-overhaul-experience.css"));
  assert.ok(smoke.includes("frontend/board-overhaul-experience.css"));
  assert.ok(bundle.includes(css.trimEnd()));
  assert.ok(
    bundle.includes(
      "/* frontend/board-overhaul-experience.css */\n" + css.trimEnd(),
    ),
  );
});

test("catalog and board route remain on their existing renderers and shell scopes", () => {
  assert.match(
    app,
    /classList\.toggle\('aps-boards-shell',state\.view==='boards'\)/,
  );
  assert.match(
    app,
    /classList\.toggle\('aps-board-shell',state\.view==='board'\)/,
  );
  assert.match(app, /items\.map\(boardCard\)\.join\(''\)/);
  assert.match(app, /function boardCard\(board,index\)/);
  assert.match(app, /function boardsPage\(\)/);
  assert.match(app, /function boardPage\(\)/);
  assert.match(css, /#app \.aps-boards-shell/);
  assert.match(css, /aps-board-shell:not\(\.aps-time-tracker-shell\)/);
  assert.match(catalog, /\.boards-catalog-grid/);
});

test("catalog actions, search, status filters and lifecycle hooks are unchanged", () => {
  assert.match(app, /data-action="active-boards"/);
  assert.match(app, /data-action="archived-boards"/);
  assert.match(app, /data-action="trashed-boards"/);
  assert.match(app, /id="board-search"/);
  assert.match(app, /id="board-search-result" role="status"/);
  assert.match(app, /data-action="board-card-edit"/);
  assert.match(app, /data-action="board-card-restore"/);
  assert.match(app, /data-action="board-card-trash"/);
  assert.match(app, /data-action="board-card-permanent-delete"/);
  assert.match(app, /case 'active-boards'/);
  assert.match(app, /case 'archived-boards'/);
  assert.match(app, /if\(event\.target\.id==='board-search'\)/);
});

test("typed table renderer preserves existing row, column, selection and footer contracts", () => {
  assert.match(table, /class="board-table board-table-custom"/);
  assert.match(table, /data-group-id=/);
  assert.match(table, /class="board-frozen-column"/);
  assert.match(table, /data-board-select-item=/);
  assert.match(table, /data-board-select-all=/);
  assert.match(table, /data-action="board-column-context"/);
  assert.match(table, /data-action="board-primary-label-edit"/);
  assert.match(table, /data-action="board-add-column"/);
  assert.match(table, /class="board-add-item-row"/);
  assert.match(table, /class="board-column-summaries"/);
  assert.match(app, /data-action="board-item-detail"/);
  assert.match(app, /restoreBoardGroupScroll\(/);
  assert.match(app, /data-board-horizontal-rail/);
});

test("board visual system covers table, frozen columns, menus, selection and status states", () => {
  for (const selector of [
    ".board-customize-toolbar",
    ".board-tool-menu-panel",
    ".board-column-menu-content",
    ".group-heading",
    ".board-group-panel",
    ".board-group-scroll",
    ".board-table-custom",
    ".board-frozen-column",
    ".board-row-selected",
    ".board-column-more",
    ".board-column-resize",
    ".board-bulk-toolbar",
    ".board-pagination",
    ".board-horizontal-rail",
    ".board-card-actions-list",
  ])
    assert.ok(css.includes(selector), `missing board style: ${selector}`);
  assert.match(css, /position: sticky/);
  assert.match(css, /left: 0/);
  assert.match(css, /overflow-x: auto/);
  assert.ok(css.includes(".board-row-selected"));
  assert.ok(css.includes(":has(.board-row-select:checked)"));
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /aps-board-loading/);
  assert.match(css, /aria-busy=\"true\"/);
});

test("catalog and table use consistent light/dark tokens and responsive control states", () => {
  assert.match(css, /--bo-page:/);
  assert.match(css, /--bo-accent:/);
  assert.match(css, /html\[data-aps-monday-theme="dark"\]/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /:hover/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:disabled/);
  assert.match(css, /aria-pressed="true"/);
});

test("Uiverse-inspired styles are original static CSS with no external runtime or injected styles", () => {
  assert.match(css, /Uiverse-inspired board interface refresh/);
  assert.doesNotMatch(css, /@import|url\(\s*https?:|@keyframes/i);
  const animations = [...css.matchAll(/animation:\s*([^;]+);/gi)].map((match) =>
    match[1].trim(),
  );
  assert.ok(
    animations.every((value) => value.startsWith("none")),
    `unexpected animation declaration: ${animations.join(", ")}`,
  );
  assert.doesNotMatch(css, /\.style\s*=|setAttribute\s*\(\s*['"]style/);
  assert.doesNotMatch(css, /\sstyle="|\sonclick=|\soninput=/);
  const fixedPositionRules = [...css.matchAll(/position:\s*fixed/g)];
  assert.equal(fixedPositionRules.length, 1);
  assert.match(css, /\.board-detail-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /aps-time-tracker-shell/);
  assert.match(css, /aps-fund-tracker-shell/);
  assert.match(css, /aps-tradelink-shell/);
  assert.match(css, /aps-fueltrack-shell/);
});
