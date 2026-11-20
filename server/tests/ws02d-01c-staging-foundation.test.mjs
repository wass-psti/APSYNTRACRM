import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/staging/cp-crm-workspace-invite-01c-foundation.sql','utf8');
const verify=readFileSync('sql/staging/cp-crm-workspace-invite-01c-readback.sql','utf8');
test('staging bootstrap creates exact existing workspace keys with no fabricated user rows',()=>{
 for(const text of ['CREATE TABLE public.profiles(', 'CREATE TABLE public.workspaces(',
  'CREATE TABLE public.workspace_members(', 'PRIMARY KEY(workspace_id,user_id)',
  'REFERENCES auth.users(id)', 'CREATE FUNCTION public.current_workspace_id(',
  'CREATE FUNCTION private.wm_board_config_session_active()'])
   assert.ok(sql.includes(text),text);
 assert.doesNotMatch(sql,/INSERT INTO|COPY |CREATE ROLE|DROP TABLE|ALTER ROLE/);
});
test('staging baseline denies direct browser reads and ensures session and membership RLS',()=>{
 for(const name of ['profiles','workspaces','workspace_members']){
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${name} ENABLE ROW LEVEL SECURITY;`));
 }
 assert.match(sql,/REVOKE ALL ON TABLE public\.profiles,public\.workspaces,public\.workspace_members/);
 assert.match(sql,/REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/auth\.sessions/);
 assert.match(sql,/not_after IS NULL OR s\.not_after>now\(\)/);
});
test('foundation refuses partially initialized or nonempty stages and does not grant role access',()=>{
 assert.match(sql,/count\(\*\) FROM auth\.users\)<>0/);
 assert.match(sql,/to_regclass\('public\.workspace_members'\) IS NOT NULL/);
 assert.doesNotMatch(sql,/GRANT |UPDATE private\.ws02d_invitation_flags|APSYNTRA_INVITES_EDGE_ENABLED/);
});
test('readback checks default-off invitation and workspace flags, no memberships and no browser invitation access',()=>{
 assert.match(verify,/enabled=false AND advanced_roles_enabled=false/);
 assert.match(verify,/creation_enabled=false AND selection_enabled=false/);
 assert.match(verify,/count\(\*\) FROM public\.workspace_members\)=0/);
 assert.match(verify,/NOT has_table_privilege\('authenticated','private\.ws02d_invitations','SELECT'\)/);
});
