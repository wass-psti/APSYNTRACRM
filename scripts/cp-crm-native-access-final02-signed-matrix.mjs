#!/usr/bin/env node
/**
 * CP-CRM-NATIVE-ACCESS-FINAL-02. One existing signed employee session per run.
 * Read-only evidence: never authenticates, impersonates, reads tokens or writes records.
 * Run with --cdp-url=http://127.0.0.1:<existing-debug-port> and
 * --expected-modules=<comma-separated-authoritatively-assigned-native-modules>
 * and --expected-user-key=<16-char-key-from-authoritative-matrix>.
 * Repeat for each distinct assigned employee; no one session certifies all users.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

export const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
export const APPS = [
  {
    moduleId: "time-tracker",
    route: "#/time-tracker",
    label: "TimeTracker",
    boardId: "46bf4ee7-368a-4c35-842c-8593ea1f6ac3",
    ready: "Signed Clock writes active",
    domain: ["timetracker_attendance_capabilities", "timetracker_ot_snapshot"],
  },
  {
    moduleId: "fund-released-tracker",
    route: "#/fund-tracker",
    label: "Fund Tracker",
    boardId: "f36da8fe-8d9d-4629-9938-12533cb3ca39",
    ready: "New Fund Request",
    domain: [
      "frt_bootstrap",
      "frt_board_dashboard_safe",
      "frt_board_list_safe",
    ],
  },
  {
    moduleId: "fueltrack-plus",
    route: "#/fueltrack",
    label: "FuelTrack+",
    boardId: "7af78b3f-67bf-4600-9aa1-9006d19d486e",
    ready: "Verified signed FuelTrack operations",
    domain: ["fueltrack_v3_read"],
  },
  {
    moduleId: "tradelink",
    route: "#/tradelink/documents",
    label: "TradeLink",
    boardId: "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88",
    ready: "My Assigned Documents",
    domain: ["tl03_assigned_documents"],
  },
];
export const isSignedText = (body) =>
  body.includes("Secure session") &&
  body.includes("Sign out") &&
  !body.includes("Sign in with your existing work account");
export const safeUserKey = (id) =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);
export function classifyApp(result) {
  if (result.state === "NOT_ASSIGNED_BY_VERIFIED_INVENTORY")
    return "NOT_APPLICABLE";
  if (!result.signed || result.uiReady !== true) return "BLOCKED";
  if (
    result.native?.status !== 200 ||
    result.native.moduleId !== result.moduleId ||
    result.native.boardId !== result.boardId
  )
    return "FAILED";
  if (!result.domainRpcs.some((r) => r.status === 200)) return "FAILED";
  if (result.httpErrors.length || result.pageErrors.length) return "FAILED";
  return "VERIFIED";
}

const cdp = process.argv.find((v) => v.startsWith("--cdp-url="))?.slice(10);
const expectedArgument = process.argv
  .find((v) => v.startsWith("--expected-modules="))
  ?.slice("--expected-modules=".length);
export const validateExpectedModules = (value) => {
  if (!value) return null;
  const listed = value.split(",").map((v) => v.trim());
  if (
    !listed.length ||
    listed.some((v) => !APPS.some((app) => app.moduleId === v)) ||
    new Set(listed).size !== listed.length
  )
    return null;
  return listed;
};
const expectedModules = validateExpectedModules(expectedArgument);
const expectedUserKey = process.argv
  .find((v) => v.startsWith("--expected-user-key="))
  ?.slice("--expected-user-key=".length);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (
    !cdp ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp) ||
    !expectedModules ||
    !/^[a-f0-9]{16}$/.test(expectedUserKey || "")
  ) {
    console.error(
      "BLOCKED: signed Chromium CDP, --expected-modules and authoritative --expected-user-key required",
    );
    process.exitCode = 2;
  } else {
    const report = {
      expectedUserKey,
      expectedModules,
      milestone: "CP-CRM-NATIVE-ACCESS-FINAL-02",
      mode: "genuine-employee-read-only",
      accountKey: null,
      workspaceKey: null,
      applications: [],
      businessWrites: 0,
      permissionWrites: 0,
    };
    let browser, page, originalUrl;
    try {
      browser = await chromium.connectOverCDP(cdp);
      const candidates = browser
        .contexts()
        .flatMap((ctx) => ctx.pages())
        .filter((p) => p.url().startsWith(BASE));
      for (const p of candidates) {
        const body = await p
          .locator("body")
          .innerText({ timeout: 5000 })
          .catch(() => "");
        if (isSignedText(body)) {
          page = p;
          break;
        }
      }
      assert.ok(
        page,
        "BLOCKED: no genuinely signed CRM tab in this Chromium session; user must sign in directly",
      );
      originalUrl = page.url();
      const initial = await page.locator("body").innerText();
      assert.ok(isSignedText(initial), "Session is not signed");
      // Inspect visible native links; never probe an unassigned route.
      const supported = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")]
          .filter((a) => a.getClientRects().length > 0)
          .map((a) => a.getAttribute("href") || ""),
      );
      let identity = null,
        workspace = null;
      for (const app of APPS) {
        const row = {
          moduleId: app.moduleId,
          boardId: app.boardId,
          state: "PENDING",
          status: null,
          signed: false,
          uiReady: false,
          native: null,
          domainRpcs: [],
          httpErrors: [],
          pageErrors: [],
        };
        report.applications.push(row);
        if (!expectedModules.includes(app.moduleId)) {
          row.state = "NOT_ASSIGNED_BY_VERIFIED_INVENTORY";
          row.status = "NOT_APPLICABLE";
          continue;
        }
        if (!supported.some((h) => h.endsWith(app.route))) {
          row.state = "ASSIGNED_NAVIGATION_MISSING";
          row.status = "BLOCKED";
          row.reason =
            "Expected assigned native application link is not visible";
          break;
        }
        const responses = [];
        const onResponse = async (response) => {
          const pathname = new URL(response.url()).pathname;
          if (!pathname.includes("/rest/v1/rpc/")) return;
          const rpc = pathname.split("/").at(-1),
            status = response.status();
          if (
            ![...app.domain, "native_application_board_context"].includes(
              rpc,
            ) &&
            status < 400
          )
            return;
          const record = { rpc, status };
          if (rpc === "native_application_board_context" && status === 200) {
            try {
              const raw = await response.json();
              const p = Array.isArray(raw) ? raw[0] : raw;
              record.moduleId = p?.moduleId;
              record.boardId = p?.board?.id;
              record.userId = p?.userId;
              record.workspaceId = p?.workspaceId;
            } catch {
              record.payloadError = true;
            }
          }
          responses.push(record);
        };
        const onError = (error) =>
          row.pageErrors.push(error.message.slice(0, 160));
        page.on("response", onResponse);
        page.on("pageerror", onError);
        try {
          await page.goto(BASE + app.route, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await page.waitForTimeout(1000);
          await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForFunction(
            (expected) => document.body.innerText.includes(expected),
            app.ready,
            { timeout: 25000 },
          );
          const body = await page.locator("body").innerText();
          row.signed = isSignedText(body);
          row.uiReady = body.includes(app.ready);
          const native = responses
            .filter((r) => r.rpc === "native_application_board_context")
            .at(-1);
          row.native = native
            ? {
                status: native.status,
                moduleId: native.moduleId,
                boardId: native.boardId,
              }
            : null;
          row.domainRpcs = responses
            .filter((r) => app.domain.includes(r.rpc))
            .map(({ rpc, status }) => ({ rpc, status }));
          row.httpErrors = responses
            .filter((r) => r.status >= 400)
            .map(({ rpc, status }) => ({ rpc, status }));
          if (native?.userId && native?.workspaceId) {
            if (identity && identity !== native.userId)
              throw new Error("Signed user changed during acceptance");
            if (workspace && workspace !== native.workspaceId)
              throw new Error("Workspace changed during acceptance");
            identity = native.userId;
            workspace = native.workspaceId;
            if (safeUserKey(identity) !== expectedUserKey)
              throw new Error(
                "Signed user does not match authoritative expected account key",
              );
            report.accountKey = safeUserKey(identity);
            report.workspaceKey = safeUserKey(workspace);
          }
          row.status = classifyApp(row);
        } catch (e) {
          row.status = "BLOCKED";
          row.reason = e.message.slice(0, 220);
        } finally {
          page.off("response", onResponse);
          page.off("pageerror", onError);
        }
        console.log(
          "MODULE",
          JSON.stringify({
            moduleId: row.moduleId,
            status: row.status,
            reason: row.reason || null,
          }),
        );
        if (row.status !== "VERIFIED") break;
      }
    } catch (e) {
      report.blocker = e.message.slice(0, 220);
      process.exitCode = 1;
    } finally {
      if (page && originalUrl)
        await page
          .goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
          .catch(() => {});
      await browser?.close().catch(() => {});
      console.log("ACCEPTANCE_REPORT", JSON.stringify(report));
      if (
        report.blocker ||
        report.applications.some((a) =>
          ["BLOCKED", "FAILED"].includes(a.status),
        )
      )
        process.exitCode = 1;
    }
  }
}
