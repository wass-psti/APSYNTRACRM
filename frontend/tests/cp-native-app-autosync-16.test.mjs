import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const writer=readFileSync('scripts/cp-native-app-autosync-16-canonical-writer.sh','utf8');
const runner=readFileSync('scripts/cp-native-app-autosync-15-staging-clone.sh','utf8');
const source=Object.fromEntries(['assign','readback','update','deny','revoke','final'].map(
 name=>[name,readFileSync('sql/acceptance/cp-native-app-autosync-16-'+name+'.sql','utf8')]
));

test('canonical writer activation cannot run outside approved disposable staging clone',()=>{
 assert.match(writer,/container" != 'supabase_db_cp16019-disposable-local'/);
 assert.match(writer,/clone" != 'cp_native15_staging_clone'/);
 assert.match(writer,/CP16_LOCAL_WRITER_PROBE/);
 assert.match(runner,/trap cleanup EXIT/);
 assert.match(runner,/CP16_LOCAL_WRITER_PROBE/);
 assert.doesNotMatch(writer,/--project-ref|supabase db push|supabase migration|https:\/\//);
});
test('uses original source workspace tables and canonical function definitions',()=>{
 assert.match(writer,/pg_dump -U postgres -d postgres --schema-only/);
 assert.match(writer,/-t public\.wm_workspace_application_roles -t public\.wm_application_role_audit/);
 assert.match(writer,/pg_get_functiondef/);
 assert.match(writer,/wm_admin_set_application_role/);
 assert.match(writer,/wm_reject_application_audit_mutation/);
 assert.match(writer,/CREATE TRIGGER wm_application_audit_immutable/);
});
test('additive platform role column is confined to local clone',()=>{
 assert.match(writer,/ALTER TABLE public\.profiles ADD COLUMN platform_role text NOT NULL DEFAULT 'employee'/);
 assert.match(writer,/CHECK\(platform_role IN\('admin_general_manager','hr','supervisor','employee'\)\)/);
 assert.match(writer,/canonical writer cannot overwrite existing backend/);
});
test('assign and independent stored role and audit readback',()=>{
 assert.match(source.assign,/'time-tracker','Employee',true/);
 assert.match(source.assign,/request\.jwt\.claim\.sub/);
 assert.match(source.readback,/wm_workspace_application_roles/);
 assert.match(source.readback,/wm_application_role_audit/);
 assert.match(source.readback,/action='grant'/);
});
test('unsupported new module and fake role are rejected',()=>{
 assert.match(source.update,/'arbitrary-new-app','Admin',true/);
 assert.match(source.update,/'time-tracker','FAKE_ROLE',true/);
 assert.match(source.update,/Unsupported module accepted/);
 assert.match(source.update,/Unsupported role accepted/);
});
test('unsigned caller denied and historical audit immutable',()=>{
 assert.match(source.deny,/auth\.uid\(\) IS NOT NULL/);
 assert.match(source.deny,/Unsigned caller unexpectedly granted role/);
 assert.match(source.deny,/Append-only audit unexpectedly mutable/);
});
test('revoke is persisted with change and revoke audit events',()=>{
 assert.match(source.revoke,/'time-tracker','Supervisor',false/);
 assert.match(source.final,/role='Supervisor' AND NOT enabled/);
 assert.match(source.final,/action='change'/);
 assert.match(source.final,/action='revoke'/);
 assert.match(writer,/for step in assign readback update deny revoke final/);
});
