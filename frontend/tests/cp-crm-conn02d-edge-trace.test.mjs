import assert from "node:assert/strict";
import test from "node:test";
import {
  summarize,
  validatePreflight,
} from "../../scripts/cp-crm-conn02d-edge-trace-acceptance.mjs";

const validSample = (overrides = {}) => ({
  probe: "rest-wm_list_boards",
  path: "/rest/v1/rpc/wm_list_boards",
  requestedMethod: "POST",
  requiredHeaders: ["apikey", "authorization", "content-type"],
  status: 200,
  rayId: "a5cba537bedddda2-HKG",
  allowOrigin: "*",
  allowMethods: "GET,POST,OPTIONS",
  allowHeaders: "apikey,authorization,content-type",
  maxAgeSeconds: "3600",
  ttfbMs: 120,
  totalMs: 121,
  ...overrides,
});

test("CP-CRM-CONN-02D accepts a complete production CORS preflight and extracts POP", () => {
  const result = validatePreflight(validSample());
  assert.equal(result.passed, true);
  assert.equal(result.colo, "HKG");
  assert.deepEqual(result.errors, []);
});

test("CP-CRM-CONN-02D rejects status, CORS, cache-age and missing trace evidence", () => {
  const result = validatePreflight(
    validSample({
      status: 400,
      rayId: "",
      allowOrigin: "https://unexpected.example.invalid",
      allowMethods: "GET,OPTIONS",
      allowHeaders: "apikey,content-type",
      maxAgeSeconds: "60",
    }),
  );
  assert.equal(result.passed, false);
  assert.equal(result.colo, null);
  assert.equal(result.errors.length, 7);
});

test("CP-CRM-CONN-02D summarizes timing and failures independently by Cloudflare POP", () => {
  const samples = [
    validatePreflight(
      validSample({ rayId: "one-HKG", ttfbMs: 100, totalMs: 101 }),
    ),
    validatePreflight(
      validSample({ rayId: "two-HKG", ttfbMs: 200, totalMs: 201 }),
    ),
    validatePreflight(
      validSample({
        rayId: "three-CEB",
        status: 503,
        ttfbMs: 900,
        totalMs: 901,
      }),
    ),
  ];
  const result = summarize(samples);
  assert.deepEqual(result, [
    {
      colo: "CEB",
      samples: 1,
      passed: 0,
      failed: 1,
      ttfbP50Ms: 900,
      ttfbP95Ms: 900,
      ttfbMaxMs: 900,
      totalMaxMs: 901,
    },
    {
      colo: "HKG",
      samples: 2,
      passed: 2,
      failed: 0,
      ttfbP50Ms: 100,
      ttfbP95Ms: 200,
      ttfbMaxMs: 200,
      totalMaxMs: 201,
    },
  ]);
});
