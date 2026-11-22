import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STYLE_SOURCES } from "../../scripts/priority5-style-manifest.mjs";

const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const page = readFileSync("index.html", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const app = readFileSync("frontend/app.js", "utf8");

test("superseded complete CRM redesign layer is not applied to the restored shell", () => {
  assert.equal(
    STYLE_SOURCES.includes("frontend/crm-complete-design-system.css"),
    false,
  );
  assert.doesNotMatch(
    bundle,
    /\/\* frontend\/crm-complete-design-system\.css \*\//,
  );
  assert.doesNotMatch(page, /frontend\/crm-complete-design-system\.css/);
  assert.doesNotMatch(manifest, /"frontend\/crm-complete-design-system\.css"/);
  assert.equal(existsSync("frontend/crm-complete-design-system.css"), true);
});

test("the original shell sources and current navigation renderers remain active", () => {
  for (const source of [
    "frontend/sidebar-experience.css",
    "frontend/workspace-ui.css",
    "frontend/soft-minimalist.css",
    "frontend/overview-experience.css",
    "frontend/board-catalog-experience.css",
    "frontend/settings-experience.css",
    "frontend/role-configuration-experience.css",
  ]) {
    assert.ok(
      STYLE_SOURCES.includes(source),
      `Missing baseline source ${source}`,
    );
  }
  assert.match(app, /function shell\(body\)\{/);
  assert.match(app, /function sidebar\(\)\{/);
  assert.match(app, /class="shell">\$\{sidebar\(\)\}<main class="main"/);
  assert.match(app, /sidebarNav\('#\/boards','My boards'/);
  assert.match(app, /sidebarNav\('#\/settings','Settings'/);
});
