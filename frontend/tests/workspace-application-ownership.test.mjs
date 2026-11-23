import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_MODULES } from "../board/services/manifest.js";
import {
  TARGET_BOARDS,
  TARGET_WORKSPACE_ID,
} from "../board/acceptance/security-targets.js";
import { NATIVE_APPLICATIONS } from "../native-application-access.js";
import {
  WORK_MANAGEMENT_BOARD_IDS,
  WORK_MANAGEMENT_BOARD_APPLICATIONS,
  WORK_MANAGEMENT_AUXILIARY_APPLICATIONS,
  WORK_MANAGEMENT_APPLICATIONS,
  applicationsForWorkspace,
  isApplicationOwnedByWorkspace,
  validateWorkspaceApplicationOwnership,
  workspaceApplicationOwnership,
} from "../workspace-application-ownership.js";
import { WORK_MANAGEMENT_WORKSPACE_ID } from "../workspace-identity.js";

const mainWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("all twelve canonical board modules have one registered Work Management owner", () => {
  assert.equal(validateWorkspaceApplicationOwnership(), true);
  assert.equal(WORK_MANAGEMENT_BOARD_APPLICATIONS.length, 12);
  assert.deepEqual(
    WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
      (application) => application.moduleKey,
    ).sort(),
    BOARD_MODULES.map((module) => module.key).sort(),
  );
  for (const application of WORK_MANAGEMENT_BOARD_APPLICATIONS) {
    assert.equal(application.ownerWorkspaceId, WORK_MANAGEMENT_WORKSPACE_ID);
    assert.equal(
      isApplicationOwnedByWorkspace(
        application.id,
        WORK_MANAGEMENT_WORKSPACE_ID,
      ),
      true,
    );
  }
});

test("all canonical board IDs match the existing twelve-board acceptance targets", () => {
  assert.equal(TARGET_WORKSPACE_ID, WORK_MANAGEMENT_WORKSPACE_ID);
  assert.equal(TARGET_BOARDS.length, 12);
  for (const target of TARGET_BOARDS) {
    assert.equal(WORK_MANAGEMENT_BOARD_IDS[target.key], target.id);
    const application = workspaceApplicationOwnership(target.key);
    assert.equal(application?.boardId, target.id);
    assert.equal(application?.name, target.name);
  }
  assert.equal(new Set(TARGET_BOARDS.map((target) => target.id)).size, 12);
});

test("native application board identities are sourced from the ownership manifest", () => {
  assert.equal(
    NATIVE_APPLICATIONS["time-tracker"].boardId,
    WORK_MANAGEMENT_BOARD_IDS.timetracker,
  );
  assert.equal(
    NATIVE_APPLICATIONS["fund-released-tracker"].boardId,
    WORK_MANAGEMENT_BOARD_IDS.frt,
  );
  assert.equal(
    NATIVE_APPLICATIONS["fueltrack-plus"].boardId,
    WORK_MANAGEMENT_BOARD_IDS.fueltrack,
  );
  assert.equal(
    NATIVE_APPLICATIONS.tradelink.boardId,
    WORK_MANAGEMENT_BOARD_IDS.tradelink,
  );
  for (const application of Object.values(NATIVE_APPLICATIONS)) {
    assert.equal(application.workspaceId, WORK_MANAGEMENT_WORKSPACE_ID);
  }
});

test("all currently registered sidebar applications belong to Work Management", () => {
  assert.equal(WORK_MANAGEMENT_APPLICATIONS.length, 15);
  assert.equal(WORK_MANAGEMENT_AUXILIARY_APPLICATIONS.length, 3);
  assert.deepEqual(
    WORK_MANAGEMENT_APPLICATIONS.map((application) => application.id),
    [
      "fm1-ticketing",
      "timetracker",
      "frt",
      "fueltrack",
      "tradelink",
      "paseo-de-lomboy",
      "talkbox",
      "fueltrans",
      "tools",
      "toolbox",
      "orders",
      "evaluation",
      "charter",
      "aims",
      "materials",
    ],
  );
  assert.deepEqual(
    WORK_MANAGEMENT_AUXILIARY_APPLICATIONS.map(
      (application) => application.id,
    ).sort(),
    ["fm1-ticketing", "paseo-de-lomboy", "talkbox"],
  );
  assert.equal(
    WORK_MANAGEMENT_AUXILIARY_APPLICATIONS.find(
      (application) => application.id === "talkbox",
    )?.requiresBoardModuleKey,
    "toolbox",
  );
  assert.ok(
    WORK_MANAGEMENT_APPLICATIONS.every(
      (application) =>
        application.ownerWorkspaceId === WORK_MANAGEMENT_WORKSPACE_ID,
    ),
  );
});

test("application lookup returns the full catalog only for Work Management", () => {
  assert.equal(
    applicationsForWorkspace(WORK_MANAGEMENT_WORKSPACE_ID).length,
    15,
  );
  assert.deepEqual(applicationsForWorkspace(mainWorkspaceId), []);
  assert.deepEqual(applicationsForWorkspace("invalid"), []);
});

test("unknown applications and foreign workspace ownership are not inferred", () => {
  assert.equal(workspaceApplicationOwnership("not-registered"), null);
  assert.equal(
    isApplicationOwnedByWorkspace(
      "not-registered",
      WORK_MANAGEMENT_WORKSPACE_ID,
    ),
    false,
  );
  assert.equal(
    isApplicationOwnedByWorkspace("tradelink", mainWorkspaceId),
    false,
  );
  assert.equal(
    isApplicationOwnedByWorkspace("tradelink", WORK_MANAGEMENT_WORKSPACE_ID),
    true,
  );
});

test("application and canonical board identifiers remain unique", () => {
  assert.equal(
    new Set(WORK_MANAGEMENT_APPLICATIONS.map((application) => application.id))
      .size,
    15,
  );
  assert.equal(
    new Set(
      WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
        (application) => application.boardId,
      ),
    ).size,
    12,
  );
});
