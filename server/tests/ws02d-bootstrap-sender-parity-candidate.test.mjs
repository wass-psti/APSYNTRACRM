import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file='sql/activation/cp-crm-workspace-invite-bootstrap-sender-parity-CANDIDATE-NOT-APPLIED.sql';
const sql=readFileSync(file,'utf8');
const original=readFileSync('sql/cp-ws02d-invitation-issue-candidate.sql','utf8');
test('sender parity candidate requires installed issuer, registry and effective role resolver',()=>{
 for(const dependency of ["to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)')",
  "to_regclass('public.apsyntra_role_bootstrap_identities')",
  "to_regprocedure('public.apsyntra_crm_effective_role(uuid,uuid)')"])
  assert.ok(sql.includes(dependency));
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.match(sql,/RAISE EXCEPTION 'WS02D sender capability prerequisites absent'/);
});
test('bootstrap parity requires immutable canonical identity and active profile with CRM admin role',()=>{
 for(const check of [
  'FROM public.apsyntra_role_bootstrap_identities b',
  'JOIN auth.users u ON u.id=b.user_id',
  'JOIN public.profiles p ON p.id=b.user_id',
  'b.user_id=p_actor',
  'lower(u.email)=b.canonical_email',
  'lower(p.email)=b.canonical_email',
  'u.email_confirmed_at IS NOT NULL',
  "p.status='active'", "p.platform_role='admin_general_manager'",
  "public.apsyntra_crm_effective_role(p_actor,p_workspace)='admin'"
 ])assert.ok(sql.includes(check),check);
});
test('candidate preserves original owner and WS02D admin conditions and active exact workspace scope',()=>{
 const old=original.slice(original.indexOf('CREATE FUNCTION private.ws02d_sender_authorized'),original.indexOf('REVOKE ALL ON FUNCTION private.ws02d_sender_authorized'));
 for(const check of [
  'public.current_workspace_id(p_actor)=p_workspace',
  'm.workspace_id=p_workspace AND m.user_id=p_actor AND m.active',
  "r.workspace_id=p_workspace AND r.user_id=p_actor AND r.relation='owner'",
  'a.workspace_id=p_workspace AND a.user_id=p_actor',
  "a.role='admin' AND f.advanced_roles_enabled IS TRUE"
 ]){assert.ok(old.includes(check));assert.ok(sql.includes(check));}
});
test('candidate neither changes account roles nor exposes direct sender execution',()=>{
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\b|GRANT\s+EXECUTE/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.ws02d_sender_authorized\(uuid,uuid\)/);
 assert.doesNotMatch(sql,/CREATE\s+(?:TABLE|ROLE|POLICY)|DROP\s+(?:TABLE|ROLE|POLICY)/i);
});
