const COUNTER_METRICS = [
  "node_disk_io_time_seconds_total",
  "node_disk_reads_completed_total",
  "node_disk_writes_completed_total",
  "node_disk_read_bytes_total",
  "node_disk_written_bytes_total",
  "node_network_receive_bytes_total",
  "node_network_transmit_bytes_total",
  "pg_stat_database_xact_commit_total",
  "pg_stat_database_xact_rollback_total",
  "pg_stat_database_blks_read_total",
  "pg_stat_database_blks_hit_total",
  "pg_stat_database_temp_files_total",
  "pg_stat_database_temp_bytes_total",
  "pg_stat_database_deadlocks_total",
];

const GAUGE_METRICS = [
  "node_memory_MemTotal_bytes",
  "node_memory_MemAvailable_bytes",
  "pg_stat_database_num_backends",
  "pgbouncer_pools_client_active_connections",
  "pgbouncer_pools_server_active_connections",
];

function labelKey(labels) {
  return JSON.stringify(
    Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function collectSeries(samples, metricName, groupLabel) {
  const series = {};
  for (const sample of samples) {
    if (sample.name !== metricName || !Number.isFinite(sample.value)) continue;
    const key = labelKey(sample.labels);
    series[key] = {
      value: sample.value,
      group: groupLabel
        ? sample.labels[groupLabel] ||
          sample.labels.job ||
          sample.labels.app ||
          sample.labels.component ||
          "unattributed"
        : null,
    };
  }
  return series;
}

function metricValues(samples, names) {
  const values = {};
  for (const name of names) {
    const matching = samples.filter(
      (sample) => sample.name === name && Number.isFinite(sample.value),
    );
    if (matching.length > 0)
      values[name] = matching.reduce((sum, sample) => sum + sample.value, 0);
  }
  return values;
}

function collectSnapshot(samples, capturedAt) {
  const inventory = {};
  const labelInventory = {};
  for (const sample of samples) {
    inventory[sample.name] = (inventory[sample.name] || 0) + 1;
    const keys = labelInventory[sample.name] || new Set();
    for (const name of Object.keys(sample.labels)) keys.add(name);
    labelInventory[sample.name] = keys;
  }

  const counterSeries = {};
  for (const name of COUNTER_METRICS) {
    const series = collectSeries(samples, name);
    if (Object.keys(series).length > 0) counterSeries[name] = series;
  }

  return {
    capturedAt,
    cpuSeries: collectSeries(
      samples.filter((sample) => sample.labels.service_type === "db"),
      "node_cpu_seconds_total",
      "mode",
    ),
    processCpuSeries: collectSeries(
      samples,
      "process_cpu_seconds_total",
      "service_type",
    ),
    counterSeries,
    gauges: metricValues(samples, GAUGE_METRICS),
    inventory,
    labelInventory: Object.fromEntries(
      Object.entries(labelInventory).map(([name, keys]) => [
        name,
        [...keys].sort(),
      ]),
    ),
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function safeDelta(current, previous) {
  const delta = current - previous;
  return delta >= 0 && Number.isFinite(delta) ? delta : null;
}

function getSeriesDeltas(previousSeries, currentSeries) {
  const deltas = [];
  let resets = 0;
  let seriesChanges = 0;
  const keys = new Set([
    ...Object.keys(previousSeries),
    ...Object.keys(currentSeries),
  ]);

  for (const key of keys) {
    const previous = previousSeries[key];
    const current = currentSeries[key];
    if (!previous || !current) {
      seriesChanges += 1;
      continue;
    }
    const delta = safeDelta(current.value, previous.value);
    if (delta === null) {
      resets += 1;
      continue;
    }
    deltas.push({ group: current.group, delta });
  }

  return { deltas, resets, seriesChanges };
}

export function analyzeMetricSamples(rawSamples) {
  if (!Array.isArray(rawSamples) || rawSamples.length < 2) {
    throw new Error("At least two successful metrics samples are required");
  }

  const samples = rawSamples.map((sample) =>
    collectSnapshot(sample.metrics, sample.capturedAt),
  );
  const intervals = [];
  let counterResets = 0;
  let seriesChanges = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedSeconds =
      (Date.parse(current.capturedAt) - Date.parse(previous.capturedAt)) / 1000;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) continue;

    const cpuResult = getSeriesDeltas(previous.cpuSeries, current.cpuSeries);
    counterResets += cpuResult.resets;
    seriesChanges += cpuResult.seriesChanges;
    const cpuDeltas = {};
    for (const item of cpuResult.deltas) {
      const mode = item.group || "unknown";
      cpuDeltas[mode] = (cpuDeltas[mode] || 0) + item.delta;
    }

    // The separate node_cpu_guest_seconds_total metric is a subset of
    // user/nice time, so it is not added to this CPU total.
    const totalCpuSeconds = Object.entries(cpuDeltas)
      .filter(([mode]) => mode !== "guest" && mode !== "guest_nice")
      .reduce((sum, [, value]) => sum + value, 0);
    const idle = cpuDeltas.idle || 0;
    const ioWait = cpuDeltas.iowait || 0;
    const steal = cpuDeltas.steal || 0;
    const activeExecution = totalCpuSeconds - idle - ioWait - steal;
    const hasCpu =
      cpuResult.resets === 0 &&
      cpuResult.seriesChanges === 0 &&
      Object.hasOwn(cpuDeltas, "idle") &&
      totalCpuSeconds > 0;

    const processResult = getSeriesDeltas(
      previous.processCpuSeries,
      current.processCpuSeries,
    );
    counterResets += processResult.resets;
    seriesChanges += processResult.seriesChanges;
    const processDeltas = {};
    for (const item of processResult.deltas) {
      const service = item.group || "unattributed";
      processDeltas[service] = (processDeltas[service] || 0) + item.delta;
    }

    const counterDeltas = {};
    const counterNames = new Set([
      ...Object.keys(previous.counterSeries),
      ...Object.keys(current.counterSeries),
    ]);
    for (const name of counterNames) {
      const result = getSeriesDeltas(
        previous.counterSeries[name] || {},
        current.counterSeries[name] || {},
      );
      counterResets += result.resets;
      seriesChanges += result.seriesChanges;
      if (result.deltas.length > 0) {
        counterDeltas[name] = result.deltas.reduce(
          (sum, item) => sum + item.delta,
          0,
        );
      }
    }

    intervals.push({
      from: previous.capturedAt,
      to: current.capturedAt,
      elapsedSeconds,
      cpu: hasCpu
        ? {
            totalSeconds: totalCpuSeconds,
            activeExecutionPercent: Math.max(
              0,
              (100 * activeExecution) / totalCpuSeconds,
            ),
            nonIdlePercent: Math.max(
              0,
              (100 * (totalCpuSeconds - idle)) / totalCpuSeconds,
            ),
            ioWaitPercent: Math.max(0, (100 * ioWait) / totalCpuSeconds),
            stealPercent: Math.max(0, (100 * steal) / totalCpuSeconds),
          }
        : null,
      processCpuPercentOfOneCore: Object.fromEntries(
        Object.entries(processDeltas).map(([name, delta]) => [
          name,
          (100 * delta) / elapsedSeconds,
        ]),
      ),
      counterDeltas,
      gauges: current.gauges,
    });
  }

  const cpuValues = intervals
    .map((interval) => interval.cpu?.activeExecutionPercent)
    .filter(Number.isFinite);
  const nonIdleValues = intervals
    .map((interval) => interval.cpu?.nonIdlePercent)
    .filter(Number.isFinite);
  const ioWaitValues = intervals
    .map((interval) => interval.cpu?.ioWaitPercent)
    .filter(Number.isFinite);
  const stealValues = intervals
    .map((interval) => interval.cpu?.stealPercent)
    .filter(Number.isFinite);
  const processNames = new Set(
    intervals.flatMap((interval) =>
      Object.keys(interval.processCpuPercentOfOneCore),
    ),
  );
  const processSummary = {};
  for (const name of processNames) {
    const oneCoreValues = intervals
      .map((interval) => interval.processCpuPercentOfOneCore[name])
      .filter(Number.isFinite);
    processSummary[name] = {
      meanPercentOfOneCore: oneCoreValues.length
        ? oneCoreValues.reduce((sum, value) => sum + value, 0) /
          oneCoreValues.length
        : null,
      p95PercentOfOneCore: percentile(oneCoreValues, 0.95),
      maxPercentOfOneCore: oneCoreValues.length
        ? Math.max(...oneCoreValues)
        : null,
    };
  }
  const allNames = new Set(
    samples.flatMap((sample) => Object.keys(sample.inventory)),
  );
  const metricInventory = Object.fromEntries(
    [...allNames]
      .sort()
      .map((name) => [
        name,
        samples.reduce(
          (count, sample) => count + (sample.inventory[name] || 0),
          0,
        ),
      ]),
  );
  const labelInventory = {};
  for (const sample of samples) {
    for (const [name, keys] of Object.entries(sample.labelInventory)) {
      labelInventory[name] = new Set([
        ...(labelInventory[name] || []),
        ...keys,
      ]);
    }
  }

  return {
    sampleCount: samples.length,
    intervalCount: intervals.length,
    start: samples[0].capturedAt,
    end: samples[samples.length - 1].capturedAt,
    durationSeconds:
      (Date.parse(samples[samples.length - 1].capturedAt) -
        Date.parse(samples[0].capturedAt)) /
      1000,
    cpu: cpuValues.length
      ? {
          meanActiveExecutionPercent:
            cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length,
          p50ActiveExecutionPercent: percentile(cpuValues, 0.5),
          p95ActiveExecutionPercent: percentile(cpuValues, 0.95),
          maxActiveExecutionPercent: Math.max(...cpuValues),
          meanNonIdlePercent:
            nonIdleValues.reduce((sum, value) => sum + value, 0) /
            nonIdleValues.length,
          p50NonIdlePercent: percentile(nonIdleValues, 0.5),
          p95NonIdlePercent: percentile(nonIdleValues, 0.95),
          maxNonIdlePercent: Math.max(...nonIdleValues),
          meanIoWaitPercent:
            ioWaitValues.reduce((sum, value) => sum + value, 0) /
            ioWaitValues.length,
          meanStealPercent:
            stealValues.reduce((sum, value) => sum + value, 0) /
            stealValues.length,
          validIntervals: cpuValues.length,
        }
      : null,
    processCpu: processSummary,
    counterResets,
    seriesChanges,
    metricInventory,
    labelInventory: Object.fromEntries(
      Object.entries(labelInventory).map(([name, keys]) => [
        name,
        [...keys].sort(),
      ]),
    ),
    intervals,
  };
}
