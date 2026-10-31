import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executeCI03} from '../../scripts/cp-frt-sec10-ci03.mjs';
const schema=readFileSync('sql/tests/cp-frt-sec10-ci03-native-finance.sql','utf8');
test('CI03 rejects any execution outside explicit GitHub-hosted ephemeral environment',async()=>{
 let network=0;
 const fetcher=async()=>{network++;throw Error('MUST_NOT_CONTACT_ANY_ENDPOINT');};
 for(const env of [
  {CI:'false',GITHUB_ACTIONS:'true',SEC10_CI03:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'false',SEC10_CI03:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'true',SEC10_CI03:'MISSING'},
  {}
 ]){
  await assert.rejects(executeCI03('',env,fetcher),/CI03_ENVIRONMENT_DENIED/);
 }
 assert.equal(network,0);
});
test('CI-only fixture contains the live FRT domain RPC contracts and complete finance tables',()=>{
 assert.match(schema,/DISPOSABLE CI ONLY/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION public\.frt_create_request/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION public\.frt_request_action/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION public\.frt_submit_liquidation/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION public\.frt_update_request/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION private\.frt_has_membership/);
 assert.match(schema,/CREATE OR REPLACE FUNCTION private\.frt_has_role/);
 for(const table of ['frt_companies','frt_requests','frt_request_items',
  'frt_audit_logs','frt_liquidations','frt_liquidation_items',
  'frt_voucher_counters']){
  assert.ok(schema.includes('CREATE TABLE public.'+table+' ('),table+' missing');
  assert.ok(schema.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY;'));
  assert.ok(schema.includes('REVOKE ALL ON TABLE public.'+table));
 }
 assert.ok(schema.includes('GRANT EXECUTE ON FUNCTION public.frt_request_action'));
 assert.ok(!schema.includes('INSERT INTO auth.users'));
 assert.ok(!schema.includes('https://'));

});
test('domain role checks precede finance status mutation in authoritative RPCs',()=>{
 const action=schema.slice(schema.indexOf('CREATE OR REPLACE FUNCTION public.frt_request_action'));
 assert.match(action,/private\.frt_has_role\(p_workspace_id,'FINANCE_APPROVER','GENERAL_MANAGER'\)/);
 assert.match(action,/private\.frt_has_role\(p_workspace_id,'GENERAL_MANAGER'\)/);
 const liquidation=schema.slice(schema.indexOf('CREATE OR REPLACE FUNCTION public.frt_submit_liquidation'));
 assert.match(liquidation,/private\.frt_current_role\(p_workspace_id\)/);
 assert.match(liquidation,/r\.finance_approved_at is null/);
});
