/** CP02 — workspace-aware application navigation and route ownership.
 * This is presentation/routing metadata only. It does not grant or deny server
 * permissions; existing signed APIs remain authoritative for application data.
 */
import {DDA_APPLICATION} from "./dda-release.js";
import {
  WORK_MANAGEMENT_APPLICATIONS,
  WORK_MANAGEMENT_BOARD_IDS,
  applicationsForWorkspace,
} from "./workspace-application-ownership.js";
import {
  isWorkspaceId,
  WORK_MANAGEMENT_WORKSPACE_ID,
} from "./workspace-identity.js";

const APPLICATION_ICONS = Object.freeze({
  "fm1-ticketing": "ticket",
  timetracker: "clock",
  fueltrans: "fueltrans",
  orders: "orders",
  frt: "finance",
  fueltrack: "fueltrack",
  tradelink: "tradelink",
  "paseo-de-lomboy": "paseo",
  talkbox: "talkbox",
  "daily-department-activity": "orders",
});

function routeParts(hash) {
  const path = String(hash || "").split("?")[0];
  return path.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function applicationMatchesRoute(application, parts) {
  if (!application || !Array.isArray(parts) || parts.length === 0) return false;

  if (application.routeKind === "board") {
    return (
      parts[0] === "boards" && parts[1]?.toLowerCase() === application.boardId
    );
  }

  if (
    application.boardId &&
    parts[0] === "boards" &&
    parts[1]?.toLowerCase() === application.boardId
  ) {
    return true;
  }

  const routeSection = String(application.route || "")
    .replace(/^#\/?/, "")
    .split("/")[0];
  return !!routeSection && parts[0] === routeSection;
}

/** Find a registered application route, including nested record/deep links. */
export function applicationForWorkspaceRoute(hash) {
  const parts = routeParts(hash);
  if (parts.length === 0) return null;
  return (
    WORK_MANAGEMENT_APPLICATIONS.find((application) =>
      applicationMatchesRoute(application, parts),
    ) || (applicationMatchesRoute(DDA_APPLICATION, parts) ? DDA_APPLICATION : null)
  );
}

/**
 * A known application route is usable only in its owning workspace. Unknown
 * and ordinary CRM routes remain unchanged. This is not an authorization check.
 */
export function workspaceApplicationRouteAccess(hash, workspaceId) {
  const application = applicationForWorkspaceRoute(hash);
  if (!application) {
    return Object.freeze({
      status: "NOT_APPLICATION_ROUTE",
      allowed: true,
      application: null,
    });
  }

  const allowed =
    isWorkspaceId(workspaceId) &&
    workspaceId.toLowerCase() === application.ownerWorkspaceId;
  return Object.freeze({
    status: allowed ? "OWNER_WORKSPACE" : "WORKSPACE_MISMATCH",
    allowed,
    application,
    applicationId: application.id,
    ownerWorkspaceId: application.ownerWorkspaceId,
    workspaceId: isWorkspaceId(workspaceId) ? workspaceId.toLowerCase() : null,
  });
}

/**
 * Resolve the application section for the active workspace.
 * Board-backed entries appear only when their canonical board is in the
 * current signed workspace catalog. Native routes retain their existing links.
 */
export function workspaceApplicationsForNavigation(workspaceId, boards = []) {
  if (
    !isWorkspaceId(workspaceId) ||
    workspaceId.toLowerCase() !== WORK_MANAGEMENT_WORKSPACE_ID
  ) {
    return Object.freeze([]);
  }

  const boardIds = new Set(
    (Array.isArray(boards) ? boards : [])
      .map((board) => String(board?.id || "").toLowerCase())
      .filter(Boolean),
  );

  const visible = applicationsForWorkspace(workspaceId).filter(
    (application) => {
      if (application.routeKind === "board" || application.id === "orders")
        return boardIds.has(application.boardId);
      if (application.requiresBoardModuleKey) {
        const dependencyBoardId =
          WORK_MANAGEMENT_BOARD_IDS[application.requiresBoardModuleKey];
        return !!dependencyBoardId && boardIds.has(dependencyBoardId);
      }
      return true;
    },
  );

  return Object.freeze(
    visible.map((application) => {
      const href =
        application.routeKind === "board"
          ? application.route.replace(":boardId", application.boardId)
          : application.route;
      const navigationKey =
        application.routeKind === "board"
          ? `recent:${application.boardId}`
          : String(application.route).replace(/^#\/?/, "").split("/")[0];
      return Object.freeze({
        ...application,
        href,
        navigationKey,
        icon: APPLICATION_ICONS[application.id] || "boards",
      });
    }),
  );
}
