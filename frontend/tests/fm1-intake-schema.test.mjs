import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFm1Intake,
  createFm1LocalDraft,
} from "../fm1/domain/intake-schema.js";

const valid = {
  requesterName: "FM1 Operator",
  callbackNumber: "+63 900 000 0000",
  subject: "WinCC station unavailable",
  description:
    "Operator reports the WinCC station is unavailable after a recent restart.",
  priority: "P2",
  productionImpact: "degraded",
  productionStopped: false,
  safetyConcern: false,
  channel: "portal",
  assetReference: "",
};

test("valid rapid-intake payload parses without requiring an asset reference", () => {
  const result = parseFm1Intake(valid);
  assert.equal(result.ok, true);
  assert.equal(result.data.assetReference, "");
});

test("invalid requester, callback, subject and description are rejected", () => {
  const result = parseFm1Intake({
    ...valid,
    requesterName: " ",
    callbackNumber: "123",
    subject: "x",
    description: "short",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ["requesterName", "callbackNumber", "subject", "description"],
  );
});

test("draft identifiers cannot be confused with server-issued FM1 ticket IDs", () => {
  const parsed = parseFm1Intake(valid);
  const draft = createFm1LocalDraft(parsed.data, {
    id: "12345678-local-draft",
    now: "2026-11-16T03:00:00.000Z",
  });
  assert.match(draft.reference, /^LOCAL-DRAFT-/);
  assert.equal(draft.serverTicketId, null);
  assert.equal(draft.submissionState, "NOT_SUBMITTED");
  assert.equal(draft.recordType, "FM1_INTAKE_DRAFT");
});

test("critical production impact and the independent production-stopped flag are preserved", () => {
  const result = parseFm1Intake({
    ...valid,
    productionImpact: "critical",
    productionStopped: true,
    safetyConcern: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.productionImpact, "critical");
  assert.equal(result.data.productionStopped, true);
  assert.equal(result.data.safetyConcern, true);
});
