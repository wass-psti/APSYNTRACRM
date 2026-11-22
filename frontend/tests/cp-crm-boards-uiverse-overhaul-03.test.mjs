import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const index = readFileSync("index.html", "utf8");
const css = readFileSync("frontend/crm-complete-design-system.css", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const app = readFileSync("frontend/app.js", "utf8");
const boardRenderer = readFileSync(
  "frontend/board/presentation/presentation.js",
  "utf8",
);

test("complete CRM design system is the final deterministic stylesheet", () => {
  const previous = manifest.indexOf('"frontend/board-uiverse-overhaul.css"');
  const current = manifest.indexOf('"frontend/crm-complete-design-system.css"');
  assert.ok(previous >= 0 && current > previous);
  assert.match(
    index,
    /apsyntra-styles\.bundle\.css\?v=cp-crm-boards-uiverse-overhaul-03/,
  );
  assert.ok(
    bundle.includes(
      `/* frontend/crm-complete-design-system.css */\n${css.trimEnd()}`,
    ),
  );
});

test("shared application shell, navigation and topbar receive a new visual system", () => {
  for (const selector of [
    ".shell",
    ".aps-sidebar",
    ".sidebar-brand-wrap",
    ".workspace-switcher",
    ".nav-link.active",
    ".topbar",
    ".top-actions",
    ".main-content",
  ]) {
    assert.ok(
      css.includes(selector),
      `Missing redesigned shell component ${selector}`,
    );
  }
  assert.match(css, /grid-template-columns:\s*264px minmax\(0, 1fr\)/);
  assert.match(css, /--crm-sidebar:\s*#172235/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /sidebar-mobile-open/);
});

test("catalog cards, filters and board workspace controls share the new design tokens", () => {
  for (const selector of [
    ".boards-hero",
    ".boards-filter-panel",
    ".boards-status-segments",
    ".boards-catalog-grid",
    ".board-card",
    ".board-customize-toolbar",
    ".board-draggable-tabs",
    ".board-group-panel",
    ".board-table-custom",
    ".board-bulk-toolbar",
    ".aps-global-search-dialog",
    ".board-item-drawer",
    ".board-history-modal",
  ]) {
    assert.ok(
      css.includes(selector),
      `Missing redesigned Boards component ${selector}`,
    );
  }
  assert.match(css, /--crm-accent:/);
  assert.match(css, /--crm-radius-card:/);
  assert.match(css, /--crm-shadow-card:/);
  assert.match(css, /\.status\.completed/);
  assert.match(css, /\.status\.in-progress/);
  assert.match(css, /\.status\.blocked/);
});

test("light, dark, responsive, reduced-motion and native module boundaries are explicit", () => {
  assert.match(css, /html\[data-aps-monday-theme="dark"\]/);
  assert.match(css, /--crm-canvas:\s*#111925/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 810px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.aps-time-tracker-shell/);
  assert.match(css, /\.aps-fund-tracker-shell/);
  assert.match(css, /\.aps-tradelink-shell/);
  assert.match(css, /\.aps-fueltrack-shell/);
  assert.doesNotMatch(css, /@import|https?:\/\/|@keyframes|will-change/);
});

test("existing route, renderer and interaction contracts remain untouched", () => {
  assert.match(
    app,
    /classList\.toggle\('aps-boards-shell',state\.view==='boards'\)/,
  );
  assert.match(app, /data-action="new-item"/);
  assert.match(app, /data-action="board-activity"/);
  assert.match(app, /data-action="board-layout-reset"/);
  assert.match(app, /data-action="board-item-detail"/);
  assert.match(boardRenderer, /class="table-scroll board-group-scroll"/);
  assert.match(boardRenderer, /class="board-table board-table-custom"/);
  assert.match(boardRenderer, /data-board-select-item/);
  assert.match(boardRenderer, /data-board-select-all/);
});
