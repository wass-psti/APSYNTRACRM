/**
 * CP-CRM-NATIVE-04B4 — existing independent signed Chrome profile attestation.
 * Read-only: no credentials, cookie values, JWT or business records are stored,
 * printed, forwarded, or used to create transactions.
 *
 * node scripts/cp-crm-native04b4-independent-session-preflight.mjs \
 * --manifest=/private/path/approved-qa-plan.json \
 * --session=tradeAuthor:http://127.0.0.1:9225 \
 * --session=tradePrimaryReviewer:http://127.0.0.1:9226 \
 * --session=tradeSecondaryReviewer:http://127.0.0.1:9227
 */
import { readFileSync } from "node:fs";
import { assessQaManifest } from "./cp-crm-native04b1-qa-manifest.mjs";

const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
const USER_API = "https://jtlusodorfnyzgyuewkz.supabase.co/auth/v1/user";
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const roles = new Set([
  "attendanceEmployee",
  "fundRequester",
  "fundFinanceReviewer",
  "fundGMVerifier",
  "fuelRequester",
  "fuelApprover",
  "tradeAuthor",
  "tradePrimaryReviewer",
  "tradeSecondaryReviewer",
]);
const appOf = {
  attendanceEmployee: "#/time-tracker",
  fundRequester: "#/fund-tracker",
  fundFinanceReviewer: "#/fund-tracker",
  fundGMVerifier: "#/fund-tracker",
  fuelRequester: "#/fueltrack",
  fuelApprover: "#/fueltrack",
  tradeAuthor: "#/tradelink/documents",
  tradePrimaryReviewer: "#/tradelink/documents",
  tradeSecondaryReviewer: "#/tradelink/documents",
};

/**
 * Pure, tested comparison of live signed subject IDs with an explicitly
 * approved (private, local) plan. This cannot authorize production writes.
 */
export function evaluateIndependentSessions(manifest, observations) {
  const issues = [];
  const rolesSeen = new Set();
  const portsSeen = new Set();
  const subjectsSeen = new Set();
  if (!Array.isArray(observations) || observations.length < 2)
    issues.push("At least two independently authenticated roles are required.");
  for (const item of observations || []) {
    if (!roles.has(item.role)) {
      issues.push("Unsupported application role in session evidence.");
      continue;
    }
    if (rolesSeen.has(item.role)) issues.push("Duplicate actor role.");
    rolesSeen.add(item.role);
    if (portsSeen.has(item.port))
      issues.push("Separate actors cannot reuse one browser endpoint.");
    portsSeen.add(item.port);
    if (!UUID.test(item.subject || ""))
      issues.push(
        "Signed subject must come from a successful Auth user response.",
      );
    else {
      if (subjectsSeen.has(item.subject))
        issues.push(
          "Independent reviewers must use distinct authenticated users.",
        );
      subjectsSeen.add(item.subject);
      if (item.subject !== manifest?.identities?.[item.role])
        issues.push("Signed user differs from privately designated role.");
    }
    if (!item.authenticated || !item.secure)
      issues.push(
        "Signed CRM startup and secure session UI must be authenticated.",
      );
    if (item.route !== appOf[item.role])
      issues.push(
        "Signed application route did not match the acceptance scope.",
      );
    if (item.requestFailures !== 0 || item.pageErrors !== 0)
      issues.push("Unexpected network or JavaScript errors.");
  }
  return {
    status: issues.length
      ? "BLOCKED"
      : "INDEPENDENT_SIGNED_IDENTITIES_VERIFIED",
    issues: [...new Set(issues)],
    independentlyVerifiedAccounts: subjectsSeen.size,
    productionWritesAuthorized: false,
    productionBusinessWrites: 0,
    transactionReadback: "NOT_TESTED",
    domainRoleChecks: "NOT_TESTED",
  };
}

function parseArgs(args) {
  const plan = args.find((v) => v.startsWith("--manifest="))?.slice(11);
  const entries = args
    .filter((v) => v.startsWith("--session="))
    .map((raw) => {
      const match =
        /^--session=([a-zA-Z]+):(http:\/\/127\.0\.0\.1:(\d+))$/.exec(raw);
      if (!match || !roles.has(match[1]))
        throw new Error(
          "Session must specify a supported actor and loopback Chromium CDP port.",
        );
      return { role: match[1], endpoint: match[2], port: Number(match[3]) };
    });
  if (!plan) throw new Error("A private manifest path must be provided.");
  if (
    entries.length < 2 ||
    new Set(entries.map((v) => v.port)).size !== entries.length
  )
    throw new Error(
      "At least two different loopback browser ports are required.",
    );
  if (new Set(entries.map((v) => v.role)).size !== entries.length)
    throw new Error("Each actor may be specified only once.");
  return { plan, entries };
}

async function observe(entry) {
  // Browser automation is optional for offline/CI contract validation.
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(entry.endpoint, {
    timeout: 7000,
  });
  let page;
  let originalRoute;
  let collector;
  try {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find(
        (candidate) =>
          candidate.url().startsWith(BASE) && !candidate.isClosed(),
      );
    if (!page) throw new Error("Existing signed CRM tab unavailable.");
    originalRoute = page.url();
    let identity = null;
    let requestFailures = 0;
    let pageErrors = 0;
    collector = async (response) => {
      if (
        response.url().split("?")[0] !== USER_API ||
        response.status() !== 200
      )
        return;
      try {
        const json = await response.json();
        if (UUID.test(json.id || "")) identity = json.id;
      } catch {
        // Do not save or log user response payloads.
      }
    };
    page.on("response", collector);
    const onFailed = (request) => {
      if (new URL(request.url()).hostname.endsWith("supabase.co"))
        requestFailures++;
    };
    const onError = () => {
      pageErrors++;
    };
    page.on("requestfailed", onFailed);
    page.on("pageerror", onError);
    await page.goto(BASE + appOf[entry.role], {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForFunction(
      () =>
        window.__APSYNTRA_STARTUP?.state === "AUTHENTICATED" &&
        document.body.innerText.includes("Secure session"),
      null,
      { timeout: 25000 },
    );
    await page.waitForTimeout(1200);
    // Do not read browser storage or OAuth/Authorization request headers.
    // Auth identity must be observed through the application's normal /user
    // response in this same existing signed browser session.
    const ui = await page.evaluate(() => ({
      authenticated: window.__APSYNTRA_STARTUP?.state === "AUTHENTICATED",
      secure: document.body.innerText.includes("Secure session"),
      route: location.hash,
    }));
    page.off("response", collector);
    page.off("requestfailed", onFailed);
    page.off("pageerror", onError);
    return {
      role: entry.role,
      port: entry.port,
      subject: identity,
      authenticated: ui.authenticated,
      secure: ui.secure,
      route: ui.route,
      requestFailures,
      pageErrors,
    };
  } finally {
    if (page && collector) page.off("response", collector);
    if (page && originalRoute && !page.isClosed())
      await page
        .goto(originalRoute, { waitUntil: "domcontentloaded", timeout: 45000 })
        .catch(() => {});
    await browser.close();
  }
}

export async function main(args) {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch {
    console.error(
      "BLOCKED: Provide a private QA manifest and two distinct loopback signed browser endpoints.",
    );
    return 2;
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(parsed.plan, "utf8"));
  } catch {
    console.error("BLOCKED: Private QA manifest cannot be read.");
    return 2;
  }
  const gate = assessQaManifest(plan);
  if (gate.status !== "READY_FOR_INDEPENDENT_HUMAN_REVIEW") {
    console.log(
      JSON.stringify({
        status: "BLOCKED",
        cause: "QA_MANIFEST_INVALID",
        productionWritesAuthorized: false,
      }),
    );
    return 2;
  }
  const observations = [];
  for (const entry of parsed.entries) {
    try {
      observations.push(await observe(entry));
    } catch {
      // Do not leak session data or error details from third-party profiles.
      console.log(
        JSON.stringify({
          status: "BLOCKED",
          cause: "SIGNED_PROFILE_UNAVAILABLE_OR_UNVERIFIED",
          rolesVerified: observations.length,
          productionWritesAuthorized: false,
        }),
      );
      return 2;
    }
  }
  const verdict = evaluateIndependentSessions(plan, observations);
  // Never print browser port, account UUID, identity data, tokens or record contents.
  console.log(
    JSON.stringify(
      {
        status: verdict.status,
        issues: verdict.issues,
        independentlyVerifiedAccounts: verdict.independentlyVerifiedAccounts,
        productionWritesAuthorized: false,
        productionBusinessWrites: 0,
        transactionReadback: verdict.transactionReadback,
        domainRoleChecks: verdict.domainRoleChecks,
      },
      null,
      2,
    ),
  );
  return verdict.status === "INDEPENDENT_SIGNED_IDENTITIES_VERIFIED" ? 0 : 2;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  process.exitCode = await main(process.argv.slice(2));
