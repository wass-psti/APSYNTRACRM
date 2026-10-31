import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';

const context={workspace_id:'22222222-2222-4222-8222-222222222222',
 profile:{status:'active',platform_role:'employee'}};

test('existing signed workspace users have explicit paired read-only SEC09 action',()=>{
 const html=renderSecurityAcceptance({context});
 assert.match(html,/CP-FRT-SEC09/);
 assert.match(html,/data-action="security-sec09-readonly"/);
 assert.match(html,/attempts no role, membership, board or finance writes/);
 assert.doesNotMatch(html,/data-action="security-sec09-copy"/);
});
test('active paired read-only run disables duplicate activation',()=>{
 const html=renderSecurityAcceptance({context,sec09Busy:true});
 assert.match(html,/data-action="security-sec09-readonly" disabled/);
});
test('runner statuses rendered safely and BLOCKED not represented as PASS',()=>{
 const html=renderSecurityAcceptance({context,sec09Result:{
  checkpoint:'CP-FRT-SEC09',status:'BLOCKED',scenario:'BOOTSTRAP',reason:'SEC07_ACTIVATION_BLOCKED',
  sources:[{checkpoint:'CP-FRT-SEC03',status:'PASS',checks:[{name:'safe-check',status:'PASS'}]}],
  checks:[{name:'<img src=x onerror=alert(1)>',status:'FAIL'}],
  writesAttempted:0,roleChangesAttempted:0
 }});
 assert.match(html,/SEC09 result: BLOCKED/);
 assert.match(html,/SEC07_ACTIVATION_BLOCKED/);
 assert.match(html,/&lt;img src=x/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/Copy nonsecret SEC09 result/);
});
test('SEC09 controller copies only sanitized evidence and prevents stale-session reuse',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 assert.match(source,/runFRTSec09SignedAcceptance\(\{auth,api:db\}\)/);
 assert.match(source,/sanitizeFRTSec09Report\(state\.sec09Result\)/);
 assert.match(source,/case 'security-sec09-readonly'/);
 assert.match(source,/state\.sec09RunId\+\+/);
 assert.match(source,/revision!==state\.sec09RunId\|\|!auth\.isSignedIn/);
 assert.match(source,/state\.frtSecurityResult=null;state\.sec07Result=null;state\.sec09Result=null;state\.sec09RunId\+\+/);
 const runner=readFileSync('frontend/frt-sec09-signed-acceptance.js','utf8');
 assert.doesNotMatch(runner,/api\.rpc\('apsyntra_crm_platform_role_set'/);
 assert.doesNotMatch(runner,/api\.rpc\('apsyntra_role_manage_user_access'/);
 assert.match(runner,/getVerifiedUser/);
 assert.match(runner,/runFRTSec03SignedAcceptance/);
 assert.match(runner,/runFRTSec07ActivationGate/);
});
