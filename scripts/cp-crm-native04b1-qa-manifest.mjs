/**
 * CP-CRM-NATIVE-04B1 — offline acceptance identity/record isolation gate.
 *
 * Pure validation. Does not connect to Supabase, GitHub, browsers or machines.
 * This tool does not authorize or execute any production write.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_PROJECT = "jtlusodorfnyzgyuewkz";
const EXPECTED_WORKSPACE = "00000000-0000-4000-8000-000000000001";
const REQUIRED_ACTORS = [
  "attendanceEmployee",
  "fundRequester",
  "fundFinanceReviewer",
  "fundGMVerifier",
  "fuelRequester",
  "fuelApprover",
  "tradeAuthor",
  "tradePrimaryReviewer",
  "tradeSecondaryReviewer",
];
const REQUIRED_BOUNDARIES = [
  "attendanceIsAuthorizedTestTime",
  "noRealBankTransfer",
  "noPhysicalFuelDispensing",
  "noUnintendedExternalNotifications",
  "documentHasTestLabel",
  "preserveOriginalAuditHistory",
  "archiveInsteadOfDelete",
];

export function assessQaManifest(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      status: "BLOCKED",
      issues: ["Manifest must be a JSON object."],
      productionWritesAuthorized: false,
    };
  }
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  if (manifest.projectId !== EXPECTED_PROJECT)
    issues.push("The designated existing Supabase project does not match.");
  if (manifest.workspaceId !== EXPECTED_WORKSPACE)
    issues.push(
      "The target workspace is not the verified Work Management workspace.",
    );
  if (!/^QA-NATIVE04B1-[A-Z0-9-]{6,40}$/.test(text(manifest.runId)))
    issues.push("A unique QA-NATIVE04B1 run identifier is required.");
  if (!/^QA-NATIVE04B1-[A-Z0-9-]{6,40}$/.test(text(manifest.recordPrefix)))
    issues.push(
      "Each acceptance record must use a QA-NATIVE04B1 record prefix.",
    );
  if (manifest.productionWriteEnabled !== false)
    issues.push(
      "The preflight manifest may not enable production business writes.",
    );
  if (manifest.executionMode !== "manual-approval-required")
    issues.push("The execution mode must remain manual-approval-required.");

  const identities = manifest.identities || {};
  for (const actor of REQUIRED_ACTORS) {
    if (
      !UUID.test(text(identities[actor])) ||
      /^0{8}-/.test(text(identities[actor]))
    )
      issues.push(
        `A real, explicitly designated Auth UUID is required for ${actor}.`,
      );
  }
  const requireDistinct = (a, b) => {
    if (UUID.test(text(identities[a])) && identities[a] === identities[b])
      issues.push(`${a} and ${b} must be independent identities.`);
  };
  requireDistinct("tradeAuthor", "tradePrimaryReviewer");
  requireDistinct("tradeAuthor", "tradeSecondaryReviewer");
  requireDistinct("tradePrimaryReviewer", "tradeSecondaryReviewer");
  requireDistinct("fundRequester", "fundFinanceReviewer");
  requireDistinct("fundRequester", "fundGMVerifier");
  requireDistinct("fundFinanceReviewer", "fundGMVerifier");
  requireDistinct("fuelRequester", "fuelApprover");

  const boundaries = manifest.boundaries || {};
  for (const name of REQUIRED_BOUNDARIES)
    if (boundaries[name] !== true)
      issues.push(`Required business safety boundary missing: ${name}.`);
  if (!text(manifest.archivePolicyReference))
    issues.push("A recorded cleanup/archive plan reference is required.");
  if (!text(manifest.designationApprovalReference))
    issues.push(
      "A separate QA identity/record designation approval reference is required.",
    );

  // Approval references are self-reported strings, not verified authorizations.
  // Even a complete plan remains non-executable until reviewed separately.
  return {
    status: issues.length ? "BLOCKED" : "READY_FOR_INDEPENDENT_HUMAN_REVIEW",
    issues,
    designatedIdentityCount: REQUIRED_ACTORS.filter((name) =>
      UUID.test(text(identities[name])),
    ).length,
    productionWritesAuthorized: false,
    verifiedWithLiveAuth: false,
    authorityChangesPerformed: false,
    businessRecordsCreated: 0,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const idx = process.argv.indexOf("--manifest");
  if (idx < 0 || !process.argv[idx + 1]) {
    console.error(
      "Provide --manifest <local JSON path>; no live account discovery is attempted.",
    );
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(readFileSync(process.argv[idx + 1], "utf8"));
      const result = assessQaManifest(manifest);
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "BLOCKED") process.exitCode = 2;
    } catch (error) {
      console.error(
        "QA manifest could not be parsed; no production action performed.",
      );
      process.exitCode = 2;
    }
  }
}
