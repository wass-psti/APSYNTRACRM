import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WorkspaceLifecycleClient,normalizeWorkspaceCreationReceipt,
 normalizeWorkspaceSelectionReceipt
} from '../workspace-lifecycle-client.js';

const primary='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('workspace creation receipts enforce server-owner/conditional privacy and no implicit switch',()=>{
 const ok=normalizeWorkspaceCreationReceipt({
  schemaVersion:1,workspaceId:foreign,relation:'owner',
  privacy:'closed',idempotent:false,active:false},'closed');
 assert.equal(ok.workspaceId,foreign);
 assert.equal(ok.active,false);
 assert.equal(Object.isFrozen(ok),true);
 for(const invalid of [
  {schemaVersion:1,workspaceId:'bad',relation:'owner',privacy:'closed',idempotent:false,active:false},
  {schemaVersion:1,workspaceId:foreign,relation:'admin',privacy:'closed',idempotent:false,active:false},
  {schemaVersion:1,workspaceId:foreign,relation:'owner',privacy:'open',idempotent:false,active:false},
  {schemaVersion:1,workspaceId:foreign,relation:'owner',privacy:'closed',idempotent:'false',active:false},
  {schemaVersion:1,workspaceId:foreign,relation:'owner',privacy:'closed',idempotent:false,active:true}
 ])assert.throws(()=>normalizeWorkspaceCreationReceipt(invalid,'closed'));
});
test('workspace selection receipt requires exact target, previous scope and changed flag',()=>{
 const valid=normalizeWorkspaceSelectionReceipt({
  schemaVersion:1,workspaceId:foreign,previousWorkspaceId:primary,switched:true
 },foreign,primary);
 assert.equal(valid.switched,true);
 assert.equal(Object.isFrozen(valid),true);
 assert.equal(normalizeWorkspaceSelectionReceipt({
  schemaVersion:1,workspaceId:primary,previousWorkspaceId:primary,switched:false
 },primary,primary).switched,false);
 for(const invalid of [
  {schemaVersion:1,workspaceId:primary,previousWorkspaceId:primary,switched:true},
  {schemaVersion:1,workspaceId:primary,previousWorkspaceId:foreign,switched:true},
  {schemaVersion:1,workspaceId:foreign,previousWorkspaceId:primary,switched:false},
  {schemaVersion:1,workspaceId:foreign,previousWorkspaceId:primary,switched:'true'}
 ])assert.throws(()=>normalizeWorkspaceSelectionReceipt(invalid,foreign,primary));
});
test('client lifecycle methods fail closed before production approval and send zero RPCs',async()=>{
 let calls=0;
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>{calls++;return {id:actor};}},
  api:{context:async()=>{calls++;return {
   user_id:actor,workspace_id:primary,profile:{status:'active'}};},
   rpc:async()=>{calls++;throw Error('PRODUCTION_RPC_MUST_NOT_RUN');}}
 });
 await assert.rejects(client.discover(),/not activated/);
 await assert.rejects(client.create({
  name:'New',privacy:'closed',requestId:foreign}),/not activated/);
 await assert.rejects(client.select(foreign,primary),/not activated/);
 assert.equal(calls,0);
});
test('pure signed identity validation fails closed on mismatches',async()=>{
 const client=new WorkspaceLifecycleClient({
  auth:{userId:foreign,getVerifiedUser:async()=>({id:actor})},
  api:{context:async()=>({user_id:actor,workspace_id:primary,profile:{status:'active'}}),
   rpc:async()=>{throw Error('Should not run');}}
 });
 await assert.rejects(client.signed(),/identity changed/);
});
test('staged SQL separates secure discovery, creation, default denial and session cutover',()=>{
 const schema=readFileSync('sql/cp-ws01b-lifecycle-contract-candidate.sql','utf8');
 const discovery=readFileSync('sql/cp-ws01-discovery-activation-candidate.sql','utf8');
 const cutover=readFileSync('sql/cp-ws01b-session-cutover-candidate.sql','utf8');
 assert.match(schema,/ALTER TABLE private\.ws01_workspace_policy ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/CREATE TABLE private\.ws01_member_roles/);
 assert.match(schema,/FOREIGN KEY\(workspace_id,user_id\)/);
 assert.match(schema,/CREATE TABLE private\.ws01_workspace_policy/);
 assert.match(schema,/CHECK \(privacy IN \('open','closed'\)\)/);
 assert.match(schema,/CREATE TABLE private\.ws01_create_requests/);
 assert.match(schema,/PRIMARY KEY\(actor_id,request_id\)/);
 assert.match(schema,/FOR UPDATE/);
 assert.match(schema,/private\.wm_board_config_session_active\(\)/);
 assert.match(schema,/REVOKE ALL ON FUNCTION public\.wm_ws01_create\(text,text,uuid\)/);
 assert.doesNotMatch(schema,/GRANT EXECUTE ON FUNCTION public\.wm_ws01_create\(/i);
 assert.match(discovery,/m\.user_id=v_actor AND m\.active IS TRUE/);
 assert.match(discovery,/coalesce\(r\.relation,'member'\)/);
 assert.match(discovery,/coalesce\(policy\.privacy,'closed'\)/);
 assert.match(cutover,/selection_enabled IS TRUE/);
 assert.match(cutover,/FOR UPDATE/);
 assert.match(cutover,/FOR SHARE/);
 assert.match(cutover,/CREATE TRIGGER ws01_prune_session_choices/);
 assert.match(cutover,/REVOKE ALL ON FUNCTION public\.wm_ws01_select\(uuid,uuid\)/);
 assert.doesNotMatch(cutover,/GRANT EXECUTE ON FUNCTION public\.wm_ws01_select\(/i);
});
test('isolated CI combines both contract stages and signs with disposable GoTrue fixture',()=>{
 const workflow=readFileSync('.github/workflows/cp-ws01b-disposable-postgres.yml','utf8');
 const fixture=readFileSync('sql/tests/cp-ws01b-disposable-setup.sql','utf8');
 const tests=readFileSync('sql/tests/cp-ws01b-disposable-acceptance.sql','utf8');
 assert.match(workflow,/postgres:17/);
 assert.match(workflow,/PGHOST: 127\.0\.0\.1/);
 assert.match(workflow,/PGDATABASE: workspace_disposable/);
 for(const path of [
  'cp-ws01b-disposable-setup.sql','cp-ws01b-lifecycle-contract-candidate.sql',
  'cp-ws01-discovery-activation-candidate.sql','cp-ws01b-session-cutover-candidate.sql',
  'cp-ws01b-disposable-preactivation.sql','cp-ws01b-disposable-acceptance.sql'
 ])assert.ok(workflow.includes(path),path);
 assert.match(fixture,/CREATE TABLE auth\.sessions/);
 assert.match(tests,/Workspace request replay conflict|Changed idempotency key payload allowed/);
 assert.match(tests,/Foreign-account workspace switch allowed/);
 assert.match(tests,/Revoked session could select workspace/);
 assert.match(tests,/Expired session could discover/);
 assert.match(tests,/Reactivated member recovered stale session choice/);
});
