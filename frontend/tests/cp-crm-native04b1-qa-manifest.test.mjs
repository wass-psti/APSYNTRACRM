import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessQaManifest } from "../../scripts/cp-crm-native04b1-qa-manifest.mjs";

const person = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const valid = () => ({
  projectId: "jtlusodorfnyzgyuewkz",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  runId: "QA-NATIVE04B1-ISOLATED-20261119",
  recordPrefix: "QA-NATIVE04B1-ISOLATED-20261119",
  executionMode: "manual-approval-required",
  productionWriteEnabled: false,
  designationApprovalReference: "QA-REQUEST-ONLY-NOT-A-GRANT",
  archivePolicyReference: "QA-ARCHIVE-REVIEW-ONLY",
  identities: {
    attendanceEmployee: person(1),
    fundRequester: person(2),
    fundFinanceReviewer: person(3),
    fundGMVerifier: person(4),
    fuelRequester: person(5),
    fuelApprover: person(6),
    tradeAuthor: person(7),
    tradePrimaryReviewer: person(8),
    tradeSecondaryReviewer: person(9),
  },
  boundaries: {
    attendanceIsAuthorizedTestTime: true,
    noRealBankTransfer: true,
    noPhysicalFuelDispensing: true,
    noUnintendedExternalNotifications: true,
    documentHasTestLabel: true,
    preserveOriginalAuditHistory: true,
    archiveInsteadOfDelete: true,
  },
});

test("complete QA plan is reviewable but never constitutes production-write authorization", () => {
  const result = assessQaManifest(valid());
  assert.equal(result.status, "READY_FOR_INDEPENDENT_HUMAN_REVIEW");
  assert.deepEqual(result.issues, []);
  assert.equal(result.designatedIdentityCount, 9);
  assert.equal(result.productionWritesAuthorized, false);
  assert.equal(result.verifiedWithLiveAuth, false);
  assert.equal(result.authorityChangesPerformed, false);
  assert.equal(result.businessRecordsCreated, 0);
});

test("missing or malformed QA accounts cannot authorize any data creation", () => {
  for (const manifest of [null, {}, { ...valid(), identities: {} }]) {
    const result = assessQaManifest(manifest);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.productionWritesAuthorized, false);
    assert.ok(result.issues.length);
  }
});

test("distinct financial, fuel and TradeLink reviewer identities are mandatory", () => {
  const groups = [
    ["tradeAuthor", "tradePrimaryReviewer"],
    ["tradeAuthor", "tradeSecondaryReviewer"],
    ["tradePrimaryReviewer", "tradeSecondaryReviewer"],
    ["fundRequester", "fundFinanceReviewer"],
    ["fundRequester", "fundGMVerifier"],
    ["fundFinanceReviewer", "fundGMVerifier"],
    ["fuelRequester", "fuelApprover"],
  ];
  for (const [a, b] of groups) {
    const manifest = valid();
    manifest.identities[a] = manifest.identities[b];
    const outcome = assessQaManifest(manifest);
    assert.equal(outcome.status, "BLOCKED", a + "/" + b);
    assert.equal(outcome.productionWritesAuthorized, false);
  }
});

test("production project/workspace drift and missing audit-preserving boundaries fail", () => {
  const variants = [
    (m) => {
      m.projectId = "another-project";
    },
    (m) => {
      m.workspaceId = person(99);
    },
    (m) => {
      m.productionWriteEnabled = true;
    },
    (m) => {
      m.executionMode = "automatic";
    },
    (m) => {
      m.recordPrefix = "REAL-FINANCE";
    },
    (m) => {
      m.runId = "NO-UNIQUE-RUN";
    },
    (m) => {
      m.boundaries.noRealBankTransfer = false;
    },
    (m) => {
      m.boundaries.preserveOriginalAuditHistory = false;
    },
    (m) => {
      delete m.designationApprovalReference;
    },
    (m) => {
      delete m.archivePolicyReference;
    },
  ];
  for (const change of variants) {
    const manifest = valid();
    change(manifest);
    const outcome = assessQaManifest(manifest);
    assert.equal(outcome.status, "BLOCKED");
    assert.equal(outcome.productionWritesAuthorized, false);
  }
});

test("CLI requires explicit local manifest and never uses implicit live discovery", () => {
  const file = fileURLToPath(
    new URL("../../scripts/cp-crm-native04b1-qa-manifest.mjs", import.meta.url),
  );
  const r = spawnSync(process.execPath, [file], {
    encoding: "utf8",
    timeout: 6000,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Provide --manifest/);
});
