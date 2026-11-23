import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  STYLE_BUNDLE,
  STYLE_SOURCES,
} from "../../scripts/priority5-style-manifest.mjs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";

const app = readFileSync("frontend/app.js", "utf8");
const bundle = readFileSync(STYLE_BUNDLE, "utf8");
const index = readFileSync("index.html", "utf8");
const start = app.indexOf("function overview(){");
const end = app.indexOf("function boardsPage(){", start);
const renderer = app.slice(start, end);
const approvedBaselineRendererHash =
  "a508fd41eba71a0d0344d52473b8e26a95f973385230fa9046c29c7c4b27c261";

test("Overview renderer exactly matches the approved original UI baseline", () => {
  assert.ok(start >= 0 && end > start);
  const hash = createHash("sha256").update(renderer).digest("hex");
  assert.equal(hash, approvedBaselineRendererHash);
  assert.ok(renderer.includes('return `\<div class="aps-overview">'));
  assert.match(renderer, /class="overview-hero-art"/);
  assert.match(renderer, /class="overview-wave"/);
  assert.doesNotMatch(
    renderer,
    /overview-dashboard|overview-metrics-section|overview-board-list/,
  );
});

test("baseline Overview keeps live board totals, role context and existing actions", () => {
  assert.match(
    renderer,
    /state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/,
  );
  assert.match(
    renderer,
    /visibleBoards\.reduce\(\(a,b\)=>a\+\(Number\(b\.item_count\)\|\|0\),0\)/,
  );
  assert.match(
    renderer,
    /signedCrmRoleLabel\(state\.crmRoleSnapshot,state\.context\)/,
  );
  assert.match(
    renderer,
    /workspaceRelationLabel\(state\.workspaceRelationSnapshot,state\.context\)/,
  );
  for (const action of [
    'data-action=\\"refresh\\"',
    'data-action=\\"new-board\\"',
  ]) {
    assert.ok(renderer.includes(action.replaceAll("\\", "")));
  }
  assert.match(renderer, /recent\.map\(boardCard\)/);
  assert.match(renderer, /state\.roleVerified===true/);
  assert.match(renderer, /Workspace essentials/);
});

test("restored CSS bundle excludes both superseded redesign layers and remains deterministic", () => {
  assert.ok(STYLE_SOURCES.includes("frontend/overview-experience.css"));
  assert.ok(STYLE_SOURCES.includes("frontend/board-overhaul-experience.css"));
  assert.equal(
    STYLE_SOURCES.includes("frontend/crm-complete-design-system.css"),
    false,
  );
  assert.equal(
    STYLE_SOURCES.includes("frontend/board-uiverse-overhaul.css"),
    false,
  );
  assert.equal(bundle, generateStyleBundle());
  assert.doesNotMatch(
    bundle,
    /\/\* frontend\/(?:crm-complete-design-system|board-uiverse-overhaul)\.css \*\//,
  );
  assert.match(
    index,
    /apsyntra-styles\.bundle\.css\?v=(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01)/,
  );
  assert.equal(existsSync("frontend/crm-complete-design-system.css"), true);
  assert.equal(existsSync("frontend/board-uiverse-overhaul.css"), true);
});

test("mobile launcher and subsequent TimeTracker visual features remain in the bundle", () => {
  for (const source of [
    "frontend/mobile-home.css",
    "frontend/apps/TimeTracker/time-tracker-add-department-modal.css",
    "frontend/apps/TimeTracker/time-tracker-ojt.css",
  ]) {
    assert.ok(
      STYLE_SOURCES.includes(source),
      `Missing preserved feature style ${source}`,
    );
  }
  assert.match(index, /frontend\/mobile-home\.js/);
  assert.ok(bundle.includes("/* frontend/mobile-home.css */"));
  assert.ok(
    bundle.includes(
      "/* frontend/apps/TimeTracker/time-tracker-add-department-modal.css */",
    ),
  );
  assert.ok(
    bundle.includes("/* frontend/apps/TimeTracker/time-tracker-ojt.css */"),
  );
});
