import test from "node:test";
import assert from "node:assert/strict";
import { parsePrometheusMetrics } from "../../scripts/cp06/metrics-parser.mjs";
import { analyzeMetricSamples } from "../../scripts/cp06/metrics-analysis.mjs";
import { captureMetrics } from "../../scripts/cp06/metrics-capture.mjs";

const fixture = `# HELP node_cpu_seconds_total Seconds spent in each CPU mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{service_type="db",cpu="0",mode="idle"} 100 1730000000000
node_cpu_seconds_total{cpu="1",mode="idle"} 110 1730000000000
node_cpu_seconds_total{service_type="db",cpu="0",mode="user"} 20 1730000000000
node_cpu_seconds_total{cpu="1",mode="user"} 30 1730000000000
process_cpu_seconds_total{service="postgres",instance="db-1"} 5
custom_metric{label="escaped\\\"quote",path="a\\nb"} 2.5
`;

test("parses Prometheus samples, labels, comments, timestamps and escaped label values", () => {
  const samples = parsePrometheusMetrics(fixture);
  assert.equal(samples.length, 6);
  assert.deepEqual(samples[0], {
    name: "node_cpu_seconds_total",
    labels: { service_type: "db", cpu: "0", mode: "idle" },
    value: 100,
  });
  assert.equal(samples[4].labels.service, "postgres");
  assert.equal(samples[5].labels.label, 'escaped"quote');
  assert.equal(samples[5].labels.path, "a\nb");
});

test("rejects malformed metric lines with a line number", () => {
  assert.throws(
    () => parsePrometheusMetrics("# comment\nnot a metric"),
    /line 2/,
  );
  assert.throws(() => parsePrometheusMetrics("metric{x=unquoted} 1"), /line 1/);
});

test("calculates host CPU active execution, I/O wait, steal and service CPU deltas", () => {
  const samples = [
    {
      capturedAt: "2026-11-23T10:00:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "idle" },
          value: 100,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "user" },
          value: 20,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "iowait" },
          value: 5,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "steal" },
          value: 2,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "guest" },
          value: 4,
        },
        {
          name: "process_cpu_seconds_total",
          labels: { service_type: "postgresql" },
          value: 5,
        },
        {
          name: "node_disk_reads_completed_total",
          labels: { service_type: "db", device: "disk0" },
          value: 10,
        },
        {
          name: "pg_stat_database_xact_commit_total",
          labels: { service_type: "postgresql", server: "localhost:5432" },
          value: 100,
        },
        {
          name: "pg_stat_database_num_backends",
          labels: { service_type: "postgresql", server: "localhost:5432" },
          value: 20,
        },
        {
          name: "pgbouncer_pools_client_active_connections",
          labels: {
            service_type: "db",
            database: "pgbouncer",
            user: "pgbouncer",
          },
          value: 2,
        },
      ],
    },
    {
      capturedAt: "2026-11-23T10:01:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "idle" },
          value: 154,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "user" },
          value: 32,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "iowait" },
          value: 8,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "steal" },
          value: 3,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "guest" },
          value: 8,
        },
        {
          name: "process_cpu_seconds_total",
          labels: { service_type: "postgresql" },
          value: 11,
        },
        {
          name: "node_disk_reads_completed_total",
          labels: { service_type: "db", device: "disk0" },
          value: 18,
        },
        {
          name: "pg_stat_database_xact_commit_total",
          labels: { service_type: "postgresql", server: "localhost:5432" },
          value: 125,
        },
        {
          name: "pg_stat_database_num_backends",
          labels: { service_type: "postgresql", server: "localhost:5432" },
          value: 24,
        },
        {
          name: "pgbouncer_pools_client_active_connections",
          labels: {
            service_type: "db",
            database: "pgbouncer",
            user: "pgbouncer",
          },
          value: 3,
        },
      ],
    },
  ];

  const result = analyzeMetricSamples(samples);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.intervalCount, 1);
  assert.equal(result.durationSeconds, 60);
  assert.ok(
    Math.abs(result.cpu.meanActiveExecutionPercent - (12 / 70) * 100) < 1e-10,
  );
  assert.ok(Math.abs(result.cpu.meanIoWaitPercent - (3 / 70) * 100) < 1e-10);
  assert.ok(Math.abs(result.cpu.meanStealPercent - (1 / 70) * 100) < 1e-10);
  assert.ok(Math.abs(result.cpu.meanNonIdlePercent - (16 / 70) * 100) < 1e-10);
  assert.equal(result.processCpu.postgresql.meanPercentOfOneCore, 10);
  assert.equal(
    result.intervals[0].counterDeltas.node_disk_reads_completed_total,
    8,
  );
  assert.equal(
    result.intervals[0].counterDeltas.pg_stat_database_xact_commit_total,
    25,
  );
  assert.equal(result.intervals[0].gauges.pg_stat_database_num_backends, 24);
  assert.equal(
    result.intervals[0].gauges.pgbouncer_pools_client_active_connections,
    3,
  );
});

test("handles counter resets without reporting negative utilization", () => {
  const samples = [
    {
      capturedAt: "2026-11-23T10:00:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "idle" },
          value: 100,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "user" },
          value: 20,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "guest" },
          value: 4,
        },
      ],
    },
    {
      capturedAt: "2026-11-23T10:01:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "idle" },
          value: 10,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "user" },
          value: 25,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", mode: "guest" },
          value: 5,
        },
      ],
    },
  ];
  const result = analyzeMetricSamples(samples);
  assert.equal(result.counterResets, 1);
  assert.equal(result.cpu, null);
});

test("requires at least two successful metrics samples", () => {
  assert.throws(() => analyzeMetricSamples([]), /At least two/);
});

test("aggregates a 31-sample window and reports interval percentiles", () => {
  const samples = [];
  for (let index = 0; index < 31; index += 1) {
    const base = index * 60;
    samples.push({
      capturedAt: new Date(
        Date.parse("2026-11-23T10:00:00.000Z") + index * 60_000,
      ).toISOString(),
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "idle" },
          value: 100 + base * 0.9,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "user" },
          value: 20 + base * 0.2,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "iowait" },
          value: 5 + base * 0.05,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "steal" },
          value: 2 + base * (1 / 60),
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "guest" },
          value: 4 + base * 0.1,
        },
      ],
    });
  }

  const result = analyzeMetricSamples(samples);
  assert.equal(result.sampleCount, 31);
  assert.equal(result.intervalCount, 30);
  assert.equal(result.durationSeconds, 1800);
  assert.equal(result.cpu.validIntervals, 30);
  assert.ok(
    Math.abs(result.cpu.meanActiveExecutionPercent - (12 / 70) * 100) < 1e-9,
  );
  assert.ok(
    Math.abs(
      result.cpu.p50ActiveExecutionPercent -
        result.cpu.meanActiveExecutionPercent,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      result.cpu.p95ActiveExecutionPercent -
        result.cpu.meanActiveExecutionPercent,
    ) < 1e-9,
  );
});

test("does not calculate CPU utilization when CPU series appear or disappear mid-window", () => {
  const samples = [
    {
      capturedAt: "2026-11-23T10:00:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "idle" },
          value: 100,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "user" },
          value: 20,
        },
      ],
    },
    {
      capturedAt: "2026-11-23T10:01:00.000Z",
      metrics: [
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "idle" },
          value: 154,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "0", mode: "user" },
          value: 32,
        },
        {
          name: "node_cpu_seconds_total",
          labels: { service_type: "db", cpu: "1", mode: "idle" },
          value: 10,
        },
      ],
    },
  ];
  const result = analyzeMetricSamples(samples);
  assert.equal(result.cpu, null);
  assert.equal(result.seriesChanges, 1);
});

test("records an HTTP failure using the request start time", async () => {
  const fixedTime = new Date("2026-11-24T02:50:00.000Z");
  const messages = [];
  const result = await captureMetrics({
    endpoint: "https://example.invalid/metrics",
    authorization: "Basic test-only",
    sampleCount: 1,
    intervalMs: 60_000,
    timeoutMs: 1_000,
    fetchImpl: async () => ({ ok: false, status: 503 }),
    now: () => fixedTime,
    sleep: async () => {},
    onMessage: (message) => messages.push(message),
  });

  assert.equal(result.samples.length, 0);
  assert.deepEqual(result.failures, [
    {
      index: 1,
      capturedAt: fixedTime.toISOString(),
      status: 503,
    },
  ]);
  assert.ok(messages.some((message) => message.includes("HTTP 503")));
});

test("sanitizes request exceptions and does not retain error details", async () => {
  const fixedTime = new Date("2026-11-24T02:51:00.000Z");
  const requestError = new Error("private response body must not be retained");
  requestError.name = "AbortError";

  const result = await captureMetrics({
    endpoint: "https://example.invalid/metrics",
    authorization: "Basic test-only",
    sampleCount: 1,
    intervalMs: 60_000,
    timeoutMs: 1_000,
    fetchImpl: async () => {
      throw requestError;
    },
    now: () => fixedTime,
    sleep: async () => {},
  });

  assert.deepEqual(result.failures, [
    {
      index: 1,
      capturedAt: fixedTime.toISOString(),
      error: "timeout",
    },
  ]);
  assert.equal(JSON.stringify(result).includes("private response body"), false);
});

test("captures valid Prometheus samples without retaining authorization", async () => {
  const fixedTime = new Date("2026-11-24T03:05:00.000Z");
  let requestHeaders;

  const result = await captureMetrics({
    endpoint: "https://example.invalid/metrics",
    authorization: "Basic test-only-secret",
    sampleCount: 1,
    intervalMs: 60_000,
    timeoutMs: 1_000,
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      return {
        ok: true,
        text: async () =>
          'node_cpu_seconds_total{service_type="db",cpu="0",mode="idle"} 100',
      };
    },
    now: () => fixedTime,
    sleep: async () => {},
  });

  assert.equal(requestHeaders.Authorization, "Basic test-only-secret");
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].capturedAt, fixedTime.toISOString());
  assert.equal(result.samples[0].metrics[0].name, "node_cpu_seconds_total");
  assert.equal(JSON.stringify(result).includes("test-only-secret"), false);
});
