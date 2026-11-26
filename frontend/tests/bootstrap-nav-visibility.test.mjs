import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {showEngineeringDiagnostics} from '../engineering-diagnostics-visibility.js';
import {signedCrmRoleLabel,signedCrmIdentityLabel} from '../crm-role-context.js';
import {workspaceRelationLabel} from '../workspace-relation-context.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_BOARD_APPLICATIONS} from '../workspace-application-ownership.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const app=readFileSync('frontend/app.js','utf8');
const sidebarSource=app.slice(app.indexOf('function sidebar(){'),
 app.indexOf('/** Signed session-local basemap opt-in.'));
const renderSidebar=new Function('state','TRADELINK_BOARD_ID','TRADELINK_APPLICATION_ROUTE','FUELTRACK_V3_APPLICATION_ROUTE','location','showEngineeringDiagnostics','sidebarNav','renderWorkspaceSwitcher',
 'renderWorkspaceInviteLaunch','workspaceName','name','initials','e','sidebarIcon',
 'signedCrmRoleLabel','signedCrmIdentityLabel','workspaceRelationLabel','currentSidebarNavigation',
 'BOARD_MODULES','STANDALONE_APPLICATION_MODULE_KEYS','moduleByBoardName','workspaceApplicationsForNavigation','isStandaloneApplicationBoard',sidebarSource+'\nreturn sidebar();');
const nav=(href,label)=>`<a href="${href}">${label}</a>`;
const render=({roleVerified,platform_role='employee',search='',workspaceId='test-workspace',boards=[],workspaceTransitionPending=false})=>renderSidebar(
 {roleVerified,boards,workspaceTransitionPending,view:'overview',boardId:null,
  context:{user_id:'test-user',workspace_id:workspaceId,profile:{platform_role}}},
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','#/tradelink','#/fueltrack',{search},showEngineeringDiagnostics,nav,()=>'',()=>'',()=> 'Test workspace',()=> 'Test user',()=> 'TU',String,()=>'',signedCrmRoleLabel,signedCrmIdentityLabel,workspaceRelationLabel,()=> 'overview',[],new Set(),()=>null,workspaceApplicationsForNavigation,()=>false
);

test('Foundation and Pages Acceptance links require server-verified bootstrap status',()=>{
 for(const roleVerified of [false,undefined,null,0]){
  const html=render({roleVerified,platform_role:'admin_general_manager'});
  assert.doesNotMatch(html,/#\/foundation|#\/acceptance|12-board foundation|Pages acceptance/);
  assert.match(html,/#\/overview/);
  assert.match(html,/#\/boards/);
  assert.match(html,/#\/settings/);
 }
 const regularBootstrap=render({roleVerified:true});
 assert.doesNotMatch(regularBootstrap,/#\/foundation|#\/acceptance|#\/security/);
 const bootstrap=render({roleVerified:true,search:'?diagnostics=1'});
 assert.match(bootstrap, /href="#\/foundation"/);
 assert.match(bootstrap, /href="#\/acceptance"/);
 assert.match(bootstrap, /href="#\/security"/);
 const forged=render({roleVerified:false,search:'?diagnostics=1'});
 assert.doesNotMatch(forged,/#\/foundation|#\/acceptance|#\/security/);
});

test('direct routes use the authoritative bootstrap verification RPC before rendering',()=>{
 const route=app.slice(app.indexOf('async function onRoute(){'),
  app.indexOf('function validateAndSubmitAccessRequest('));
 assert.match(route,/\['role-configuration','foundation','acceptance'\]\.includes\(state\.view\)/);
 assert.match(route,/await roleConfig\.bootstrapVerified\(\)/);
 assert.match(route,/if\(state\.view==='user-role-management'\)/);
 assert.match(route,/ensureTeamsController\(\);controller\.bindGlobal\(\);render\(\);await controller\.load\(\)/);
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
 assert.match(app,/if\(!verified&&\['foundation','acceptance'\]\.includes\(view\)\)/);
});

test('application navigation is rendered only for the owning Work Management workspace',()=>{
 const boards=WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application=>({id:application.boardId,name:application.name}));
 const workManagement=render({workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,boards});
 const workManagementPrimary=workManagement.split('<nav class="nav-list" aria-label="Primary">')[1].split('</nav>')[0];
 const applicationSection=workManagementPrimary.split('Applications</div>')[1]||'';
 const applicationHrefs=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,boards).map(application=>application.href);
 assert.equal(applicationHrefs.length,15);
 for(const href of applicationHrefs)assert.ok(applicationSection.includes('href=\"'+href+'\"'),href);
 for(const label of ['FM1 Ticketing','TimeTracker','Fund Tracker','FuelTrack+','TradeLink',
  'Paseo de Lomboy','TalkBox','FuelTrans Support Portal','Tool Traceability','Toolbox Issues',
  'Order Intake','Employee Evaluation','Charter Navigator','APS AIMS','Material Request Hub'])
  assert.ok(applicationSection.includes(label),label);

 const otherWorkspace=render({workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  boards:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Personal board'}]});
 const otherPrimary=otherWorkspace.split('<nav class="nav-list" aria-label="Primary">')[1].split('</nav>')[0];
 assert.doesNotMatch(otherPrimary,/Applications|FM1 Ticketing|TimeTracker|Fund Tracker|FuelTrack\+|TradeLink|Paseo de Lomboy|TalkBox|Tool Traceability|Toolbox Issues/);
 for(const href of ['#/overview','#/boards','#/user-role-management','#/settings'])
  assert.ok(otherPrimary.includes('href=\"'+href+'\"'),href);
 assert.match(otherWorkspace,/Personal board/);
});

test('the application section disappears immediately while a verified workspace transition is loading',()=>{
 const boards=WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application=>({id:application.boardId,name:application.name}));
 const pending=render({workspaceId:WORK_MANAGEMENT_WORKSPACE_ID,boards,workspaceTransitionPending:true});
 const primary=pending.split('<nav class="nav-list" aria-label="Primary">')[1].split('</nav>')[0];
 assert.doesNotMatch(primary,/Applications|FM1 Ticketing|TimeTracker|Fund Tracker|FuelTrack\+|TradeLink|Paseo de Lomboy|TalkBox/);
 assert.match(primary,/#\/overview/);
});
