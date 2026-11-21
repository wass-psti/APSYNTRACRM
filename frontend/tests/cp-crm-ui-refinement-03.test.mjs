import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "scripts/cp-crm-ui-refinement-03-existing-tab.js",
  "utf8",
);
const runner = readFileSync(
  "scripts/cp-crm-ui-refinement-03-acceptance.mjs",
  "utf8",
);
test("live audit targets existing authorized CRM tab without launching a browser", () => {
  assert.match(runner, /existing.*Chromium tab/i);
  assert.match(runner, /execute t javascript javascriptSource/);
  assert.doesNotMatch(
    runner,
    /chromium\.launch|open -na|--user-data-dir|remote-debugging-port/,
  );
});
test("UI audit restores route and never submits mutation actions", () => {
  assert.match(source, /location\.hash = result\.originalRoute/);
  assert.match(source, /document\.visibilityState/);
  assert.match(source, /getBoundingClientRect/);
  assert.doesNotMatch(
    source,
    /fetch\(|localStorage|sessionStorage|\.submit\(|\.requestSubmit\(|\.dispatchEvent\(|\.remove\(|\.delete\(/,
  );
});
test("menu acceptance requires visible foreground geometry and expanded semantics", () => {
  assert.match(source, /expanded: trigger\.getAttribute\('aria-expanded'\)/);
  assert.match(source, /rect\.left >= 0/);
  assert.match(source, /rect\.bottom <= innerHeight/);
  assert.match(runner, /row\.expanded !== ["\']true["\']/);
  assert.match(runner, /row\.overflow !== 0/);
});

test("background-tab menu checks are blocked rather than falsely failed", () => {
  assert.match(source, /TAB_NOT_FOREGROUND/);
  assert.match(source, /TAB_LOST_FOREGROUND/);
  assert.match(
    runner,
    /result: problems.length \? ["\']FAILED["\'] : skipped.length \? ["\']BLOCKED["\'] : ["\']PASS["\']/,
  );
});

test("live menu verifier never accepts stale detached DOM after refresh", () => {
  assert.match(source, /if \(!menu\.isConnected \|\| !trigger\.isConnected\)/);
  assert.match(source, /DOM_REPLACED_DURING_CHECK/);
  assert.match(source, /const candidates = visibleMenus\(\)/);
  assert.match(source, /connected: menu\.isConnected/);
  assert.match(runner, /skipped\.length/);
});
