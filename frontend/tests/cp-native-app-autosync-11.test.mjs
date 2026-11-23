import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runner=readFileSync('scripts/cp-native-app-autosync-10-disposable-clone.sh','utf8');
const sql=readFileSync('sql/acceptance/cp-native-app-autosync-11-profile-compatibility.sql','utf8');

test('clone exclusive lock cleanup registered before pre-existing DB refusal',()=>{
 const trap=runner.indexOf('trap cleanup EXIT');
 const refusal=runner.indexOf('already exists; refusing overwrite');
 assert.ok(trap>0);
 assert.ok(refusal>trap,'Refusal must occur after cleanup is registered');
 assert.match(runner,/rmdir "\$lock_dir"/);
 assert.match(runner,/if \(\(created\)\)/);
});
test('staging compatibility rehearsal uses only a disposable temporary table',()=>{
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/CREATE TEMP TABLE cp11_staging_profiles/);
 assert.match(sql,/ON COMMIT DROP;/);
 assert.match(sql,/ALTER TABLE cp11_staging_profiles/);
 assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/ALTER TABLE\s+(?:public\.)?profiles\b/i);
});
test('existing profiles are not assigned new authorities as part of clone test',()=>{
 assert.match(sql,/platform_role text NOT NULL DEFAULT 'employee'/);
 assert.match(sql,/WHERE id='20000000-0000-4000-8000-000000000002'\)<>\'disabled\'/);
 assert.match(runner,/NOT VERIFIED: three real signed browser sessions/);
 assert.match(runner,/cp-native-app-autosync-11-profile-compatibility.sql/);
});
test('unknown module writer remains unsupported by original constraints',()=>{
 assert.match(runner,/Unsupported module unexpectedly assignable/);
 assert.match(runner,/role IN \('HR','Supervisor'\)/);
});
