import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';
const context={workspace_id:'22222222-2222-4222-8222-222222222222',profile:{platform_role:'hr',status:'active'}};
test('general signed inspector works for HR even when there are no authorized boards',()=>{
 const html=renderSecurityAcceptance({context,sec10Boards:[],sec10IsBootstrap:false});
 assert.match(html,/data-action="security-effective-access"/);
 assert.doesNotMatch(html,/data-action="security-effective-access" disabled/);
 assert.match(html,/No authorized active boards are available/);
 assert.match(html,/id="sec10-board" class="search-input" disabled/);
 assert.match(html,/data-action="security-sec10-readonly" disabled/);
});
test('bootstrap can inspect own effective permissions, but controlled transition is not permitted',()=>{
 const html=renderSecurityAcceptance({context:{...context,profile:{platform_role:'admin_general_manager',status:'active'}},
  sec10IsBootstrap:true,sec10Boards:[{id:'33333333-3333-4333-8333-333333333333',name:'FRT'}]});
 assert.match(html,/data-action="security-effective-access"/);
 assert.doesNotMatch(html,/data-action="security-effective-access" disabled/);
 assert.match(html,/data-action="security-sec10-readonly" disabled/);
});
test('signed HR empty board snapshot has explicit empty state and module permissions',()=>{
 const report={status:'PASS',scenario:'NONBOOTSTRAP',platformRole:'hr',
  effectivePlatformRole:'supervisor',explicitPlatformRole:null,
  boards:[],boardsEmpty:true,modules:[{moduleId:'fund-released-tracker',role:null,allowed:false}]};
 const html=renderSecurityAcceptance({context,effectiveAccessResult:report,sec10Boards:[]});
 assert.match(html,/Effective CRM platform role: supervisor/);
 assert.match(html,/No boards are currently authorized/);
 assert.match(html,/fund-released-tracker/);
 assert.match(html,/Denied/);
 assert.match(html,/data-action="security-effective-access-copy"/);
});
test('module/board labels and server reason are escaped, no XSS',()=>{
 const html=renderSecurityAcceptance({context,effectiveAccessResult:{
  status:'PASS',scenario:'BOOTSTRAP',platformRole:'admin_general_manager',
  effectivePlatformRole:'admin',explicitPlatformRole:null,
  boardsEmpty:false,
  boards:[{name:'<svg onload=alert(1)>',memberRole:null,view:true,edit:true,manage:true}],
  modules:[{moduleId:'tradelink',role:'<img onerror=alert(1)>',allowed:true}]
 }});
 assert.match(html,/&lt;svg onload/);
 assert.doesNotMatch(html,/<svg onload/);
 assert.match(html,/&lt;img onerror/);
 assert.doesNotMatch(html,/<img onerror/);
});
test('controller uses signed inspector RPC and invalidates report on identity changes',()=>{
 const s=readFileSync('frontend/app.js','utf8');
 assert.match(s,/inspectMySignedEffectiveAccess\(\{auth,api:db\}\)/);
 assert.match(s,/sanitizeEffectiveAccessReport\(state\.effectiveAccessResult\)/);
 assert.match(s,/case 'security-effective-access'/);
 assert.match(s,/state\.effectiveAccessResult=null;state\.effectiveAccessRunId\+\+/);
 const action=s.split("case 'security-effective-access':{")[1].split("case 'security-effective-access-copy':{")[0];
 assert.doesNotMatch(action,/setCrmPlatformRole|role_manage|role_set|\.mutate\(|\.insert\(|\.delete\(/);
});
