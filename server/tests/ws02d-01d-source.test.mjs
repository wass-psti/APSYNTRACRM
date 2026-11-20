import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/staging/cp-crm-workspace-invite-01d-verified-user-onboarding.sql','utf8');
test('staging onboarding requires two real confirmed email identities and active Auth sessions',()=>{
 assert.match(sql,/email_confirmed_at IS NOT NULL/);
 assert.match(sql,/is_anonymous IS FALSE/);
 assert.match(sql,/auth\.sessions s WHERE s\.user_id=u\.id/);
 assert.match(sql,/count\(\*\) FROM auth\.users\)<>2/);
 assert.match(sql,/inviter_email=recipient_email/);
});
test('no artificial GoTrue users, secret extraction, module-role changes or production permissions',()=>{
 assert.doesNotMatch(sql,/INSERT INTO auth\.|UPDATE auth\.|CREATE USER|ALTER ROLE|GRANT |service_role|email_confirmed_at=now\(\)/i);
 assert.doesNotMatch(sql,/INSERT INTO private\.ws02d_member_access|INSERT INTO public\.work_board_members|APSYNTRA_INVITES_EDGE_ENABLED/);
 assert.match(sql,/INSERT INTO public\.workspace_members\(workspace_id,user_id,active\)/);
 assert.match(sql,/INSERT INTO private\.ws01_member_roles\(workspace_id,user_id,relation\)/);
});
test('preflight explicitly rejects already populated workspace, previous membership and enabled invitation flags',()=>{
 assert.match(sql,/count\(\*\) FROM public\.workspaces\)<>0/);
 assert.match(sql,/count\(\*\) FROM public\.workspace_members\)<>0/);
 assert.match(sql,/enabled FROM private\.ws02d_invitation_flags WHERE id\) IS DISTINCT FROM false/);
 assert.match(sql,/RAISE EXCEPTION '01D onboarding denied/);
});
