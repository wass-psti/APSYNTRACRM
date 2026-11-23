/** CP01 — canonical workspace identity helpers.
 * Workspace display names are labels only. Main Workspace identity must come
 * from the existing server-owned private.ws02_personal_workspaces mapping.
 */
export const WORK_MANAGEMENT_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";

export const WORKSPACE_IDENTITY_KIND = Object.freeze({
  WORK_MANAGEMENT: "work-management",
  PERSONAL_MAIN: "personal-main",
  OTHER: "other",
  UNKNOWN: "unknown",
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isWorkspaceId(value) {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Resolve workspace identity without relying on a mutable display name.
 * personalWorkspaceId must be supplied from an authoritative server mapping;
 * local preferences and workspace names are not ownership evidence.
 */
export function identifyWorkspace({
  workspaceId,
  personalWorkspaceId = null,
} = {}) {
  if (!isWorkspaceId(workspaceId)) {
    return Object.freeze({
      workspaceId: null,
      kind: WORKSPACE_IDENTITY_KIND.UNKNOWN,
      isKnown: false,
    });
  }

  const normalizedWorkspaceId = workspaceId.toLowerCase();
  if (normalizedWorkspaceId === WORK_MANAGEMENT_WORKSPACE_ID) {
    return Object.freeze({
      workspaceId: normalizedWorkspaceId,
      kind: WORKSPACE_IDENTITY_KIND.WORK_MANAGEMENT,
      isKnown: true,
    });
  }

  if (
    isWorkspaceId(personalWorkspaceId) &&
    normalizedWorkspaceId === personalWorkspaceId.toLowerCase()
  ) {
    return Object.freeze({
      workspaceId: normalizedWorkspaceId,
      kind: WORKSPACE_IDENTITY_KIND.PERSONAL_MAIN,
      isKnown: true,
    });
  }

  return Object.freeze({
    workspaceId: normalizedWorkspaceId,
    kind: WORKSPACE_IDENTITY_KIND.OTHER,
    isKnown: true,
  });
}

export function isWorkManagementWorkspace(workspaceId) {
  return (
    identifyWorkspace({ workspaceId }).kind ===
    WORKSPACE_IDENTITY_KIND.WORK_MANAGEMENT
  );
}

export function isPersonalMainWorkspace(workspaceId, personalWorkspaceId) {
  return (
    identifyWorkspace({ workspaceId, personalWorkspaceId }).kind ===
    WORKSPACE_IDENTITY_KIND.PERSONAL_MAIN
  );
}
