/**
 * CP-CRM-CONN-02B: real Chromium acceptance for Supabase CORS preflight caching.
 * Uses a disposable browser profile and an intentionally invalid JWT against
 * a read-only RPC. The API rejects both POSTs before invoking the RPC; no data
 * is read or changed. No user browser profile or session is accessed.
 */
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP_URL = "https://wass-psti.github.io/APSYNTRACRM/";
const API_URL =
  "https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/rpc/wm_auth_access_context";
const RPC_PATH = "/rest/v1/rpc/wm_auth_access_context";
const CONFIG = readFileSync(join(ROOT, "frontend/config.js"), "utf8");
const API_KEY = CONFIG.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1];
if (!API_KEY)
  throw Error("Public Supabase client key was not found in frontend/config.js");

function chromePath() {
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
class CDPPage {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        this.events.push(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async call(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("CDP " + method + " timed out"));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(deadline);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(deadline);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw Error(result.exceptionDetails.text || "Browser evaluation failed");
    return result.result?.value;
  }
  close() {
    this.ws.close();
  }
}
async function until(fn, { attempts = 200, delay = 100 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await sleep(delay);
  }
  throw Error("Timed out waiting for disposable Chromium");
}
async function runMode(executable, cache) {
  const profile = mkdtempSync(join(tmpdir(), "apsyntra-conn02b-cors-"));
  let browser, page;
  try {
    browser = spawn(
      executable,
      [
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--user-data-dir=" + profile,
        "--remote-debugging-port=0",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    const active = join(profile, "DevToolsActivePort");
    await until(() => existsSync(active));
    const port = Number(readFileSync(active, "utf8").split("\n")[0]);
    const base = "http://127.0.0.1:" + port;
    const target = await (
      await fetch(base + "/json/new?about:blank", {
        method: "PUT",
        signal: AbortSignal.timeout(10000),
      })
    ).json();
    page = new CDPPage(target.webSocketDebuggerUrl);
    await page.ready;
    await page.call("Page.enable");
    await page.call("Runtime.enable");
    await page.call("Network.enable");
    await page.call("Page.navigate", { url: APP_URL });
    await until(() =>
      page.evaluate(
        'document.readyState==="complete" && location.origin==="https://wass-psti.github.io"',
      ),
    );
    const args = JSON.stringify({ apiUrl: API_URL, apiKey: API_KEY, cache });
    const expression =
      "(async({apiUrl,apiKey,cache})=>{" +
      'const response=await fetch(apiUrl,{method:"POST",mode:"cors",redirect:"error",cache,' +
      'headers:{apikey:apiKey,Authorization:"Bearer invalid-cp-crm-conn02b","Content-Type":"application/json"},' +
      'body:JSON.stringify({p_workspace_id:"00000000-0000-4000-8000-000000000001"})});' +
      "const body=await response.json().catch(()=>({}));" +
      "return {status:response.status,code:body.code||body.error_code||null};})(" +
      args +
      ")";
    const first = await page.evaluate(expression);
    await sleep(100);
    const optionsAfterFirst = page.events.filter(
      (event) =>
        event.method === "Network.requestWillBeSent" &&
        event.params.request.method === "OPTIONS" &&
        new URL(event.params.request.url).pathname === RPC_PATH,
    ).length;
    const second = await page.evaluate(expression);
    await sleep(150);
    const relevant = page.events.filter(
      (event) =>
        event.method === "Network.requestWillBeSent" &&
        new URL(event.params.request.url).pathname === RPC_PATH,
    );
    const options = relevant.filter(
      (event) => event.params.request.method === "OPTIONS",
    );
    const posts = relevant.filter(
      (event) => event.params.request.method === "POST",
    );
    const responses = new Map(
      page.events
        .filter((event) => event.method === "Network.responseReceived")
        .map((event) => [event.params.requestId, event.params.response]),
    );
    const preflight = options
      .map((event) => responses.get(event.params.requestId))
      .find(Boolean);
    assert.equal(
      first.status,
      401,
      "invalid JWT must be rejected before the read RPC executes",
    );
    assert.equal(
      second.status,
      401,
      "the repeated request must still reach the API",
    );
    assert.equal(posts.length, 2, "both POST requests must reach the network");
    assert.ok(preflight, "a real browser OPTIONS preflight must be observed");
    const headers = preflight.headers || {};
    const header = (name) =>
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
      )?.[1] || "";
    assert.equal(preflight.status, 200, "Supabase preflight must succeed");
    assert.equal(header("access-control-max-age"), "3600");
    assert.equal(header("access-control-allow-origin"), "*");
    for (const required of ["apikey", "authorization", "content-type"])
      assert.ok(
        header("access-control-allow-headers").toLowerCase().includes(required),
        "preflight must allow " + required,
      );
    assert.equal(
      options.length,
      cache === "default" ? 1 : 2,
      cache === "default"
        ? "default mode must reuse the preflight cache"
        : "no-store control must reproduce repeated preflights",
    );
    assert.equal(optionsAfterFirst, 1);
    return {
      cache,
      firstStatus: first.status,
      secondStatus: second.status,
      preflightRequests: options.length,
      networkPostRequests: posts.length,
      preflightStatus: preflight.status,
      maxAgeSeconds: header("access-control-max-age"),
    };
  } finally {
    page?.close();
    if (browser) {
      const exited = new Promise((resolve) => browser.once("exit", resolve));
      browser.kill("SIGTERM");
      await Promise.race([exited, sleep(1500)]);
    }
    try {
      rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch {}
  }
}
async function main() {
  const executable = chromePath();
  if (!executable) throw Error("BLOCKED: Chromium executable unavailable");
  const noStore = await runMode(executable, "no-store");
  const normal = await runMode(executable, "default");
  assert.equal(noStore.preflightRequests, 2);
  assert.equal(normal.preflightRequests, 1);
  console.log(
    "CP_CRM_CONN_02B_BROWSER_CORS_PREFLIGHT_PASS " +
      JSON.stringify({ noStore, default: normal }),
  );
}
main().catch((error) => {
  console.error("CP_CRM_CONN_02B_BROWSER_CORS_PREFLIGHT_FAIL:", error.message);
  process.exitCode = 1;
});
