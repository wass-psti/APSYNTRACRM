import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';

const context={
 workspace_id:'22222222-2222-4222-8222-222222222222',
 profile:{status:'active',platform_role:'employee'}
};
test('SEC07 read-only action available to signed nonbootstrap and bootstrap users',()=>{
 const html=renderSecurityAcceptance({context});
 assert.match(html,/CP-FRT-SEC07/);
 assert.match(html,/data-action="security-sec07-readonly"/);
 assert.match(html,/No account, role, finance or board data is modified/);
 assert.doesNotMatch(html,/data-action="security-sec07-copy"/);
});
test('running SEC07 disables overlapping user action',()=>{
 const html=renderSecurityAcceptance({context,sec07Busy:true});
 assert.match(html,/data-action="security-sec07-readonly" disabled/);
});
test('BLOCKED missing migration is visible, escaped, and not labeled successful',()=>{
 const html=renderSecurityAcceptance({context,sec07Result:{
  status:'BLOCKED',scenario:'BOOTSTRAP',reason:'CRM_ROLE_BACKEND_NOT_INSTALLED',
  checks:[{name:'<img src=x onerror=alert(1)>',status:'FAIL'}],writesAttempted:0
 }});
 assert.match(html,/SEC07 result: BLOCKED/);
 assert.match(html,/CRM_ROLE_BACKEND_NOT_INSTALLED/);
 assert.match(html,/&lt;img src=x/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/Writes attempted: 0/);
 assert.match(html,/data-action="security-sec07-copy"/);
});
test('application clears old SEC07 result on signout, session expiration, workspace switch',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 assert.match(source,/runFRTSec07ActivationGate\(\{auth,api:db\}\)/);
 assert.match(source,/case 'security-sec07-readonly'/);
 assert.match(source,/case 'security-sec07-copy'/);
 assert.match(source,/state\.frtSecurityResult=null;state\.sec07Result=null;state\.sec09Result=null;state\.sec09RunId\+\+;state\.sec10Result=null;state\.sec10RunId\+\+;state\.effectiveAccessResult=null;state\.effectiveAccessRunId\+\+;location\.hash='#\/login'/);
 assert.match(source,/auth\.onExpired=\(\)=>\{state\.context=null;state\.frtSecurityResult=null;state\.sec07Result=null/);
 assert.match(source,/state\.roleData=null;state\.userRoleData=null;state\.userRoleSelected=null;\s*state\.frtSecurityResult=null;state\.sec07Result=null/);
});
test('SEC07 action routes only through existing read-only signed runner',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const action=source.split("case 'security-sec07-readonly':{")[1].split("case 'security-sec07-copy':{")[0];
 assert.doesNotMatch(action,/setCrmPlatformRole|manage_user_access|\.insert\(|\.update\(|\.delete\(/);
 const runner=readFileSync('frontend/frt-sec07-signed-activation.js','utf8');
 assert.doesNotMatch(runner,/api\.rpc\('apsyntra_crm_platform_role_set'/);
 assert.match(runner,/PGRST202/);
});
