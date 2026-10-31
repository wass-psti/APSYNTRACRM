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
test('SEC10 app action uses read-only signed runner with context invalidation',()=>{
 const s=readFileSync('frontend/app.js','utf8');
 assert.match(s,/runFRTSec10SignedCeilingProbe\(\{auth,api:db,boardId,stage\}\)/);
 assert.match(s,/sanitizeFRTSec10Report\(state\.sec10Result\)/);
 assert.match(s,/case 'security-sec10-readonly'/);
 assert.match(s,/case 'security-sec10-copy'/);
 assert.match(s,/revision!==state\.sec10RunId\|\|!auth\.isSignedIn/);
 assert.match(s,/state\.sec10Result=null;state\.sec10RunId\+\+;/);
 const action=s.split("case 'security-sec10-readonly':{")[1].split("case 'security-sec10-copy':{")[0];
 assert.doesNotMatch(action,/setCrmPlatformRole|apsyntra_crm_platform_role_set|\.mutate\(|\.insert\(|\.update\(|\.delete\(/);
});
