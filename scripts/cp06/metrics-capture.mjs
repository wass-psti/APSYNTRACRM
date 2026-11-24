import { setTimeout as delay } from "node:timers/promises";
import { parsePrometheusMetrics } from "./metrics-parser.mjs";

export async function captureMetrics({
  endpoint,
  authorization,
  sampleCount,
  intervalMs,
  timeoutMs,
  fetchImpl = fetch,
  now = () => new Date(),
  sleep = delay,
  onMessage = () => {},
}) {
  const samples = [];
  const failures = [];
  const startedAt = now();
  const startedAtMs = startedAt.getTime();

  onMessage(
    `CP-06 metrics capture started: ${sampleCount} samples, ${intervalMs}ms interval.`,
  );

  for (let index = 0; index < sampleCount; index += 1) {
    const scheduledAt = startedAtMs + index * intervalMs;
    const waitMs = scheduledAt - now().getTime();
    if (waitMs > 0) await sleep(waitMs);

    const requestStartedAt = now().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: {
          Authorization: authorization,
          Accept: "text/plain; version=0.0.4",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        failures.push({
          index: index + 1,
          capturedAt: requestStartedAt,
          status: response.status,
        });
        onMessage(
          `Sample ${index + 1}/${sampleCount}: HTTP ${response.status}.`,
        );
        continue;
      }

      const body = await response.text();
      const metrics = parsePrometheusMetrics(body);
      if (metrics.length === 0) {
        throw new Error("Metrics endpoint returned no series");
      }

      const capturedAt = now().toISOString();
      samples.push({ capturedAt, metrics });
      onMessage(
        `Sample ${index + 1}/${sampleCount}: captured ${metrics.length} metric series.`,
      );
    } catch (error) {
      const failureType =
        error.name === "AbortError" ? "timeout" : "request_or_parse_failure";
      failures.push({
        index: index + 1,
        capturedAt: requestStartedAt,
        error: failureType,
      });
      onMessage(
        `Sample ${index + 1}/${sampleCount}: ${failureType === "timeout" ? "request timed out" : "request or metrics parsing failed"}.`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    samples,
    failures,
  };
}
