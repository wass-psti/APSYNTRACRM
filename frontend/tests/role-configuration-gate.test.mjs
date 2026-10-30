import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/cp-role-configuration-bootstrap.sql','utf8');
const app=readFileSync('frontend/app.js','utf8');
const client=readFileSync('frontend/role-configuration-client.js','utf8');
test('bootstrap source is tied to immutable Auth identity, not local role or email',()=>{
 assert.match(sql,/apsyntra_role_bootstrap_identities/);
 assert.match(sql,/JOIN auth\.users u ON u\.id=b\.user_id/);
 assert.match(sql,/b\.user_id=auth\.uid\(\)/);
 assert.match(sql,/p\.status='active'/);
 assert.match(sql,/p\.platform_role='admin_general_manager'/);
 assert.match(app,/state\.roleVerified===true/);
 assert.match(app,/roleConfig\.bootstrapVerified\(\)/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|is_platform_admin/);
});
test('role RPC and new tables deny anonymous, direct DML and out-of-workspace access',()=>{
 for(const name of ['apsyntra_role_bootstrap_identities','apsyntra_role_templates',
  'apsyntra_role_change_requests','apsyntra_role_change_audit']){
   assert.match(sql,new RegExp('REVOKE ALL ON public\\.'+name));
   assert.match(sql,new RegExp('ALTER TABLE public\\.'+name+' FORCE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/p_workspace_id IS DISTINCT FROM public\.current_workspace_id\(v_actor\)/);
 assert.match(sql,/apsyntra_role_configuration_snapshot\(uuid\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/apsyntra_role_configuration_propose\(uuid,text,jsonb\) FROM PUBLIC,anon,authenticated/);
});
test('no effective privilege grant, bootstrap reassignment, or audit update path exists',()=>{
 assert.match(sql,/NO mutation\/apply RPC/);
 assert.match(sql,/BEFORE UPDATE OR DELETE/);
 assert.match(sql,/Role audit is immutable/);
 assert.match(sql,/Cannot modify self, bootstrap identities or out-of-scope users/);
 assert.doesNotMatch(sql,/UPDATE public\.profiles SET/);
 assert.doesNotMatch(sql,/UPDATE public\.module_role_assignments/);
 assert.doesNotMatch(sql,/INSERT INTO public\.work_board_members/);
 assert.match(app,/No production access has changed/);
});
test('unapproved administration page is absent from non-bootstrap nav and direct route denies',()=>{
 assert.match(app,/state\.roleVerified===true\?/);
 assert.match(app,/if\(!state\.roleVerified\)/);
 assert.match(app,/location\.hash=routeHome;return onRoute\(\)/);
 assert.match(app,/state\.roleVerified=false;state\.roleData=null/);
});
