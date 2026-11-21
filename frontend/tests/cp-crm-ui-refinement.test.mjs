import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";
import {
  STYLE_SOURCES,
  STYLE_BUNDLE,
} from "../../scripts/priority5-style-manifest.mjs";

const source = readFileSync("frontend/enterprise-ui-refinement.css", "utf8");

test("shared refinement precedes the application visual layer in deterministic CSS", () => {
  assert.equal(STYLE_SOURCES.at(-14), "frontend/enterprise-ui-refinement.css");
  assert.equal(STYLE_SOURCES.at(-13), "frontend/application-ui-refinement.css");
  assert.equal(readFileSync(STYLE_BUNDLE, "utf8"), generateStyleBundle());
});
test("shared UI coverage includes navigation, cards, inputs, boards and dialogs", () => {
  for (const selector of [
    ".aps-sidebar",
    ".stat-card",
    ".board-card",
    ".aps-board-shell",
    ".field input",
    ".board-bulk-toolbar",
    ".modal",
    ".toast",
    ".aps-select-trigger",
    ".topbar",
    ".search-input",
    ".settings-grid",
    ".fm1-metric-card",
    ".tt-attendance-console",
    ".ft3-panel",
    ".tl-draft-panel",
    ".tb-panel",
    ".frt-ref-table-card",
    ".ws01-browser-card",
  ]) {
    assert.ok(source.includes(selector), `Missing shared surface ${selector}`);
  }
});
test("motion, responsiveness, focus, dark mode and native semantics remain intact", () => {
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /data-aps-monday-theme="dark"/);
  assert.match(source, /:focus-visible/);
  assert.match(source, /\.board-table-custom tbody tr:focus-within td/);
  assert.doesNotMatch(
    source,
    /!important|animation:\s*infinite|@keyframes|pointer-events:\s*none/,
  );
});
test("design refinement adds no application, backend or library dependencies", () => {
  const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
  assert.match(manifest, /frontend\/enterprise-ui-refinement\.css/);
  assert.match(
    readFileSync("index.html", "utf8"),
    /frontend\/enterprise-ui-refinement\.css/,
  );
  assert.doesNotMatch(source, /@import|url\(|javascript:|expression\(/i);
});
