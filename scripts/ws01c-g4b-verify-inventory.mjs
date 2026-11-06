// CP-WS-01C/B3 G4B — offline source-provenance inventory shape check.
// Not a claim of compiled source or runtime authorization for all 63 callers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../sql/tests/cp-ws01c-g4b-source-fingerprint-inventory.json', import.meta.url);
const snapshot = JSON.parse(readFileSync(file, 'utf8'));
assert.equal(snapshot.checkpoint, 'CP-WS-01C/B3-G4B');
assert.equal(snapshot.expected_callers, 63);
assert.equal(snapshot.source_bodies_excluded, true);
assert.equal(snapshot.entries.length, 63);

const seen = new Set();
const groups = { target_user: 0, direct_auth_uid: 0, default_auth_uid: 0, actor_alias: 0 };
for (const entry of snapshot.entries) {
  assert.equal(typeof entry.signature, 'string');
  assert.ok(entry.signature.includes('(') && entry.signature.endsWith(')'));
  assert.ok(!seen.has(entry.signature), 'Duplicate production signature');
  seen.add(entry.signature);
  assert.match(entry.source_sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof entry.security_definer, 'boolean');
  assert.equal(typeof entry.authenticated_execute, 'boolean');
  assert.ok(Object.hasOwn(groups, entry.call_site_category));
  groups[entry.call_site_category] += 1;
  if (entry.call_site_category === 'actor_alias') {
    assert.equal(entry.alias_declares_auth_uid, true, 'Unreviewed actor alias');
  }
}
assert.deepEqual(groups, { target_user: 2, direct_auth_uid: 5, default_auth_uid: 3, actor_alias: 53 });
assert.deepEqual(
  snapshot.entries.filter(e => e.call_site_category === 'target_user').map(e => e.signature).sort(),
  ['public.has_module_access(p_module_id text, p_user_id uuid)',
   'public.module_role_for(p_module_id text, p_user_id uuid)']
);
console.log('CP_WS01C_B3_G4B_LIVE_SOURCE_FINGERPRINT_INVENTORY_PASS: 63 identities; 2 target-user; 61 caller/default call sites');
