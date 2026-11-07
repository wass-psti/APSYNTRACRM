import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const candidate=read('../../sql/cp-tl03e-legacy-session-hardening-candidate.sql');
const baseline=read('../../sql/tests/cp-tl03e-legacy-unguarded-disposable.sql');
const checks=read('../../sql/tests/cp-tl03e-legacy-disposable-acceptance.sql');
const client=read('../tradelink-domain-client.js');
const getBodies=s=>[...s.matchAll(/CREATE OR REPLACE FUNCTION public\.(tradelink_[a-z_]+)\(/g)].map(x=>x[1]);
const required=[
 'tradelink_asset_read','tradelink_asset_write','tradelink_cleanup_fence_activate',
 'tradelink_cleanup_fence_release','tradelink_reconciliation_assess',
 'tradelink_reconciliation_cleanup_audit_list','tradelink_reconciliation_cleanup_preflight',
 'tradelink_reconciliation_list','tradelink_reconciliation_report',
 'tradelink_reconciliation_request_cleanup','tradelink_reconciliation_verify_revision'
];
test('source candidate contains exactly the reviewed 11 legacy function bodies, no extra object',()=>{
 assert.deepEqual(getBodies(candidate),required);
 assert.deepEqual(getBodies(baseline),required);
 assert.equal((candidate.match(/TRADELINK_SESSION_REVOKED/g)||[]).length,11);
 assert.equal((candidate.match(/private\.wm_board_config_session_active\(\) IS DISTINCT FROM TRUE/g)||[]).length,11);
});
test('synthetic fixtures reject production and live candidate requires approval marker',()=>{
 for(const path of [
  '../../sql/tests/cp-tl03e-legacy-disposable-setup.sql',
  '../../sql/tests/cp-tl03e-legacy-unguarded-disposable.sql',
  '../../sql/tests/cp-tl03e-legacy-disposable-grants.sql',
  '../../sql/tests/cp-tl03e-legacy-disposable-original-gap.sql',
  '../../sql/tests/cp-tl03e-legacy-disposable-acceptance.sql'
 ]){
  const fixture=read(path);
  assert.match(fixture,/current_database\(\) <> 'cp_tl03e_disposable'/);
  assert.match(fixture,/TL03E_DISPOSABLE_ONLY/);
 }
 assert.match(candidate,/TL03E_CHANGE_APPROVAL_REQUIRED/);
 assert.match(candidate,/current_setting\('apsyntra\.cp_tl03e_approved_change',true\)/);
});
test('candidate refuses exact source-helper drift and retains existing function grants',()=>{
 assert.match(candidate,/TL03E_SESSION_HELPER_DRIFT/);
 assert.match(candidate,/TL03E_ENTRYPOINT_COUNT_DRIFT/);
 assert.match(candidate,/TL03E_LEGACY_RPC_DRIFT/);
 assert.match(candidate,/TL03E_ACL_MISMATCH/);
 assert.match(candidate,/BEGIN;[\s\S]+COMMIT;/);
 assert.doesNotMatch(candidate,/\b(GRANT|REVOKE|DROP|TRUNCATE|ALTER)\b/i);
 // Existing function bodies legitimately retain their original scoped DML.
});
test('all 11 legacy RPCs receive fail-closed session guard before the original authorization body',()=>{
 for(const name of required){
  const start=candidate.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  const after=candidate.indexOf('CREATE OR REPLACE FUNCTION public.',start+1);
  const body=candidate.slice(start,after===-1?candidate.indexOf('DO $postflight$'):after);
  const guard=body.indexOf('TRADELINK_SESSION_REVOKED');
  assert.ok(guard>=0,name+': missing guard');
  assert.ok(guard<body.indexOf("has_module_access('tradelink'"),name+': guard must precede module check');
 }
});
test('original legacy function source is preserved after removing only the session guard',()=>{
 const inserted=[
  " IF private.wm_board_config_session_active() IS DISTINCT FROM TRUE THEN",
  "  RAISE EXCEPTION 'TRADELINK_SESSION_REVOKED' USING ERRCODE='42501';",
  " END IF;",
  ""
 ].join('\n');
 const section=(source,name)=>{
  const start=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0,name);
  const next=source.indexOf('CREATE OR REPLACE FUNCTION public.',start+10);
  const post=source.indexOf('DO $postflight$',start+10);
  const ends=[next,post].filter(x=>x>start);
  return source.slice(start,ends.length?Math.min(...ends):source.length).trim();
 };
 for(const name of required){
  const before=section(baseline,name);
  const after=section(candidate,name);
  assert.equal(after.split(inserted).length,2,name+': one guard');
  assert.equal(after.replace(inserted,''),before,name+': unchanged original');
 }
});
test('disposable tests model all distinct cases and production feature flags are not enabled',()=>{
 assert.match(checks,/REVOCATION PASS: 11 of 11/);
 assert.match(checks,/GET STACKED DIAGNOSTICS denial_message = MESSAGE_TEXT/);
 assert.match(checks,/denial_message IS DISTINCT FROM 'TRADELINK_SESSION_REVOKED'/);
 assert.match(checks,/denial_message IS DISTINCT FROM 'TRADELINK_ACCESS_DENIED'/);
 assert.match(checks,/Expired synthetic session/);
 assert.match(checks,/Employee gained asset read/);
 assert.match(checks,/Foreign workspace read exposed/);
 assert.match(checks,/Valid manager CAS write broken/);
 assert.match(client,/TL03_DOMAIN_READS_ENABLED=true/);
 assert.match(client,/TL03_DOMAIN_WRITES_ENABLED=false/);
});
