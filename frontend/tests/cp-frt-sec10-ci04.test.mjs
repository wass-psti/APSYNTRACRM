import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireCI04,executeCI04} from '../../scripts/cp-frt-sec10-ci04.mjs';
const schema=readFileSync('sql/tests/cp-frt-sec10-ci04-remaining-rls.sql','utf8');
test('CI04 never accesses any network outside approved GitHub-hosted ephemeral execution',async()=>{
 let calls=0;const forbidden=async()=>{calls++;throw Error('NO_NETWORK_ALLOWED')};
 for(const env of [
  {},{CI:'false',GITHUB_ACTIONS:'true',SEC10_CI04:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'false',SEC10_CI04:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'true',SEC10_CI04:'NOT_APPROVED'}]){
  await assert.rejects(executeCI04('',env,forbidden),/CI04_NOT_EPHEMERAL/);
 }
 assert.equal(calls,0);
 assert.equal(requireCI04({CI:'true',GITHUB_ACTIONS:'true',SEC10_CI04:'EPHEMERAL_ONLY'}),true);
});
test('all remaining finance tables mirror SELECT RLS policies without direct grants',()=>{
 assert.ok(schema.includes('DISPOSABLE CI ONLY'));
 for(const name of ['frt_attachments','frt_comments','frt_memberships']){
  assert.ok(schema.includes('CREATE TABLE public.'+name+' ('),name+' missing');
  assert.ok(schema.includes('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;'));
  assert.ok(schema.includes('REVOKE ALL ON TABLE public.'+name+' FROM PUBLIC,anon,authenticated'));
 }
 assert.ok(schema.includes('CREATE POLICY frt_membership_self_or_gm_select'));
 assert.ok(schema.includes('user_id = auth.uid()'));
 assert.ok(schema.includes("private.frt_has_role(workspace_id"));
 assert.ok(!schema.includes('INSERT INTO auth.users'));
 assert.ok(!schema.includes('GRANT SELECT ON TABLE'));
});
test('revocation proof does not falsely assert access JWT expiry on logout',()=>{
 const source=readFileSync('scripts/cp-frt-sec10-ci04.mjs','utf8');
 assert.ok(source.includes('REFRESH_TOKEN_STILL_VALID_AFTER_LOGOUT'));
 assert.ok(source.includes('SIGNED_OUT_SESSION_STILL_PERSISTED'));
 assert.ok(source.includes('oldAccessJwtAcceptedAfterLogout:jwtStillValid'));
 assert.ok(source.includes('expiredAuthJwtTested:false'));
 assert.ok(source.includes("REVOKE SELECT ON TABLE public."));
 assert.ok(source.includes("FROM authenticated;"));
 assert.ok(source.includes('sameJwtRoleChangeEnforced:true'));
});
