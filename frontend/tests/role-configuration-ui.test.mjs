import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRoleConfiguration,PERMISSION_ACTIONS,ROLE_MODULE_OPTIONS} from '../role-configuration-ui.js';
test('bootstrap false never renders role data, users or navigation',()=>{
 const output=renderRoleConfiguration({verified:false,data:{users:[{email:'sensitive@example.com'}]}});
 assert.doesNotMatch(output,/sensitive@example.com|role-propose|Permission matrix/);
 assert.match(output,/Access unavailable/);
});
test('bootstrap panel includes five sections and twelve module capability matrix',()=>{
 const html=renderRoleConfiguration({verified:true,data:{workspaceId:'ws',users:[],roles:[],assignments:[],boards:[],proposals:[],audit:[]},tab:'matrix'});
 assert.equal((html.match(/data-action="role-propose-permission"/g)||[]).length,12*7);
 assert.equal(PERMISSION_ACTIONS.length,7);
 assert.equal(ROLE_MODULE_OPTIONS.length,12);
 assert.match(html,/STAGED ONLY/);
});
test('server strings and profile display are escaped',()=>{
 const html=renderRoleConfiguration({verified:true,tab:'users',data:{
  users:[{id:'abc',email:'<script>alert(1)</script>',displayName:'Test',platformRole:'employee'}],
  roles:[],assignments:[],boards:[],proposals:[],audit:[]}});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('default role catalogue remains protected reference-only',()=>{
 const html=renderRoleConfiguration({verified:true,tab:'roles',data:{users:[],boards:[],
  roles:[{roleKey:'admin',displayName:'Admin',kind:'system_reference',state:'reference'}],proposals:[],audit:[]}});
 assert.match(html,/Protected default role/);assert.doesNotMatch(html,/data-role-key="admin"/);
});
