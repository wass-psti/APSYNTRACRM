import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync('scripts/cp-crm-conn-02g-employee-browser-acceptance.mjs','utf8');

test('CP-CRM-CONN-02G acceptance covers the four exact native module and canonical board contracts',()=>{
  for(const value of [
    'time-tracker','fund-released-tracker','fueltrack-plus','tradelink',
    '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
    'f36da8fe-8d9d-4629-9938-12533cb3ca39',
    '7af78b3f-67bf-4600-9aa1-9006d19d486e',
    '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
    'timetracker_ot_snapshot','timetracker_attendance_capabilities',
    'frt_bootstrap','frt_board_dashboard_safe','frt_board_list_safe',
    'fueltrack_v3_read','tl03_assigned_documents',
  ])assert.ok(script.includes(value),`missing acceptance contract: ${value}`);
  assert.match(script,/native_application_board_context/);
  assert.match(script,/context\?\.role,'Employee'/);
  assert.match(script,/--simulate-generic-denials/);
});

test('acceptance uses an existing signed employee session and never submits business writes',()=>{
  assert.match(script,/connectOverCDP/);
  assert.match(script,/An existing signed employee application tab must be open/);
  assert.match(script,/productionDataWritten=false/);
  assert.match(script,/workflowActionsSubmitted=false/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|document\.cookie|page\.click|\.fill\(|\.check\(|\.uncheck\(|\.selectOption\(|\.submit\(/);
});

test('generic board denial simulation is ephemeral and does not modify backend policies',()=>{
  assert.doesNotMatch(script,/wm_list_boards/);
  assert.match(script,/page\.route\(/);
  assert.match(script,/route\.fulfill\(\{status:403/);
  assert.match(script,/productionPoliciesChanged=false/);
  assert.match(script,/list_module_activity/);
  assert.match(script,/optionalActivityDenials/);
  assert.match(script,/genericViewPermissionRequests/);
  assert.match(script,/page\.unroute\(/);
});

test('native platform sync does not reintroduce generic board view, shell, catalog or layout prerequisites',()=>{
  const app=readFileSync('frontend/app.js','utf8');
  const start=app.indexOf('async function reconcilePlatformSync');
  const end=app.indexOf('let workspaceRelationReadGeneration',start);
  assert.ok(start>=0&&end>start,'platform sync function is present');
  const sync=app.slice(start,end);
  assert.match(sync,/nativeApplicationModuleForBoardId\(boardId\)/);
  assert.match(sync,/!nativeModuleId&&await db\.allowed\(boardId,'view'\)/);
  assert.match(sync,/refreshBoardCatalog&&!nativeModuleId\?await db\.boards\('active'\):state\.boards/);
  assert.match(sync,/nativeModuleId\?db\.nativeApplicationBoardContext\(nativeModuleId\)/);
  assert.match(sync,/nativeModuleId\?Promise\.resolve\(null\):readVisibleBoardSnapshot/);
  assert.match(sync,/nativeModuleId\?Promise\.resolve\(null\):boardStructureClient\.read\(boardId\)/);
  assert.match(sync,/nativeModuleId\?db\.allowed\(boardId,'edit'\)\.catch\(\(\)=>false\)/);
  assert.match(sync,/nativeModuleId\?db\.allowed\(boardId,'manage'\)\.catch\(\(\)=>false\)/);
});


test('native platform reconciliation identifies canonical application boards independent of transient tab state',()=>{
  const access=readFileSync('frontend/native-application-access.js','utf8');
  assert.match(access,/export function nativeApplicationModuleForBoardId\(boardId\)/);
  assert.match(access,/application\.boardId===boardId/);
  const app=readFileSync('frontend/app.js','utf8');
  assert.match(app,/nativeApplicationModuleForBoardId,nativeApplicationModuleForBoardRoute/);
});


test('routine platform reconciliation invalidates board snapshots without cancelling signed context reads',()=>{
  const data=readFileSync('frontend/data.js','utf8');
  const app=readFileSync('frontend/app.js','utf8');
  assert.match(data,/invalidateBoardCache\(boardId=null,\{revision=null,invalidateContext=true\}=\{\}\)/);
  assert.match(data,/if\(invalidateContext===true\)/);
  assert.match(app,/db\.invalidateBoardCache\(null,\{invalidateContext:event\.reason==='cross-tab'\}\)/);
});
