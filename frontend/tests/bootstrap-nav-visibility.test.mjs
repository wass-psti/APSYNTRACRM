import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');
const sidebarSource=app.slice(app.indexOf('function sidebar(){'),
 app.indexOf('/** Signed session-local basemap opt-in.'));
const renderSidebar=new Function('state','sidebarNav','renderWorkspaceSwitcher',
 'renderWorkspaceInviteLaunch','workspaceName','name','initials','e','sidebarIcon',
 sidebarSource+'\nreturn sidebar();');
const nav=(href,label)=>`<a href="${href}">${label}</a>`;
const render=({roleVerified,platform_role='employee'})=>renderSidebar(
 {roleVerified,boards:[],view:'overview',boardId:null,
  context:{user_id:'test-user',workspace_id:'test-workspace',profile:{platform_role}}},
 nav,()=>'',()=>'',()=> 'Test workspace',()=> 'Test user',()=> 'TU',String,()=>''
);

test('Foundation and Pages Acceptance links require server-verified bootstrap status',()=>{
 for(const roleVerified of [false,undefined,null,0]){
  const html=render({roleVerified,platform_role:'admin_general_manager'});
  assert.doesNotMatch(html,/#\/foundation|#\/acceptance|12-board foundation|Pages acceptance/);
  assert.match(html,/#\/overview/);
  assert.match(html,/#\/boards/);
  assert.match(html,/#\/settings/);
 }
 const bootstrap=render({roleVerified:true});
 assert.match(bootstrap, /href="#\/foundation"/);
 assert.match(bootstrap, /href="#\/acceptance"/);
});

test('direct routes use the authoritative bootstrap verification RPC before rendering',()=>{
 const route=app.slice(app.indexOf('async function onRoute(){'),
  app.indexOf('function validateAndSubmitAccessRequest('));
 assert.match(route,/\['role-configuration','user-role-management','foundation','acceptance'\]\.includes\(state\.view\)/);
 assert.match(route,/await roleConfig\.bootstrapVerified\(\)/);
 assert.match(route,/location\.hash=routeHome;return onRoute\(\)/);
 const renderSource=app.slice(app.indexOf('function render(){'),app.indexOf('function findBoardCard('));
 assert.match(renderSource,/state\.view==='foundation'&&state\.roleVerified===true/);
 assert.match(renderSource,/state\.view==='acceptance'&&state\.roleVerified===true/);
});

test('sensitive acceptance actions are not entered by non-bootstrap sessions',()=>{
 for(const action of ['foundation-refresh','foundation-provision','foundation-operational-test',
  'run-pages-acceptance','run-native-acceptance']){
  const pos=app.indexOf(`case '${action}':{`);
  assert.ok(pos>0,action);
  assert.match(app.slice(pos,pos+110),/if\(state\.roleVerified!==true\)return;/);
 }
 assert.match(app,/if\(!verified&&\['role-configuration','user-role-management','foundation','acceptance'\]\.includes\(view\)\)/);
});
