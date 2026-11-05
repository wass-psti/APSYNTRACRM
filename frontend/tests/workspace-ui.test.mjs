import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WS01_DISCOVERY_ENABLED,WS01_CREATION_ENABLED,WS01_SWITCHING_ENABLED,
 workspaceCatalog,visibleWorkspaces,normalizeServerWorkspaceCatalog,validateWorkspaceProposal,renderWorkspaceSwitcher
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
 assert.match(app,/openWorkspaceSelector\(\{id:state\.context\.workspace_id,name:workspaceName\(\)\}\)/);
 assert.match(app,/closeWorkspacePanels\(\);clearBulkActivation\(\)/);
 assert.match(index,/frontend\/workspace-ui\.css/);
 assert.match(smoke,/frontend\/workspace-ui\.js/);
 assert.match(smoke,/frontend\/workspace-ui\.css/);
});

test('future server catalog validates exact identity, active workspace, no duplicate or forged roles',()=>{
 const alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const good={schemaVersion:1,userId:alice,activeWorkspaceId:signedWorkspace,rows:[
  {id:signedWorkspace,name:'Work Management',relation:'member',active:true},
  {id:foreignWorkspace,name:'Engineering',relation:'member',active:false}
 ]};
 const scope={userId:alice,workspaceId:signedWorkspace};
 const parsed=normalizeServerWorkspaceCatalog(good,scope);
 assert.equal(parsed.status,'SIGNED_MEMBER_DISCOVERY');
 assert.equal(parsed.canSwitch,false);
 assert.equal(parsed.canCreate,false);
 assert.equal(parsed.canDiscoverAll,false);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'member'}).map(x=>x.id),
  [signedWorkspace,foreignWorkspace]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'recent'}).map(x=>x.id),
  [signedWorkspace]);
 assert.deepEqual(visibleWorkspaces(parsed,{tab:'owner'}),[]);
 for(const invalid of [
  {...good,userId:foreignWorkspace},
  {...good,activeWorkspaceId:foreignWorkspace},
  {...good,rows:[...good.rows,{...good.rows[0]}]},
  {...good,rows:[{...good.rows[0],active:false},good.rows[1]]},
  {...good,rows:[{...good.rows[0],relation:'owner'},good.rows[1]]},
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
