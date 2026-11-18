import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_MODULES} from '../board-manifest.js';

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

test('native application section preserves standalone routes and authorized module boards',()=>{
 for(const route of ['#/fm1','#/time-tracker','#/fund-tracker'])assert.ok(sidebar.includes(route),route);
 for(const label of ['FuelTrack+','TradeLink'])assert.ok(sidebar.includes(label),label);
 assert.equal(BOARD_MODULES.length,12);
 assert.match(sidebar,/const boardApplications=BOARD_MODULES\.filter/);
 assert.match(sidebar,/state\.boards\.find\(row=>moduleByBoardName\(row\.name\)\?\.key===module\.key\)/);
 assert.match(sidebar,/board\?sidebarNav\(nativePlaceholderHref\(module\.key\),module\.name/);
 assert.match(sidebar,/Applications<\/div>/);
 assert.match(sidebar,/boardApplications\+/);
 assert.match(sidebar,/sidebar-recent-list/);
 assert.match(sidebar,/!isStandaloneApplicationBoard\(board\)/);
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
 assert.match(scope,/\['focus','visible','cross-tab'\]\.includes\(reason\)/);
 assert.match(scope,/Date\.now\(\)-crmRoleLastReadAt>=10000/);
 assert.match(scope,/refreshSignedCrmRole\(\{force:roleRecheck\}\)/);
 assert.doesNotMatch(scope,/role_set|\.mutate\(/);
});
