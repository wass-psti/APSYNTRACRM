import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 crmPlatformRoleChangeNeeded,
 UserRoleManagementClient
} from '../user-role-management.js';

const workspace='10000000-0000-4000-8000-000000000001';
const target='20000000-0000-4000-8000-000000000001';

test('unchanged explicit workspace override is a no-op; a new explicit override is a change',()=>{
 assert.equal(crmPlatformRoleChangeNeeded('admin','admin'),false);
 assert.equal(crmPlatformRoleChangeNeeded('admin','supervisor'),true);
 assert.equal(crmPlatformRoleChangeNeeded(null,'employee'),true);
 assert.equal(crmPlatformRoleChangeNeeded(null,null),false);
 assert.equal(crmPlatformRoleChangeNeeded('viewer',null),true);
});

test('role dialog disables applying the preselected explicit role and reenables when changed',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const start=source.indexOf("case 'user-role-edit-crm-platform':");
 const end=source.indexOf("case 'user-role-edit-module':",start);
 const block=source.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(block,/submitDisabled:roleAlreadyAssigned/);
 assert.match(block,/picker\?\.addEventListener\('change'/);
 assert.match(block,/submitButton\.disabled=!changed/);
 assert.match(block,/data-crm-role-change-hint aria-live="polite"/);
 assert.match(block,/Choose a different role to apply a change/);
 assert.match(block,/if\(!crmPlatformRoleChangeNeeded\(record\.assignedRole,role\)\)/);
 assert.match(block,/successMessage:''/);
 assert.match(block,/expectedUpdatedAt:record\.updatedAt\|\|null/);
});

test('unchanged-race result requires a fresh signed workspace snapshot before non-error feedback',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 const start=source.indexOf('async function applyCrmPlatformRole(');
 const end=source.indexOf('async function loadRoleConfiguration()',start);
 const block=source.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(block,/err\?\.code==='PT409'/);
 assert.match(block,/CRM platform role assignment unchanged/);
 assert.match(block,/await loadUserRoleManagement\(\);[\s\S]*current\?\.assignedRole===role/);
 assert.match(block,/No changes were made/);
 assert.match(block,/throw err/);
});

test('the authoritative backend unchanged-role rejection is preserved, no direct table mutation',()=>{
 const sql=readFileSync('sql/cp-frt-sec06-crm-platform-role-cap.sql','utf8');
 assert.match(sql,/v_current_role IS NOT DISTINCT FROM p_role/);
 assert.match(sql,/CRM platform role assignment unchanged/);
 const calls=[];
 const client=new UserRoleManagementClient({rpc:async(name,args)=>{
  calls.push({name,args});
  return {effective:true,workspaceId:workspace,targetUserId:target,
   scope:'crm-platform',effectiveRole:'supervisor'};
 }});
 return client.setCrmPlatformRole({workspaceId:workspace,userId:target,
  role:'supervisor',expectedUpdatedAt:'2026-11-18T08:00:00Z'}).then(()=>{
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'apsyntra_crm_platform_role_set');
  assert.equal(calls[0].args.p_expected_updated_at,'2026-11-18T08:00:00Z');
 });
});
