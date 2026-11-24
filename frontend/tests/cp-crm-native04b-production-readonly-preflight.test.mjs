import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const file = new URL(
  "../../scripts/cp-crm-native04b-production-readonly-preflight.mjs",
  import.meta.url,
);
const source = readFileSync(file, "utf8");

test("production preflight requires an explicitly supplied loopback Chromium endpoint", () => {
  assert.match(source, /127\\\.0\\\.0\\\.1/);
  assert.match(source, /connectOverCDP\(cdp\)/);
  assert.doesNotMatch(source, /^import .*playwright/m);
  assert.match(source, /await import\("playwright"\)/);
  const outcome = spawnSync(process.execPath, [file.pathname], {
    encoding: "utf8",
    timeout: 8000,
  });
  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /Provide --cdp-url/);
});

test("preflight covers four canonical routes and restores the original employee tab", () => {
  for (const route of [
    "#/time-tracker",
    "#/fund-tracker",
    "#/fueltrack",
    "#/tradelink/documents",
  ])
    assert.ok(source.includes(route), `Missing ${route}`);
  assert.match(source, /oldUrl = page\.url\(\)/);
  assert.match(source, /\.goto\(oldUrl/);
  assert.match(source, /await browser\.close\(\)/);
});

test("read-only preflight never submits or disguises a business transaction", () => {
  assert.doesNotMatch(source, /page\.(?:click|fill|press|type)\s*\(/);
  assert.doesNotMatch(source, /\.locator\([^;]*\)\.click\(/);
  assert.doesNotMatch(source, /(?:fetch|axios|XMLHttpRequest)\s*\(/);
  assert.doesNotMatch(
    source,
    /(?:localStorage|sessionStorage|document\.cookie)/,
  );
  assert.match(source, /productionBusinessWrites: 0/);
  assert.match(source, /PENDING_DESIGNATED_TEST_IDENTITIES_AND_RECORDS/);
});
