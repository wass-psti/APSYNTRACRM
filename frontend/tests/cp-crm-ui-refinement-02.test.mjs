import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLE_SOURCES,
  STYLE_BUNDLE,
} from "../../scripts/priority5-style-manifest.mjs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";

const css = readFileSync("frontend/application-ui-refinement.css", "utf8");
test("deep app layer is last and generated CSS stays deterministic", () => {
  assert.equal(STYLE_SOURCES.at(-19), "frontend/enterprise-ui-refinement.css");
  assert.equal(STYLE_SOURCES.at(-18), "frontend/application-ui-refinement.css");
  assert.equal(readFileSync(STYLE_BUNDLE, "utf8"), generateStyleBundle());
  assert.match(
    readFileSync("index.html", "utf8"),
    /frontend\/application-ui-refinement\.css/,
  );
});
test("deep app refinements cover menus, accessible native controls, module surfaces and tables", () => {
  for (const selector of [
    ".aps-action-popover",
    ".board-tool-menu-panel",
    ".board-column-menu-content",
    ".aps-select-listbox",
    ".ws01-browser-card",
    ".tl-reference-document-toolbar",
    ".fm1-primary-button",
    ".fm1-panel",
    ".ft3-panel",
    ".tt-attendance-console",
    ".tb-panel",
    ".frt-ref-table-card",
    ".board-table-custom",
  ]) {
    assert.ok(css.includes(selector), `Missing ${selector}`);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-aps-monday-theme="dark"/);
});
test("no new scripts, external CSS, positioning or permission overrides", () => {
  assert.doesNotMatch(
    css,
    /@import|url\(|javascript:|expression\(|@keyframes|animation:\s*infinite/i,
  );
  assert.doesNotMatch(
    css,
    /!important|pointer-events:\s*none|position:\s*(fixed|absolute)|overflow-x:\s*hidden/i,
  );
  assert.doesNotMatch(css, /auth\.uid|role_id|permission|rbac|supabase/i);
});
