import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_MODULES} from '../board/services/manifest.js';
import {WORK_MANAGEMENT_BOARD_APPLICATIONS} from '../workspace-application-ownership.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const app=readFileSync('frontend/app.js','utf8');
const presentation=readFileSync('frontend/monday-inspired-ui.js','utf8');
const sidebar=app.slice(app.indexOf('function sidebar(){'),
 app.indexOf('/** Signed session-local basemap opt-in.'));

test('Monday presentation must preserve host-authorized applications and admin controls',()=>{
 const start=presentation.indexOf('// The signed host owns navigation and capabilities.');
 const end=presentation.indexOf('// Keep existing host navigation and board catalog intact',start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(presentation.slice(start,end),/\.remove\(|\.hidden\s*=\s*true/);
 assert.match(presentation.slice(start,end),/a\[href="#\/overview"\]/);
 assert.match(sidebar,/state\.adminVerified===true/);
 assert.match(sidebar,/role-configuration/);
 assert.match(sidebar,/user-role-management/);
});

test('native application section is generated from the canonical manifest for Work Management only',()=>{
 assert.equal(BOARD_MODULES.length,12);
 assert.equal(WORK_MANAGEMENT_BOARD_APPLICATIONS.length,12);
 assert.match(sidebar,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
 assert.match(sidebar,/const applicationNav=applications\.map/);
 assert.match(sidebar,/const applicationSection=applications\.length\?/);
 assert.match(sidebar,/active\(application\.navigationKey\)/);
 assert.match(sidebar,/sidebar-recent-list/);
 assert.match(sidebar,/!isStandaloneApplicationBoard\(board\)/);
 const boards=WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application=>({id:application.boardId,name:application.name}));
 const navigation=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,boards);
 assert.equal(navigation.length,15);
 for(const route of ['#/fm1','#/time-tracker','#/fund-tracker','#/fueltrack','#/tradelink','#/paseo','#/talkbox'])
  assert.ok(navigation.some(application=>application.href===route),route);
 assert.deepEqual(workspaceApplicationsForNavigation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',boards),[]);
});

test('CRM tier change revalidates signed administrator capability without profile mutation',()=>{
 const start=app.indexOf('async function refreshSignedCrmRole(');
 const end=app.indexOf('async function refreshWorkspace()',start);
 const scope=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(scope,/previousRole=currentSignedCrmRole\(state\.crmRoleSnapshot,ctx\)\?\.effectiveRole/);
 assert.match(scope,/previousRole!==undefined&&previousRole!==role\.effectiveRole/);
 assert.match(scope,/await roleConfig\.adminVerified\(\)/);
 assert.match(scope,/state\.adminVerified=admin/);
 assert.match(scope,/generation!==crmRoleReadGeneration/);
 assert.match(scope,/auth\.accessToken!==token/);
 assert.match(scope,/location\.hash='#\/overview'/);
 assert.doesNotMatch(scope,/\.mutate\(|role_set|UPDATE public/);
});

test('focus, visibility and cross-tab reconciliation detect workspace role reassignment without polling storms',()=>{
 const start=app.indexOf('async function reconcilePlatformSync(');
 const end=app.indexOf('async function refreshSignedWorkspaceRelation()',start);
 const scope=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(scope,/shouldRecheckWorkspaceRoles\(\{reason,roleChanged,/);
 assert.match(scope,/lastReadAt:crmRoleLastReadAt/);
 assert.match(scope,/if\(roleRecheck\)\{/);
 assert.match(scope,/refreshSignedCrmRole\(\{force:roleRecheck\}\)/);
 assert.doesNotMatch(scope,/if\(roleChanged\|\|sensitive\)/);
 assert.doesNotMatch(scope,/role_set|\.mutate\(/);
});
