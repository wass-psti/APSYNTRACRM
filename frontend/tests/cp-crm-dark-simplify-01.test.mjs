import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLE_SOURCES,
  STYLE_BUNDLE,
} from "../../scripts/priority5-style-manifest.mjs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";
import { overviewIcon } from "../overview-visuals.js";
import { sidebarIcon } from "../sidebar-visuals.js";
const css = readFileSync("frontend/dark-simplified-system.css", "utf8");
const legacy = readFileSync("frontend/monday-inspired-ui.css", "utf8");
test("final style layer and bundle are deterministic", () => {
  assert.equal(STYLE_SOURCES.at(-1), "frontend/dark-simplified-system.css");
  assert.equal(readFileSync(STYLE_BUNDLE, "utf8"), generateStyleBundle());
  assert.match(
    readFileSync("index.html", "utf8"),
    /bundle\.css\?v=cp-crm-dark-simplify-01/,
  );
});
test("solid icons exist for every existing nav/dashboard symbol without replacing light icons", () => {
  for (const symbol of [
    "grid",
    "items",
    "pulse",
    "shield",
    "lock",
    "check",
    "refresh",
    "plus",
    "arrow",
  ]) {
    const svg = overviewIcon(symbol);
    assert.match(svg, /class="icon-outline"/);
    assert.match(svg, /class="icon-solid" fill="currentColor" stroke="none"/);
  }
  for (const symbol of [
    "overview",
    "boards",
    "ticket",
    "clock",
    "finance",
    "fueltrack",
    "paseo",
    "talkbox",
    "tradelink",
    "foundation",
    "security",
    "roles",
    "users",
    "settings",
    "acceptance",
    "recent",
    "logout",
    "chevron",
  ]) {
    const svg = sidebarIcon(symbol);
    assert.match(svg, /class="icon-outline"/);
    assert.match(svg, /class="icon-solid" fill="currentColor" stroke="none"/);
  }
});
test("dark-only flat design keeps focus, essentials grid, and state semantics", () => {
  for (const marker of [
    "@media screen",
    'data-aps-monday-theme="dark"',
    ".icon-solid",
    /\.overview-essentials\s+\.activity-item/,
    ".overview-essentials-indicator",
    /\.overview-board-grid\s+\.board-card/,
    /\.boards-catalog-grid\s+\.board-card/,
    /\.frt-ref\s+\.frt-ref-metric/,
    /\.tt-native\s+\.tt-monitor-stat/,
    ":focus-visible",
    "prefers-reduced-motion",
  ])
    assert.ok(
      typeof marker === "string" ? css.includes(marker) : marker.test(css),
      String(marker),
    );
  assert.doesNotMatch(
    css,
    /@import|@keyframes|!important|javascript:|auth\.uid|fetch\(/i,
  );
  assert.doesNotMatch(
    css,
    /@media print|display:\s*none\s*;?\s*}\s*\/\*\s*native/i,
  );
});

test("legacy empty-state dark override no longer forces a card onto Workspace essentials", () => {
  assert.match(
    legacy,
    /html\[data-aps-monday-theme="dark"\] #app \.aps-overview \.overview-empty \{/,
  );
  assert.doesNotMatch(
    legacy,
    /html\[data-aps-monday-theme="dark"\] #app \.aps-overview :is\(\.overview-empty, \.overview-essentials\)/,
  );
  const metricRule = legacy.match(
    /html\[data-aps-monday-theme="dark"\] #app \.aps-overview \.overview-stat-grid > \.stat-card \{([^}]*)\}/,
  );
  assert.ok(metricRule, "legacy dashboard metric rule remains scoped");
  assert.doesNotMatch(metricRule[1], /background:|border:|box-shadow:/);
});
