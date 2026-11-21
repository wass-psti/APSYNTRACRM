/**
 * Routes native application role changes through the existing application-specific
 * assignment services. Individual and bulk workflows share this mapping so they
 * cannot drift into different persistence contracts.
 */
import { SCOPED_SIX_MODULE_IDS } from "./user-role-management.js";

function assignmentFor(snapshot, userId, moduleId) {
  return (
    snapshot?.moduleAssignments?.find(
      (item) => item.userId === userId && item.moduleId === moduleId,
    ) || null
  );
}

export async function writeNativeApplicationRoleAssignment(
  manager,
  {
    workspaceId,
    userId,
    moduleId,
    role,
    enabled,
    expectedUpdatedAt = null,
    snapshot,
  } = {},
) {
  if (
    !manager ||
    typeof manager.mutate !== "function" ||
    typeof workspaceId !== "string" ||
    typeof userId !== "string" ||
    typeof moduleId !== "string" ||
    typeof role !== "string" ||
    typeof enabled !== "boolean"
  )
    throw Error("Invalid native application role change");
  const common = { workspaceId, userId, role, enabled };

  if (moduleId === "fueltrans") {
    if (snapshot?.fueltransWorkspaceAvailable !== true)
      throw Error("FuelTrans workspace role contract is unavailable.");
    return manager.setFueltransWorkspaceRole({ ...common, expectedUpdatedAt });
  }
  if (moduleId === "charter-navigator") {
    if (snapshot?.charterWorkspaceAvailable !== true)
      throw Error("Charter workspace role backend is not activated.");
    const current = assignmentFor(snapshot, userId, moduleId);
    return manager.setCharterWorkspaceRole({
      ...common,
      expectedUpdatedAt:
        current?.scopedSource === true ? expectedUpdatedAt : null,
    });
  }
  if (
    SCOPED_SIX_MODULE_IDS.includes(moduleId) &&
    snapshot?.scopedSixAvailable === true
  ) {
    const current = assignmentFor(snapshot, userId, moduleId);
    return manager.setScopedSixRole({
      ...common,
      moduleId,
      expectedUpdatedAt:
        current?.scopedSource === true ? expectedUpdatedAt : null,
    });
  }
  if (moduleId === "fund-released-tracker") {
    if (snapshot?.frtWorkspaceAvailable !== true)
      throw Error("Fund Tracker workspace membership is not installed yet.");
    const current = assignmentFor(snapshot, userId, moduleId);
    return manager.setFrtWorkspaceRole({
      ...common,
      expectedUpdatedAt:
        current?.scopedSource === true ? expectedUpdatedAt : null,
    });
  }
  if (moduleId === "tool-traceability") {
    if (snapshot?.toolTraceabilityWorkspaceAvailable !== true)
      throw Error(
        "Tool Traceability workspace membership is not installed yet.",
      );
    return manager.setToolTraceabilityWorkspaceRole({
      ...common,
      expectedUpdatedAt,
    });
  }
  return manager.mutate({
    ...common,
    scope: "module",
    resourceId: moduleId,
    expectedUpdatedAt,
  });
}

/** Confirm an assignment only from a freshly retrieved authoritative snapshot. */
export function nativeApplicationRoleAssignmentPersisted(
  snapshot,
  { userId, moduleId, role, enabled } = {},
) {
  if (
    !snapshot ||
    !Array.isArray(snapshot.moduleAssignments) ||
    typeof userId !== "string" ||
    typeof moduleId !== "string" ||
    typeof enabled !== "boolean"
  )
    return false;
  const current = assignmentFor(snapshot, userId, moduleId);
  return enabled
    ? current?.enabled === true && current.role === role
    : !current || current.enabled !== true;
}
