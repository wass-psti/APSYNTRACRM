// CP-WS-01C/B3 G4C — metadata provenance and dependency consistency.
// This verifies captured source fingerprints and overlap only; it does NOT
// execute patched role functions or certify signed-user authorization.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}
const current = read('../sql/tests/cp-ws01c-g4c-role-dependent-fingerprints.json');
const baseline = read('../sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json');

assert.equal(current.checkpoint, 'CP-WS-01C/B3-G4C');
assert.equal(current.source_bodies_included, false);
assert.equal(current.semantic_behavior_certified, false);
assert.equal(current.dependents.length, 54);
assert.equal(current.role_sources.length, 2);
assert.equal(baseline.entries.length, 63);

const expectedRoleNames = [
  'public.has_module_access(p_module_id text, p_user_id uuid)',
  'public.module_role_for(p_module_id text, p_user_id uuid)',
];
assert.deepEqual(current.role_sources.map(x => x.signature).sort(), expectedRoleNames);
const baselineBySignature = new Map(baseline.entries.map(x => [x.signature, x]));
const digestPattern = /^[a-f0-9]{64}$/;
for (const source of current.role_sources) {
  assert.match(source.source_sha256, digestPattern);
  assert.equal(source.source_sha256, baselineBySignature.get(source.signature)?.source_sha256);
}

const counts = {
  direct_dependent_count: current.dependents.length,
  has_access_references: 0,
  role_for_references: 0,
  overlap_both: 0,
  authenticated_callable_dependents: 0,
  also_current_workspace_lookup: 0,
};
const seen = new Set();
for (const d of current.dependents) {
  assert.match(d.source_sha256, digestPattern);
  assert.equal(typeof d.signature, 'string');
  assert.equal(typeof d.security_definer, 'boolean');
  assert.equal(typeof d.signed_executable, 'boolean');
  assert.ok(!seen.has(d.signature), 'duplicate role-dependent signature');
  seen.add(d.signature);
  assert.ok(d.calls_has_module_access || d.calls_module_role_for);
  if (d.calls_has_module_access) counts.has_access_references++;
  if (d.calls_module_role_for) counts.role_for_references++;
  if (d.calls_has_module_access && d.calls_module_role_for) counts.overlap_both++;
  if (d.signed_executable) counts.authenticated_callable_dependents++;
  if (d.calls_current_workspace_id) {
    counts.also_current_workspace_lookup++;
    assert.equal(baselineBySignature.get(d.signature)?.source_sha256,
      d.source_sha256, 'shared workspace reference fingerprint differs');
  }
}
assert.deepEqual(counts, current.summary);
assert.deepEqual(counts, {
  direct_dependent_count: 54, has_access_references: 45,
  role_for_references: 24, overlap_both: 15,
  authenticated_callable_dependents: 45,
  also_current_workspace_lookup: 44,
});
console.log('CP_WS01C_B3_G4C_ROLE_DEPENDENCY_PROVENANCE_PASS: 54 direct dependents, 2 role sources, 44 fingerprint intersections');
