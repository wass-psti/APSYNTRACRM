#!/usr/bin/env node
/** Genuine, read-only signed two-account native capability probe.
 * Reuses the user's existing authorized QA Chromium tabs; never reads tokens,
 * signs in, copies session state or writes role/business records.
 * A different-workspace pair is reported as a cross-user sync BLOCKER.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  APPS,
  BASE,
  isSignedText,
} from "./cp-crm-native-access-final02-signed-matrix.mjs";
const hash = (id) => createHash("sha256").update(id).digest("hex").slice(0, 16);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assessSignedPair(records, expectedKeys) {
  if (
    !Array.isArray(expectedKeys) ||
    expectedKeys.length !== 2 ||
    new Set(expectedKeys).size !== 2 ||
    expectedKeys.some((k) => !/^[a-f0-9]{16}$/.test(k))
  )
    return {
      status: "BLOCKED",
      reason: "Two distinct authoritative account keys required",
    };
  const pair = expectedKeys.map((key) =>
    records.find(
      (r) =>
        r.signed === true &&
        r.active === true &&
        r.accountKey === key &&
        uuid.test(r.workspaceId || ""),
    ),
  );
  if (pair.some((r) => !r) || pair[0].tab === pair[1].tab)
    return {
      status: "BLOCKED",
      reason: "Two independent signed expected accounts required",
    };
  if (pair[0].workspaceId !== pair[1].workspaceId)
    return {
      status: "BLOCKED",
      reason: "Signed accounts are in different workspaces",
    };
  return {
    status: "ELIGIBLE",
    reason: "Genuine same-workspace signed accounts verified",
  };
}
const arg = (k) =>
  process.argv.find((x) => x.startsWith(k + "="))?.slice(k.length + 1);
const cdp = arg("--cdp-url"),
  keys = arg("--expected-user-keys")?.split(",");
if (import.meta.url === pathToFileURL(process.argv[1] || "/dev/null").href) {
  const report = {
    milestone: "CP-CRM-URM-INTEGRITY-03",
    mode: "read-only-signed-native-capability",
    accounts: [],
    crossUserAcceptance: "PENDING",
    businessWrites: 0,
    permissionWrites: 0,
  };
  if (
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp || "") ||
    !keys ||
    keys.length !== 2 ||
    keys.some((x) => !/^[a-f0-9]{16}$/.test(x))
  ) {
    console.error(
      "BLOCKED: local CDP and two authoritative pseudonymous account keys required",
    );
    process.exitCode = 2;
  } else {
    let browser;
    try {
      const { chromium } = await import("playwright");
      browser = await chromium.connectOverCDP(cdp);
      const pages = browser
        .contexts()
        .flatMap((c) => c.pages())
        .filter((p) => p.url().startsWith(BASE));
      const inventory = [];
      for (const page of pages) {
        const original = page.url();
        const records = [];
        const parsers = [];
        const onResponse = (response) => {
          const name = new URL(response.url()).pathname.split("/").at(-1);
          if (
            ![
              "wm_auth_access_context",
              "apsyntra_crm_my_effective_access",
            ].includes(name)
          )
            return;
          const r = { name, status: response.status() };
          records.push(r);
          if (r.status === 200)
            parsers.push(
              response
                .json()
                .then((raw) => {
                  const v = Array.isArray(raw) ? raw[0] : raw;
                  r.data = v;
                })
                .catch(() => {
                  r.error = true;
                }),
            );
        };
        page.on("response", onResponse);
        try {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForFunction(
            () =>
              document.body?.innerText.includes("Secure session") &&
              document.body?.innerText.includes("Sign out"),
            null,
            { timeout: 18000 },
          );
          for (
            let i = 0;
            i < 15 &&
            (!records.some((r) => r.name === "wm_auth_access_context") ||
              !records.some(
                (r) => r.name === "apsyntra_crm_my_effective_access",
              ));
            i++
          )
            await page.waitForTimeout(250);
          await Promise.all(parsers);
          const identity = records.find(
            (r) => r.name === "wm_auth_access_context" && r.status === 200,
          )?.data;
          const access = records.find(
            (r) =>
              r.name === "apsyntra_crm_my_effective_access" && r.status === 200,
          )?.data;
          if (
            !uuid.test(identity?.user_id || "") ||
            !uuid.test(identity?.workspace_id || "") ||
            access?.workspaceId !== identity.workspace_id ||
            !Array.isArray(access?.modules)
          )
            continue;
          const entry = {
            tab: inventory.length + 1,
            page,
            original,
            signed: true,
            active: identity?.profile?.status === "active",
            accountKey: hash(identity.user_id),
            workspaceId: identity.workspace_id,
            access,
          };
          inventory.push(entry);
        } catch (e) {
          report.accounts.push({
            state: "BLOCKED",
            reason:
              "Independent signed context unavailable: " +
              e.message.slice(0, 115),
          });
        } finally {
          page.off("response", onResponse);
        }
      }
      for (const key of keys) {
        const entry = inventory.find((x) => x.accountKey === key && x.active);
        if (!entry) {
          report.accounts.push({
            accountKey: key,
            state: "BLOCKED",
            reason: "No matching active signed tab",
          });
          continue;
        }
        const { page, access, workspaceId, original } = entry;
        const row = {
          accountKey: key,
          workspaceKey: hash(workspaceId),
          signed: true,
          active: true,
          applications: [],
          businessWrites: 0,
        };
        report.accounts.push(row);
        try {
          for (const app of APPS) {
            const module = access.modules.find(
              (m) => m?.moduleId === app.moduleId,
            );
            if (!module) {
              row.applications.push({
                moduleId: app.moduleId,
                status: "BLOCKED",
                reason: "Missing authoritative module projection",
              });
              continue;
            }
            if (module.allowed !== true) {
              row.applications.push({
                moduleId: app.moduleId,
                status: "NOT_ASSIGNED",
                allowed: false,
              });
              continue;
            }
            const responses = [],
              parsers = [],
              errors = [];
            const onError = (e) => errors.push(e.message.slice(0, 130));
            const onResponse = (response) => {
              const name = new URL(response.url()).pathname.split("/").at(-1),
                status = response.status();
              if (
                ![...app.domain, "native_application_board_context"].includes(
                  name,
                )
              )
                return;
              const record = { name, status };
              responses.push(record);
              if (name === "native_application_board_context" && status === 200)
                parsers.push(
                  response
                    .json()
                    .then((raw) => {
                      const obj = Array.isArray(raw) ? raw[0] : raw;
                      record.matches =
                        obj?.moduleId === app.moduleId &&
                        obj?.board?.id === app.boardId &&
                        obj?.userId &&
                        hash(obj.userId) === key &&
                        obj?.workspaceId === workspaceId;
                    })
                    .catch(() => {
                      record.matches = false;
                    }),
                );
            };
            page.on("response", onResponse);
            page.on("pageerror", onError);
            const result = {
              moduleId: app.moduleId,
              status: "PENDING",
              domainRpcs: [],
              pageErrors: [],
            };
            row.applications.push(result);
            try {
              await page.goto(BASE + app.route, {
                waitUntil: "domcontentloaded",
                timeout: 45000,
              });
              await page
                .locator(app.selector)
                .waitFor({ state: "visible", timeout: 25000 });
              for (
                let n = 0;
                n < 20 &&
                (!responses.some(
                  (r) => r.name === "native_application_board_context",
                ) ||
                  !responses.some((r) => app.domain.includes(r.name)));
                n++
              )
                await page.waitForTimeout(300);
              await Promise.all(parsers);
              const signed = isSignedText(
                await page.locator("body").innerText(),
              );
              const native = responses.find(
                (r) =>
                  r.name === "native_application_board_context" &&
                  r.status === 200 &&
                  r.matches,
              );
              result.domainRpcs = responses
                .filter((r) => app.domain.includes(r.name))
                .map(({ name, status }) => ({ name, status }));
              result.pageErrors = errors;
              result.status =
                signed &&
                native &&
                result.domainRpcs.some((r) => r.status === 200) &&
                !errors.length
                  ? "VERIFIED"
                  : "FAILED";
              result.nativeBoardMatch = Boolean(native);
            } catch (e) {
              const denied = responses.find(
                (r) =>
                  r.name === "native_application_board_context" &&
                  r.status === 403,
              );
              result.status = denied
                ? "FAILED_PROJECTION_NATIVE_MISMATCH"
                : "BLOCKED";
              result.nativeStatus = denied?.status || null;
              result.reason = denied
                ? "Effective-access projection allows the module, but signed native context returned HTTP 403"
                : e.message.slice(0, 160);
            } finally {
              page.off("response", onResponse);
              page.off("pageerror", onError);
            }
          }
        } finally {
          await page
            .goto(original, { waitUntil: "domcontentloaded", timeout: 45000 })
            .catch(() => {});
        }
      }
      const pair = assessSignedPair(inventory, keys);
      report.crossUserAcceptance = pair.status;
      report.crossUserReason = pair.reason;
    } catch (e) {
      report.blocker = e.message.slice(0, 220);
      process.exitCode = 1;
    } finally {
      await browser?.close().catch(() => {});
      console.log("CP_URM03_SIGNED_READONLY", JSON.stringify(report));
    }
  }
}
