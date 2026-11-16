import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = require("axe-core").source;
const executablePath =
  process.env.CHROMIUM_PATH ||
  "/Applications/Chromium.app/Contents/MacOS/Chromium";
const baseUrl =
  process.env.FM1_TEST_URL ||
  "http://127.0.0.1:5173/frontend/tests/fixtures/fm1-component.html";
const scopeA = baseUrl + "?user=fm1-user-a&workspace=fm1-workspace-a";

let devServer = null;
let browser = null;

async function ensureViteServer() {
  try {
    const response = await fetch(baseUrl);
    if (response.ok) return;
  } catch {
    // Start the local Vite server below when no server is already listening.
  }
  if (process.env.FM1_TEST_URL) {
    throw new Error(
      "FM1_TEST_URL is not reachable; refusing to start a different test server.",
    );
  }
  devServer = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (devServer.exitCode !== null) {
      throw new Error(
        "Vite exited before the FM1 browser fixture became available.",
      );
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Wait for the local development server to become ready.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the FM1 Vite test server.");
}

try {
  await ensureViteServer();
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(scopeA, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByText("Awaiting acceptance").first().waitFor();

  await page.addScriptTag({ content: axeSource });
  const checkAccessibility = async (label) => {
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    assert.equal(
      result.violations.length,
      0,
      label +
        " accessibility violations: " +
        JSON.stringify(
          result.violations.map((item) => ({
            id: item.id,
            impact: item.impact,
            nodes: item.nodes.map((node) => node.target),
          })),
        ),
    );
  };

  await checkAccessibility("FM1 overview");
  await page.getByRole("button", { name: "Tickets" }).click();
  await page.getByRole("heading", { name: "Ticket intake & queue" }).waitFor();
  await page.locator('[data-fm1-action="new-ticket"]').first().click();
  await page.getByRole("heading", { name: "New service request" }).waitFor();

  await page.locator('input[name="requesterName"]').fill("FM1 Operator");
  await page.locator('input[name="callbackNumber"]').fill("+63 917 123 4567");
  await page.locator('input[name="subject"]').fill("WinCC station unavailable");
  await page.locator('select[name="priority"]').selectOption("P2");
  await page
    .locator('select[name="productionImpact"]')
    .selectOption("degraded");
  await page
    .locator('textarea[name="description"]')
    .fill(
      "Operator reports that the WinCC station is unavailable following a recent restart.",
    );
  await page.locator('input[name="assetReference"]').fill("FM1-WINCC-01");
  await page.locator('input[name="productionStopped"]').check();

  await checkAccessibility("FM1 intake form");
  await page.getByRole("button", { name: "Save local draft" }).click();
  await page.getByText("WinCC station unavailable").waitFor();
  await page.getByText(/LOCAL-DRAFT-/).waitFor();
  await page.getByText("Local draft · Not submitted").waitFor();
  const storedDraft = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("apsyntra-fm1-local-drafts", 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("intakeDrafts", "readonly");
          const request = transaction
            .objectStore("intakeDrafts")
            .index("scopeKey")
            .getAll("fm1-user-a::fm1-workspace-a");
          request.onsuccess = () => resolve(request.result[0] || null);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
  assert.equal(
    storedDraft?.productionStopped,
    true,
    "production-stopped checkbox must persist independently of the impact selector",
  );
  assert.equal(storedDraft?.scopeKey, "fm1-user-a::fm1-workspace-a");

  const replaceScope = async (userId, workspaceId) =>
    page.locator("fm1-application").evaluate(
      (element, scope) => {
        const replacement = document.createElement("fm1-application");
        replacement.setAttribute("data-user-id", scope.userId);
        replacement.setAttribute("data-workspace-id", scope.workspaceId);
        element.replaceWith(replacement);
      },
      { userId, workspaceId },
    );

  // Same-document remount simulates the CRM shell replacing the application after a workspace/account switch.
  await replaceScope("fm1-user-b", "fm1-workspace-b");
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByRole("button", { name: "Tickets" }).click();
  await page.getByRole("heading", { name: "No intake drafts yet" }).waitFor();

  await replaceScope("fm1-user-a", "fm1-workspace-a");
  await page.getByRole("heading", { name: /FM1 SLA Ticketing/ }).waitFor();
  await page.getByRole("button", { name: "Tickets" }).click();
  await page.getByText("WinCC station unavailable").waitFor();
  await page.getByText("Local draft · Not submitted").waitFor();

  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    app: document.querySelector(".fm1-app")?.scrollWidth || 0,
  }));
  assert.ok(
    overflow.document <= overflow.viewport,
    "FM1 mobile layout overflows horizontally: " + JSON.stringify(overflow),
  );

  await page.locator('[data-fm1-action="delete-draft"]').click();
  await page.getByRole("heading", { name: "No intake drafts yet" }).waitFor();
  assert.deepEqual(
    pageErrors,
    [],
    "browser console/page errors: " + pageErrors.join(" | "),
  );

  console.log("FM1_BROWSER_ACCEPTANCE_PASS");
  console.log(
    "Desktop overview, ticket navigation, intake validation, scoped IndexedDB draft save/read/delete, cross-user/workspace isolation, 360px layout and WCAG 2.2 AA axe checks passed.",
  );
} finally {
  if (browser) await browser.close();
  if (devServer && devServer.exitCode === null) {
    const exited = new Promise((resolve) => devServer.once("exit", resolve));
    devServer.kill("SIGTERM");
    await exited;
  }
}
