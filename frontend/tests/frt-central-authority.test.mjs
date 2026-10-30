import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/cp-frt-sec01-bootstrap-role-governance.sql','utf8');
test('legacy FRT and central role writes require immutable server-side bootstrap identity',()=>{
 assert.match(sql,/PERFORM public\.apsyntra_role_require_scope\(p_workspace_id\)/);
 assert.match(sql,/not public\.apsyntra_role_is_bootstrap\(\)/);
 assert.match(sql,/public\.apsyntra_role_bootstrap_identities/);
 assert.match(sql,/Protected or self target cannot be modified through FRT/);
});
test('FRT local role lists are bootstrap-only and all client-facing admin RPCs reject anonymous',()=>{
 assert.match(sql,/public\.frt_admin_users/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.frt_admin_users\(uuid\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.frt_admin_set_role\(uuid,uuid,text\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.wm_admin_set_application_role\(uuid,text,text,boolean\) FROM PUBLIC,anon,authenticated/);
});
test('production finance actions and exact four FRT roles remain preserved',()=>{
 for(const role of ['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR'])
  assert.ok(sql.includes(role),'Missing original role '+role);
 for(const action of ['USER_ROLE_CHANGED','fund-released-tracker','frt_audit_logs','module_role_assignments'])
  assert.ok(sql.includes(action),'Operational role persistence lost: '+action);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM auth\.users|DELETE FROM public\.profiles|TRUNCATE/i);
});

test('legacy role RPCs are revoked for signed users',()=>{
 const rollback=readFileSync('sql/cp-frt-sec01b-revoke-legacy-role-rpc.sql','utf8');
 for(const name of ['frt_admin_set_role','frt_admin_users','wm_admin_set_application_role']){
  assert.ok(rollback.includes('REVOKE ALL ON FUNCTION public.'+name));
 }
 for(const line of sql.split('\n'))assert.ok(!line.startsWith('GRANT EXECUTE ON FUNCTION public.frt_admin_set_role') &&
 !line.startsWith('GRANT EXECUTE ON FUNCTION public.frt_admin_users') &&
 !line.startsWith('GRANT EXECUTE ON FUNCTION public.wm_admin_set_application_role'));
});
test('test-only cleanup does not delete shared Auth users, workspace memberships or histories',()=>{
 const src=readFileSync('sql/cp-frt-sec02-retire-qa-membership-config.sql','utf8');
 assert.match(src,/FRT-ACCEPTANCE-QA-v0\.5\.0/);
 assert.match(src,/DELETE FROM public\.frt_memberships/);
 assert.match(src,/DELETE FROM public\.frt_companies/);
 assert.match(src,/v_users<>4 OR v_members<>4 OR v_companies<>3/);
 assert.doesNotMatch(src,/DELETE FROM (?:auth\.users|public\.profiles|public\.workspace_members)/);
 assert.doesNotMatch(src,/DROP TABLE|TRUNCATE/);
});
