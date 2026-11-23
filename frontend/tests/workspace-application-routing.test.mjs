import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WORK_MANAGEMENT_APPLICATIONS,
  WORK_MANAGEMENT_BOARD_APPLICATIONS,
} from "../workspace-application-ownership.js";
import {
  applicationForWorkspaceRoute,
  workspaceApplicationRouteAccess,
  workspaceApplicationsForNavigation,
} from "../workspace-application-routing.js";
import { WORK_MANAGEMENT_WORKSPACE_ID } from "../workspace-identity.js";

const otherWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const allCanonicalBoards = WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
  (application) => ({
    id: application.boardId,
    name: application.name,
  }),
);

test("Work Management receives the complete ordered 15-application navigation catalog", () => {
  const applications = workspaceApplicationsForNavigation(
    WORK_MANAGEMENT_WORKSPACE_ID,
    allCanonicalBoards,
  );
  assert.equal(applications.length, 15);
  assert.deepEqual(
    applications.map((application) => application.id),
    WORK_MANAGEMENT_APPLICATIONS.map((application) => application.id),
  );
  assert.equal(
    new Set(applications.map((application) => application.href)).size,
    15,
  );
  assert.ok(
    applications.every(
      (application) =>
        application.ownerWorkspaceId === WORK_MANAGEMENT_WORKSPACE_ID,
    ),
  );
});

test("Main Workspace and other workspaces receive no Work Management application navigation", () => {
  assert.deepEqual(
    workspaceApplicationsForNavigation(otherWorkspaceId, allCanonicalBoards),
    [],
  );
  assert.deepEqual(
    workspaceApplicationsForNavigation("invalid-workspace", allCanonicalBoards),
    [],
  );
  assert.deepEqual(
    workspaceApplicationsForNavigation(null, allCanonicalBoards),
    [],
  );
});

test("board-backed applications appear only when their canonical board is in the active catalog", () => {
  const nativeAndAuxiliary = workspaceApplicationsForNavigation(
    WORK_MANAGEMENT_WORKSPACE_ID,
    [],
  );
  assert.deepEqual(
    nativeAndAuxiliary.map((application) => application.id),
    [
      "fm1-ticketing",
      "timetracker",
      "frt",
      "fueltrack",
      "tradelink",
      "paseo-de-lomboy",
    ],
  );

  const withToolbox = workspaceApplicationsForNavigation(
    WORK_MANAGEMENT_WORKSPACE_ID,
    [
      allCanonicalBoards.find((board) =>
        WORK_MANAGEMENT_BOARD_APPLICATIONS.find(
          (application) =>
            application.moduleKey === "toolbox" &&
            application.boardId === board.id,
        ),
      ),
    ],
  );
  assert.ok(withToolbox.some((application) => application.id === "talkbox"));
  assert.ok(withToolbox.some((application) => application.id === "toolbox"));
  assert.equal(withToolbox.length, 8);
});

test("native and auxiliary application routes resolve to their registered owners", () => {
  for (const application of WORK_MANAGEMENT_APPLICATIONS.filter(
    (item) => item.routeKind !== "board",
  )) {
    const route = `${application.route}/record/example`;
    assert.equal(applicationForWorkspaceRoute(route)?.id, application.id);
    const allowed = workspaceApplicationRouteAccess(
      route,
      WORK_MANAGEMENT_WORKSPACE_ID,
    );
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.status, "OWNER_WORKSPACE");
  }
});

test("all twelve canonical board routes and their deep links resolve to their owner", () => {
  for (const application of WORK_MANAGEMENT_BOARD_APPLICATIONS) {
    for (const route of [
      `#/boards/${application.boardId}`,
      `#/boards/${application.boardId}/items`,
      `#/boards/${application.boardId}/native/${application.moduleKey}/record-1`,
    ]) {
      assert.equal(applicationForWorkspaceRoute(route)?.id, application.id);
      assert.equal(
        workspaceApplicationRouteAccess(route, WORK_MANAGEMENT_WORKSPACE_ID)
          .allowed,
        true,
      );
    }
  }
});

test("direct application URLs do not resolve inside Main Workspace or another workspace", () => {
  const routes = WORK_MANAGEMENT_APPLICATIONS.flatMap((application) =>
    application.routeKind === "board"
      ? [
          `#/boards/${application.boardId}`,
          `#/boards/${application.boardId}/items`,
        ]
      : [application.route, `${application.route}/record/example`],
  );
  for (const route of routes) {
    const result = workspaceApplicationRouteAccess(route, otherWorkspaceId);
    assert.equal(result.allowed, false, route);
    assert.equal(result.status, "WORKSPACE_MISMATCH", route);
    assert.ok(result.applicationId, route);
  }
});

test("ordinary CRM routes and user-created board routes remain unaffected", () => {
  for (const route of [
    "#/overview",
    "#/boards",
    "#/settings",
    "#/role-configuration",
    "#/boards/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/items",
  ]) {
    const result = workspaceApplicationRouteAccess(route, otherWorkspaceId);
    assert.equal(result.allowed, true, route);
    assert.equal(result.status, "NOT_APPLICATION_ROUTE", route);
  }
});

test("known application routes with missing workspace identity are not treated as owned", () => {
  const result = workspaceApplicationRouteAccess("#/tradelink", null);
  assert.equal(result.allowed, false);
  assert.equal(result.status, "WORKSPACE_MISMATCH");
  assert.equal(result.applicationId, "tradelink");
});

test("TalkBox route retains the Toolbox Issues board dependency in sidebar navigation", () => {
  const source = readFileSync(
    "frontend/workspace-application-ownership.js",
    "utf8",
  );
  assert.match(source, /requiresBoardModuleKey: "toolbox"/);
  const applications = workspaceApplicationsForNavigation(
    WORK_MANAGEMENT_WORKSPACE_ID,
    allCanonicalBoards,
  );
  const talkbox = applications.find(
    (application) => application.id === "talkbox",
  );
  assert.equal(talkbox?.href, "#/talkbox");
});

test("application routing is presentation-only and does not introduce role or permission checks", () => {
  const source = readFileSync(
    "frontend/workspace-application-routing.js",
    "utf8",
  );
  assert.doesNotMatch(source, /roleConfig|adminVerified|db\.allowed|\.rpc\(/);
  assert.match(source, /This is presentation\/routing metadata only/);
});

test("app shell consumes the ownership manifest for sidebar and checks route ownership before loading applications", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  assert.match(
    app,
    /workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/,
  );
  assert.match(
    app,
    /workspaceApplicationRouteAccess\(hash,state\.context\?\.workspace_id\)/,
  );
  assert.match(app, /const applicationSection=applications\.length\?/);
  assert.match(
    app,
    /history\.replaceState\(null,'',location\.pathname\+location\.search\+routeHome\)/,
  );
  const routeGuard = app.indexOf(
    "const applicationRoute=workspaceApplicationRouteAccess",
  );
  const fm1Import = app.indexOf(
    "if(parts[0]==='fm1')fm1Module=await import('./fm1/index.js')",
  );
  assert.ok(routeGuard > 0 && fm1Import > routeGuard);
});

test("workspace switch reconciles the new signed workspace in place without a page reload", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf(
    "onWorkspaceSwitched:async(receipt,targetWorkspace)=>{",
  );
  const end = app.indexOf("}});", start);
  const handler = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(handler, /receipt\.previousWorkspaceId!==previousWorkspaceId/);
  assert.match(handler, /state\.workspaceTransitionPending=true/);
  assert.match(
    handler,
    /state\.workspaceTransitionTargetId=receipt\.workspaceId/,
  );
  assert.match(
    handler,
    /state\.boards=\[\];state\.archived=\[\];state\.trashed=\[\]/,
  );
  assert.match(handler, /await refreshWorkspace\(\)/);
  assert.match(handler, /await onRoute\(\)/);
  assert.match(handler, /closeWorkspacePanels\(\)/);
  assert.doesNotMatch(handler, /location\.reload\(\)/);
  assert.match(app, /if\(state\.workspaceTransitionPending\)return false/);
  assert.match(app, /if\(state\.workspaceTransitionPending\)/);
  assert.match(
    app,
    /state\.context\?\.workspace_id===state\.workspaceTransitionTargetId/,
  );
});

test("a changed workspace clears the previous workspace catalog and app state before loading new boards", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const start = app.indexOf("async function refreshWorkspace(){");
  const end = app.indexOf("async function loadUserRoleManagement()", start);
  const refresh = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(
    refresh,
    /const workspaceIdentityChanged=priorIdentity!==state\.context\?\.user_id/,
  );
  assert.match(refresh, /if\(priorWorkspace\)\{/);
  assert.match(
    refresh,
    /state\.boards=\[\];state\.archived=\[\];state\.trashed=\[\]/,
  );
  assert.match(
    refresh,
    /state\.boardId=null;state\.board=null;state\.boardUi=null/,
  );
  assert.match(refresh, /state\.view='overview'/);
  assert.match(refresh, /pendingNativeSearchSelection=null/);
  assert.match(
    refresh,
    /state\.context\?\.workspace_id===state\.workspaceTransitionTargetId&&/,
  );
  assert.match(refresh, /!state\.boardCatalogError/);
  assert.match(
    refresh,
    /history\.replaceState\(null,'',location\.pathname\+location\.search\+routeHome\)/,
  );
});
