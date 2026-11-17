/**
 * CP-DB-CPU-17C: interpret *read-only* interval evidence, never infer a
 * direct/hostile caller from missing gateway records.
 * No network access, credentials, persistent state, or background work.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(name + ' must be a nonnegative integer');
  return value;
}

export function analyzeFailureOrigin(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new TypeError('Interval evidence must be an object');
  const start = Date.parse(snapshot.window_start);
  const end = Date.parse(snapshot.window_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new TypeError('A valid positive UTC interval is required');
  const minutes = (end - start) / 60000;
  const conflicts = count(snapshot.fm1_revision_conflicts, 'fm1_revision_conflicts');
  const ingress = count(snapshot.gateway_fm1_update_requests, 'gateway_fm1_update_requests');
  const gatewayTotal = count(snapshot.gateway_total_requests, 'gateway_total_requests');
  if (ingress > gatewayTotal)
    throw new TypeError('FM1 gateway requests cannot exceed all gateway requests');
  const rollbackStart = count(snapshot.pg_rollbacks_start, 'pg_rollbacks_start');
  const rollbackEnd = count(snapshot.pg_rollbacks_end, 'pg_rollbacks_end');
  if (rollbackEnd < rollbackStart)
    throw new TypeError('Rollback statistics reset or timestamps are reversed');
  const rollbackRate = (rollbackEnd - rollbackStart) / (60 * minutes);
  const conflictRate = conflicts / minutes;
  const gatewayGap = conflicts > 0 && ingress === 0;
  const notes = [];
  if (gatewayGap)
    notes.push('PostgreSQL FM1 conflicts lack corresponding RPC path entries in the sampled API Gateway logs; originating client not proven.');
  if (rollbackRate > conflictRate / 60)
    notes.push('Database-wide transaction rollbacks exceed FM1 conflict events; rollback semantics and other origins require independent attribution.');
  if (conflicts > 0)
    notes.push('Confirmed stale-revision conflicts remain; retaining optimistic concurrency is required.');
  notes.push('One interval is not a CPU time series or a matched before/after workload benchmark.');
  return {
    status: conflicts > 0 || rollbackEnd > rollbackStart ? 'INCIDENT_OPEN' : 'INSUFFICIENT_FOR_FINAL_CPU_ACCEPTANCE',
    interval_minutes: +minutes.toFixed(2),
    fm1_errors_per_minute: +conflictRate.toFixed(2),
    rollback_transactions_per_second: +rollbackRate.toFixed(2),
    gateway_fm1_update_requests: ingress,
    gateway_total_requests: gatewayTotal,
    gateway_correlation_missing: gatewayGap,
    originating_client: 'UNATTRIBUTED',
    cpu_recovery: 'UNVERIFIED',
    notes
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node scripts/cp-db-cpu17c-origin-evidence.mjs <interval-evidence.json>');
    const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    console.log(JSON.stringify(analyzeFailureOrigin(snapshot), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
