/**
 * CP-CRM-CONN-02D: bounded, credential-free production CORS preflight trace.
 * Sends only OPTIONS requests. It does not sign in, send API keys or bearer
 * tokens, invoke RPCs, read business data, or mutate production state.
 */
import https from "node:https";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const API_HOST = "jtlusodorfnyzgyuewkz.supabase.co";
export const APP_ORIGIN = "https://wass-psti.github.io";
export const REQUEST_TIMEOUT_MS = 15000;

export const PROBES = Object.freeze([
  Object.freeze({
    name: "rest-wm_list_boards",
    path: "/rest/v1/rpc/wm_list_boards",
    requestedMethod: "POST",
    requiredHeaders: Object.freeze(["apikey", "authorization", "content-type"]),
  }),
  Object.freeze({
    name: "rest-wm_auth_access_context",
    path: "/rest/v1/rpc/wm_auth_access_context",
    requestedMethod: "POST",
    requiredHeaders: Object.freeze(["apikey", "authorization", "content-type"]),
  }),
  Object.freeze({
    name: "auth-user",
    path: "/auth/v1/user",
    requestedMethod: "GET",
    requiredHeaders: Object.freeze(["apikey", "authorization"]),
  }),
]);

function headerList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function validatePreflight(sample) {
  const errors = [];
  const rayId = String(sample.rayId ?? "").trim();
  const colo = sample.colo ?? rayId.match(/-([A-Z]{3})$/)?.[1] ?? null;
  const methods = headerList(sample.allowMethods).map((value) =>
    value.toUpperCase(),
  );
  const allowedHeaders = headerList(sample.allowHeaders);
  const allowOrigin = String(sample.allowOrigin ?? "").trim();
  const maxAgeSeconds = Number(sample.maxAgeSeconds);

  if (sample.status !== 200)
    errors.push(`expected HTTP 200, received ${sample.status ?? "none"}`);
  if (!rayId) errors.push("Cloudflare CF-RAY response header is missing");
  if (!colo) errors.push("Cloudflare POP suffix is missing from CF-RAY");
  if (allowOrigin !== "*" && allowOrigin !== APP_ORIGIN) {
    errors.push(
      `unexpected Access-Control-Allow-Origin: ${allowOrigin || "missing"}`,
    );
  }
  if (!methods.includes(String(sample.requestedMethod ?? "").toUpperCase())) {
    errors.push(
      `Access-Control-Allow-Methods does not include ${sample.requestedMethod}`,
    );
  }
  for (const required of sample.requiredHeaders ?? []) {
    if (!allowedHeaders.includes(required.toLowerCase())) {
      errors.push(`Access-Control-Allow-Headers does not include ${required}`);
    }
  }
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 3600) {
    errors.push(
      `Access-Control-Max-Age must be at least 3600 seconds, received ${sample.maxAgeSeconds ?? "missing"}`,
    );
  }

  return { ...sample, colo, errors, passed: errors.length === 0 };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarize(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const key = sample.colo ?? "UNKNOWN";
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([colo, entries]) => {
      const ttfb = entries.map((entry) => entry.ttfbMs).filter(Number.isFinite);
      const total = entries
        .map((entry) => entry.totalMs)
        .filter(Number.isFinite);
      return {
        colo,
        samples: entries.length,
        passed: entries.filter((entry) => entry.passed).length,
        failed: entries.filter((entry) => !entry.passed).length,
        ttfbP50Ms: percentile(ttfb, 0.5),
        ttfbP95Ms: percentile(ttfb, 0.95),
        ttfbMaxMs: ttfb.length ? Math.max(...ttfb) : null,
        totalMaxMs: total.length ? Math.max(...total) : null,
      };
    });
}

function requestPreflight(probe, sequence) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    let lookupAt = null;
    let connectAt = null;
    let secureConnectAt = null;
    let ttfbMs = null;
    let completed = false;

    const finish = (sample) => {
      if (completed) return;
      completed = true;
      resolve(
        validatePreflight({
          probe: probe.name,
          path: probe.path,
          requestedMethod: probe.requestedMethod,
          requiredHeaders: [...probe.requiredHeaders],
          sequence,
          ...sample,
        }),
      );
    };

    const request = https.request(
      {
        hostname: API_HOST,
        path: probe.path,
        method: "OPTIONS",
        agent: false,
        headers: {
          Origin: APP_ORIGIN,
          "Access-Control-Request-Method": probe.requestedMethod,
          "Access-Control-Request-Headers": probe.requiredHeaders.join(","),
          Accept: "*/*",
        },
      },
      (response) => {
        ttfbMs = performance.now() - startedAt;
        response.resume();
        response.once("end", () => {
          const headers = response.headers;
          const rayId = String(headers["cf-ray"] ?? "");
          finish({
            status: response.statusCode ?? null,
            rayId,
            colo: rayId.match(/-([A-Z]{3})$/)?.[1] ?? null,
            server: String(headers.server ?? ""),
            allowOrigin: String(headers["access-control-allow-origin"] ?? ""),
            allowMethods: String(headers["access-control-allow-methods"] ?? ""),
            allowHeaders: String(headers["access-control-allow-headers"] ?? ""),
            maxAgeSeconds: headers["access-control-max-age"] ?? null,
            dnsMs: lookupAt === null ? null : lookupAt - startedAt,
            tcpMs:
              connectAt === null ? null : connectAt - (lookupAt ?? startedAt),
            tlsMs:
              secureConnectAt === null
                ? null
                : secureConnectAt - (connectAt ?? startedAt),
            ttfbMs,
            totalMs: performance.now() - startedAt,
          });
        });
      },
    );

    request.once("socket", (socket) => {
      socket.once("lookup", () => {
        lookupAt = performance.now();
      });
      socket.once("connect", () => {
        connectAt = performance.now();
      });
      socket.once("secureConnect", () => {
        secureConnectAt = performance.now();
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(`request timed out after ${REQUEST_TIMEOUT_MS}ms`),
      );
    });
    request.once("error", (error) => {
      finish({
        status: null,
        rayId: "",
        colo: null,
        error: error.message,
        dnsMs: lookupAt === null ? null : lookupAt - startedAt,
        tcpMs: connectAt === null ? null : connectAt - (lookupAt ?? startedAt),
        tlsMs:
          secureConnectAt === null
            ? null
            : secureConnectAt - (connectAt ?? startedAt),
        ttfbMs,
        totalMs: performance.now() - startedAt,
      });
    });
    request.end();
  });
}

function sampleCountFromArgs(args) {
  const raw = args
    .find((value) => value.startsWith("--samples="))
    ?.split("=")[1];
  if (raw === undefined) return 4;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("--samples must be an integer between 1 and 10");
  }
  return value;
}

export async function runAcceptance(sampleCount = 4) {
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10) {
    throw new Error("sampleCount must be an integer between 1 and 10");
  }

  const samples = [];
  for (let round = 0; round < sampleCount; round += 1) {
    for (const probe of PROBES) {
      samples.push(await requestPreflight(probe, round + 1));
      await delay(125);
    }
  }

  const failed = samples.filter((sample) => !sample.passed);
  const report = {
    milestone: "CP-CRM-CONN-02D",
    kind: "credential-free production OPTIONS trace",
    projectHost: API_HOST,
    appOrigin: APP_ORIGIN,
    samplesPerProbe: sampleCount,
    totalSamples: samples.length,
    passed: samples.length - failed.length,
    failed: failed.length,
    summaryByColo: summarize(samples),
    samples,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const report = await runAcceptance(
    sampleCountFromArgs(process.argv.slice(2)),
  );
  if (report.failed > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`CP_CRM_CONN_02D_EDGE_TRACE_FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
