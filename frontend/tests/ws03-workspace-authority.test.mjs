import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS03_RESTRICTED_CREATION_ENABLED,WS03_OWNERSHIP_TRANSFER_ENABLED,
 normalizeWorkspaceCreatorAuthority,canCreateOrganizationalWorkspace,
 validateOwnershipTransfer,WorkspaceAuthorityClient
} from '../workspace-authority.js';
import {WS01_CREATION_ENABLED,WS01_SWITCHING_ENABLED} from '../workspace-ui.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const owner='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';
const signed={schemaVersion:1,userId:user,workspaceId:workspace,
 allowed:true,basis:'organization_owner'};

test('legacy signed creation and switching exist but WS03 entitlement stays default OFF',()=>{
 assert.equal(WS01_CREATION_ENABLED,true);
 assert.equal(WS01_SWITCHING_ENABLED,true);
 assert.equal(WS03_RESTRICTED_CREATION_ENABLED,false);
 assert.equal(WS03_OWNERSHIP_TRANSFER_ENABLED,false);
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(ui,/workspaceCreateAllowed\(options\)/);
 assert.match(ui,/canCreateOrganizationalWorkspace\(/);
 assert.match(ui,/title="Workspace creation requires verified IT Admin/);
 assert.match(ui,/const enabled=workspaceCreateAllowed\(options\)/);
 assert.doesNotMatch(ui,/localStorage.*creatorAuthority/);
});
test('source of authority must be a matching signed server receipt',()=>{
 const result=normalizeWorkspaceCreatorAuthority(signed,{userId:user,workspaceId:workspace});
 assert.equal(result.allowed,true);
 assert.equal(result.basis,'organization_owner');
 assert.equal(canCreateOrganizationalWorkspace(result),false);
 assert.equal(canCreateOrganizationalWorkspace(result,{enabled:true}),true);
 const it=normalizeWorkspaceCreatorAuthority({...signed,basis:'it_admin'},
  {userId:user,workspaceId:workspace});
 assert.equal(canCreateOrganizationalWorkspace(it,{enabled:true}),true);
 for(const forged of [
  null,{...signed,userId:owner},{...signed,workspaceId:owner},
  {...signed,basis:'employee'},{...signed,basis:null},
  {...signed,allowed:false,basis:'organization_owner'},
  {...signed,schemaVersion:2}
 ]){
  assert.equal(normalizeWorkspaceCreatorAuthority(forged,{
   userId:user,workspaceId:workspace
  }).allowed,false);
 }
});
test('personal Main Workspace owner title alone does not grant create',()=>{
 const unverified={status:'SIGNED_CREATION_AUTHORITY',
  allowed:true,basis:'owner'};
 assert.equal(canCreateOrganizationalWorkspace(unverified,{enabled:true}),false);
 assert.equal(canCreateOrganizationalWorkspace({
  allowed:true,basis:'it_admin'
 },{enabled:true}),false);
 assert.equal(canCreateOrganizationalWorkspace(null,{enabled:true}),false);
});
test('workspace owner transfer is typed and requires expected owner and target',()=>{
 const valid=validateOwnershipTransfer({
  workspaceId:workspace,resourceKind:'workspace',targetUserId:user,
  expectedOwnerId:owner,requestId
 });
 assert.deepEqual(valid,{workspaceId:workspace,resourceKind:'workspace',
  targetUserId:user,expectedOwnerId:owner,requestId});
 assert.equal(validateOwnershipTransfer({
  workspaceId:workspace,resourceKind:'workspace',
  resourceId:user,targetUserId:user,expectedOwnerId:owner,requestId
 }),null);
 assert.equal(validateOwnershipTransfer({
  workspaceId:workspace,resourceKind:'application',resourceId:'time-tracker',
  targetUserId:user,expectedOwnerId:owner,requestId
 }),null);
 assert.equal(validateOwnershipTransfer({
  workspaceId:workspace,targetUserId:user,
  expectedOwnerId:user,requestId
 }),null);
});
test('no signed RPC or ownership transfer without server activation',async()=>{
 let reads=0;
 const client=new WorkspaceAuthorityClient({
  auth:{getVerifiedUser:async()=>{reads++;return {id:user};}},
  api:{context:async()=>{reads++;return {}},rpc:async()=>{reads++;return {}}}
 });
 assert.equal((await client.readCreatorAuthority()).allowed,false);
 await assert.rejects(client.transferOwnership({
  workspaceId:workspace,targetUserId:user,expectedOwnerId:owner,requestId
 }),/not yet activated/i);
 assert.equal(reads,0);
});
test('signed actor/active workspace must be stable before authority acceptance',async()=>{
 let calls=0;
 const auth={userId:user,getVerifiedUser:async()=>({id:user})};
 const api={context:async()=>({
  user_id:user,workspace_id:workspace,profile:{status:'active'}
 }),rpc:async(name,args)=>{
  calls++;
  assert.equal(name,'wm_ws03_creator_eligibility');
  assert.deepEqual(args,{});
  return signed;
 }};
 const client=new WorkspaceAuthorityClient({auth,api,enabled:true});
 assert.equal((await client.readCreatorAuthority()).allowed,true);
 assert.equal(calls,1);
 const mismatch=new WorkspaceAuthorityClient({auth,api:{
  ...api,context:async()=>({user_id:user,workspace_id:owner,profile:{status:'active'}})
 },enabled:true});
 assert.equal((await mismatch.readCreatorAuthority()).allowed,false);
});
test('backend candidates deny by default and require explicit creator roster',()=>{
 const sql=readFileSync('sql/ws03-restricted-workspace-creation-DISPOSABLE-CANDIDATE.sql','utf8');
 for(const token of [
  'restricted_creation_enabled boolean NOT NULL DEFAULT false',
  'private.ws03_creator_authorities',
  "a.authority IN('it_admin','organization_owner')",
  'private.ws01_signed_actor_session()',
  'CREATE OR REPLACE FUNCTION public.wm_ws01_create',
  "VALUES(v_id,v_actor,'owner')",
  'public.wm_ws03_creator_eligibility()',
  'FROM PUBLIC,anon,authenticated'
 ])assert.ok(sql.includes(token),token);
 const transfer=readFileSync('sql/ws03-workspace-ownership-transfer-DISPOSABLE-CANDIDATE.sql','utf8');
 for(const token of [
  'owner_transfer_enabled IS TRUE',
  'p_expected_owner_id',
  'workspace.owner.transferred',
  'p_target_user_id',
  'email_confirmed_at IS NOT NULL',
  "p_resource_kind IS DISTINCT FROM 'workspace'",
  'REVOKE ALL ON FUNCTION public.wm_ws03_transfer_ownership'
 ])assert.ok(transfer.includes(token),token);
 assert.doesNotMatch(transfer,/GRANT EXECUTE ON FUNCTION/i);
});
test('exact board/group and workspace invitations remain disabled',()=>{
 assert.match(readFileSync('frontend/workspace-board-groups.js','utf8'),
  /BOARD_GROUP_ACCESS_ENABLED=false/);
 assert.match(readFileSync('frontend/workspace-invitation-client.js','utf8'),
  /WS02D_INVITE_CLIENT_ENABLED=false/);
 assert.match(readFileSync('frontend/auth-account-flows.js','utf8'),
  /REGISTRATION_ADMISSION_ENABLED=false/);
});
