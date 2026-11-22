import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync('scripts/cp-native-app-autosync-18-local-signed-qa.py','utf8');
const ledger=readFileSync('sql/acceptance/cp-native-app-autosync-18-auth-migration-ledger.sql','utf8');

test('CP18 signed Auth is restricted to the exact local disposable Supabase project',()=>{
 assert.match(script,/cp16019-disposable-local/);
 assert.match(script,/supabase_auth_cp16019-disposable-local/);
 assert.match(script,/supabase_db_cp16019-disposable-local/);
 assert.match(script,/127\.0\.0\.1:54321/);
 assert.match(script,/--local-disposable/);
 assert.doesNotMatch(script,/jeqwjlxubntsddeauvqa|supabase\.co|service_role|SERVICE_ROLE_KEY/);
});
test('workdir and anon key are discovered from existing verified local container',()=>{
 assert.match(script,/com\.supabase\.cli\.workdir/);
 assert.match(script,/com\.supabase\.cli\.project/);
 assert.match(script,/status", "--workdir"/);
 assert.match(script,/ANON_KEY/);
 assert.doesNotMatch(script,/Users\/informationtechnology/);
});
test('GoTrue acceptance uses real signup, sign-in and bearer user identity',()=>{
 assert.match(script,/auth\/v1\/signup/);
 assert.match(script,/auth\/v1\/token\?grant_type=password/);
 assert.match(script,/auth\/v1\/user/);
 assert.match(script,/Authorization/);
 assert.match(script,/len\(set\(subjects\)\) != 3/);
 assert.match(script,/incorrect-password/);
});
test('reversible cleanup only targets exact random QA emails, never real user data',()=>{
 assert.match(script,/secrets\.token_hex\(12\)/);
 assert.match(script,/cp18\.qa\./);
 assert.match(script,/example\.com/);
 assert.match(script,/email IN \(/);
 assert.match(script,/email LIKE 'cp18\.qa\.%@example\.com'/);
 assert.match(script,/DELETE FROM public\.profiles/);
 assert.match(script,/DELETE FROM auth\.users/);
 assert.match(script,/finally:/);
 assert.match(script,/after != before/);
 assert.match(script,/LOCAL QA CLEANUP FAILED/);
});
test('cleanup verifies Auth, sessions, profile, workspace and audit counters',()=>{
 for(const name of ['auth.users','auth.sessions','public.profiles','public.workspace_members',
   'public.wm_workspace_application_roles','public.wm_application_role_audit']){
  assert.ok(script.includes(name));
 }
 assert.match(script,/Deleted QA account still resolves through GoTrue \/user/);
});
test('staging Auth migration source fingerprint is read only and anchored',()=>{
 assert.match(ledger,/BEGIN|DO \$verify\$/);
 assert.match(ledger,/20260911120000/);
 assert.match(ledger,/20261030120000/);
 assert.match(ledger,/89b5e505220d565bc38e8092af7b6c0f/);
 assert.match(ledger,/v_count<>84/);
 assert.doesNotMatch(ledger,/\bINSERT\s+INTO|\bUPDATE\s+auth|\bALTER\s+TABLE|\bDELETE\s+FROM/i);
});
test('CP18 explicitly does not claim new-module writer or staging acceptance',()=>{
 assert.match(script,/NOT VERIFIED: genuine remote staging sign-in, module role HTTP writer, new module contract/);
 assert.doesNotMatch(script,/request\.jwt\.claim\.sub|ALTER ROLE|SET ROLE/);
});
