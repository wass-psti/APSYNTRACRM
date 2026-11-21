import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FUELTRANS_WORKSPACE_ROLES,
  MODULE_ROLE_OPTIONS,
  SCOPED_SIX_MODULE_IDS,
  UserRoleManagementClient,
} from "../user-role-management.js";
import {
  nativeApplicationRoleAssignmentPersisted,
  writeNativeApplicationRoleAssignment,
} from "../native-application-role-assignment.js";

const workspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workspaceId = workspace;
const userId = "11111111-1111-4111-8111-111111111111";
const revision = "2026-11-20T08:00:00Z";
const applicationIds = Object.keys(MODULE_ROLE_OPTIONS);
const scopedSnapshot = {
  fueltransWorkspaceAvailable: true,
  toolTraceabilityWorkspaceAvailable: true,
  frtWorkspaceAvailable: true,
  scopedSixAvailable: true,
  charterWorkspaceAvailable: true,
  moduleAssignments: [
    {
      userId,
      moduleId: "charter-navigator",
      role: "user",
      enabled: true,
      scopedSource: true,
      updatedAt: revision,
    },
    {
      userId,
      moduleId: "time-tracker",
      role: "Employee",
      enabled: true,
      scopedSource: false,
      updatedAt: revision,
    },
    {
      userId,
      moduleId: "fund-released-tracker",
      role: "REQUESTOR",
      enabled: true,
      scopedSource: true,
      updatedAt: revision,
    },
  ],
};

function roleFor(moduleId) {
  return moduleId === "fueltrans"
    ? FUELTRANS_WORKSPACE_ROLES[0]
    : MODULE_ROLE_OPTIONS[moduleId][0];
}

test("all twelve native applications use their existing authoritative assignment RPC", async () => {
  const calls = [];
  const client = new UserRoleManagementClient({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "apsyntra_role_fueltrans_workspace_set")
        return {
          effective: true,
          workspaceId,
          targetUserId: userId,
          scope: "module",
          resourceId: "fueltrans",
          after: { role: args.p_role, enabled: args.p_enabled },
        };
      if (name === "apsyntra_role_manage_user_access")
        return {
          effective: true,
          workspaceId,
          targetUserId: userId,
          scope: args.p_scope,
          resourceId: args.p_resource_id,
        };
      return {
        effective: true,
        workspaceId,
        targetUserId: userId,
        moduleId:
          args.p_module_id ||
          (name === "apsyntra_role_tooltrace_workspace_set"
            ? "tool-traceability"
            : name === "apsyntra_role_frt_workspace_set"
              ? "fund-released-tracker"
              : "charter-navigator"),
        role: args.p_role,
        enabled: args.p_enabled,
      };
    },
  });
  const expected = {
    fueltrans: "apsyntra_role_fueltrans_workspace_set",
    "tool-traceability": "apsyntra_role_tooltrace_workspace_set",
    "fund-released-tracker": "apsyntra_role_frt_workspace_set",
    "charter-navigator": "apsyntra_role_charter_workspace_set",
    "toolbox-issues": "apsyntra_role_manage_user_access",
    "material-request-hub": "apsyntra_role_manage_user_access",
  };
  for (const moduleId of SCOPED_SIX_MODULE_IDS)
    expected[moduleId] = "apsyntra_role_scoped_six_set";
  assert.equal(applicationIds.length, 12);
  for (const moduleId of applicationIds) {
    await writeNativeApplicationRoleAssignment(client, {
      workspaceId: workspace,
      userId,
      moduleId,
      role: roleFor(moduleId),
      enabled: true,
      expectedUpdatedAt: revision,
      snapshot: scopedSnapshot,
    });
  }
  assert.deepEqual(
    calls.map((call) => call.name),
    applicationIds.map((id) => expected[id]),
  );
  assert.equal(calls.length, 12);
});

test("workspace-specific revision values are forwarded only for records from that source", async () => {
  const calls = [];
  const client = new UserRoleManagementClient({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "apsyntra_role_fueltrans_workspace_set")
        return {
          effective: true,
          workspaceId,
          targetUserId: userId,
          scope: "module",
          resourceId: "fueltrans",
          after: { role: args.p_role, enabled: args.p_enabled },
        };
      if (name === "apsyntra_role_manage_user_access")
        return {
          effective: true,
          workspaceId,
          targetUserId: userId,
          scope: "module",
          resourceId: args.p_resource_id,
        };
      return {
        effective: true,
        workspaceId,
        targetUserId: userId,
        moduleId:
          args.p_module_id ||
          (name === "apsyntra_role_frt_workspace_set"
            ? "fund-released-tracker"
            : name === "apsyntra_role_tooltrace_workspace_set"
              ? "tool-traceability"
              : "charter-navigator"),
        role: args.p_role,
        enabled: args.p_enabled,
      };
    },
  });
  for (const moduleId of [
    "fueltrans",
    "charter-navigator",
    "time-tracker",
    "fund-released-tracker",
    "tool-traceability",
  ]) {
    await writeNativeApplicationRoleAssignment(client, {
      workspaceId: workspace,
      userId,
      moduleId,
      role: roleFor(moduleId),
      enabled: true,
      expectedUpdatedAt: revision,
      snapshot: scopedSnapshot,
    });
  }
  assert.equal(calls[0].args.p_expected_updated_at, revision);
  assert.equal(calls[1].args.p_expected_updated_at, revision);
  assert.equal(calls[2].args.p_expected_updated_at, null);
  assert.equal(calls[3].args.p_expected_updated_at, revision);
  assert.equal(calls[4].args.p_expected_updated_at, revision);
});

test("six shared-source applications preserve the existing single-workspace legacy fallback", async () => {
  const calls = [];
  const client = new UserRoleManagementClient({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        effective: true,
        workspaceId,
        targetUserId: userId,
        scope: "module",
        resourceId: args.p_resource_id,
      };
    },
  });
  for (const moduleId of SCOPED_SIX_MODULE_IDS) {
    await writeNativeApplicationRoleAssignment(client, {
      workspaceId: workspace,
      userId,
      moduleId,
      role: roleFor(moduleId),
      enabled: true,
      expectedUpdatedAt: revision,
      snapshot: { ...scopedSnapshot, scopedSixAvailable: false },
    });
  }
  assert.ok(
    calls.every((call) => call.name === "apsyntra_role_manage_user_access"),
  );
  assert.ok(calls.every((call) => call.args.p_scope === "module"));
});

test("missing specialized contracts are reported without silently switching assignment sources", async () => {
  const calls = [];
  const client = new UserRoleManagementClient({
    rpc: async (name, args) => {
      calls.push(name);
      return {
        effective: true,
        workspaceId,
        targetUserId: userId,
        scope: "module",
        resourceId: args.p_resource_id,
      };
    },
  });
  for (const [moduleId, flag] of [
    ["fueltrans", "fueltransWorkspaceAvailable"],
    ["charter-navigator", "charterWorkspaceAvailable"],
    ["fund-released-tracker", "frtWorkspaceAvailable"],
    ["tool-traceability", "toolTraceabilityWorkspaceAvailable"],
  ]) {
    await assert.rejects(
      () =>
        writeNativeApplicationRoleAssignment(client, {
          workspaceId: workspace,
          userId,
          moduleId,
          role: roleFor(moduleId),
          enabled: true,
          snapshot: { ...scopedSnapshot, [flag]: false },
        }),
      /contract|backend|membership/,
    );
  }
  assert.deepEqual(calls, []);
});

test("authoritative readback confirms exact assignment and revocation state only", () => {
  const assigned = {
    moduleAssignments: [
      { userId, moduleId: "time-tracker", role: "Employee", enabled: true },
    ],
  };
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(assigned, {
      userId,
      moduleId: "time-tracker",
      role: "Employee",
      enabled: true,
    }),
    true,
  );
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(assigned, {
      userId,
      moduleId: "time-tracker",
      role: "Supervisor",
      enabled: true,
    }),
    false,
  );
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(assigned, {
      userId,
      moduleId: "time-tracker",
      role: "Employee",
      enabled: false,
    }),
    false,
  );
  const revoked = {
    moduleAssignments: [
      { userId, moduleId: "time-tracker", role: "Employee", enabled: false },
    ],
  };
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(revoked, {
      userId,
      moduleId: "time-tracker",
      role: "Employee",
      enabled: false,
    }),
    true,
  );
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(
      { moduleAssignments: [] },
      {
        userId,
        moduleId: "time-tracker",
        role: "Employee",
        enabled: false,
      },
    ),
    true,
  );
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(null, {
      userId,
      moduleId: "time-tracker",
      role: "Employee",
      enabled: true,
    }),
    false,
  );
});

test("backend failures are returned to the caller and never reported as persisted", async () => {
  const client = new UserRoleManagementClient({
    rpc: async () => {
      throw Object.assign(Error("write unavailable"), { status: 503 });
    },
  });
  await assert.rejects(
    () =>
      writeNativeApplicationRoleAssignment(client, {
        workspaceId: workspace,
        userId,
        moduleId: "time-tracker",
        role: "Employee",
        enabled: true,
        snapshot: scopedSnapshot,
      }),
    /write unavailable/,
  );
  assert.equal(
    nativeApplicationRoleAssignmentPersisted(
      { moduleAssignments: [] },
      {
        userId,
        moduleId: "time-tracker",
        role: "Employee",
        enabled: true,
      },
    ),
    false,
  );
});

test("individual and native bulk UI share the same write and authoritative readback helpers", () => {
  const app = readFileSync("frontend/app.js", "utf8");
  const individual = app.slice(
    app.indexOf("async function applyUserRoleChange("),
    app.indexOf("async function applyCrmPlatformRole("),
  );
  const bulk = app.slice(
    app.indexOf("case 'user-role-native-batch-review':"),
    app.indexOf("case 'user-role-batch-review':"),
  );
  assert.match(
    individual,
    /writeNativeApplicationRoleAssignment\(userRoleManager/,
  );
  assert.match(individual, /nativeApplicationRoleAssignmentPersisted/);
  assert.match(bulk, /writeNativeApplicationRoleAssignment\(userRoleManager/);
  assert.match(bulk, /nativeApplicationRoleAssignmentPersisted/);
  assert.doesNotMatch(
    bulk,
    /userRoleManager\.set(?:Fueltrans|Charter|ScopedSix|Frt|ToolTraceability)/,
  );
});

test("two-member multi-application assignments and revocations survive refreshed snapshot readback", async () => {
  const { planNativeApplicationBatch } = await import("../user-role-batch.js");
  const first = "22222222-2222-4222-8222-222222222222";
  const second = "33333333-3333-4333-8333-333333333333";
  const actor = "44444444-4444-4444-8444-444444444444";
  const records = new Map();
  const key = (userId, moduleId) => userId + ":" + moduleId;
  const client = new UserRoleManagementClient({
    rpc: async (name, args) => {
      const moduleId = args.p_module_id || args.p_resource_id;
      const userId = args.p_target_user_id;
      const row = {
        userId,
        moduleId,
        role: args.p_role,
        enabled: args.p_enabled,
        scopedSource: name === "apsyntra_role_scoped_six_set",
      };
      records.set(key(userId, moduleId), row);
      if (name === "apsyntra_role_manage_user_access")
        return {
          effective: true,
          workspaceId: args.p_workspace_id,
          targetUserId: userId,
          scope: "module",
          resourceId: moduleId,
        };
      return {
        effective: true,
        workspaceId: args.p_workspace_id,
        targetUserId: userId,
        moduleId,
        role: args.p_role,
        enabled: args.p_enabled,
      };
    },
  });
  const base = {
    workspaceId: workspace,
    users: [
      {
        id: first,
        email: "first@example.invalid",
        protected: false,
        activeWorkspaceCount: 1,
      },
      {
        id: second,
        email: "second@example.invalid",
        protected: false,
        activeWorkspaceCount: 1,
      },
      {
        id: actor,
        email: "actor@example.invalid",
        protected: false,
        activeWorkspaceCount: 1,
      },
    ],
    boards: [],
    moduleAssignments: [],
    boardAssignments: [],
    scopedSixAvailable: true,
  };
  const applications = [
    { moduleId: "time-tracker", role: MODULE_ROLE_OPTIONS["time-tracker"][0] },
    {
      moduleId: "toolbox-issues",
      role: MODULE_ROLE_OPTIONS["toolbox-issues"][0],
    },
  ];
  const plan = planNativeApplicationBatch(base, {
    userIds: [first, second],
    actorUserId: actor,
    applications,
    enabled: true,
  });
  assert.equal(plan.operations.length, 4);
  for (const op of plan.operations) {
    await writeNativeApplicationRoleAssignment(client, {
      workspaceId: workspace,
      userId: op.userId,
      moduleId: op.resourceId,
      role: op.role,
      enabled: op.enabled,
      expectedUpdatedAt: op.expectedUpdatedAt,
      snapshot: base,
    });
  }
  const assigned = { ...base, moduleAssignments: [...records.values()] };
  assert.ok(
    plan.operations.every((op) =>
      nativeApplicationRoleAssignmentPersisted(assigned, {
        userId: op.userId,
        moduleId: op.resourceId,
        role: op.role,
        enabled: true,
      }),
    ),
  );
  const revoke = planNativeApplicationBatch(assigned, {
    userIds: [first, second],
    actorUserId: actor,
    applications,
    enabled: false,
  });
  assert.equal(revoke.operations.length, 4);
  for (const op of revoke.operations) {
    await writeNativeApplicationRoleAssignment(client, {
      workspaceId: workspace,
      userId: op.userId,
      moduleId: op.resourceId,
      role: op.role,
      enabled: op.enabled,
      expectedUpdatedAt: op.expectedUpdatedAt,
      snapshot: assigned,
    });
  }
  const revoked = { ...base, moduleAssignments: [...records.values()] };
  assert.ok(
    revoke.operations.every((op) =>
      nativeApplicationRoleAssignmentPersisted(revoked, {
        userId: op.userId,
        moduleId: op.resourceId,
        role: op.role,
        enabled: false,
      }),
    ),
  );
});
