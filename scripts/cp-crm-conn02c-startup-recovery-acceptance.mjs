/**
 * CP-CRM-CONN-02C: disposable Chromium acceptance for transient entry-module
 * failure and recovery. A single static dependency returns synthetic HTTP 503
 * on the first navigation; the built-in recovery reload must then initialize
 * the app. No user profile, credentials, tokens, or business data are used.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const APP_URL = "https://wass-psti.github.io/APSYNTRACRM/#/overview";

function chromiumPath() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((path) => path && existsSync(path));
}

async function runSignedSessionRecovery(executable) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const userId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  let authCalls = 0;
  const authStatuses = [];
  const rpcCalls = [];
  let releaseThirdRequest;
  let markThirdRequestStarted;
  const thirdRequestGate = new Promise((resolve) => {
    releaseThirdRequest = resolve;
  });
  const thirdRequestStarted = new Promise((resolve) => {
    markThirdRequestStarted = resolve;
  });
  const pageErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(
    ({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)),
    {
      key: "apsyntra.crm.auth.v1",
      value: {
        access_token: "synthetic-signed-access",
        refresh_token: "synthetic-signed-refresh",
        expires_at: Date.now() + 3600000,
        user: { id: userId, email: "signed-user@example.invalid" },
      },
    },
  );
  await page.route(
    "https://jtlusodorfnyzgyuewkz.supabase.co/**",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "apikey,authorization,content-type",
        "access-control-max-age": "3600",
        "content-type": "application/json",
      };
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers, body: "" });
        return;
      }
      if (path === "/auth/v1/user") {
        authCalls += 1;
        if (authCalls <= 2) {
          authStatuses.push(503);
          await route.fulfill({
            status: 503,
            headers,
            body: JSON.stringify({
              message: "synthetic transient verification failure",
            }),
          });
          return;
        }
        if (authCalls === 3) {
          markThirdRequestStarted();
          await thirdRequestGate;
        }
        authStatuses.push(200);
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            id: userId,
            email: "signed-user@example.invalid",
          }),
        });
        return;
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").pop();
        rpcCalls.push(name);
        const value =
          name === "wm_auth_access_context"
            ? {
                user_id: userId,
                workspace_id: workspaceId,
                profile: { status: "active", platform_role: "member" },
              }
            : name === "wm_list_boards"
              ? []
              : false;
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(value),
        });
        return;
      }
      await route.fulfill({ status: 200, headers, body: "[]" });
    },
  );

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => window.__APSYNTRA_STARTUP?.state === "RECOVERABLE_ERROR",
      { timeout: 30000 },
    );
    assert.equal(
      authCalls,
      2,
      "one bounded startup retry follows the initial transient failure",
    );
    assert.deepEqual(authStatuses, [503, 503]);

    await page.evaluate(() => {
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(new Event("online"));
      }
    });
    await thirdRequestStarted;
    await page
      .evaluate(() => {
        for (let index = 0; index < 5; index += 1) {
          window.dispatchEvent(new Event("online"));
        }
        return Array.from({ length: 5 }, () =>
          window.__APSYNTRA_STARTUP.begin(),
        );
      })
      .then((results) => {
        assert.deepEqual(results, [false, false, false, false, false]);
      });
    await page.waitForTimeout(150);
    assert.equal(
      authCalls,
      3,
      "repeated online events must not start duplicate boot flows",
    );

    releaseThirdRequest();
    await page.waitForFunction(
      () =>
        window.__APSYNTRA_STARTUP?.state === "AUTHENTICATED" &&
        document
          .querySelector("#app")
          ?.innerText?.includes("Current workspace"),
      { timeout: 45000 },
    );
    assert.deepEqual(authStatuses.slice(0, 3), [503, 503, 200]);
    assert.ok(rpcCalls.includes("wm_auth_access_context"));
    assert.ok(rpcCalls.includes("wm_list_boards"));
    assert.deepEqual(pageErrors, []);

    console.log(
      "CP_CRM_CONN_02C_SIGNED_SESSION_RECOVERY_PASS " +
        JSON.stringify({
          authCallsBeforeRecovery: 2,
          authCallsWhileRecoveryPending: 3,
          repeatedOnlineEvents: 10,
          authStatuses: authStatuses.slice(0, 3),
          rpcCalls: rpcCalls.slice(0, 8),
          startup: "AUTHENTICATED",
        }),
    );
  } finally {
    releaseThirdRequest();
    await context.close();
    await browser.close();
  }
}

async function reserveLocalPort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForLocalApp(url, server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null)
      throw Error("Vite dev server exited before becoming ready");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw Error("Vite dev server did not become ready within 8 seconds");
}

async function runSignInAcceptance(executable) {
  const port = await reserveLocalPort();
  const viteEntry = new URL("../node_modules/vite/bin/vite.js", import.meta.url)
    .pathname;
  const localAppUrl = `http://127.0.0.1:${port}/#/overview`;
  const server = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  await waitForLocalApp(`http://127.0.0.1:${port}/`, server);

  const browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const userId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  let tokenCalls = 0;
  let verifiedUserCalls = 0;
  const rpcCalls = [];
  const pageErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "apsyntra.crm.auth.v1") {
        throw new DOMException(
          "Synthetic storage quota failure",
          "QuotaExceededError",
        );
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.route(
    "https://jtlusodorfnyzgyuewkz.supabase.co/**",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "apikey,authorization,content-type",
        "access-control-max-age": "3600",
        "content-type": "application/json",
      };
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers, body: "" });
        return;
      }
      if (path === "/auth/v1/token") {
        tokenCalls += 1;
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            access_token: "synthetic-login-access",
            refresh_token: "synthetic-login-refresh",
            expires_in: 3600,
            user: { id: userId, email: "synthetic.user@example.invalid" },
          }),
        });
        return;
      }
      if (path === "/auth/v1/user") {
        verifiedUserCalls += 1;
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({
            id: userId,
            email: "synthetic.user@example.invalid",
          }),
        });
        return;
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").pop();
        rpcCalls.push(name);
        const value =
          name === "wm_auth_access_context"
            ? {
                user_id: userId,
                workspace_id: workspaceId,
                profile: { status: "active", platform_role: "member" },
              }
            : name === "wm_list_boards"
              ? []
              : false;
        await route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify(value),
        });
        return;
      }
      await route.fulfill({ status: 200, headers, body: "[]" });
    },
  );

  try {
    await page.goto(localAppUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(
      () =>
        window.__APSYNTRA_STARTUP?.state === "UNAUTHENTICATED" &&
        Boolean(document.querySelector("#login-form")),
      { timeout: 45000 },
    );
    await page.locator("#email").fill("synthetic.user@example.invalid");
    await page.locator("#password").fill("Synthetic-Only-Password");
    await page.locator("#login-submit").click();
    await page.waitForFunction(
      () =>
        Boolean(
          document
            .querySelector("#app")
            ?.innerText?.includes("Current workspace"),
        ) && !document.querySelector("#login-form"),
      { timeout: 45000 },
    );

    assert.equal(tokenCalls, 1);
    assert.ok(verifiedUserCalls >= 1);
    assert.ok(rpcCalls.includes("wm_auth_access_context"));
    assert.ok(rpcCalls.includes("wm_list_boards"));
    assert.deepEqual(pageErrors, []);
    console.log(
      "CP_CRM_CONN_02C_SIGN_IN_STORAGE_FAILURE_PASS " +
        JSON.stringify({
          syntheticTokenExchanges: tokenCalls,
          providerIdentityVerifications: verifiedUserCalls,
          storageWriteFailuresInjected: true,
          workspaceLoaded: true,
        }),
    );
  } finally {
    await context.close();
    await browser.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null || server.signalCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
}

async function main() {
  const executable = chromiumPath();
  if (!executable) throw Error("BLOCKED: Chromium executable unavailable");

  const browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let moduleRequests = 0;
  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/frontend/data.js", async (route) => {
    moduleRequests += 1;
    if (moduleRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "synthetic transient module failure",
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(APP_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(
      () =>
        Boolean(document.querySelector(".aps-init-retry")) ||
        Boolean(document.querySelector("#app")?.innerText?.length),
      { timeout: 45000 },
    );

    const first = await page.evaluate(() => ({
      startup: window.__APSYNTRA_STARTUP?.state ?? null,
      retryVisible: Boolean(document.querySelector(".aps-init-retry")),
      appText: document.querySelector("#app")?.innerText?.slice(0, 180) ?? "",
    }));
    assert.equal(first.startup, "FATAL_ERROR");
    assert.equal(first.retryVisible, true);

    await page.locator(".aps-init-retry").click();
    await page.waitForFunction(
      () =>
        window.__APSYNTRA_STARTUP?.state === "UNAUTHENTICATED" &&
        document
          .querySelector("#app")
          ?.innerText?.includes("Sign in with your existing work account"),
      { timeout: 60000 },
    );

    const recovered = await page.evaluate(() => ({
      startup: window.__APSYNTRA_STARTUP?.state ?? null,
      signInVisible:
        document
          .querySelector("#app")
          ?.innerText?.includes("Sign in with your existing work account") ??
        false,
      retryVisible: Boolean(document.querySelector(".aps-init-retry")),
      resourceCount: performance.getEntriesByType("resource").length,
    }));
    assert.equal(moduleRequests, 2);
    assert.equal(recovered.startup, "UNAUTHENTICATED");
    assert.equal(recovered.signInVisible, true);
    assert.equal(recovered.retryVisible, false);
    assert.deepEqual(pageErrors, []);
    assert.equal(consoleErrors.length, 1);
    assert.ok(
      consoleErrors[0].includes("503"),
      "only the injected transient failure may be logged",
    );

    console.log(
      "CP_CRM_CONN_02C_STARTUP_RECOVERY_PASS " +
        JSON.stringify({
          injectedTransientFailures: 1,
          moduleRequests,
          first,
          recovered,
        }),
    );
  } finally {
    await context.close();
    await browser.close();
  }
  await runSignedSessionRecovery(executable);
  await runSignInAcceptance(executable);
}

main().catch((error) => {
  console.error("CP_CRM_CONN_02C_STARTUP_RECOVERY_FAIL:", error.message);
  process.exitCode = 1;
});
