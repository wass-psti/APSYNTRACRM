import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';

const context={workspace_id:'11111111-1111-4111-8111-111111111111',
 profile:{status:'active',platform_role:'employee'}};

test('ordinary signed nonbootstrap member can start FRT read-only verification',()=>{
 const html=renderSecurityAcceptance({context});
 assert.match(html,/data-action="security-frt-readonly"/);
 assert.match(html,/Run FRT read-only signed acceptance/);
 assert.doesNotMatch(html,/data-action="security-frt-copy"/);
});

test('ongoing FRT verification disables duplicate action',()=>{
 const html=renderSecurityAcceptance({context,frtBusy:true});
 assert.match(html,/data-action="security-frt-readonly" disabled/);
});

test('security panel renders sanitized checks with no access-token or identity output',()=>{
 const html=renderSecurityAcceptance({context,frtResult:{
  checkpoint:'CP-FRT-SEC03',status:'PASS',scenario:'NONBOOTSTRAP',
  checks:[{name:'verified-signed-identity',status:'PASS'},
   {name:'<img src=x onerror=alert(1)>',status:'FAIL'}],writesAttempted:0
 }});
 assert.match(html,/FRT result: PASS/);
 assert.match(html,/verified-signed-identity/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/Changes attempted: 0/);
 assert.match(html,/data-action="security-frt-copy"/);
});

test('existing app triggers only read-only SEC03 helper and clears displayed results on logout',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/runFRTSec03SignedAcceptance\(\{auth,api:db\}\)/);
 assert.match(app,/case 'security-frt-readonly'/);
 assert.match(app,/case 'security-frt-copy'/);
 assert.match(app,/state\.frtSecurityResult=null;state\.sec07Result=null;location\.hash='#\/login'/);
 const action=app.split("case 'security-frt-readonly':{")[1].split("case 'security-frt-copy':{")[0];
 assert.doesNotMatch(action,/apsyntra_role_manage_user_access|frt_admin_set_role|\.mutate\(/);

});
