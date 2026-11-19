import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runner = readFileSync(
  "scripts/cp-native-app-access-03-employee-browser-acceptance.mjs",
  "utf8",
);
const startup = readFileSync("frontend/workspace-startup-read.js", "utf8");
const routeResolver = readFileSync(
  "frontend/native-application-access.js",
  "utf8",
);
const app = readFileSync("frontend/app.js", "utf8");

test("CP-03 acceptance runner covers HTTP 403 and 503 without changing production APIs", () => {
  assert.match(runner, /const statuses\s*=\s*\[403,\s*503\]/);
  assert.match(runner, /wm_list_boards/);
  assert.match(runner, /route\.fulfill\(\{\s*status:\s*catalogFailureStatus/);
  assert.match(runner, /productionDataWritten:\s*false/);
  assert.match(runner, /workflowActionsSubmitted:\s*false/);
  assert.match(runner, /productionPoliciesChanged:\s*false/);
  assert.doesNotMatch(
    runner,
    /localStorage|sessionStorage|document\.cookie|access_token|refresh_token/,
  );
  assert.ok(
    runner.includes(
      'page.getByRole("button", { name: "Retry workspace refresh" }).click()',
    ),
  );
  assert.doesNotMatch(runner, /\.fill\(|\.type\(|\.check\(/);
});

test("CP-03 covers Overview plus every exact canonical native application route", () => {
  for (const route of [
    "#/overview",
    "#/time-tracker",
    "#/fund-tracker",
    "#/fueltrack",
    "#/tradelink/documents",
  ])
    assert.ok(runner.includes(route), route);
  for (const id of [
    "46bf4ee7-368a-4c35-842c-8593ea1f6ac3",
    "f36da8fe-8d9d-4629-9938-12533cb3ca39",
    "7af78b3f-67bf-4600-9aa1-9006d19d486e",
    "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88",
  ])
    assert.ok(runner.includes(id), id);
  for (const rpc of [
    "native_application_board_context",
    "timetracker_attendance_capabilities",
    "frt_board_dashboard_safe",
    "fueltrack_v3_read",
    "tl03_assigned_documents",
  ])
    assert.ok(runner.includes(rpc), rpc);
  assert.match(runner, /context\.userId,\s*signedUserId/);
  assert.match(runner, /context\.workspaceId,\s*signedWorkspaceId/);
});

test("CP-03 verifies recovery after the temporary outage override is removed", () => {
  assert.match(
    runner,
    /page\.unroute\(["']\*\*\/rest\/v1\/rpc\/wm_list_boards["']\)/,
  );
  assert.match(runner, /catalogStatus:\s*200/);
  assert.match(runner, /degradedNoticeCleared:\s*true/);
  assert.match(
    runner,
    /const degradedCatalog = waitForRpc\(page, catalogRpc, 503\)/,
  );
  assert.match(runner, /Board catalog temporarily unavailable/);
});

test("native catalog fallback remains route-scoped and generic board startup remains fatal", () => {
  assert.match(routeResolver, /workspaceRouteAllowsBoardCatalogFallback/);
  assert.match(
    app,
    /workspaceRouteAllowsBoardCatalogFallback\(location\.hash\)/,
  );
  assert.ok(startup.includes("allowBoardListFailure=false"));
  assert.ok(startup.includes("allowBoardListFailure!==true"));
  assert.match(app, /state\.boardCatalogError\s*=\s*boardCatalogError/);
});

test("acceptance preserves the employee browser tab and restores its original URL", () => {
  assert.match(runner, /originalUrl\s*=\s*page\.url\(\)/);
  assert.match(runner, /page\s*\.goto\(originalUrl/);
  assert.doesNotMatch(runner, /browser\.close\(/);
});
