#!/usr/bin/env node
/** CP-CRM-NATIVE-CORE-02B: genuine, read-only two-window native synchronization.
 * Requires a user-owned, already authenticated Chromium CDP page.
 * A synthetic cache INVALIDATION (not a mutation) requests fresh signed reads.
 * No login, tokens, production records, role changes or business RPC writes.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  APPS,
  isSignedText,
} from "./cp-crm-native-access-final02-signed-matrix.mjs";
const base = "https://wass-psti.github.io/APSYNTRACRM/";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const keyFor = (id) =>
  createHash("sha256").update(id).digest("hex").slice(0, 16);
export const eligibleSignedPage = (body, url) =>
  url.startsWith(base) && isSignedText(body);
export function verifyNativeReply({
  status,
  payload,
  expectedUserKey,
  expectedBoardId,
  moduleId,
  workspaceId,
}) {
  const p = Array.isArray(payload) ? payload[0] : payload;
  return (
    status === 200 &&
    p?.moduleId === moduleId &&
    p?.board?.id === expectedBoardId &&
    uuid.test(p?.userId || "") &&
    uuid.test(p?.workspaceId || "") &&
    keyFor(p.userId) === expectedUserKey &&
    (!workspaceId || p.workspaceId === workspaceId)
  );
}
/** Identity decisions must use signed server context, never visible role labels.
 * An existing tab is eligible only when it is the same independently signed
 * user AND workspace. A different valid employee remains untouched. */
export function matchingSignedTabPair(entries, expectedKey) {
  if (!Array.isArray(entries) || !/^[0-9a-f]{16}$/.test(expectedKey || ""))
    throw Error("Invalid signed acceptance inventory");
  const assigned = entries.filter(
    (item) =>
      item?.signed === true &&
      item?.profileActive === true &&
      item?.accountKey === expectedKey &&
      /^[0-9a-f]{16}$/.test(item?.workspaceKey || ""),
  );
  if (assigned.length < 2) return null;
  const original = assigned[0];
  const peer = assigned.find(
    (item) =>
      item !== original &&
      item.workspaceKey === original.workspaceKey &&
      item.page !== original.page,
  );
  return peer ? { original, peer } : null;
}

export const signedInvalidation = (userId, workspaceId, boardId) => ({
  version: 1,
  type: "invalidate",
  sender: "cp-native-core-02b-read-only",
  sequence: 1,
  userId,
  workspaceId,
  boardId,
  revision: null,
  at: Date.now(),
});

if (import.meta.url === pathToFileURL(process.argv[1] || "/dev/null").href) {
  const arg = (name) =>
    process.argv.find((v) => v.startsWith(name + "="))?.slice(name.length + 1);
  const cdp = arg("--cdp-url"),
    moduleId = arg("--module"),
    expectedKey = arg("--expected-user-key");
  const app = APPS.find((a) => a.moduleId === moduleId);
  const report = {
    milestone: "CP-CRM-NATIVE-CORE-02B",
    moduleId,
    accountKey: null,
    mode: "genuine-signed-two-tab-read-only",
    initial: "PENDING",
    refresh: "PENDING",
    reopen: "PENDING",
    crossWindow: "PENDING",
    businessWrites: 0,
    permissionWrites: 0,
  };
  if (
    !app ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp || "") ||
    !/^[0-9a-f]{16}$/.test(expectedKey || "")
  ) {
    console.error(
      "BLOCKED: expected module, signed local CDP, and verified user key are required",
    );
    process.exitCode = 2;
  } else {
    let browser, page, peer, original, peerOriginal;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.connectOverCDP(cdp);
      // Preflight both tabs with the authoritative signed context RPC BEFORE
      // navigating either tab to an app route. Do not touch a different user.
      const pages = browser
        .contexts()
        .flatMap((c) => c.pages())
        .filter((p) => p.url().startsWith(base));
      const inventory = [];
      for (const candidate of pages) {
        const body = await candidate
          .locator("body")
          .innerText({ timeout: 5000 })
          .catch(() => "");
        if (!eligibleSignedPage(body, candidate.url())) continue;
        const signedResponse = candidate.waitForResponse(
          (r) =>
            new URL(r.url()).pathname.endsWith(
              "/rest/v1/rpc/wm_auth_access_context",
            ),
          { timeout: 25000 },
        );
        void signedResponse.catch(() => {});
        await candidate.reload({
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        const response = await signedResponse;
        if (response.status() !== 200) continue;
        const raw = await response.json();
        const context = Array.isArray(raw) ? raw[0] : raw;
        if (
          !uuid.test(context?.user_id || "") ||
          !uuid.test(context?.workspace_id || "")
        )
          continue;
        // A DOMContentLoaded event precedes async session restoration. Wait
        // for signed UI instead of wrongly classifying a loading shell.
        await candidate
          .waitForFunction(
            () => {
              const body = document.body?.innerText || "";
              return (
                body.includes("Secure session") &&
                body.includes("Sign out") &&
                !body.includes("Sign in with your existing work account")
              );
            },
            null,
            { timeout: 15000 },
          )
          .catch(() => {});
        const refreshedBody = await candidate
          .locator("body")
          .innerText({ timeout: 15000 })
          .catch(() => "");
        inventory.push({
          page: candidate,
          signed: eligibleSignedPage(refreshedBody, candidate.url()),
          profileActive: context?.profile?.status === "active",
          accountKey: keyFor(context.user_id),
          workspaceKey: keyFor(context.workspace_id),
        });
      }
      const pair = matchingSignedTabPair(inventory, expectedKey);
      if (!pair) {
        const matching = inventory.filter(
          (x) => x.signed && x.accountKey === expectedKey,
        );
        report.preflight = {
          validSignedTabs: inventory.filter((x) => x.signed).length,
          matchingEmployeeTabs: matching.length,
          matchingWorkspaceTabs: matching.length
            ? matching.filter(
                (x) => x.workspaceKey === matching[0].workspaceKey,
              ).length
            : 0,
        };
        throw Error(
          "BLOCKED: two independently signed tabs for the same assigned employee and workspace are required",
        );
      }
      page = pair.original.page;
      peer = pair.peer.page;
      original = page.url();
      peerOriginal = peer.url();
      let signedContext = null;
      async function validatePhase(target, action, phase) {
        const observed = target.waitForResponse(
          (r) =>
            new URL(r.url()).pathname.endsWith(
              "/rest/v1/rpc/native_application_board_context",
            ) &&
            r
              .request()
              .postData()
              ?.includes('"' + moduleId + '"'),
          { timeout: 30000 },
        );
        void observed.catch(() => {});
        await action();
        await target
          .locator(app.selector)
          .waitFor({ state: "visible", timeout: 30000 });
        const response = await observed;
        const payload = await response.json();
        const p = Array.isArray(payload) ? payload[0] : payload;
        const body = await target.locator("body").innerText();
        if (
          !eligibleSignedPage(body, target.url()) ||
          !verifyNativeReply({
            status: response.status(),
            payload,
            expectedUserKey: expectedKey,
            expectedBoardId: app.boardId,
            moduleId,
            workspaceId: signedContext?.workspaceId,
          })
        )
          throw Error(
            phase + " signed native user/workspace/Board validation failed",
          );
        signedContext = { userId: p.userId, workspaceId: p.workspaceId };
        report.accountKey = expectedKey;
        report[phase] = "VERIFIED";
      }
      await validatePhase(
        page,
        () =>
          page.goto(base + app.route, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          }),
        "initial",
      );
      await validatePhase(
        page,
        () => page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }),
        "refresh",
      );
      // Same-account signed peer was selected BEFORE either tab's app route
      // navigation, and no other account has been navigated or mutated.
      await peer.goto(base + app.route, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const peerBody = await peer.locator("body").innerText({ timeout: 15000 });
      if (!eligibleSignedPage(peerBody, peer.url()))
        throw Error("BLOCKED: second tab lost its genuine signed session");
      await validatePhase(
        peer,
        () =>
          peer.reload({
            waitUntil: "domcontentloaded",
            timeout: 45000,
          }),
        "reopen",
      );
      const crossRead = peer.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith(
            "/rest/v1/rpc/native_application_board_context",
          ) &&
          r
            .request()
            .postData()
            ?.includes('"' + moduleId + '"'),
        { timeout: 30000 },
      );
      void crossRead.catch(() => {});
      const hint = signedInvalidation(
        signedContext.userId,
        signedContext.workspaceId,
        app.boardId,
      );
      await page.evaluate((message) => {
        const channel = new BroadcastChannel(
          "apsyntra.crm.board-invalidation.v1",
        );
        try {
          channel.postMessage(message);
        } finally {
          channel.close();
        }
      }, hint);
      const response = await crossRead;
      const payload = await response.json();
      const body = await peer.locator("body").innerText();
      if (
        !eligibleSignedPage(body, peer.url()) ||
        !verifyNativeReply({
          status: response.status(),
          payload,
          expectedUserKey: expectedKey,
          expectedBoardId: app.boardId,
          moduleId,
          workspaceId: signedContext.workspaceId,
        })
      )
        throw Error(
          "Second-tab signed reconciliation did not return the correct native context",
        );
      report.crossWindow = "VERIFIED";
    } catch (error) {
      report.blocker = error.message.slice(0, 230);
      process.exitCode = 1;
    } finally {
      if (peer && peerOriginal)
        await peer
          .goto(peerOriginal, { waitUntil: "domcontentloaded", timeout: 30000 })
          .catch(() => {});
      if (page && original)
        await page
          .goto(original, { waitUntil: "domcontentloaded", timeout: 30000 })
          .catch(() => {});
      await browser?.close().catch(() => {});
      console.log("NATIVE_SYNC_ACCEPTANCE", JSON.stringify(report));
    }
  }
}
