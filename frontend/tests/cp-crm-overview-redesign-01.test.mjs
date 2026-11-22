import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLE_BUNDLE,
  STYLE_SOURCES,
} from "../../scripts/priority5-style-manifest.mjs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";

const app = readFileSync("frontend/app.js", "utf8");
const designSystem = readFileSync(
  "frontend/crm-complete-design-system.css",
  "utf8",
);
const bundle = readFileSync(STYLE_BUNDLE, "utf8");
const index = readFileSync("index.html", "utf8");
const smoke = readFileSync("scripts/pages-smoke.mjs", "utf8");
const browserScript = readFileSync(
  "scripts/cp-crm-overview-redesign-01-browser.mjs",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const previewStart = app.indexOf("function overviewBoardPreview(");
const overviewStart = app.indexOf("function overview(){");
const overviewEnd = app.indexOf("function boardsPage(){", overviewStart);
const overview = app.slice(previewStart, overviewEnd);
const designStart = designSystem.indexOf("/* CP-CRM-OVERVIEW-REDESIGN-01");
const design = designSystem.slice(designStart);

test("Overview renders the new dashboard composition in the actual route renderer", () => {
  assert.ok(
    previewStart >= 0 &&
      overviewStart > previewStart &&
      overviewEnd > overviewStart,
  );
  assert.match(overview, /class="aps-overview overview-dashboard"/);
  assert.match(overview, /class="overview-metrics-section"/);
  assert.match(overview, /class="stat-grid overview-stat-grid/);
  assert.match(
    overview,
    /class="card-grid overview-board-grid overview-board-list/,
  );
  assert.match(overview, /class="overview-foundation-section"/);
  assert.match(overview, /class="overview-catalog-alert"/);
  assert.doesNotMatch(overview, /overview-hero-art|overview-wave|👋/);
});

test("Workspace statistics continue to use authoritative board and signed identity state", () => {
  assert.match(
    overview,
    /state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/,
  );
  assert.match(
    overview,
    /visibleBoards\.reduce\(\(a,b\)=>a\+\(Number\(b\.item_count\)\|\|0\),0\)/,
  );
  assert.match(
    overview,
    /signedCrmRoleLabel\(state\.crmRoleSnapshot,state\.context\)/,
  );
  assert.match(
    overview,
    /workspaceRelationLabel\(state\.workspaceRelationSnapshot,state\.context\)/,
  );
  for (const label of [
    "Active boards",
    "Board items",
    "Workspace status",
    "Your access",
  ]) {
    assert.ok(overview.includes(label), label);
  }
  assert.match(overview, /aria-label="Workspace statistics"/);
  assert.match(overview, /class="stat-footer overview-access-footer"/);
  assert.match(overview, /class="overview-access-identity"/);
  assert.match(overview, /aria-label="Board items: /);
  assert.doesNotMatch(overview, /\b94%\b|\b8 workflows\b|mock metric/i);
});

test("Overview keeps existing route actions, board links, management menus and the verified foundation gate", () => {
  for (const action of ['data-action="refresh"', 'data-action="new-board"']) {
    assert.ok(overview.includes(action), action);
  }
  assert.match(overview, /href="#\/boards"/);
  assert.match(overview, /recent\.map\(boardCard\)/);
  assert.match(overview, /state\.roleVerified===true/);
  const boardCardStart = app.indexOf("function boardCard(board,index){");
  const emptyStart = app.indexOf("function empty(", boardCardStart);
  const boardCard = app.slice(boardCardStart, emptyStart);
  assert.match(boardCard, /class="board-card-actions"/);
  assert.match(boardCard, /data-action="board-card-edit"/);
  assert.match(boardCard, /data-action="board-card-trash"/);
  assert.match(boardCard, /data-action="board-card-restore"/);
  assert.match(boardCard, /aria-label="Open '/);
});

test("Overview is a low-clutter list dashboard, not a second nested card catalog", () => {
  assert.ok(designStart >= 0, "dedicated Overview design layer exists");
  assert.match(design, /\.overview-stat-grid \{/);
  assert.match(design, /border-radius: 13px/);
  assert.match(design, /\.overview-stat-grid\s+\.stat-card\s*\{/);
  assert.match(design, /background: transparent/);
  assert.match(design, /\.overview-board-list\s+\.board-card\s*\{/);
  assert.match(design, /border-bottom: 1px solid var\(--crm-line\)/);
  assert.match(design, /\.overview-essentials\s*\{/);
  assert.doesNotMatch(design, /(?:linear|radial)-gradient\s*\(/);
  assert.doesNotMatch(design, /box-shadow:\s*0\s+0\s+\d+px/);
});

test("Overview design reuses shared CRM tokens, solid icons, focus states and both themes", () => {
  for (const token of [
    "--crm-surface",
    "--crm-ink",
    "--crm-text",
    "--crm-line",
    "--crm-accent",
    "--crm-focus",
  ]) {
    assert.ok(design.includes(`var(${token})`), token);
  }
  assert.match(
    design,
    /\.overview-svg-icon\s+\.icon-outline\s*\{\s*display:\s*none/,
  );
  assert.match(
    design,
    /\.overview-svg-icon\s+\.icon-solid\s*\{\s*display:\s*inline/,
  );
  assert.match(design, /html\[data-aps-monday-theme="dark"\]/);
  assert.match(design, /:focus-visible/);
  assert.match(design, /prefers-reduced-motion:\s*reduce/);
});

test("Overview has tested desktop, tablet, narrow-mobile and reduced-motion layouts", () => {
  assert.match(design, /@media \(max-width: 1180px\)/);
  assert.match(design, /@media \(max-width: 810px\)/);
  assert.match(design, /@media \(max-width: 600px\)/);
  assert.match(design, /@media \(max-width: 360px\)/);
  assert.match(design, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(design, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(design, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("The final Overview design layer is included in the generated bundle and production smoke", () => {
  assert.equal(STYLE_SOURCES.at(-1), "frontend/crm-complete-design-system.css");
  assert.equal(bundle, generateStyleBundle());
  assert.ok(bundle.includes("CP-CRM-OVERVIEW-REDESIGN-01"));
  assert.match(
    index,
    /apsyntra-styles\.bundle\.css\?v=cp-crm-overview-redesign-01/,
  );
  assert.match(smoke, /'frontend\/crm-complete-design-system\.css'/);
});

test("No training, model optimization or runtime dependency was added", () => {
  assert.doesNotMatch(
    design,
    /gradient\s*descent|backpropagation|training\s*loop|fine[- ]?tuning|weight\s*update/i,
  );
  assert.doesNotMatch(
    app.slice(overviewStart, overviewEnd),
    /gradient\s*descent|backpropagation|training\s*loop|fine[- ]?tuning|weight\s*update/i,
  );
  assert.doesNotMatch(
    browserScript,
    /gradient\s*descent|backpropagation|training\s*loop|fine[- ]?tuning|weight\s*update/i,
  );
  assert.equal(packageJson.dependencies?.torch, undefined);
  assert.equal(packageJson.dependencies?.tensorflow, undefined);
  assert.equal(packageJson.devDependencies?.torch, undefined);
  assert.equal(packageJson.devDependencies?.tensorflow, undefined);
});
