import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLE_SOURCES,
  STYLE_BUNDLE,
} from "../../scripts/priority5-style-manifest.mjs";
import { generateStyleBundle } from "../../scripts/build-priority5-styles.mjs";

const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
const index = readFileSync("index.html", "utf8");
const app = readFileSync("frontend/app.js", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const bundle = readFileSync(STYLE_BUNDLE, "utf8");

test("restoration manifest is the approved baseline suffix with only additive feature styles retained", () => {
  assert.equal(
    STYLE_SOURCES.at(-3),
    "frontend/dark-workspace-account-completion.css",
  );
  assert.equal(STYLE_SOURCES.at(-2), "frontend/dark-simplified-system.css");
  assert.equal(STYLE_SOURCES.at(-1), "frontend/board-overhaul-experience.css");
  assert.equal(new Set(STYLE_SOURCES).size, STYLE_SOURCES.length);
  assert.equal(bundle, generateStyleBundle());
  assert.match(index, /apsyntra-styles\.bundle\.css\?v=cp-crm-ui-restore-01/);
  assert.doesNotMatch(
    manifest,
    /"frontend\/(?:board-uiverse-overhaul|crm-complete-design-system)\.css"/,
  );
});

test("mobile navigation and current TimeTracker functions are preserved", () => {
  assert.match(index, /frontend\/mobile-home\.js\?v=20261123-bottom-nav-1/);
  assert.match(app, /openTimeTrackerAddDepartmentModal/);
  assert.match(app, /TimeTrackerOjtClient/);
  assert.match(app, /createTimeTrackerWorkNoteDraft/);
  assert.match(app, /case 'tt-departments-delete'/);
});

test("restoration adds no training dependencies, model code or execution loops", () => {
  const changedImplementation = [
    readFileSync("frontend/app.js", "utf8"),
    readFileSync("scripts/priority5-style-manifest.mjs", "utf8"),
    readFileSync("index.html", "utf8"),
  ].join("\n");
  assert.doesNotMatch(
    changedImplementation,
    /gradient\s*descent|backpropagation|fine[- ]?tuning|training\s*loop|weight\s*update/i,
  );
  for (const dependency of [
    "torch",
    "tensorflow",
    "@tensorflow/tfjs",
    "onnxruntime-node",
  ]) {
    assert.equal(packageJson.dependencies?.[dependency], undefined);
    assert.equal(packageJson.devDependencies?.[dependency], undefined);
  }
});
