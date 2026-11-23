import test from "node:test";
import assert from "node:assert/strict";
import {
  WORK_MANAGEMENT_WORKSPACE_ID,
  WORKSPACE_IDENTITY_KIND,
  identifyWorkspace,
  isWorkspaceId,
  isWorkManagementWorkspace,
  isPersonalMainWorkspace,
} from "../workspace-identity.js";

const personalWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("Work Management identity uses its canonical workspace UUID", () => {
  assert.equal(
    WORK_MANAGEMENT_WORKSPACE_ID,
    "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(isWorkManagementWorkspace(WORK_MANAGEMENT_WORKSPACE_ID), true);
  assert.equal(
    identifyWorkspace({ workspaceId: WORK_MANAGEMENT_WORKSPACE_ID }).kind,
    WORKSPACE_IDENTITY_KIND.WORK_MANAGEMENT,
  );
});

test("Main Workspace identity requires the server-owned personal workspace mapping", () => {
  assert.equal(
    identifyWorkspace({ workspaceId: personalWorkspaceId }).kind,
    WORKSPACE_IDENTITY_KIND.OTHER,
  );
  assert.equal(
    identifyWorkspace({
      workspaceId: personalWorkspaceId,
      personalWorkspaceId,
    }).kind,
    WORKSPACE_IDENTITY_KIND.PERSONAL_MAIN,
  );
  assert.equal(
    isPersonalMainWorkspace(personalWorkspaceId, personalWorkspaceId),
    true,
  );
  assert.equal(
    isPersonalMainWorkspace(personalWorkspaceId, otherWorkspaceId),
    false,
  );
});

test("workspace names and labels cannot be used to infer workspace identity", () => {
  const identity = identifyWorkspace({ workspaceId: otherWorkspaceId });
  assert.equal(identity.kind, WORKSPACE_IDENTITY_KIND.OTHER);
  assert.equal(identity.workspaceId, otherWorkspaceId);
  assert.equal(identity.isKnown, true);
});

test("malformed or absent workspace identifiers are classified as unknown", () => {
  for (const workspaceId of [
    null,
    undefined,
    "",
    "Main Workspace",
    "not-a-uuid",
  ]) {
    assert.equal(isWorkspaceId(workspaceId), false);
    assert.equal(
      identifyWorkspace({ workspaceId }).kind,
      WORKSPACE_IDENTITY_KIND.UNKNOWN,
    );
  }
});

test("UUID comparisons are case-insensitive and return normalized identity", () => {
  const uppercase = personalWorkspaceId.toUpperCase();
  const identity = identifyWorkspace({
    workspaceId: uppercase,
    personalWorkspaceId,
  });
  assert.equal(identity.kind, WORKSPACE_IDENTITY_KIND.PERSONAL_MAIN);
  assert.equal(identity.workspaceId, personalWorkspaceId);
});
