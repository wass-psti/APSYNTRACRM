import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 APPLICATION_ACCESS_DIALOG_ENABLED,APPLICATION_ACCESS_SUPPORTED_MODULES,
 applicationDefaultInviteRole,normalizeSignedApplicationDirectory,
 renderApplicationAccessDialog
} from '../application-access-dialog.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';
const memberId='33333333-3333-4333-8333-333333333333';
const otherId='44444444-4444-4444-8444-444444444444';
const moduleId='time-tracker';
const roles=['Employee','Supervisor','System Admin'];
const directory={
 adminVerified:true,workspaceId,
 users:[
  {id:memberId,name:'Casey Employee',email:'casey@example.org',protected:false},
  {id:otherId,name:'Jordan Worker',email:'jordan@example.org',protected:false},
  {id:actorId,name:'Current Admin',email:'admin@example.org',protected:false}
 ],
 moduleAssignments:[{userId:memberId,moduleId,role:'Employee',enabled:true,updatedAt:'2026-11-19T01:00:00Z'}]
};
test('application-specific invitations are staged OFF by default',()=>{
 assert.equal(APPLICATION_ACCESS_DIALOG_ENABLED,false);
 assert.ok(APPLICATION_ACCESS_SUPPORTED_MODULES.includes('time-tracker'));
 assert.ok(!APPLICATION_ACCESS_SUPPORTED_MODULES.includes('fm1'));
 assert.equal(applicationDefaultInviteRole(moduleId,roles),'Employee');
 assert.equal(applicationDefaultInviteRole('unreviewed-module',roles),null);
});
test('signed manager snapshot normalizes only assigned roles for exact application',()=>{
 const parsed=normalizeSignedApplicationDirectory(directory,{workspaceId,moduleId,actorId,roleOptions:roles});
 assert.equal(parsed.status,'VERIFIED_MANAGER_DIRECTORY');
 assert.equal(parsed.members.length,3);
 assert.equal(parsed.members.find(p=>p.id===memberId).role,'Employee');
 assert.equal(parsed.members.find(p=>p.id===otherId).role,null);
 assert.equal(parsed.members.find(p=>p.id===actorId).protected,true);
 assert.equal(parsed.moduleId,moduleId);
});
test('unverified or out-of-scope directory fails closed',()=>{
 for(const raw of [
  {...directory,adminVerified:false},
  {...directory,workspaceId:otherId},
  {...directory,users:[...directory.users,directory.users[0]]},
  {...directory,moduleAssignments:[...directory.moduleAssignments,{userId:memberId,moduleId,role:'Supervisor',enabled:true}]},
  {...directory,moduleAssignments:[{userId:memberId,moduleId,role:'Unreviewed',enabled:true}]}
 ]){
  assert.equal(normalizeSignedApplicationDirectory(raw,{workspaceId,moduleId,actorId,roleOptions:roles}).status,'UNAVAILABLE');
 }
 assert.equal(normalizeSignedApplicationDirectory(directory,{workspaceId,moduleId:'toolbox-issues',actorId,roleOptions:roles}).status,'UNAVAILABLE');
});
test('application dialog mirrors searchable People / Teams layout and escapes names',()=>{
 const raw={...directory,users:directory.users.map(p=>p.id===memberId?{...p,name:'<img src=x onerror=alert(1)>'}:p)};
 const parsed=normalizeSignedApplicationDirectory(raw,{workspaceId,moduleId,actorId,roleOptions:roles});
 const html=renderApplicationAccessDialog({moduleName:'TimeTracker',directory:parsed,roleOptions:roles});
 assert.match(html,/Invite to this application/);
 assert.match(html,/Search by name or email address/);
 assert.match(html,/data-app-invite-tab="people"/);
 assert.match(html,/data-app-invite-tab="teams"/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/data-app-invite-remove=/);
 assert.match(html,/data-app-invite-add=/);
 assert.match(html,/Protected/);
 const filtered=renderApplicationAccessDialog({moduleName:'TimeTracker',directory:parsed,roleOptions:roles,query:'jordan@'});
 assert.match(filtered,/Jordan Worker/);
 assert.doesNotMatch(filtered,/Current Admin/);
 assert.doesNotMatch(filtered,/&lt;img src=x/);
 const teams=renderApplicationAccessDialog({moduleName:'TimeTracker',directory:parsed,roleOptions:roles,tab:'teams'});
 assert.match(teams,/No team assignments are enabled/);
 assert.doesNotMatch(teams,/data-app-invite-add=/);
});
test('role updates require explicit action, and missing server reads reveal no users',()=>{
 const parsed=normalizeSignedApplicationDirectory(directory,{workspaceId,moduleId,actorId,roleOptions:roles});
 const updated=renderApplicationAccessDialog({
  moduleName:'TimeTracker',directory:parsed,roleOptions:roles,
  selectedRoles:new Map([[memberId,'Supervisor']])
 });
 assert.match(updated,/data-app-invite-update=/);
 const pending=renderApplicationAccessDialog({moduleName:'TimeTracker',roleOptions:roles});
 assert.match(pending,/Application member directory has not been verified/);
 assert.doesNotMatch(pending,/Casey Employee/);
 assert.doesNotMatch(pending,/data-app-invite-add=/);
});
test('integrated route uses server-authorized admin RPC, never broad board grant',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/APPLICATION_ACCESS_DIALOG_ENABLED&&currentApplicationInviteTarget\(\)/);
 assert.match(app,/state.adminVerified!==true/);
 assert.match(app,/userRoleManager\.snapshot\(target.workspaceId/);
 assert.match(app,/userRoleManager\.setScopedSixRole/);
 assert.match(app,/userRoleManager\.setFrtWorkspaceRole/);
 assert.match(app,/userRoleManager\.setToolTraceabilityWorkspaceRole/);
 assert.match(app,/userRoleManager\.setFueltransWorkspaceRole/);
 assert.match(app,/userRoleManager\.setCharterWorkspaceRole/);
 assert.doesNotMatch(app,/case 'application-invite-open':[\s\S]{0,120}work_board_access/);
});
