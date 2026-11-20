import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/cp-crm-urm-integrity-03d-owner-native-role-candidate.sql','utf8');
const acceptance=readFileSync('sql/tests/cp-crm-urm-integrity-03d-owner-native-policy.sql','utf8');
test('non-deployable native owner candidate covers four native modules only',()=>{
 for(const token of ['time-tracker','fund-released-tracker','fueltrack-plus','tradelink',
  'private.ws02_personal_workspaces','private.ws01_member_roles','public.workspace_members',
  'public.profiles','public.apsyntra_crm_effective_role','public.apsyntra_crm_platform_roles'])
  assert.ok(sql.includes(token),token);
 assert.match(sql,/p_workspace_id=public\.current_workspace_id\(p_user_id\)/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/NOT EXISTS/);
 assert.doesNotMatch(sql,/^\s*(?:GRANT EXECUTE|SECURITY DEFINER|ALTER TABLE|UPDATE public\.|INSERT INTO)\b/m);
});
test('disposable acceptance covers owner, nonowner, inactive, cross-workspace, and explicit ceiling',()=>{
 for(const token of ['ROLLBACK;','public.has_module_access','public.module_role_for',
  'Nonowner employee','leaked across selected workspaces','explicit CRM ceiling',
  'Inactive owner membership','Inactive owner profile',
  'CP_CRM_URM_INTEGRITY_03D_OWNER_POLICY_CANDIDATE_PASS'])
  assert.ok(acceptance.includes(token),token);
 assert.doesNotMatch(acceptance,/production\.supabase\.co|service_role|supabase db push|supabase link/);
});
