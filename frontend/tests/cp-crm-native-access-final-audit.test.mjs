import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  new URL(
    "../../scripts/cp-crm-native-access-final-readonly.sql",
    import.meta.url,
  ),
  "utf8",
);

test("native access audit is read only and uses authoritative effective role and membership", () => {
  assert.match(sql, /public\.current_workspace_id/);
  assert.match(sql, /public\.module_role_for/);
  assert.match(sql, /public\.has_module_access/);
  assert.match(sql, /public\.workspace_members/);
  assert.match(sql, /active IS TRUE/);
  for (const forbidden of [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bALTER\s+\w+\b/i,
    /\bGRANT\s+\w+\b/i,
    /\bREVOKE\s+\w+\b/i,
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i,
    /\bSET\s+ROLE\b/i,
  ]) {
    const executable = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(executable, forbidden);
  }
});
test("all four native modules must match their existing canonical active Board", () => {
  for (const name of [
    "time-tracker",
    "fund-released-tracker",
    "fueltrack-plus",
    "tradelink",
  ])
    assert.match(sql, new RegExp("'" + name + "'"));
  assert.match(sql, /b\.workspace_id=e\.workspace_id/);
  assert.match(sql, /b\.name=c\.board_name/);
  assert.match(sql, /b\.description LIKE c\.marker/);
  assert.match(sql, /b\.archived_at IS NULL/);
  assert.match(sql, /b\.trashed_at IS NULL/);
});
test("Charter Navigator legacy assignments are compared with the scoped source without writing grants", () => {
  assert.match(
    sql,
    /public\.apsyntra_charter_current_role\(user_id,workspace_id\)/,
  );
  assert.match(sql, /a\.module_id='charter-navigator'/);
  assert.match(sql, /effective_role_present/);
  assert.match(sql, /scoped_role_present/);
});
