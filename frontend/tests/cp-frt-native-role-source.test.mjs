import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeApplicationModuleForRoute,NATIVE_APPLICATIONS} from '../native-application-access.js';
import {MODULE_ROLE_OPTIONS,UserRoleManagementClient} from '../user-role-management.js';
const sql=readFileSync('supabase/migrations/20261120190000_cp_frt_native_role_source_parity.sql','utf8');
test('Fund Tracker UI route and URM assignment share one canonical module ID',()=>{
 assert.equal(nativeApplicationModuleForRoute('#/fund-tracker'),'fund-released-tracker');
 assert.ok(NATIVE_APPLICATIONS['fund-released-tracker']);
 assert.ok(MODULE_ROLE_OPTIONS['fund-released-tracker'].includes('REQUESTOR'));
});
test('URM Fund Tracker assignment persists via existing dedicated workspace writer',async()=>{
 let called;
 const client=new UserRoleManagementClient({rpc:async (name,args)=>{called={name,args};return {effective:true,workspaceId:args.p_workspace_id,targetUserId:args.p_target_user_id,moduleId:'fund-released-tracker',role:args.p_role,enabled:args.p_enabled}}});
 const workspaceId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
 await client.setFrtWorkspaceRole({workspaceId,userId,role:'REQUESTOR',enabled:true});
 assert.equal(called.name,'apsyntra_role_frt_workspace_set');
 assert.equal(called.args.p_role,'REQUESTOR');
});
test('migration reuses the existing native role resolver and protects disabled FRT memberships',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.apsyntra_scoped_module_role/);
 assert.match(sql,/p_module_id='fund-released-tracker'/);
 assert.match(sql,/FROM public\.frt_memberships f/);
 assert.match(sql,/f\.enabled IS TRUE AND f\.status='active'/);
 assert.match(sql,/public\.apsyntra_workspace_module_roles/);
 assert.match(sql,/public\.module_role_assignments/);
 assert.match(sql,/wm\.active IS TRUE/);
 assert.doesNotMatch(sql,/DROP |TRUNCATE |DISABLE ROW LEVEL SECURITY|GRANT |REVOKE |ALTER TABLE/i);
});
