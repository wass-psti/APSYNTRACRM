import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const page = readFileSync("index.html", "utf8");
const css = readFileSync("frontend/board-uiverse-overhaul.css", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const app = readFileSync("frontend/app.js", "utf8");
const renderer = readFileSync(
  "frontend/board/presentation/presentation.js",
  "utf8",
);

test("previous Uiverse board stylesheet remains before the complete CRM design system", () => {
  const previous = manifest.indexOf('"frontend/board-overhaul-experience.css"');
  const current = manifest.indexOf('"frontend/board-uiverse-overhaul.css"');
  const complete = manifest.indexOf(
    '"frontend/crm-complete-design-system.css"',
  );
  assert.ok(previous >= 0 && current > previous && complete > current);
  assert.match(
    page,
    /apsyntra-styles\.bundle\.css\?v=(?:cp-crm-boards-uiverse-overhaul-03|cp-crm-overview-redesign-01)/,
  );
  assert.ok(bundle.includes(css.trimEnd()));
  assert.ok(
    bundle.includes(
      "/* frontend/board-uiverse-overhaul.css */\n" + css.trimEnd(),
    ),
  );
});

test("catalog redesign covers cards, search, status filters and responsive grids", () => {
  assert.match(css, /\.boards-hero/);
  assert.match(css, /\.boards-filter-panel/);
  assert.match(css, /\.boards-status-segments/);
  assert.match(css, /#board-search/);
  assert.match(css, /\.boards-catalog-grid/);
  assert.match(css, /\.board-card-actions-list/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("standard board workspace retains native table semantics and sticky columns", () => {
  assert.match(
    app,
    /classList\.toggle\('aps-board-shell',state\.view==='board'\)/,
  );
  assert.match(renderer, /class="table-scroll board-group-scroll"/);
  assert.match(renderer, /class="board-table board-table-custom"/);
  assert.match(css, /\.board-group-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(
    css,
    /\.board-table-custom\s+thead\s+th[\s\S]*?position:\s*sticky/,
  );
  assert.match(
    css,
    /\.board-table-custom\s+thead\s+th\.board-frozen-column[\s\S]*?left:\s*0/,
  );
  assert.match(
    css,
    /\.board-table-custom\s+tbody\s+td\.board-frozen-column[\s\S]*?position:\s*sticky/,
  );
  assert.match(css, /\.board-row-selected/);
  assert.match(css, /\.board-configured-status/);
  assert.match(css, /\.board-bulk-toolbar/);
  assert.match(css, /\.board-pagination/);
});

test("menus, forms, dialogs and drawer use consistent Uiverse-inspired surfaces", () => {
  assert.match(css, /\.board-tool-menu-panel/);
  assert.match(css, /\.board-column-menu-content/);
  assert.match(css, /\.board-actions-popover/);
  assert.match(css, /\.board-card-actions-list/);
  assert.match(css, /body:has\([\s\S]*#app/);
  assert.match(css, /body:has\([\s\S]*\.aps-boards-shell/);
  assert.match(css, /body:has\([\s\S]*\.aps-board-shell/);
  assert.match(css, /#modal-form/);
  assert.match(css, /\.board-detail-backdrop\s*\{/);
  assert.match(css, /z-index:\s*10010/);
  assert.match(css, /\.board-item-drawer/);
});

test("light and dark tokens, focus, disabled, loading and reduced-motion states are defined", () => {
  assert.match(css, /--bu-page:\s*#f6f8fc/);
  assert.match(css, /html\[data-aps-monday-theme="dark"\]/);
  assert.match(css, /--bu-page:\s*#151b25/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:disabled/);
  assert.match(css, /\[aria-busy="true"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(
    css,
    /@import|https?:\/\/|@keyframes|will-change|backdrop-filter/,
  );
});

test("design rules do not change board renderer markup or event contracts", () => {
  assert.match(app, /data-action="new-item"/);
  assert.match(app, /data-action="board-activity"/);
  assert.match(app, /data-action="board-layout-reset"/);
  assert.match(app, /data-action="board-item-detail"/);
  assert.match(renderer, /data-board-select-item/);
  assert.match(renderer, /data-board-select-all/);
});
