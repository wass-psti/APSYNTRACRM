import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync(
  "scripts/cp-crm-ui-refinement-05-existing-window.mjs",
  "utf8",
);
const probe = readFileSync(
  "scripts/cp-crm-ui-refinement-05-viewport-probe.js",
  "utf8",
);

test("only the existing signed Chromium tab is used for viewport acceptance", () => {
  assert.match(runner, /EXISTING_CRM_WINDOW_SELECTED/);
  assert.match(runner, /window id targetWindowId/);
  assert.match(runner, /active tab of window id targetWindowId/);
  assert.match(runner, /no controllable existing Chromium CRM window/);
  assert.match(runner, /execute targetTab javascript scriptText/);
  assert.doesNotMatch(
    runner,
    /chromium\.launch|open -na|--user-data-dir|remote-debugging-port|launchPersistentContext/,
  );
});
test("original window bounds and original route are restored, including after errors", () => {
  assert.match(runner, /finally \{/);
  assert.match(
    runner,
    /runScript\(restore, \[\.\.\.originalBounds\.map\(String\), selectedWindowId\]\)/,
  );
  assert.match(probe, /location\.hash = initialRoute/);
  assert.match(probe, /status = ["\']complete["\']/);
});
test("no production writes, session extraction or menu action dispatch", () => {
  assert.doesNotMatch(
    probe,
    /fetch\(|localStorage|sessionStorage|\.click\(|\.submit\(|\.requestSubmit\(/,
  );
  assert.doesNotMatch(
    probe,
    /access_token|Bearer |authorization|\.remove\(|\.delete\(/i,
  );
  assert.match(probe, /documentOverflow/);
  assert.match(probe, /scrollables/);
  assert.match(probe, /document\.visibilityState/);
});
test("unavailable browser and mismatched viewport are not claimed as passing", () => {
  assert.match(runner, /blockedReason \? ["\']BLOCKED["\']/);
  assert.match(
    runner,
    /Math\.abs\(result\.report\.width - result\.targetWidth\) > 40/,
  );
  assert.match(runner, /results\.length !== 3/);
  assert.match(runner, /originalBounds\?\.length !== 4/);
});
