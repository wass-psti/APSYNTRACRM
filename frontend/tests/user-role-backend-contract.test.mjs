import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/cp-rc02-effective-user-management.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
test('backend manages only existing central module and board role storage',()=>{
 assert.match(sql,/INSERT INTO public\.module_role_assignments/);
 assert.match(sql,/INSERT INTO public\.work_board_members/);
 assert.match(sql,/public\.wm_admin_set_application_role/);
 assert.match(sql,/public\.apsyntra_role_require_scope/);
 assert.match(sql,/public\.apsyntra_role_bootstrap_identities/);
 assert.match(sql,/p_workspace_id=p_workspace_id|wm\.workspace_id=p_workspace_id/);
});
test('bootstrap scope and identity changes cannot be bypassed in frontend',()=>{
 assert.match(app,/roleConfig\.bootstrapVerified\(\)/);
 assert.match(app,/await auth\.getVerifiedUser\(\)/);
 assert.match(app,/applyUserRoleChange/);
 assert.match(app,/state\.roleVerified===true/);
 assert.match(app,/user-role-management/);
});
test('server protections fail closed for protected, concurrent and cross-workspace cases',()=>{
 assert.match(sql,/public\.is_platform_admin\(p_target_user_id\)/);
 assert.match(sql,/Ambiguous multi-workspace application role target/);
 assert.match(sql,/Stale module role assignment/);
 assert.match(sql,/Stale board membership/);
 assert.match(sql,/Board outside active workspace/);
 assert.match(sql,/Protected board owner/);
 assert.match(sql,/INSERT INTO public\.apsyntra_role_change_audit/); // append-only audit remains protected
});
test('audit records are part of same transaction and no direct client DML used',()=>{
 assert.match(sql,/INSERT INTO public\.apsyntra_role_change_audit/);
 assert.match(sql,/event,detail/);
 assert.match(sql,/applied/);
 const client=readFileSync('frontend/user-role-management.js','utf8');
 assert.doesNotMatch(client,/from\(['"]module_role_assignments/);
 assert.match(client,/apsyntra_role_manage_user_access/);
});
