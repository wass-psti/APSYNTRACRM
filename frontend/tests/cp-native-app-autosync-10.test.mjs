import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const clone=readFileSync('scripts/cp-native-app-autosync-10-disposable-clone.sh','utf8');
const registry=readFileSync('scripts/cp-native-app-autosync-04-local-acceptance.sh','utf8');

test('disposable clone is bound to the known local PostgreSQL container and database',()=>{
 assert.match(clone,/container="supabase_db_cp16019-disposable-local"/);
 assert.match(clone,/clone="cp_native10_disposable"/);
 assert.match(clone,/already exists; refusing overwrite/);
 assert.match(clone,/trap cleanup EXIT/);
 assert.match(clone,/dropdb -U postgres/);
 assert.match(clone,/rm -f "\$dump"/);
 assert.doesNotMatch(clone,/https:\/\/|supabase\.co|jtlusodorfnyzgyuewkz|jeqwjlxubntsddeauvqa/);
});

test('restored schemas exclude Vault and full Realtime data; adapter is local only',()=>{
 assert.match(clone,/-n public -n auth -n private/);
 assert.match(clone,/pg_restore[^\n]*--exit-on-error/);
 assert.match(clone,/CREATE FUNCTION realtime\.send/);
 assert.doesNotMatch(clone,/-n vault|-n realtime/);
});

test('clone assignment evidence is distinct from real signed browser acceptance',()=>{
 assert.match(clone,/registry lifecycle on cloned local data/);
 assert.match(clone,/independent SQL connection readback/);
 assert.match(clone,/Unsupported module unexpectedly assignable/);
 assert.match(clone,/NOT VERIFIED: three real signed browser sessions/);
 assert.match(clone,/QA rollback failed/);
});

test('registry acceptance respects a guarded clone database override',()=>{
 assert.match(registry,/postgres\|cp_native10_disposable/);
 assert.match(registry,/Refusing unapproved database name/);
 assert.match(registry,/psql -X -v ON_ERROR_STOP=1 -U postgres -d "\$database_name"/);
});
test('staging compatibility inventory is strictly read-only',()=>{
 const query=readFileSync('sql/acceptance/cp-native-app-autosync-10-staging-compatibility.sql','utf8');
 assert.match(query,/information_schema\.columns/);
 assert.match(query,/pg_policies/);
 assert.doesNotMatch(query,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|INTO|public|private)/i);
});
test('disposable archive and exclusive run lock are cleaned on exit',()=>{
 assert.match(clone,/lock_dir="\/tmp\/cp_native10_disposable\.lock"/);
 assert.match(clone,/if ! mkdir "\$lock_dir"/);
 assert.match(clone,/rmdir "\$lock_dir"/);
 assert.match(clone,/chmod 600 "\$dump"/);
});
