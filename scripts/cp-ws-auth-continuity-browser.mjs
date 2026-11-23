import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { SUPABASE_URL } from "../frontend/config.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const fixture = "/frontend/tests/fixtures/cp-ws-auth-continuity.html";
const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "continuity@example.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
function jwt(version = "initial") {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
      jti: version,
    }),
  ).toString("base64url");
  return (
    header +
    "." +
    payload +
    "." +
    Buffer.from("test-signature").toString("base64url")
  );
}
function session(accessToken = jwt(), refreshToken = "refresh-one") {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}
async function waitForServer(url, processHandle) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null)
      throw Error("Vite server exited before readiness.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw Error("Vite server did not become ready.");
}
function installFakeAuthRoutes(context, stats) {
  const origin = new URL(SUPABASE_URL).origin;
  context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !url.pathname.startsWith("/auth/v1/"))
      return route.continue();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors, body: "" });
    if (
      url.pathname.endsWith("/token") &&
      url.searchParams.get("grant_type") === "password"
    )
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(session(jwt("password"), "refresh-one")),
      });
    if (
      url.pathname.endsWith("/token") &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      stats.refreshRequests++;
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(
          session(
            jwt("refresh-" + stats.refreshRequests),
            "refresh-" + stats.refreshRequests,
          ),
        ),
      });
    }
    if (url.pathname.endsWith("/user")) {
      stats.userRequests++;
      stats.userTokens.push(request.headers()["authorization"] || "");
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(user),
      });
    }
    if (url.pathname.endsWith("/logout"))
      return route.fulfill({ status: 204, headers: cors, body: "" });
    return route.fulfill({
      status: 404,
      headers: { ...cors, "content-type": "application/json" },
      body: '{"message":"unexpected test auth request"}',
    });
  });
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore" },
);
const profileDir = mkdtempSync(join(tmpdir(), "cp-ws-auth-continuity-"));
const executablePath = "/Applications/Chromium.app/Contents/MacOS/Chromium";
const browserOptions = { headless: true, args: ["--no-sandbox"] };
if (existsSync(executablePath)) browserOptions.executablePath = executablePath;
let context = null;
let stats = { userRequests: 0, refreshRequests: 0, userTokens: [] };
try {
  await waitForServer(baseUrl, vite);
  context = await chromium.launchPersistentContext(profileDir, browserOptions);
  installFakeAuthRoutes(context, stats);
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  await Promise.all([
    page1.goto(baseUrl + fixture),
    page2.goto(baseUrl + fixture),
  ]);
  await Promise.all([
    page1.waitForFunction(() => window.restoreState !== "pending"),
    page2.waitForFunction(() => window.restoreState !== "pending"),
  ]);
  assert.equal(
    await page1.evaluate(() => window.restoreState),
    "UNAUTHENTICATED",
  );
  assert.equal(
    await page2.evaluate(() => window.restoreState),
    "UNAUTHENTICATED",
  );

  await page1.evaluate(async () =>
    window.auth.signIn("continuity@example.invalid", "synthetic-password"),
  );
  await page2.waitForFunction(
    () => window.authEvents.some((event) => event.event === "SIGNED_IN"),
    null,
    { timeout: 10000 },
  );
  assert.equal(await page2.evaluate(() => window.auth.userId), userId);

  const beforeIdentityReads = stats.userRequests;
  await page2.evaluate(async () => {
    for (let index = 0; index < 100; index++) {
      const verified = await window.auth.getVerifiedUser();
      if (verified.id !== window.auth.userId) throw Error("Identity mismatch");
    }
  });
  assert.equal(
    stats.userRequests - beforeIdentityReads,
    1,
    "100 repeated verified-user reads should make one Auth request",
  );

  await page2.evaluate(() => {
    const provider = window.auth.provider;
    const original = provider.getSession.bind(provider);
    window.sessionReadCount = 0;
    provider.getSession = async () => {
      window.sessionReadCount++;
      return original();
    };
  });
  const tokenBenchmark = await page2.evaluate(async () => {
    const started = performance.now();
    let token = null;
    for (let index = 0; index < 1000; index++)
      token = await window.auth.token();
    return { token, elapsedMs: performance.now() - started };
  });
  assert.ok(tokenBenchmark.token, "A valid session token should be returned");
  assert.equal(
    await page2.evaluate(() => window.sessionReadCount),
    0,
    "1000 valid token reads should use the in-memory session",
  );

  const rotatedToken = await page1.evaluate(() => window.auth.refresh());
  await page2.waitForFunction(
    (token) => window.auth.accessToken === token,
    rotatedToken,
    { timeout: 10000 },
  );
  const beforePostRefreshReads = stats.userRequests;
  await page2.evaluate(async () => {
    for (let index = 0; index < 100; index++)
      await window.auth.getVerifiedUser();
  });
  assert.equal(
    stats.userRequests - beforePostRefreshReads,
    1,
    "A cross-tab token rotation should invalidate the old cache once",
  );
  assert.equal(stats.refreshRequests, 1);
  assert.ok(tokenBenchmark.elapsedMs >= 0);

  await page1.evaluate(
    ({ userId, workspaceId }) =>
      window.writeWorkspacePreference(userId, workspaceId),
    { userId, workspaceId },
  );
  await page2.waitForFunction(
    () => window.preferenceEvents.length === 1,
    null,
    { timeout: 5000 },
  );
  assert.deepEqual(await page2.evaluate(() => window.preferenceEvents[0]), {
    userId,
    workspaceId,
  });

  const signedOut = await page1.evaluate(() =>
    window.auth.signOut({ scope: "global" }),
  );
  assert.equal(signedOut, true);
  await page2.waitForFunction(() => window.expiredCount === 1, null, {
    timeout: 10000,
  });
  assert.equal(await page2.evaluate(() => window.auth.isSignedIn), false);

  await page1.evaluate(async () =>
    window.auth.signIn("continuity@example.invalid", "synthetic-password"),
  );
  await page2.waitForFunction(
    () =>
      window.authEvents.filter((event) => event.event === "SIGNED_IN")
        .length === 2,
    null,
    { timeout: 10000 },
  );
  await page1.reload();
  await page1.waitForFunction(() => window.restoreState !== "pending");
  assert.equal(await page1.evaluate(() => window.restoreState), "SIGNED_IN");
  assert.equal(await page1.evaluate(() => window.auth.userId), userId);

  await context.close();
  stats = { userRequests: 0, refreshRequests: 0, userTokens: [] };
  context = await chromium.launchPersistentContext(profileDir, browserOptions);
  installFakeAuthRoutes(context, stats);
  const restartedPage = await context.newPage();
  await restartedPage.goto(baseUrl + fixture);
  await restartedPage.waitForFunction(() => window.restoreState !== "pending");
  assert.equal(
    await restartedPage.evaluate(() => window.restoreState),
    "SIGNED_IN",
  );
  assert.equal(await restartedPage.evaluate(() => window.auth.userId), userId);
  assert.equal(
    await restartedPage.evaluate(
      ({ userId }) => window.readWorkspacePreference(userId),
      { userId },
    ),
    workspaceId,
  );
  console.log(
    "PASS: cross-window sign-in/logout, workspace preference sync, cached identity reads, 1000 in-memory token reads, cross-tab token rotation, and persistent browser-profile restart. " +
      JSON.stringify({
        userReadsBeforeRestart:
          beforePostRefreshReads - beforeIdentityReads + 1,
        refreshRequests: 1,
        tokenReadBenchmarkMs: Number(tokenBenchmark.elapsedMs.toFixed(2)),
      }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  vite.kill("SIGTERM");
  rmSync(profileDir, { recursive: true, force: true });
}
