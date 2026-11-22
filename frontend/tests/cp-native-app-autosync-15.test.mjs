import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync('scripts/cp-native-app-autosync-15-staging-clone.sh','utf8');
const fixture=readFileSync('sql/acceptance/cp-native-app-autosync-15-staging-clone-fixture.sql','utf8');
const update=readFileSync('sql/acceptance/cp-native-app-autosync-15-staging-clone-update.sql','utf8');
const readback=readFileSync('sql/acceptance/cp-native-app-autosync-15-staging-clone-readback.sql','utf8');
const check=readFileSync('sql/acceptance/cp-native-app-autosync-15-constraint-normalization.sql','utf8');
const fingerprint=readFileSync('sql/acceptance/cp-native-app-autosync-15-schema-fingerprint.sql','utf8');

test('CP15 reads only existing staging schema and targets fixed local clone',()=>{
 assert.match(shell,/staging_project="jeqwjlxubntsddeauvqa"/);
 assert.match(shell,/container="supabase_db_cp16019-disposable-local"/);
 assert.match(shell,/clone="cp_native15_staging_clone"/);
 assert.match(shell,/supabase db dump --project-ref/);
 assert.match(shell,/--schema auth,public,private,extensions/);
 assert.doesNotMatch(shell,/supabase (?:db push|migration up|link)|apply_migration|service_role/i);
});
test('no password/session export, live rows, permanent clone or overwritten database',()=>{
 assert.match(shell,/--file "\$original"/);
 assert.match(shell,/pg_dump|db dump/);
 assert.doesNotMatch(shell,/--data-only|--role-only/);
 assert.match(shell,/already exists; refusing to overwrite/);
 assert.match(shell,/trap cleanup EXIT/);
 assert.match(shell,/dropdb -U postgres "\$clone"/);
 assert.match(shell,/rm -rf -- "\$tmp_dir"/);
 assert.match(shell,/IF EXISTS\(SELECT 1 FROM auth.users\)/);
});
test('schema restore omits only managed owner/default ACL and checks full app topology',()=>{
 assert.match(shell,/if len\(owner_lines\) != 78 or len\(default_lines\) != 12/);
 assert.match(shell,/actual\.nspname='auth' AND actual\.tables=27 AND actual\.rls=16/);
 assert.match(shell,/actual\.nspname='private' AND actual\.tables=11 AND actual\.rls=11/);
 assert.match(shell,/actual\.nspname='public' AND actual\.tables=3 AND actual\.rls=3/);
 assert.match(fingerprint,/pg_get_functiondef/);
 assert.match(fingerprint,/pg_get_constraintdef/);
 assert.match(shell,/source-compatible schema fingerprint/);
});
test('known constraint normalization is explicitly documented and checked',()=>{
 assert.match(check,/f54b41109af8b61bddd720ae63182e12/);
 assert.match(check,/d0e76e5e7e92c5380031f3379e79b73d/);
 assert.match(check,/original IS DISTINCT FROM restored/);
 assert.match(check,/repeat\('a',129\)/);
});
test('three synthetic users are not claimed as genuine signed sessions',()=>{
 assert.match(fixture,/current_database\(\)<>'cp_native15_staging_clone'/);
 assert.match(fixture,/qa15-admin@example\.invalid/);
 assert.match(fixture,/qa15-member2@example\.invalid/);
 assert.match(shell,/NOT VERIFIED: signed Auth sessions, CRM new-module writer, browser persistence/);
 assert.match(shell,/for stage in fixture update readback/);
});
test('independent SQL connections verify persistence, reject unsupported roles, and cascade',()=>{
 assert.match(update,/Unsupported invitation role unexpectedly accepted/);
 assert.match(update,/Unsupported workspace relation unexpectedly accepted/);
 assert.match(readback,/Independent readback failed after SQL connection closed/);
 assert.match(readback,/Existing staging composite FK cascade did not persist/);
 assert.match(shell,/Three DISTINCT PostgreSQL sessions/);
});
