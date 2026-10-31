import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';
const board='33333333-3333-4333-8333-333333333333';
const context={user_id:'11111111-1111-4111-8111-111111111111',
 workspace_id:'22222222-2222-4222-8222-222222222222',
 profile:{status:'active',platform_role:'employee'}};
test('SEC10 post-transition action is blocked until a real board is selected',()=>{
 const html=renderSecurityAcceptance({context});
 assert.match(html,/CP-FRT-SEC10/);
 assert.match(html,/data-action="security-sec10-readonly" disabled/);
 assert.match(html,/independently approved isolated nonproduction/);
 assert.doesNotMatch(html,/data-action="security-sec10-copy"/);
});
test('known accessible board is displayed as a safe escaped option',()=>{
 const html=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'<script>alert(1)</script>'}]});
 assert.match(html,/data-action="security-sec10-readonly"/);
 assert.doesNotMatch(html,/data-action="security-sec10-readonly" disabled/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/value="SUPERVISOR"/);
 assert.match(html,/value="RESTORED"/);
});
test('verified bootstrap administrator sees SEC10 unavailable and explicit signout guidance',()=>{
 const html=renderSecurityAcceptance({context,sec10IsBootstrap:true,sec10Boards:[{id:board,name:'QA'}]});
 assert.match(html,/data-action="security-sec10-readonly" disabled/);
 assert.match(html,/This session is a verified bootstrap administrator/);
 assert.match(html,/Sign out before testing/);
 assert.match(html,/approved isolated nonproduction environment/);
});
test('blocked results distinguish bootstrap session from malformed signed decision',()=>{
 const html=renderSecurityAcceptance({context,sec10IsBootstrap:true,sec10Boards:[{id:board,name:'QA'}],
  sec10Result:{scenario:'BOOTSTRAP',phase:'VIEWER',status:'BLOCKED',
   reason:'BOOTSTRAP_SESSION_INELIGIBLE',checks:[]}});
 assert.match(html,/Signed scenario: BOOTSTRAP/);
 assert.match(html,/BOOTSTRAP_SESSION_INELIGIBLE/);
 assert.match(html,/selection does not change account roles/);
 const other=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'QA'}],
  sec10Result:{scenario:'UNVERIFIED',phase:'VIEWER',status:'BLOCKED',
   reason:'INVALID_BOOTSTRAP_DECISION',checks:[]}});
 assert.match(other,/invalid administrator-classification result/);
});
test('Supervisor on Viewer-only board reports unmet ownership rather than failed privilege',()=>{
 const html=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'Operations'}],
  sec10Result:{phase:'SUPERVISOR',scenario:'NONBOOTSTRAP',status:'BLOCKED',
   reason:'PREEXISTING_BOARD_OWNER_REQUIRED',checks:[],
   writesAttempted:0,roleChangesAttempted:0}});
 assert.match(html,/PREEXISTING_BOARD_OWNER_REQUIRED/);
 assert.match(html,/CRM Supervisor does not override board Viewer permissions/);
 assert.match(html,/pre-existing ownership/);
 assert.match(html,/Writes: 0/);
 assert.doesNotMatch(html,/SEC10 signed capability result: PASS/);
});
test('result remains labeled read-only with no proof of new Auth issuance',()=>{
 const html=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'FRT'}],sec10Result:{
  phase:'VIEWER',status:'PASS',checks:[{name:'<img onerror=alert(1)>',status:'FAIL'}],
  writesAttempted:0
 }});
 assert.match(html,/SEC10 signed capability result: PASS/);
 assert.match(html,/Fresh Auth session independently verified: NO/);
 assert.match(html,/Prior ownership independently verified: NO/);
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img onerror/);
 assert.match(html,/data-action="security-sec10-copy"/);
});
test('staged transition failures explain that a selected label is not a role assignment',()=>{
 const html=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'FRT'}],sec10Result:{
  phase:'VIEWER',scenario:'NONBOOTSTRAP',status:'BLOCKED',
  reason:'STAGE_NOT_CONFIRMED_BY_BACKEND',checks:[],writesAttempted:0
 }});
 assert.match(html,/STAGE_NOT_CONFIRMED_BY_BACKEND/);
 assert.match(html,/dropdown does not assign Viewer\/Supervisor/);
 assert.match(html,/signed effective-permissions inspection/);
 const restored=renderSecurityAcceptance({context,sec10Boards:[{id:board,name:'FRT'}],sec10Result:{
  phase:'RESTORED',scenario:'NONBOOTSTRAP',status:'BLOCKED',
  reason:'ORIGINAL_OPERATIONAL_PREREQUISITES_MISSING',checks:[],writesAttempted:0
 }});
 assert.match(restored,/board-owner or FRT-module prerequisite/);
});
test('SEC10 app action uses read-only signed runner with context invalidation',()=>{
 const s=readFileSync('frontend/app.js','utf8');
 assert.match(s,/runFRTSec10SignedCeilingProbe\(\{auth,api:db,boardId,stage\}\)/);
 assert.match(s,/sanitizeFRTSec10Report\(state\.sec10Result\)/);
 assert.match(s,/case 'security-sec10-readonly'/);
 assert.match(s,/case 'security-sec10-copy'/);
 assert.match(s,/sec10IsBootstrap:state\.roleVerified===true/);
 assert.match(s,/if\(state\.roleVerified===true\)/);
 assert.match(s,/revision!==state\.sec10RunId\|\|!auth\.isSignedIn/);
 assert.match(s,/state\.sec10Result=null;state\.sec10RunId\+\+;/);
 const action=s.split("case 'security-sec10-readonly':{")[1].split("case 'security-sec10-copy':{")[0];
 assert.doesNotMatch(action,/setCrmPlatformRole|apsyntra_crm_platform_role_set|\.mutate\(|\.insert\(|\.update\(|\.delete\(/);
});
