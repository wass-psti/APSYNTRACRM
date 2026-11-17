import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const executablePath =
  process.env.CHROMIUM_PATH ||
  "/Applications/Chromium.app/Contents/MacOS/Chromium";
const baseUrl =
  "http://127.0.0.1:5175/frontend/tests/fixtures/platform-sync-lease.html";
const user = "20000000-0000-4000-8000-000000000001";
const workspace = "10000000-0000-4000-8000-000000000001";
let server;
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5175/");
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Vite server did not become ready");
}

try {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort",
    ],
    {
      stdio: "ignore",
    },
  );
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const pages = await Promise.all([
    context.newPage(),
    context.newPage(),
    context.newPage(),
  ]);
  await Promise.all(
    pages.map((page) =>
      page.goto(`${baseUrl}?user=${user}&workspace=${workspace}`),
    ),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(() => typeof window.__leader === "boolean"),
    ),
  );
  await delay(300);

  const leaders = async () =>
    Promise.all(pages.map((page) => page.evaluate(() => window.__leader)));
  let states = await leaders();
  assert.equal(
    states.filter(Boolean).length,
    1,
    `expected one leader across three tabs; got ${states}`,
  );
  const currentLeader = pages[states.findIndex(Boolean)];
  await currentLeader.evaluate(() => window.__lease.stop());
  await delay(6500);
  states = await leaders();
  assert.equal(
    states.filter(Boolean).length,
    1,
    `expected one successor after lease release; got ${states}`,
  );

  const isolated = await context.newPage();
  await isolated.goto(
    `${baseUrl}?user=${user}&workspace=10000000-0000-4000-8000-000000000002`,
  );
  await isolated.waitForFunction(() => window.__leader === true);
  assert.equal(
    await isolated.evaluate(() => window.__leader),
    true,
    "a separate workspace scope must elect its own leader",
  );

  console.log("PLATFORM_SYNC_MULTITAB_ACCEPTANCE PASS");
  console.log(
    "- Three same-scope tabs elected exactly one Realtime/polling leader.",
  );
  console.log("- Releasing the leader lease elected exactly one successor.");
  console.log("- A different workspace elected an independent leader.");
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && !server.killed) server.kill("SIGTERM");
}
