import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WorkspaceLifecycleClient,normalizeWorkspaceCreationReceipt,
 normalizeWorkspaceSelectionReceipt,normalizeWorkspaceConfigurationReceipt
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
test('discovery fails closed on mismatched signed identity and switching remains disabled',async()=>{
 let rpcCalls=0;
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:foreign})},
  api:{context:async()=>({user_id:actor,workspace_id:primary,profile:{status:'active'}}),
   rpc:async()=>{rpcCalls++;throw Error('UNEXPECTED_CREATION_RPC');}}
 });
 await assert.rejects(client.discover(),/Signed workspace identity changed/);
 await assert.rejects(client.create({
  name:'New',privacy:'closed',requestId:foreign
 }),/Signed workspace identity changed/);
 await assert.rejects(client.select(foreign,primary),/not activated/);
 assert.equal(rpcCalls,0);
});

test('read-only signed workspace discovery shows only server-authorized member rows',async()=>{
 let verified=0,contexts=0;
 const rpc=[];
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>{verified++;return {id:actor};}},
  api:{
   context:async()=>{contexts++;return {user_id:actor,workspace_id:primary,profile:{status:'active'}};},
   rpc:async(method,args)=>{
    rpc.push({method,args});
    assert.equal(method,'wm_ws01_list');
    assert.deepEqual(args,{});
    return {schemaVersion:1,userId:actor,activeWorkspaceId:primary,rows:[
     {id:primary,name:'Work Management',relation:'member',privacy:'closed',active:true},
     {id:foreign,name:'Shared Operations',relation:'owner',privacy:'closed',active:false}
    ]};
   }
  }
 });
 const catalog=await client.discover();
 assert.equal(catalog.status,'SIGNED_MEMBER_DISCOVERY');
 assert.deepEqual(catalog.rows.map(row=>row.name),['Work Management','Shared Operations']);
 assert.equal(catalog.rows[1].verifiedScope,'SIGNED_MEMBER_RPC');
 assert.equal(catalog.canSwitch,false);
 assert.equal(catalog.canDiscoverAll,false);
 assert.equal(rpc.length,1);
 assert.equal(verified,2);
 assert.equal(contexts,2);
});

test('signed discovery rejects mismatched server actor or workspace without leaking rows',async()=>{
 for(const mismatch of ['user','workspace']){
  let rpcCalls=0;
  const client=new WorkspaceLifecycleClient({
   auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
   api:{
    context:async()=>({user_id:actor,workspace_id:primary,profile:{status:'active'}}),
    rpc:async method=>{
     rpcCalls++;
     assert.equal(method,'wm_ws01_list');
     return {schemaVersion:1,userId:mismatch==='user'?foreign:actor,
      activeWorkspaceId:mismatch==='workspace'?foreign:primary,rows:[
       {id:primary,name:'Work Management',relation:'member',privacy:'closed',active:true}
      ]};
    }
   }
  });
  await assert.rejects(client.discover(),/Invalid signed workspace discovery result/);
  assert.equal(rpcCalls,1);
 }
});

test('signed discovery rejects a changed session or workspace after the read',async()=>{
 let calls=0;
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>({id:actor})},
  api:{
   context:async()=>{calls++;return {user_id:actor,
    workspace_id:calls===1?primary:foreign,profile:{status:'active'}};},
   rpc:async()=>({schemaVersion:1,userId:actor,activeWorkspaceId:primary,rows:[
    {id:primary,name:'Work Management',relation:'member',privacy:'closed',active:true}
   ]})
  }
 });
 await assert.rejects(client.discover(),/Signed workspace changed during request/);
 assert.equal(calls,2);
});

test('enabled create sends exactly one caller-scoped RPC and independently rechecks stable context',async()=>{
 let signedChecks=0,contextChecks=0,rpcCalls=0;
 const requestId='99999999-9999-4999-8999-999999999901';
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>{signedChecks++;return {id:actor};}},
  api:{
   context:async()=>{contextChecks++;return {user_id:actor,
    workspace_id:primary,profile:{status:'active'}};},
   rpc:async(method,args)=>{
    rpcCalls++;assert.equal(method,'wm_ws01_create');
    assert.deepEqual(args,{p_name:'Authorized Workspace',
     p_privacy:'closed',p_request_id:requestId});
    return {schemaVersion:1,workspaceId:foreign,relation:'owner',
     privacy:'closed',idempotent:false,active:false};
   }
  }
 });
 const r=await client.create({name:' Authorized Workspace ',
  privacy:'closed',requestId});
 assert.equal(r.relation,'owner');
 assert.equal(r.active,false);
 assert.equal(r.workspaceId,foreign);
 assert.equal(rpcCalls,1);
 assert.equal(signedChecks,2);
 assert.equal(contextChecks,2);
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
 const creation=readFileSync('sql/cp-ws01c-b3-create-contract-candidate.sql','utf8');
 const discovery=readFileSync('sql/cp-ws01-discovery-activation-candidate.sql','utf8');
 const cutover=readFileSync('sql/cp-ws01b-session-cutover-candidate.sql','utf8');
 assert.match(schema,/ALTER TABLE private\.ws01_workspace_policy ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/CREATE TABLE private\.ws01_member_roles/);
 assert.match(schema,/FOREIGN KEY\(workspace_id,user_id\)/);
 assert.match(schema,/CREATE TABLE private\.ws01_workspace_policy/);
 assert.match(schema,/CHECK \(privacy IN \('open','closed'\)\)/);
 assert.match(schema,/CREATE TABLE private\.ws01_create_requests/);
 assert.match(schema,/PRIMARY KEY\(actor_id,request_id\)/);
 assert.doesNotMatch(schema,/CREATE FUNCTION (?:public|private)\.wm_ws01_/);
 assert.doesNotMatch(schema,/CREATE FUNCTION public\.wm_ws01_create\(/);
 assert.match(creation,/FOR UPDATE/);
 assert.match(creation,/private\.wm_board_config_session_active\(\)/);
 assert.match(creation,/REVOKE ALL ON FUNCTION public\.wm_ws01_create\(text,text,uuid\)/);
 assert.doesNotMatch(creation,/GRANT EXECUTE ON FUNCTION public\.wm_ws01_create\(/i);
 assert.match(discovery,/m\.user_id=v_actor AND m\.active IS TRUE/);
 assert.match(discovery,/coalesce\(r\.relation,'member'\)/);
 assert.match(discovery,/coalesce\(policy\.privacy,'closed'\)/);
 assert.match(cutover,/selection_enabled IS TRUE/);
 assert.match(cutover,/OR NOT private\.wm_board_config_session_active\(\)/);
 assert.match(cutover,/THEN RETURN NULL; END IF;/);
 const disposable=readFileSync('sql/tests/cp-ws01b-disposable-acceptance.sql','utf8');
 assert.match(disposable,/Revoked session retained current workspace or board access/);
 assert.match(disposable,/Expired session retained workspace or board access/);
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
  'cp-ws01-discovery-activation-candidate.sql','cp-ws01c-b3-create-contract-candidate.sql',
  'cp-ws01c-b1-schema-acceptance.sql','cp-ws01b-session-cutover-candidate.sql',
  'cp-ws01b-disposable-preactivation.sql','cp-ws01b-disposable-acceptance.sql'
 ])assert.ok(workflow.includes(path),path);
 assert.match(fixture,/CREATE TABLE auth\.sessions/);
 assert.match(tests,/Workspace request replay conflict|Changed idempotency key payload allowed/);
 assert.match(tests,/Foreign-account workspace switch allowed/);
 assert.match(tests,/Revoked session could select workspace/);
 assert.match(tests,/Expired session could discover/);
 assert.match(tests,/Reactivated member recovered stale session choice/);
});

test('every staged migration has intact SQL boundaries and no literal escaped newlines',()=>{
 for(const path of [
  'sql/cp-ws01b-lifecycle-contract-candidate.sql',
  'sql/cp-ws01-discovery-activation-candidate.sql',
  'sql/cp-ws01c-b3-create-contract-candidate.sql',
  'sql/cp-ws01b-session-cutover-candidate.sql'
 ]){
  const sql=readFileSync(path,'utf8');
  assert.doesNotMatch(sql,/\\n/,'Literal escaped newline in '+path);
  assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1,path+' transaction opens once');
  assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1,path+' transaction commits once');
  assert.equal(sql.trim().endsWith('COMMIT;'),true,path+' cannot contain trailing SQL');
 }
 const discovery=readFileSync('sql/cp-ws01-discovery-activation-candidate.sql','utf8');
 assert.match(discovery,/LEFT JOIN private\.ws01_member_roles r ON/);
 assert.match(discovery,/LEFT JOIN private\.ws01_workspace_policy policy ON/);
 const cutover=readFileSync('sql/cp-ws01b-session-cutover-candidate.sql','utf8');
 assert.equal((cutover.match(/CREATE FUNCTION public\.wm_ws01_select\(/g)||[]).length,1);
 assert.equal((cutover.match(/END \$scope\$;/g)||[]).length,1);
 assert.equal((cutover.match(/END \$select\$;/g)||[]).length,1);
 assert.match(cutover,/'\^\[0-9a-fA-F\]\{8\}.*\{12\}\$'/);
 assert.match(cutover,/OR NOT private\.wm_board_config_session_active\(\)/);
});

test('disposable lifecycle reads observe committed writes in distinct statement snapshots',()=>{
 const cutover=readFileSync('sql/cp-ws01b-session-cutover-candidate.sql','utf8');
 const acceptance=readFileSync('sql/tests/cp-ws01b-disposable-acceptance.sql','utf8');
 const switchBody=cutover.split('CREATE FUNCTION public.wm_ws01_select(')[1]
  ?.split('END $select$;')[0]||'';
 assert.match(switchBody,/SELECT 1 FROM private\.ws01_session_choices choice/);
 assert.doesNotMatch(switchBody,/IF public\.current_workspace_id\(v_actor\) IS DISTINCT FROM p_workspace_id/);
 assert.match(acceptance,/END \$owner_create\$;[\s\S]*DO \$owner_discovery\$/);
 assert.match(acceptance,/END \$session_switch\$;[\s\S]*DO \$session_scope\$/);
 assert.match(acceptance,/Changed idempotency key payload allowed/);
 assert.match(acceptance,/Stale expected workspace accepted/);
});

test('disposable GoTrue fixture recognizes full UUID sessions and contains one initialization path',()=>{
 const setup=readFileSync('sql/tests/cp-ws01b-disposable-setup.sql','utf8');
 const guard=setup.split('CREATE FUNCTION private.wm_board_config_session_active()')[1]
  ?.split('END $guard$;')[0];
 assert.ok(guard,'Synthetic guard must exist');
 const match=guard.match(/sid\s*!~\s*'([^']+)'/);
 assert.ok(match,'Synthetic guard must validate a signed session UUID');
 const pattern=new RegExp(match[1]);
 assert.match('aaaaaaaa-0000-4000-8000-000000000001',pattern);
 assert.doesNotMatch('aaaaaaaa-0000-4000-000000000001',pattern);
 assert.equal((setup.match(/CREATE FUNCTION public\.ws01_fixture_auth_diagnostics\(/g)||[]).length,1);
 assert.equal((setup.match(/CREATE FUNCTION public\.ws01_fixture_visible_boards\(/g)||[]).length,1);
 assert.equal((setup.match(/INSERT INTO auth\.users\(id\)/g)||[]).length,1);
 assert.equal((setup.match(/INSERT INTO auth\.sessions\(id,user_id,not_after\)/g)||[]).length,1);
 assert.equal((setup.match(/\$diagnostics\$/g)||[]).length,2);
 assert.equal((setup.match(/\$boards\$/g)||[]).length,2);
});


test('B1 migration contains no public or private RPCs and is accepted before B2/B3',()=>{
 const b1=readFileSync('sql/cp-ws01b-lifecycle-contract-candidate.sql','utf8');
 const b3=readFileSync('sql/cp-ws01c-b3-create-contract-candidate.sql','utf8');
 const workflow=readFileSync('.github/workflows/cp-ws01b-disposable-postgres.yml','utf8');
 const post=readFileSync('sql/tests/cp-ws01c-b1-schema-acceptance.sql','utf8');
 assert.equal((b1.match(/^CREATE TABLE private\.ws01_/gm)||[]).length,6);
 assert.equal((b1.match(/^ALTER TABLE private\.ws01_.* ENABLE ROW LEVEL SECURITY;$/gm)||[]).length,6);
 assert.doesNotMatch(b1,/CREATE FUNCTION/);
 assert.doesNotMatch(b1,/GRANT EXECUTE/);
 assert.match(b1,/creation_enabled boolean NOT NULL DEFAULT false/);
 assert.match(b1,/selection_enabled boolean NOT NULL DEFAULT false/);
 assert.match(b3,/CREATE FUNCTION private\.ws01_signed_actor_session/);
 assert.match(b3,/CREATE FUNCTION public\.wm_ws01_create/);
 assert.doesNotMatch(b3,/GRANT EXECUTE.*TO authenticated/);
 assert.match(post,/to_regprocedure\('public\.wm_ws01_create\(text,text,uuid\)'\) IS NOT NULL/);
 assert.match(post,/v_total<>6 OR v_rls<>6 OR v_direct<>0 OR v_policies<>0/);
 const install=workflow.indexOf('-f sql/cp-ws01b-lifecycle-contract-candidate.sql');
 const verify=workflow.indexOf('-f sql/tests/cp-ws01c-b1-schema-acceptance.sql');
 const discover=workflow.indexOf('-f sql/cp-ws01-discovery-activation-candidate.sql');
 const create=workflow.indexOf('-f sql/cp-ws01c-b3-create-contract-candidate.sql');
 assert.ok(install>=0&&install<verify&&verify<discover&&discover<create);
});


test('staged owner settings receipt requires exact CAS transition, id and no-op truth',()=>{
 const accepted=normalizeWorkspaceConfigurationReceipt({
  schemaVersion:1,workspaceId:foreign,name:'Engineering Ops',
  privacy:'closed',previousName:'Engineering',previousPrivacy:'open',changed:true
 },{workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
   expectedName:'Engineering',expectedPrivacy:'open'});
 assert.equal(accepted.changed,true);
 assert.equal(Object.isFrozen(accepted),true);
 assert.equal(normalizeWorkspaceConfigurationReceipt({
  schemaVersion:1,workspaceId:foreign,name:'Engineering Ops',
  privacy:'closed',previousName:'Engineering Ops',previousPrivacy:'closed',
  changed:false
 },{workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
   expectedName:'Engineering Ops',expectedPrivacy:'closed'}).changed,false);
 const scope={workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
  expectedName:'Engineering',expectedPrivacy:'open'};
 for(const forged of [
  {schemaVersion:1,workspaceId:primary,name:'Engineering Ops',privacy:'closed',
   previousName:'Engineering',previousPrivacy:'open',changed:true},
  {schemaVersion:1,workspaceId:foreign,name:'Forged',privacy:'closed',
   previousName:'Engineering',previousPrivacy:'open',changed:true},
  {schemaVersion:1,workspaceId:foreign,name:'Engineering Ops',privacy:'open',
   previousName:'Engineering',previousPrivacy:'open',changed:true},
  {schemaVersion:1,workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
   previousName:'Unknown',previousPrivacy:'open',changed:true},
  {schemaVersion:1,workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
   previousName:'Engineering',previousPrivacy:'open',changed:false}
 ])assert.throws(()=>normalizeWorkspaceConfigurationReceipt(forged,scope));
});

test('workspace configuration remains ungranted and client cannot send dormant RPC',async()=>{
 let calls=0;
 const client=new WorkspaceLifecycleClient({
  auth:{userId:actor,getVerifiedUser:async()=>{calls++;return {id:actor};}},
  api:{context:async()=>{calls++;throw Error('MUST_NOT_QUERY');},
   rpc:async()=>{calls++;throw Error('MUST_NOT_WRITE');}}
 });
 await assert.rejects(client.configure({
  workspaceId:foreign,name:'Engineering Ops',privacy:'closed',
  expectedName:'Engineering',expectedPrivacy:'open'
 }),/not activated/);
 assert.equal(calls,0);
 const migration=readFileSync('sql/cp-ws01c-b4-owner-configuration-candidate.sql','utf8');
 const acceptance=readFileSync('sql/tests/cp-ws01c-b4-owner-configuration-disposable.sql','utf8');
 const workflow=readFileSync('.github/workflows/cp-ws01b-disposable-postgres.yml','utf8');
 assert.match(migration,/private\.ws01_signed_actor_session\(\)/);
 assert.match(migration,/role\.relation='owner'/);
 assert.match(migration,/m\.active IS TRUE/);
 assert.match(migration,/p_expected_name IS DISTINCT FROM v_old_name/);
 assert.match(migration,/FOR UPDATE OF w,policy FOR SHARE OF m,role/);
 assert.match(migration,/workspace\.configured/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.wm_ws01_configure/);
 assert.doesNotMatch(migration,/GRANT EXECUTE ON FUNCTION public\.wm_ws01_configure/);
 assert.match(acceptance,/WHEN serialization_failure/);
 assert.match(acceptance,/WHEN insufficient_privilege/);
 assert.match(acceptance,/ROLLBACK;/);
 assert.match(workflow,/cp-ws01c-b4-owner-configuration-disposable\.sql/);
});
