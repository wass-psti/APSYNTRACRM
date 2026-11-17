import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFailureOrigin } from '../../scripts/cp-db-cpu17c-origin-evidence.mjs';

const sample = {
  window_start: '2026-11-17T08:00:00Z',
  window_end: '2026-11-17T08:09:00Z',
  fm1_revision_conflicts: 529,
  gateway_fm1_update_requests: 0,
  gateway_total_requests: 758,
  pg_rollbacks_start: 49300000,
  pg_rollbacks_end: 49304860
};

test('missing ingress evidence remains unattributed, not an asserted bypass', () => {
  const result = analyzeFailureOrigin(sample);
  assert.equal(result.status, 'INCIDENT_OPEN');
  assert.equal(result.gateway_correlation_missing, true);
  assert.equal(result.originating_client, 'UNATTRIBUTED');
  assert.equal(result.fm1_errors_per_minute, 58.78);
  assert.equal(result.rollback_transactions_per_second, 9);
  assert.equal(result.cpu_recovery, 'UNVERIFIED');
});

test('rollbacks are not automatically attributed to FM1 or defined as failed operations', () => {
  const result = analyzeFailureOrigin(sample);
  assert.ok(result.notes.some(note => note.includes('independent attribution')));
  assert.ok(result.notes.every(note => !note.includes('malicious')));
});

test('zero conflicts never certifies CPU recovery from one short window', () => {
  const result = analyzeFailureOrigin({
    ...sample, fm1_revision_conflicts: 0,
    pg_rollbacks_end: sample.pg_rollbacks_start
  });
  assert.equal(result.status, 'INSUFFICIENT_FOR_FINAL_CPU_ACCEPTANCE');
  assert.equal(result.cpu_recovery, 'UNVERIFIED');
});

test('gateway evidence changes correlation flag but does not invent the source', () => {
  const result = analyzeFailureOrigin({...sample,gateway_fm1_update_requests:529});
  assert.equal(result.gateway_correlation_missing, false);
  assert.equal(result.originating_client, 'UNATTRIBUTED');
});

test('bad counter data is never silently treated as success', () => {
  assert.throws(() => analyzeFailureOrigin({...sample,pg_rollbacks_end:1}), /reset/);
  assert.throws(() => analyzeFailureOrigin({...sample, fm1_revision_conflicts:-1}), /nonnegative/);
  assert.throws(() => analyzeFailureOrigin({...sample, gateway_fm1_update_requests:759}), /exceed/);
  assert.throws(() => analyzeFailureOrigin({...sample, window_end:sample.window_start}), /valid positive/);
});
