import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { captureMetrics } from "./metrics-capture.mjs";
import { analyzeMetricSamples } from "./metrics-analysis.mjs";

const projectRef = process.env.SUPABASE_PROJECT_REF || "jtlusodorfnyzgyuewkz";
const secretKey = process.env.SUPABASE_METRICS_SECRET_KEY;
const sampleCount = Number(process.env.CP06_SAMPLE_COUNT || 31);
const intervalMs = Number(process.env.CP06_INTERVAL_MS || 60_000);
const timeoutMs = Number(process.env.CP06_REQUEST_TIMEOUT_MS || 15_000);
const outputPath = resolve(
  process.env.CP06_OUTPUT_PATH || "/tmp/cp06-metrics-samples.json",
);

if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey || "")) {
  console.error(
    "Missing SUPABASE_METRICS_SECRET_KEY. Supply an existing Secret API key through the environment; do not place it in a command argument or source file.",
  );
  process.exit(2);
}
if (!/^[a-z0-9]{8,40}$/.test(projectRef)) {
  console.error("Invalid Supabase project reference.");
  process.exit(2);
}
if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 120) {
  console.error("CP06_SAMPLE_COUNT must be an integer between 2 and 120.");
  process.exit(2);
}
if (
  !Number.isInteger(intervalMs) ||
  intervalMs < 1_000 ||
  intervalMs > 3_600_000
) {
  console.error("CP06_INTERVAL_MS must be between 1000 and 3600000.");
  process.exit(2);
}

const endpoint = `https://${projectRef}.supabase.co/customer/v1/privileged/metrics`;
const authorization = `Basic ${Buffer.from(`service_role:${secretKey}`, "utf8").toString("base64")}`;
const capture = await captureMetrics({
  endpoint,
  authorization,
  sampleCount,
  intervalMs,
  timeoutMs,
  onMessage: (message) => console.log(message),
});
const { samples, failures } = capture;

const analysis = samples.length >= 2 ? analyzeMetricSamples(samples) : null;
const complete =
  samples.length === sampleCount &&
  analysis?.cpu?.validIntervals === sampleCount - 1;
const report = {
  schemaVersion: 1,
  complete,
  projectRef,
  endpointPath: "/customer/v1/privileged/metrics",
  captureStartedAt: capture.startedAt,
  captureFinishedAt: capture.finishedAt,
  requestedSamples: sampleCount,
  intervalMs,
  successfulSamples: samples.length,
  failures,
  analysis,
  samples: samples.map((sample) => ({
    capturedAt: sample.capturedAt,
    metrics: sample.metrics,
  })),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
await chmod(outputPath, 0o600);
console.log(
  `CP-06 metrics capture finished: ${samples.length}/${sampleCount} successful samples.`,
);
console.log(`Evidence file: ${outputPath}`);
if (analysis?.cpu) {
  console.log(
    `CPU non-idle: mean ${analysis.cpu.meanNonIdlePercent.toFixed(3)}%, p50 ${analysis.cpu.p50NonIdlePercent.toFixed(3)}%, p95 ${analysis.cpu.p95NonIdlePercent.toFixed(3)}%, max ${analysis.cpu.maxNonIdlePercent.toFixed(3)}%.`,
  );
  console.log(
    `CPU active execution (excluding I/O wait and steal): mean ${analysis.cpu.meanActiveExecutionPercent.toFixed(3)}%, p50 ${analysis.cpu.p50ActiveExecutionPercent.toFixed(3)}%, p95 ${analysis.cpu.p95ActiveExecutionPercent.toFixed(3)}%, max ${analysis.cpu.maxActiveExecutionPercent.toFixed(3)}%.`,
  );
  console.log(
    `Mean I/O wait: ${analysis.cpu.meanIoWaitPercent.toFixed(3)}%; mean steal: ${analysis.cpu.meanStealPercent.toFixed(3)}%.`,
  );
}
for (const [service, values] of Object.entries(analysis?.processCpu || {})) {
  console.log(
    `${service} process CPU: mean ${values.meanPercentOfOneCore.toFixed(3)}%, p95 ${values.p95PercentOfOneCore.toFixed(3)}%, max ${values.maxPercentOfOneCore.toFixed(3)}% of one core.`,
  );
}
if (!complete) {
  console.error(
    "Capture is incomplete: require all requested samples and valid CPU deltas for every interval.",
  );
  process.exitCode = 1;
}
