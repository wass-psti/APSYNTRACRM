#!/usr/bin/env node
/**
 * Offline, non-mutating acceptance aggregation.
 * Accepts a pseudonymous authoritative expected matrix and individually signed
 * browser reports; reports missing evidence, never upgrades database access
 * projection alone to VERIFIED.
 *
 * Usage: node scripts/cp-crm-native-access-final03-aggregate.mjs <expected.json> <reports.json>
 * Format: {"assignments":[{"accountKey":"0123456789abcdef","moduleId":"tradelink"}]}
 * Reports: JSON array of signed-matrix ACCEPTANCE_REPORT objects.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const KEY = /^[a-f0-9]{16}$/;
const moduleId = /^[a-z][a-z0-9-]{1,48}$/;
const expectedNativeBoards = Object.freeze({
  "time-tracker": "46bf4ee7-368a-4c35-842c-8593ea1f6ac3",
  "fund-released-tracker": "f36da8fe-8d9d-4629-9938-12533cb3ca39",
  "fueltrack-plus": "7af78b3f-67bf-4600-9aa1-9006d19d486e",
  tradelink: "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88",
});
export function aggregateNativeAcceptance(expected, reports) {
  if (!Array.isArray(expected?.assignments) || !Array.isArray(reports))
    throw Error("Invalid acceptance inputs");
  const assignments = new Map();
  for (const a of expected.assignments) {
    if (!KEY.test(a.accountKey || "") || !moduleId.test(a.moduleId || ""))
      throw Error("Invalid expected account/module");
    const key = a.accountKey + ":" + a.moduleId;
    if (assignments.has(key)) throw Error("Duplicate expected assignment");
    assignments.set(key, {
      accountKey: a.accountKey,
      moduleId: a.moduleId,
      status: "PENDING_SIGNED_RUNTIME",
    });
  }
  const evidence = new Map();
  for (const r of reports) {
    if (
      r?.milestone !== "CP-CRM-NATIVE-ACCESS-FINAL-02" ||
      r.mode !== "genuine-employee-read-only" ||
      !KEY.test(r.accountKey || "") ||
      !Array.isArray(r.applications) ||
      r.businessWrites !== 0 ||
      r.permissionWrites !== 0 ||
      r.blocker
    )
      throw Error("Invalid or non-genuine signed runtime report");
    for (const app of r.applications) {
      const k = r.accountKey + ":" + app.moduleId;
      if (!assignments.has(k)) {
        if (app.status === "VERIFIED")
          throw Error("Unexpected or unassigned module reported VERIFIED");
        continue;
      }
      if (evidence.has(k))
        throw Error("Duplicate signed runtime evidence for account/module");
      if (
        app.status === "VERIFIED" &&
        !Object.hasOwn(expectedNativeBoards, app.moduleId)
      )
        throw Error("No signed browser contract established for this module");
      if (
        app.status === "VERIFIED" &&
        !(
          app.signed &&
          app.uiReady &&
          app.native?.status === 200 &&
          app.native?.moduleId === app.moduleId &&
          app.native?.boardId === expectedNativeBoards[app.moduleId] &&
          app.boardId === expectedNativeBoards[app.moduleId] &&
          app.domainRpcs?.some((x) => x.status === 200) &&
          Array.isArray(app.httpErrors) &&
          app.httpErrors.length === 0 &&
          Array.isArray(app.pageErrors) &&
          app.pageErrors.length === 0
        )
      )
        throw Error("Invalid purported VERIFIED application evidence");
      evidence.set(
        k,
        app.status === "VERIFIED"
          ? "VERIFIED"
          : app.status === "FAILED"
            ? "FAILED"
            : "BLOCKED",
      );
    }
  }
  for (const [k, row] of assignments)
    if (evidence.has(k)) row.status = evidence.get(k);
  const rows = [...assignments.values()].sort(
    (a, b) =>
      a.accountKey.localeCompare(b.accountKey) ||
      a.moduleId.localeCompare(b.moduleId),
  );
  const counts = {
    total: rows.length,
    verified: rows.filter((r) => r.status === "VERIFIED").length,
    pending: rows.filter((r) => r.status === "PENDING_SIGNED_RUNTIME").length,
    blocked: rows.filter((r) => r.status === "BLOCKED").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
  };
  return {
    status:
      counts.total > 0 && counts.verified === counts.total
        ? "VERIFIED"
        : "INCOMPLETE",
    counts,
    rows,
  };
}
if (import.meta.url === pathToFileURL(process.argv[1] || "/dev/null").href) {
  try {
    if (process.argv.length !== 4)
      throw Error("Expected exactly two local JSON file paths");
    const expected = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const reports = JSON.parse(readFileSync(process.argv[3], "utf8"));
    const result = aggregateNativeAcceptance(expected, reports);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "VERIFIED") process.exitCode = 1;
  } catch (error) {
    console.error("BLOCKED: " + error.message);
    process.exitCode = 2;
  }
}
