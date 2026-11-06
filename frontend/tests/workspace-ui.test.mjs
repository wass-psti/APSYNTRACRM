import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS01_DISCOVERY_ENABLED,WS01_CREATION_ENABLED,WS01_SWITCHING_ENABLED,
 workspaceCatalog,visibleWorkspaces,normalizeServerWorkspaceCatalog,validateWorkspaceProposal,assessWorkspaceCreationReadiness,submitWorkspaceCreation,renderWorkspaceSwitcher,
 WS02_INVITATIONS_ENABLED,validateWorkspaceInvitationDraft,renderWorkspaceInviteLaunch
} from '../workspace-ui.js';

const signedWorkspace='00000000-0000-4000-8000-000000000001';
const foreignWorkspace='00000000-0000-4000-8000-000000000002';
const current={id:signedWorkspace,name:'Work Management'};
test('workspace catalog admits only the current signed context; no unverified discovery',()=>{
 assert.equal(WS01_DISCOVERY_ENABLED,false);
 assert.equal(WS01_CREATION_ENABLED,false);
 assert.equal(WS01_SWITCHING_ENABLED,false);
 const result=workspaceCatalog(current);
 assert.equal(result.status,'CURRENT_WORKSPACE_ONLY');
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].id,signedWorkspace);
 assert.equal(result.canCreate,false);
 assert.equal(result.canSwitch,false);
 assert.equal(result.canDiscoverAll,false);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.rows));
 assert.ok(Object.isFrozen(result.rows[0]));
});
test('missing or invalid signed workspace returns no browsable workspaces',()=>{
 const missing=workspaceCatalog({id:'not-a-uuid',name:'Foreign'});
 assert.equal(missing.status,'UNAVAILABLE');
 assert.deepEqual(missing.rows,[]);
 assert.deepEqual(workspaceCatalog({id:foreignWorkspace,name:' '}).rows,[]);
});
test('all/recent/member filter contains only verified signed membership',()=>{
 const c=workspaceCatalog(current);
 for(const tab of ['all','recent','member']){
  assert.deepEqual(visibleWorkspaces(c,{tab}).map(x=>x.id),[signedWorkspace]);
 }
 for(const tab of ['owner','collaborator'])
  assert.deepEqual(visibleWorkspaces(c,{tab}),[]);
 assert.equal(visibleWorkspaces(c,{query:'WORK'}).length,1);
 assert.equal(visibleWorkspaces(c,{query:'unavailable'}).length,0);
 assert.equal(visibleWorkspaces(c,{query:'work',tab:'invalid'}).length,1);
});
test('unverified or forged foreign workspace entries never render',()=>{
 const c=workspaceCatalog(current);
 const injected={...c,rows:[...c.rows,{id:foreignWorkspace,name:'Secret',relation:'owner'}]};
 assert.deepEqual(visibleWorkspaces(injected).map(x=>x.id),[signedWorkspace]);
});
test('create-workspace review validates open/closed and rejects malicious names',()=>{
 assert.deepEqual(validateWorkspaceProposal({name:'  R&D Operations ',privacy:'closed'}),
  {valid:true,name:'R&D Operations',privacy:'closed'});
 assert.equal(validateWorkspaceProposal({name:'AB',privacy:'open'}).valid,true);
 for(const proposal of [
  {name:' ',privacy:'open'},{name:'A',privacy:'open'},
  {name:'x'.repeat(81),privacy:'closed'},
  {name:'<img src=x onerror=alert(1)>',privacy:'open'},
  {name:'Test',privacy:'public'},{name:'Test',privacy:''}
 ])assert.equal(validateWorkspaceProposal(proposal).valid,false);
});
test('workspace creation readiness explicitly blocks server activation without any workspace mutation',()=>{
 const valid=assessWorkspaceCreationReadiness({name:' Main Workspace ',privacy:'closed'});
 assert.equal(valid.valid,true);
 assert.equal(valid.canCreate,false);
 assert.equal(valid.status,'PENDING_SERVER_ACTIVATION');
 assert.match(valid.message,/approved signed server lifecycle/);
 assert.match(valid.message,/No workspace was created/);
 assert.ok(Object.isFrozen(valid));
 for(const draft of [
  {name:'',privacy:'closed'},
  {name:'A',privacy:'closed'},
  {name:'<svg onload=alert(1)>',privacy:'open'},
  {name:'Valid Name',privacy:'public'}
 ]){
  const outcome=assessWorkspaceCreationReadiness(draft);
  assert.equal(outcome.status,'INVALID_DRAFT');
  assert.equal(outcome.canCreate,false);
  assert.equal(outcome.valid,false);
  assert.ok(Object.isFrozen(outcome));
 }
});

test('create modal explains blocked lifecycle and defaults privacy closed without misleading save action',()=>{
 const module=readFileSync('frontend/workspace-ui.js','utf8');
 const css=readFileSync('frontend/workspace-ui.css','utf8');
 assert.match(module,/function createContent\(\{enabled=WS01_CREATION_ENABLED\}=\{\}\)/);
 assert.match(module,/aria-labelledby="ws01-create-title" aria-describedby="ws01-create-description/);
 assert.match(module,/id="ws01-proposal" novalidate/);
 assert.match(module,/name="privacy" value="closed" checked/);
 assert.match(module,/name="privacy" value="open"/);
 assert.match(module,/Open is workspace metadata only/);
 assert.match(module,/Creation unavailable — pending authorized backend activation/);
 assert.match(module,/type="submit" class="ws01-primary"/);
 assert.match(module,/active\?'Create workspace':'Validate draft'/);
 assert.match(module,/if\(!enabled\)\{/);
 assert.match(module,/ws01-create-footer/);
 assert.match(module,/aria-live="polite"/);
 assert.match(module,/assessWorkspaceCreationReadiness\(proposal\)/);
 assert.match(module,/field\.focus\(\)/);
 assert.doesNotMatch(module,/api\.rpc\(['\"]wm_ws01_create/);
 assert.match(css,/\.ws01-create-card \.ws01-create-footer\{/);
 assert.match(css,/\.ws01-create-card \.ws01-create-footer button\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/max-height:min\(90dvh,calc\(100dvh - 24px\)\)/);
 assert.match(css,/overflow-wrap:anywhere/);
});

test('workspace creation stays server-blocked by default and never invokes client create',async()=>{
 let calls=0;
 const lifecycle={create:async()=>{calls++;throw Error('MUST_NOT_WRITE');}};
 const requestId='11111111-1111-4111-8111-111111111111';
 const invalid=await submitWorkspaceCreation({
  proposal:{name:'x',privacy:'closed'},enabled:true,lifecycle,requestId
 });
 assert.equal(invalid.status,'INVALID_DRAFT');
 const disabled=await submitWorkspaceCreation({
  proposal:{name:'A Valid Workspace',privacy:'closed'},lifecycle,requestId
 });
 assert.equal(disabled.status,'PENDING_SERVER_ACTIVATION');
 assert.equal(disabled.ok,false);
 assert.equal(disabled.valid,true);
 assert.equal(calls,0);
 assert.equal(WS01_CREATION_ENABLED,false);
});

test('authorized creation path validates an exact owner receipt, stable UUID and idempotent replay',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111';
 const workspaceId='22222222-2222-4222-8222-222222222222';
 const calls=[];
 const lifecycle={create:async(arg)=>{
  calls.push(arg);
  return {workspaceId,relation:'owner',privacy:'closed',
   active:false,idempotent:calls.length>1};
 }};
 for(const status of ['CREATED','EXISTING_REQUEST']){
  const result=await submitWorkspaceCreation({
   proposal:{name:'  Engineering Pilot  ',privacy:'closed'},
   enabled:true,requestId,lifecycle
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,status);
  assert.equal(result.receipt.workspaceId,workspaceId);
  assert.equal(result.receipt.active,false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.receipt));
  assert.deepEqual(calls.at(-1),{
   name:'Engineering Pilot',privacy:'closed',requestId
  });
 }
 assert.equal(calls.length,2);
});

test('creation handler never mistakes denial, malformed receipt or ambiguous timeout as success',async()=>{
 const requestId='11111111-1111-4111-8111-111111111111';
 let calls=0;
 for(const status of [401,403,404,409,503,0,500]){
  const result=await submitWorkspaceCreation({
   proposal:{name:'Safe Workspace',privacy:'open'},
   enabled:true,requestId,
   lifecycle:{create:async()=>{calls++;throw {status,message:'secret_jwt_and_email_must_not_leak'}}}
  });
  assert.equal(result.ok,false);
  assert.notEqual(result.status,'CREATED');
  assert.doesNotMatch(result.message,/secret_jwt_and_email_must_not_leak/);
 }
 assert.equal(calls,7);
 const malformed=await submitWorkspaceCreation({
  proposal:{name:'Safe Workspace',privacy:'open'},enabled:true,requestId,
  lifecycle:{create:async()=>({workspaceId:requestId,
   relation:'admin',privacy:'open',active:true,idempotent:false})}
 });
 assert.equal(malformed.status,'UNCONFIRMED');
 assert.equal(malformed.ok,false);
 const badId=await submitWorkspaceCreation({
  proposal:{name:'Safe Workspace',privacy:'open'},enabled:true,
  requestId:'fake',
  lifecycle:{create:async()=>{throw Error('MUST_NOT_CALL')}}
 });
 assert.equal(badId.status,'CLIENT_NOT_READY');
});

test('new create UI keeps draft mode by default, guarded branch for authorized signed lifecycle',()=>{
 const module=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(module,/WS01_CREATION_ENABLED=false/);
 assert.match(module,/function createContent\(\{enabled=WS01_CREATION_ENABLED\}=\{\}\)/);
 assert.match(module,/if\(!enabled\)\{/);
 assert.match(module,/await submitWorkspaceCreation\(\{proposal:validated/);
 assert.match(module,/globalThis\.crypto\?\.randomUUID\?\.\(\)/);
 assert.match(module,/requestDraft!==fingerprint/);
 assert.match(module,/if\(busy\|\|completed\)return/);
 assert.match(module,/activeOverlay!==layer\|\|!layer\.isConnected/);
 assert.match(module,/data\.status|dataset\.status/);
 assert.match(module,/Create workspace/);
 assert.match(module,/Validate draft/);
 assert.match(app,/new WorkspaceLifecycleClient\(\{auth,api:db\}\)/);
 assert.match(app,/\{lifecycle:workspaceLifecycleClient\}/);
 assert.doesNotMatch(module,/fetch\(|localStorage|sessionStorage/);
});

test('workspace switcher escapes signed workspace name and exposes an accessible action',()=>{
 const markup=renderWorkspaceSwitcher({
  id:signedWorkspace,name:'<script>alert("x")</script>'});
 assert.doesNotMatch(markup,/<script>/);
 assert.match(markup,/&lt;script&gt;/);
 assert.match(markup,/data-action="ws01-open"/);
 assert.match(markup,/aria-haspopup="dialog"/);
 const unavailable=renderWorkspaceSwitcher({});
 assert.match(unavailable,/Workspace unavailable/);
});
test('integration is limited to authorized workspace context and never executes a lifecycle RPC',()=>{
 const module=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 const index=readFileSync('index.html','utf8');
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.doesNotMatch(module,/[.]rpc\(['"](?:wm_create_workspace|wm_switch_workspace|wm_ws01_create|wm_ws01_switch)/);
 assert.match(module,/WS01_CREATION_ENABLED=false/);
 assert.match(module,/No workspace was created/);
 assert.match(app,/renderWorkspaceSwitcher\(\{id:state\.context\?\.workspace_id,name:workspaceName\(\)\}\)/);
 assert.match(app,/openWorkspaceSelector\(\{id:state\.context\.workspace_id,name:workspaceName\(\)\},\{lifecycle:workspaceLifecycleClient\}\)/);
 assert.match(app,/closeWorkspacePanels\(\);clearBulkActivation\(\)/);
 assert.match(index,/frontend\/workspace-ui\.css/);
 assert.match(smoke,/frontend\/workspace-ui\.js/);
 assert.match(smoke,/frontend\/workspace-ui\.css/);
});

test('future server catalog validates exact identity, active workspace, no duplicate or forged roles',()=>{
 const alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const good={schemaVersion:1,userId:alice,activeWorkspaceId:signedWorkspace,rows:[
  {id:signedWorkspace,name:'Work Management',relation:'member',privacy:'closed',active:true},
  {id:foreignWorkspace,name:'Engineering',relation:'collaborator',privacy:'open',active:false}
 ]};
 const scope={userId:alice,workspaceId:signedWorkspace};
 const parsed=normalizeServerWorkspaceCatalog(good,scope);
 assert.equal(parsed.status,'SIGNED_MEMBER_DISCOVERY');
 assert.equal(parsed.canSwitch,false);
 assert.equal(parsed.canCreate,false);
 assert.equal(parsed.canDiscoverAll,false);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'member'}).map(x=>x.id),
  [signedWorkspace]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'recent'}).map(x=>x.id),
  [signedWorkspace]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'owner'}),[]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'collaborator'}).map(x=>x.id),[foreignWorkspace]);
 for(const invalid of [
  {...good,userId:foreignWorkspace},
  {...good,activeWorkspaceId:foreignWorkspace},
  {...good,rows:[...good.rows,{...good.rows[0]}]},
  {...good,rows:[{...good.rows[0],active:false},good.rows[1]]},
  {...good,rows:[{...good.rows[0],relation:'superuser'},good.rows[1]]},
  {...good,rows:[{...good.rows[0],privacy:'public'},good.rows[1]]},
  {...good,rows:good.rows.slice(1)},
  {...good,rows:[{...good.rows[0],name:' '},good.rows[1]]}
 ])assert.equal(normalizeServerWorkspaceCatalog(invalid,scope).status,'INVALID');
});
test('staged discovery SQL requires genuine signed session and never grants table reads',()=>{
 const sql=readFileSync('sql/cp-ws01-discovery-activation-candidate.sql','utf8');
 assert.match(sql,/private\.wm_board_config_session_active\(\)/);
 assert.match(sql,/m\.user_id=v_actor AND m\.active IS TRUE/);
 assert.match(sql,/p\.status='active'/);
 assert.match(sql,/public\.current_workspace_id\(v_actor\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_ws01_list\(\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.wm_ws01_list\(\) TO authenticated/);
 assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON (?:TABLE )?public\.(?:workspaces|workspace_members)/i);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\s+public\.(?:workspaces|workspace_members)/i);
});

test('signed membership role is server-supplied and cannot be invented for legacy workspaces',()=>{
 const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const raw={schemaVersion:1,userId:actor,activeWorkspaceId:signedWorkspace,rows:[
  {id:signedWorkspace,name:'Main',relation:'owner',privacy:'closed',active:true},
  {id:foreignWorkspace,name:'Shared',relation:'collaborator',privacy:'closed',active:false}
 ]};
 const parsed=normalizeServerWorkspaceCatalog(raw,{userId:actor,workspaceId:signedWorkspace});
 assert.equal(parsed.status,'SIGNED_MEMBER_DISCOVERY');
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'owner'}).map(x=>x.id),[signedWorkspace]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'collaborator'}).map(x=>x.id),[foreignWorkspace]);
 assert.equal(visibleWorkspaces(workspaceCatalog(current),{tab:'owner'}).length,0);
});

// CP-WS-02D reference interaction: the invitation UI is visible without claiming
// platform authority, backend invitation delivery, or privileged role grants.
test('workspace invitation launch exists only for the signed current workspace',()=>{
 assert.equal(WS02_INVITATIONS_ENABLED,false);
 const launch=renderWorkspaceInviteLaunch(current);
 assert.match(launch,/data-action="ws02-open-invites"/);
 assert.match(launch,/Invite members/);
 assert.match(launch,/aria-haspopup="dialog"/);
 assert.match(renderWorkspaceInviteLaunch(current,{placement:'topbar'}),/ws02-invite-topbar/);
 assert.equal(renderWorkspaceInviteLaunch({id:'bad-id',name:'Private'}),'');
 assert.equal(renderWorkspaceInviteLaunch({id:signedWorkspace,name:' '}),'');
 const malicious=renderWorkspaceInviteLaunch({id:signedWorkspace,name:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(malicious,/<img/);
 assert.match(malicious,/&lt;img/);
});

test('invitation review accepts distinct emails and strictly workspace-local role drafts',()=>{
 const valid=validateWorkspaceInvitationDraft({
  emails:'  member@example.com,admin@example.org;viewer@example.net  ',
  role:'viewer',message:'Coordinate next week.'
 });
 assert.equal(valid.valid,true);
 assert.deepEqual(valid.recipients,['member@example.com','admin@example.org','viewer@example.net']);
 assert.equal(valid.role,'viewer');
 assert.equal(valid.message,'Coordinate next week.');
 assert.equal(Object.isFrozen(valid),true);
 assert.equal(Object.isFrozen(valid.recipients),true);
 for(const role of ['admin','member','viewer']){
  assert.equal(validateWorkspaceInvitationDraft({emails:'friend@example.com',role}).valid,true);
 }
 for(const bad of [
  {emails:'',role:'member'},
  {emails:'not-email',role:'member'},
  {emails:'name@example.com,NAME@example.com',role:'member'},
  {emails:'email@example.com',role:'owner'},
  {emails:'email@example.com',role:'admin_general_manager'},
  {emails:'email@example.com',role:'member',message:'X'.repeat(501)},
  {emails:'email@example.com',role:'viewer',message:'Hello\u0000there'},
  {emails:Array.from({length:11},(_,i)=>'person'+i+'@example.com').join(','),role:'viewer'}
 ])assert.equal(validateWorkspaceInvitationDraft(bad).valid,false,JSON.stringify(bad).slice(0,140));
});

test('invitation panel previews draft only, never sends email or creates memberships',()=>{
 const module=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/workspace-ui.css','utf8');
 assert.match(module,/function inviteContent\(current\)/);
 assert.match(module,/role="dialog" aria-modal="true"/);
 assert.match(module,/ws02-invite-title/);
 for(const part of ['name="emails"','name="role"','name="message"',
  'value="admin"','value="member"','value="viewer"',
  'Send invites — pending activation','disabled aria-describedby',
  'data-ws02-context','No invitations were sent',
  'WS02_INVITATIONS_ENABLED=false'])
  assert.ok(module.includes(part),part);
 assert.doesNotMatch(module,/\.rpc\(['"](?:wm_ws02_invite|wm_invite_workspace|wm_ws01_invite)/);
 assert.doesNotMatch(module,/fetch\(['"]\/auth\/v1\/invite|fetch\(['"]\/rest\/v1\/rpc/);
 assert.match(app,/renderWorkspaceInviteLaunch\(\{id:state\.context\?\.workspace_id,name:workspaceName\(\)\}\)/);
 assert.match(module,/data-action="ws02-open-invites"/);
 assert.match(app,/case 'ws02-open-invites':/);
 assert.match(app,/openWorkspaceInvitationDialog\(\{/);
 assert.match(css,/\.ws02-invite-card/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
