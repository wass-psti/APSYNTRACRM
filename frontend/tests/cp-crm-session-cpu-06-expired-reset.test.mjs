import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("expired-session cleanup resets TimeTracker report filters from the exported defaults", () => {
  const start = app.indexOf("auth.onExpired=()=>{");
  assert.notEqual(start, -1, "auth expiry handler exists");
  const end = app.indexOf("\nlet workspacePreferenceSyncPending=", start);
  assert.ok(end > start, "auth expiry handler boundary exists");
  const handler = app.slice(start, end);

  assert.match(
    app,
    /TT_REPORT_DEFAULT_FILTERS\s*\}\s*from\s*['"]\.\/time-tracker-reports\.js['"]/,
  );
  assert.match(
    handler,
    /state\.ttReportFilters=\{\.\.\.TT_REPORT_DEFAULT_FILTERS\}/,
  );
  assert.doesNotMatch(handler, /\bTT_REPORT_FILTERS\b/);
});
