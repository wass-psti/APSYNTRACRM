import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../sql/tests/cp-tt-auto-clockout-02d-live-readonly-acceptance.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("02D live inspection remains aggregate-only without mutations", () => {
  const executable = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  assert.match(executable, /^WITH source AS \(/i);
  assert.match(executable, /FROM outcome;\s*$/i);
  assert.doesNotMatch(
    executable,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|PERFORM)\b/i,
  );
  assert.equal((executable.match(/;/g) || []).length, 1);
});

test("02D live acceptance verifies natural completion and source/Board/audit integrity", () => {
  for (const required of [
    "private.tt_auto_clockout_sessions",
    "private.tt_attendance_board_projection",
    "timetracker_attendance_mutation_audit",
    "a.source='automatic'",
    "private.tt_attendance_credited_ms",
    "typed_status IS DISTINCT FROM expected_done_status",
    "natural_grace_expirations",
    "natural_approved_overtime_expirations",
    "automatic_closeout_integrity_errors",
    "PENDING_NATURAL_EXPIRATION",
    "PENDING_APPROVED_OVERTIME_ENDPOINT",
    "FAILED_INTEGRITY",
  ]) {
    assert.ok(
      sql.includes(required),
      "Missing lifecycle verification: " + required,
    );
  }
});
