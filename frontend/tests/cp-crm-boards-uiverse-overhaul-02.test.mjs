import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STYLE_SOURCES } from "../../scripts/priority5-style-manifest.mjs";

const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const page = readFileSync("index.html", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const app = readFileSync("frontend/app.js", "utf8");
const renderer = readFileSync(
  "frontend/board/presentation/presentation.js",
  "utf8",
);

test("superseded Uiverse board layer is retained for history but excluded from the active bundle", () => {
  assert.equal(
    STYLE_SOURCES.includes("frontend/board-uiverse-overhaul.css"),
    false,
  );
  assert.equal(STYLE_SOURCES.at(-1), "frontend/board-overhaul-experience.css");
  assert.doesNotMatch(
    bundle,
    /\/\* frontend\/board-uiverse-overhaul\.css \*\//,
  );
  assert.doesNotMatch(page, /frontend\/board-uiverse-overhaul\.css/);
  assert.doesNotMatch(manifest, /"frontend\/board-uiverse-overhaul\.css"/);
  assert.equal(existsSync("frontend/board-uiverse-overhaul.css"), true);
  assert.match(
    page,
    /apsyntra-styles\.bundle\.css\?v=(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01)/,
  );
});

test("approved board presentation and native board renderer remain active", () => {
  assert.ok(STYLE_SOURCES.includes("frontend/board-overhaul-experience.css"));
  assert.ok(STYLE_SOURCES.includes("frontend/board-catalog-experience.css"));
  assert.match(
    app,
    /classList\.toggle\('aps-boards-shell',state\.view==='boards'\)/,
  );
  assert.match(
    app,
    /classList\.toggle\('aps-board-shell',state\.view==='board'\)/,
  );
  assert.match(renderer, /class="table-scroll board-group-scroll"/);
  assert.match(renderer, /class="board-table board-table-custom"/);
  assert.match(renderer, /data-board-select-item/);
  assert.match(renderer, /data-board-select-all/);
  assert.match(app, /data-action="board-item-detail"/);
  assert.match(app, /restoreBoardGroupScroll\(/);
});
