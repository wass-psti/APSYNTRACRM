import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('sql/cp-profile-avatar-storage-activation.sql','utf8').toLowerCase();

test('avatar bucket is private, WebP-only and bounded at the Storage layer',()=>{
 assert.match(sql,/\('account-avatars',\s*'account-avatars',\s*false,\s*400000,\s*array\['image\/webp'\]/);
 assert.match(sql,/current_bucket\.public is distinct from false/);
 assert.match(sql,/current_bucket\.file_size_limit is distinct from 400000/);
 assert.match(sql,/current_bucket\.allowed_mime_types is distinct from array\['image\/webp'\]/);
});

test('avatar objects use immutable owner-prefixed UUID WebP paths',()=>{
 for(const policy of ['account_avatars_insert_own','account_avatars_delete_own']){
  assert.ok(sql.includes('"'+policy+'"'));
 }
 assert.match(sql,/owner_id = \(select auth\.uid\(\)::text\)/);
 assert.match(sql,/cardinality\(storage\.foldername\(name\)\) = 1/);
 assert.match(sql,/storage\.filename\(name\) ~ '\^\[0-9a-f\]/);
 assert.doesNotMatch(sql,/create policy[^;]+for update/i);
});

test('avatar reads are operation-limited and require an active shared workspace',()=>{
 assert.match(sql,/storage\.allow_any_operation\(array\[/);
 assert.match(sql,/object\.get_authenticated/);
 assert.match(sql,/object\.get_authenticated_info/);
 assert.match(sql,/private\.profile_avatar_can_read/);
 assert.doesNotMatch(sql,/object\.list/);
 assert.match(sql,/viewer_members\.active = true/);
 assert.match(sql,/owner_members\.active = true/);
});

test('profile reference updates are self-only, CAS protected and upload-verified',()=>{
 assert.match(sql,/function public\.set_own_profile_avatar\(\s*p_avatar_path text,\s*p_expected_avatar_path text\s*\)/);
 assert.match(sql,/object_row\.owner_id = v_actor::text/);
 assert.match(sql,/avatar_path is not distinct from p_expected_avatar_path/);
 assert.match(sql,/revoke all on function public\.set_own_profile_avatar\(text, text\) from public, anon/);
 assert.match(sql,/grant execute on function public\.set_own_profile_avatar\(text, text\) to authenticated/);
});

test('signed access context exposes only the current user profile avatar path',()=>{
 assert.match(sql,/'avatar_path',\s*p\.avatar_path/);
 assert.match(sql,/where p\.id = v_actor/);
 assert.match(sql,/public\.current_workspace_id\(v_actor\)/);
 assert.doesNotMatch(sql,/drop policy[^;]*fueltrans_crm_evidence/i);
});
