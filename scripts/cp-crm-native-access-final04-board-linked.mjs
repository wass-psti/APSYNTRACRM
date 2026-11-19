#!/usr/bin/env node
/** Genuine signed-user, read-only Board-linked native-application preflight.
 * These eight modules do NOT implement native_application_board_context.
 * A passing result certifies a signed workspace-scoped Board read ONLY,
 * never a module-specific functional workflow or universal acceptance.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { BOARD_MODULES } from "../frontend/board/services/manifest.js";
import { pathToFileURL } from "node:url";
const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-f0-9]{16}$/;
const names = Object.freeze({
  fueltrans: "FuelTrans Standalone",
  "tool-traceability": "Tool Traceability",
  "toolbox-issues": "Toolbox Issues",
  "material-request-hub": "Material Request Hub",
  "employee-eval": "Employee Evaluation",
  "charter-navigator": "Charter Navigator",
  "order-intake": "Order Intake",
  "aps-aims": "APS AIMS",
});
export const BOARD_LINKED_MODULES = Object.freeze(
  Object.fromEntries(
    Object.entries(names).map(([id, name]) => {
      const match = BOARD_MODULES.find((m) => m.name === name);
      if (!match) throw Error("Missing registered Board module: " + name);
      return [
        id,
        Object.freeze({ moduleId: id, boardName: name, boardKey: match.key }),
      ];
    }),
  ),
);
export const pseudonym = (id) =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);
export const signedText = (body) =>
  body.includes("Secure session") &&
  body.includes("Sign out") &&
  !body.includes("Sign in with your existing work account");
export function validateAssignedBoards(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 8)
    throw Error("Expected 1-8 independently assigned Board modules");
  const seen = new Set();
  return rows.map((row) => {
    if (
      !BOARD_LINKED_MODULES[row?.moduleId] ||
      !UUID.test(row?.boardId || "") ||
      seen.has(row.moduleId)
    )
      throw Error("Unsupported, duplicate or invalid assigned Board");
    seen.add(row.moduleId);
    return { moduleId: row.moduleId, boardId: row.boardId };
  });
}
export function classifySignedBoardRead({
  assigned,
  roleMatched,
  body,
  shell,
  errorResponses,
  pageErrors,
  boardId,
}) {
  if (!assigned) return "NOT_APPLICABLE";
  if (!signedText(body)) return "BLOCKED";
  if (
    !roleMatched ||
    !shell ||
    shell.status !== 200 ||
    shell.board?.id !== boardId ||
    shell.board?.status !== "active" ||
    shell.board?.archived_at !== null ||
    shell.board?.trashed_at !== null
  )
    return "FAILED";
  if (errorResponses.length || pageErrors.length) return "FAILED";
  return "BOARD_READ_VERIFIED";
}
if (import.meta.url === pathToFileURL(process.argv[1] || "/dev/null").href) {
  const cdp = process.argv.find((a) => a.startsWith("--cdp-url="))?.slice(10);
  const expectedKey = process.argv
    .find((a) => a.startsWith("--expected-user-key="))
    ?.slice(20);
  const assignmentFile = process.argv
    .find((a) => a.startsWith("--assigned-boards="))
    ?.slice(18);
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp || "") ||
    !KEY.test(expectedKey || "") ||
    !assignmentFile
  ) {
    console.error(
      "BLOCKED: existing localhost signed CDP, independently verified account key and local assigned Boards JSON required",
    );
    process.exitCode = 2;
  } else {
    const { readFileSync } = await import("node:fs");
    let browser, page, original, expected;
    const report = {
      milestone: "CP-CRM-NATIVE-ACCESS-FINAL-04",
      mode: "signed-board-linked-read-only",
      accountKey: null,
      applications: [],
      businessWrites: 0,
      permissionWrites: 0,
    };
    try {
      expected = validateAssignedBoards(
        JSON.parse(readFileSync(assignmentFile, "utf8")).assignments,
      );
      browser = await chromium.connectOverCDP(cdp);
      const candidates = browser
        .contexts()
        .flatMap((ctx) => ctx.pages())
        .filter((p) => p.url().startsWith(BASE));
      for (const p of candidates) {
        if (
          signedText(
            await p
              .locator("body")
              .innerText({ timeout: 5000 })
              .catch(() => ""),
          )
        ) {
          page = p;
          break;
        }
      }
      assert.ok(
        page,
        "No genuine signed employee tab; do not use administrator or expired session",
      );
      original = page.url();
      // First authoritative signed identity comes from the current user's existing
      // signed RPC. Do not fetch JWT, cookies, storage or impersonate other users.
      const contextWait = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith(
            "/rest/v1/rpc/wm_auth_access_context",
          ),
        { timeout: 25000 },
      );
      void contextWait.catch(() => {});
      await page.goto(BASE + "#/overview", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      const contextResponse = await contextWait;
      assert.equal(contextResponse.status(), 200, "signed user context failed");
      const raw = await contextResponse.json(),
        context = Array.isArray(raw) ? raw[0] : raw;
      const userId = context?.user_id,
        workspaceId = context?.workspace_id;
      assert.ok(
        UUID.test(userId || "") && UUID.test(workspaceId || ""),
        "authoritative signed user/workspace unavailable",
      );
      assert.equal(pseudonym(userId), expectedKey, "wrong signed user account");
      report.accountKey = expectedKey;
      for (const assigned of expected) {
        const module = BOARD_LINKED_MODULES[assigned.moduleId],
          entry = {
            moduleId: assigned.moduleId,
            boardId: assigned.boardId,
            status: "PENDING",
            signed: false,
            board: null,
            httpErrors: [],
            pageErrors: [],
          };
        report.applications.push(entry);
        const onResponse = (r) => {
          const path = new URL(r.url()).pathname;
          if (path.includes("/rest/v1/rpc/") && r.status() >= 400)
            entry.httpErrors.push({
              rpc: path.split("/").at(-1),
              status: r.status(),
            });
        };
        const onError = (e) => entry.pageErrors.push(e.message.slice(0, 140));
        page.on("response", onResponse);
        page.on("pageerror", onError);
        try {
          const shellResponse = page.waitForResponse(
            (r) => {
              if (
                !new URL(r.url()).pathname.endsWith(
                  "/rest/v1/rpc/wm_get_board_shell",
                )
              )
                return false;
              try {
                return (
                  r.request().postDataJSON()?.p_board_id === assigned.boardId
                );
              } catch {
                return false;
              }
            },
            { timeout: 25000 },
          );
          void shellResponse.catch(() => {});
          await page.goto(BASE + "#/boards/" + assigned.boardId, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          const resolved = await shellResponse;
          const rawBoard = await resolved.json();
          const parsed = Array.isArray(rawBoard) ? rawBoard[0] : rawBoard;
          const shell = { status: resolved.status(), board: parsed?.board };
          await page.waitForTimeout(1000);
          const body = await page.locator("body").innerText({ timeout: 5000 });
          entry.signed = signedText(body);
          entry.board = shell
            ? {
                id: shell.board.id,
                name: shell.board.name,
                status: shell.board.status,
              }
            : null;
          entry.status = classifySignedBoardRead({
            assigned: true,
            roleMatched:
              shell?.board?.name === module.boardName &&
              shell?.board?.workspace_id === workspaceId,
            body,
            shell,
            errorResponses: entry.httpErrors,
            pageErrors: entry.pageErrors,
            boardId: assigned.boardId,
          });
          if (entry.status !== "BOARD_READ_VERIFIED")
            entry.reason =
              "Signed Board shell, workspace, canonical name or UI verification missing";
        } catch (e) {
          entry.status = "BLOCKED";
          entry.reason = e.message.slice(0, 200);
        } finally {
          page.off("response", onResponse);
          page.off("pageerror", onError);
        }
        console.log(
          "BOARD_MODULE",
          JSON.stringify({ moduleId: entry.moduleId, status: entry.status }),
        );
        if (entry.status !== "BOARD_READ_VERIFIED") break;
      }
    } catch (e) {
      report.blocker = e.message.slice(0, 220);
      process.exitCode = 1;
    } finally {
      if (page && original)
        await page
          .goto(original, { waitUntil: "domcontentloaded", timeout: 30000 })
          .catch(() => {});
      await browser?.close().catch(() => {});
      console.log("BOARD_READ_REPORT", JSON.stringify(report));
      if (
        report.blocker ||
        report.applications.some((x) => x.status !== "BOARD_READ_VERIFIED")
      )
        process.exitCode = 1;
    }
  }
}
