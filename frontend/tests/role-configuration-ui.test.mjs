import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRoleConfiguration,PERMISSION_ACTIONS,ROLE_MODULE_OPTIONS} from '../role-configuration-ui.js';
test('bootstrap false never renders role data, users or navigation',()=>{
 const output=renderRoleConfiguration({verified:false,data:{users:[{email:'sensitive@example.com'}]}});
 assert.doesNotMatch(output,/sensitive@example.com|role-propose|Permission matrix/);
 assert.match(output,/Access unavailable/);
});
test('removed global capability matrix and mixed assignments are not rendered',()=>{
 const data={workspaceId:'ws',users:[],roles:[],assignments:[],boards:[],proposals:[],audit:[]};
 const html=renderRoleConfiguration({verified:true,data,tab:'roles'});
 assert.equal((html.match(/data-action="role-tab"/g)||[]).length,3);
 assert.doesNotMatch(html,/Permission matrix|data-action="role-propose-permission"|data-action="role-propose-assign"/);
 assert.equal(PERMISSION_ACTIONS.length,7,'Legacy action vocabulary remains for authorized app migration');
 assert.equal(ROLE_MODULE_OPTIONS.length,12,'Existing module definitions are preserved');
 assert.match(html,/STAGED ONLY/);
});
test('server strings and role display are escaped',()=>{
 const html=renderRoleConfiguration({verified:true,tab:'roles',data:{
  users:[],roles:[{roleKey:'unsafe',displayName:'<script>alert(1)</script>',kind:'custom',state:'proposal'}],
  assignments:[],boards:[],proposals:[],audit:[]}});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
test('default role catalogue remains protected reference-only',()=>{
 const html=renderRoleConfiguration({verified:true,tab:'roles',data:{users:[],boards:[],
  roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference'}],proposals:[],audit:[]}});
 assert.match(html,/Protected default role/);assert.doesNotMatch(html,/data-role-key="admin"/);
});

test('apostrophes in central role names are escaped without corrupting text',()=>{
 const html=renderRoleConfiguration({verified:true,tab:'roles',data:{users:[],boards:[],
  roles:[{roleKey:'finance_operations',displayName:"Finance's Operations",kind:'custom',state:'proposal'}],
  proposals:[],audit:[]}});
 assert.match(html,/Finance&#39;s Operations/);
 assert.doesNotMatch(html,/Financeundefineds|Finance's Operations/);
});
