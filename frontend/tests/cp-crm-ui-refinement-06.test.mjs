import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  "scripts/cp-crm-ui-refinement-06-ax-viewport.applescript",
  "utf8",
);
const runner = readFileSync(
  "scripts/cp-crm-ui-refinement-06-ax-acceptance.mjs",
  "utf8",
);

test("fallback inspects only the existing selected CRM window", () => {
  assert.match(script, /tell process "Chromium"/);
  assert.match(script, /name of targetWindow does not contain "APSYNTRA CRM"/);
  assert.doesNotMatch(
    script,
    /open location|make new|create tab|set URL|keystroke|key code/,
  );
  assert.doesNotMatch(
    runner,
    /chromium\.launch|launchPersistentContext|open -na|remote-debugging-port/,
  );
});
test("resize routine restores original window size and location on failure", () => {
  assert.match(script, /set originalSize to size of targetWindow/);
  assert.match(script, /set originalPosition to position of targetWindow/);
  assert.match(script, /on error errText/);
  assert.match(script, /set size of targetWindow to originalSize/);
  assert.match(script, /set position of targetWindow to originalPosition/);
  assert.match(script, /chmod 600/);
});
test("responsive assertions reject unsupported widths and missing captures", () => {
  assert.match(runner, /Math\.abs\(measuredWidth - requestedWidth\) > 24/);
  assert.match(runner, /screenshotBytes === 0/);
  assert.match(runner, /measurements\.length !== expected\.length/);
  assert.match(
    runner,
    /status: blockers\.length \? ["\']BLOCKED["\'] : ["\']PASS["\']/,
  );
});
test("test output never claims touch or role-specific certification", () => {
  assert.match(runner, /mobileTouchCertified: false/);
  assert.match(runner, /roleSpecificCertified: false/);
  assert.doesNotMatch(
    script,
    /auth\.uid|sessionStorage|localStorage|password|fetch\(/i,
  );
});

test("CP07 evidence requires fresh screenshots rather than previous run artifacts", () => {
  assert.match(script, /rm -f \/tmp\/cp-crm-ui06-existing-/);
  assert.match(
    runner,
    /screenshotRecent = imageStats\.mtimeMs >= startedAt - 2000/,
  );
  assert.match(runner, /screenshot is stale/);
});
