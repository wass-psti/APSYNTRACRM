/** CP01 — canonical application-to-workspace ownership manifest.
 * All twelve existing board applications and the three additional CRM sidebar
 * applications belong to the original Work Management workspace. This is
 * ownership metadata, not an authorization or role system.
 */
import { BOARD_MODULES } from "./board/services/manifest.js";
import {
  isWorkspaceId,
  WORK_MANAGEMENT_WORKSPACE_ID,
} from "./workspace-identity.js";

export const WORK_MANAGEMENT_BOARD_IDS = Object.freeze({
  fueltrans: "b520cefe-6abb-446a-abec-ae5589329a99",
  tools: "47df2cdc-503a-4a22-a35c-06f72be5c56b",
  toolbox: "e761b849-f144-4ad2-a418-af9e68b5cc58",
  frt: "f36da8fe-8d9d-4629-9938-12533cb3ca39",
  fueltrack: "7af78b3f-67bf-4600-9aa1-9006d19d486e",
  tradelink: "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88",
  timetracker: "46bf4ee7-368a-4c35-842c-8593ea1f6ac3",
  orders: "d045708b-6e36-4f0a-92fc-f0b8baf93de3",
  evaluation: "d1593528-36a6-4644-82f9-58873d3c136b",
  charter: "8219a2a9-be85-479e-af0c-e4a399495f58",
  aims: "991d8263-fc7d-49f0-9207-387edd51d299",
  materials: "617c4c0f-e343-4b3b-8456-50d47dcbaf99",
});

const NAVIGATION = Object.freeze({
  fueltrans: {
    label: "FuelTrans Standalone",
    kind: "native",
    route: "#/fueltrans",
    order: 80,
  },
  tools: {
    label: "Tool Traceability",
    kind: "board",
    route: "#/boards/:boardId",
    order: 90,
  },
  toolbox: {
    label: "Toolbox Issues",
    kind: "board",
    route: "#/boards/:boardId",
    order: 100,
  },
  frt: {
    label: "Fund Tracker",
    kind: "native",
    route: "#/fund-tracker",
    order: 30,
  },
  fueltrack: {
    label: "FuelTrack+",
    kind: "native",
    route: "#/fueltrack",
    order: 40,
  },
  tradelink: {
    label: "TradeLink",
    kind: "native",
    route: "#/tradelink",
    order: 50,
  },
  timetracker: {
    label: "TimeTracker",
    kind: "native",
    route: "#/time-tracker",
    order: 20,
  },
  orders: {
    label: "Order Intake",
    kind: "board",
    route: "#/boards/:boardId",
    order: 110,
  },
  evaluation: {
    label: "Employee Evaluation",
    kind: "board",
    route: "#/boards/:boardId",
    order: 120,
  },
  charter: {
    label: "Charter Navigator",
    kind: "board",
    route: "#/boards/:boardId",
    order: 130,
  },
  aims: {
    label: "APS AIMS",
    kind: "board",
    route: "#/boards/:boardId",
    order: 140,
  },
  materials: {
    label: "Material Request Hub",
    kind: "board",
    route: "#/boards/:boardId",
    order: 150,
  },
});

export const WORK_MANAGEMENT_BOARD_APPLICATIONS = Object.freeze(
  BOARD_MODULES.map((module) => {
    const navigation = NAVIGATION[module.key];
    const boardId = WORK_MANAGEMENT_BOARD_IDS[module.key];
    if (!navigation || !isWorkspaceId(boardId)) {
      throw new Error(
        `Workspace application ownership is incomplete for ${module.key}.`,
      );
    }
    return Object.freeze({
      id: module.key,
      moduleKey: module.key,
      name: module.name,
      label: navigation.label,
      routeKind: navigation.kind,
      route: navigation.route,
      navigationOrder: navigation.order,
      boardId,
      ownerWorkspaceId: WORK_MANAGEMENT_WORKSPACE_ID,
    });
  }),
);

export const WORK_MANAGEMENT_AUXILIARY_APPLICATIONS = Object.freeze([
  Object.freeze({
    id: "fm1-ticketing",
    moduleKey: null,
    name: "FM1 Ticketing",
    label: "FM1 Ticketing",
    routeKind: "auxiliary",
    route: "#/fm1",
    navigationOrder: 10,
    boardId: null,
    ownerWorkspaceId: WORK_MANAGEMENT_WORKSPACE_ID,
  }),
  Object.freeze({
    id: "paseo-de-lomboy",
    moduleKey: null,
    name: "Paseo de Lomboy",
    label: "Paseo de Lomboy",
    routeKind: "auxiliary",
    route: "#/paseo",
    navigationOrder: 60,
    boardId: null,
    ownerWorkspaceId: WORK_MANAGEMENT_WORKSPACE_ID,
  }),
  Object.freeze({
    id: "talkbox",
    moduleKey: "toolbox",
    name: "TalkBox",
    label: "TalkBox",
    routeKind: "auxiliary",
    route: "#/talkbox",
    navigationOrder: 70,
    boardId: null,
    requiresBoardModuleKey: "toolbox",
    ownerWorkspaceId: WORK_MANAGEMENT_WORKSPACE_ID,
  }),
]);

export const WORK_MANAGEMENT_APPLICATIONS = Object.freeze(
  [
    ...WORK_MANAGEMENT_BOARD_APPLICATIONS,
    ...WORK_MANAGEMENT_AUXILIARY_APPLICATIONS,
  ].sort((left, right) => left.navigationOrder - right.navigationOrder),
);

const APPLICATION_BY_ID = new Map(
  WORK_MANAGEMENT_APPLICATIONS.map((application) => [
    application.id,
    application,
  ]),
);

export function workspaceApplicationOwnership(applicationId) {
  return APPLICATION_BY_ID.get(applicationId) || null;
}

export function isApplicationOwnedByWorkspace(applicationId, workspaceId) {
  const application = workspaceApplicationOwnership(applicationId);
  return (
    isWorkspaceId(workspaceId) &&
    application?.ownerWorkspaceId === workspaceId.toLowerCase()
  );
}

/** Returns the registered apps for a workspace; other workspaces start empty. */
export function applicationsForWorkspace(workspaceId) {
  if (!isWorkspaceId(workspaceId)) return Object.freeze([]);
  const normalizedWorkspaceId = workspaceId.toLowerCase();
  return Object.freeze(
    WORK_MANAGEMENT_APPLICATIONS.filter(
      (application) => application.ownerWorkspaceId === normalizedWorkspaceId,
    ),
  );
}

export function validateWorkspaceApplicationOwnership() {
  const moduleKeys = WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
    (application) => application.moduleKey,
  );
  const applicationIds = WORK_MANAGEMENT_APPLICATIONS.map(
    (application) => application.id,
  );
  const boardIds = WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
    (application) => application.boardId,
  );
  return (
    WORK_MANAGEMENT_BOARD_APPLICATIONS.length === 12 &&
    WORK_MANAGEMENT_AUXILIARY_APPLICATIONS.length === 3 &&
    new Set(moduleKeys).size === 12 &&
    new Set(applicationIds).size === WORK_MANAGEMENT_APPLICATIONS.length &&
    new Set(boardIds).size === 12 &&
    BOARD_MODULES.every((module) => moduleKeys.includes(module.key)) &&
    WORK_MANAGEMENT_APPLICATIONS.every(
      (application) =>
        application.ownerWorkspaceId === WORK_MANAGEMENT_WORKSPACE_ID,
    )
  );
}
