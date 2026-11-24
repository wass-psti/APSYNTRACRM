import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_PATH =
  /report|observability|metrics|prometheus|database|pooler|analytics|\/platform\/projects\//i;
const SAFE_TRACE_HEADERS = new Set([
  "x-request-id",
  "x-correlation-id",
  "x-supabase-request-id",
  "traceparent",
  "cf-ray",
  "x-amzn-trace-id",
]);

function isSupabaseHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "supabase.com" ||
    host.endsWith(".supabase.com") ||
    host === "supabase.co" ||
    host.endsWith(".supabase.co")
  );
}

function safeHost(hostname) {
  const host = hostname.toLowerCase();
  if (host.endsWith(".supabase.co") && host !== "supabase.co") {
    return "[project].supabase.co";
  }
  return host;
}

function safePath(pathname) {
  return pathname
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\b/g, "[token]")
    .replace(/\b[a-z0-9]{20,40}\b/gi, "[opaque-id]");
}

function safeErrorCode(response) {
  const content = response.content || {};
  if (
    !String(content.mimeType || "")
      .toLowerCase()
      .includes("json") ||
    typeof content.text !== "string" ||
    content.text.length > 64_000
  ) {
    return null;
  }

  try {
    const body = JSON.parse(content.text);
    const candidate =
      body.code || body.error_code || body.errorCode || body.statusCode;
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      return null;
    }
    const value = String(candidate);
    return /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function safeTraceHeaders(headers = []) {
  const result = {};
  for (const header of headers) {
    const name = String(header.name || "").toLowerCase();
    if (!SAFE_TRACE_HEADERS.has(name)) continue;
    const value = String(header.value || "").trim();
    if (value && value.length <= 256 && /^[A-Za-z0-9._:=;-]+$/.test(value)) {
      result[name] = value;
    }
  }
  return result;
}

function summarizeEntry(entry) {
  const request = entry.request || {};
  const response = entry.response || {};
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  if (!isSupabaseHost(url.hostname)) return null;

  const status = Number(response.status) || 0;
  const path = safePath(url.pathname);
  const transportError = Boolean(entry._error || entry.error);
  const reportRelated = REPORT_PATH.test(path);
  if (!reportRelated && status < 400 && !transportError) return null;

  return {
    startedAt: String(entry.startedDateTime || ""),
    host: safeHost(url.hostname),
    path,
    method: String(request.method || "GET").toUpperCase(),
    status,
    statusText: String(response.statusText || "").slice(0, 80),
    durationMs: Number.isFinite(Number(entry.time))
      ? Math.max(0, Number(entry.time))
      : null,
    mimeType: String(response.content?.mimeType || "").slice(0, 100),
    errorCode: status >= 400 ? safeErrorCode(response) : null,
    responseBytes: Number.isFinite(Number(response.content?.size))
      ? Math.max(0, Number(response.content.size))
      : null,
    reportRelated,
    transportError,
    traceHeaders: safeTraceHeaders(response.headers),
  };
}

export function analyzeDashboardHar(har) {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new TypeError("HAR file must contain log.entries");
  }

  const requests = entries.map(summarizeEntry).filter(Boolean);
  const reportRequests = requests.filter((request) => request.reportRelated);
  const failedRequests = requests.filter(
    (request) => request.status >= 400 || request.transportError,
  );

  return {
    schemaVersion: 1,
    source: "sanitized HAR request metadata",
    capturedEntries: entries.length,
    supabaseRequests: requests.length,
    reportRequestsFound: reportRequests.length,
    failedSupabaseRequests: failedRequests.length,
    requests,
    reportRequests,
    failedRequests,
    rawHeadersIncluded: false,
    requestBodiesIncluded: false,
    responseBodiesIncluded: false,
    queryStringsIncluded: false,
  };
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = resolve(
    process.argv[3] || "/tmp/cp07-dashboard-har-summary.json",
  );

  if (!inputPath) {
    console.error(
      "Usage: node scripts/cp07/analyze-dashboard-har.mjs <input.har> [output.json]",
    );
    process.exitCode = 2;
    return;
  }

  const har = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const report = analyzeDashboardHar(har);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);

  console.log(`HAR entries inspected: ${report.capturedEntries}.`);
  console.log(`Supabase requests retained: ${report.supabaseRequests}.`);
  console.log(`Report-related requests: ${report.reportRequestsFound}.`);
  console.log(`Failed Supabase requests: ${report.failedSupabaseRequests}.`);
  console.log(`Sanitized evidence: ${outputPath}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    console.error(`HAR analysis failed: ${error.message}`);
    process.exitCode = 1;
  });
}
