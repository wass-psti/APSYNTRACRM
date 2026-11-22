import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(name)=>readFileSync(name,'utf8');
const writer=source('scripts/cp-native-app-autosync-16-canonical-writer.sh');
const clone=source('scripts/cp-native-app-autosync-15-staging-clone.sh');
const bulk=source('sql/acceptance/cp-native-app-autosync-17-bulk.sql');
const readback=source('sql/acceptance/cp-native-app-autosync-17-bulk-readback.sql');
const deny=source('sql/acceptance/cp-native-app-autosync-17-bulk-deny.sql');
const final=source('sql/acceptance/cp-native-app-autosync-17-bulk-final.sql');

test('CP17 enables existing source writer only within CP15 isolated clone',()=>{
 assert.match(writer,/CP16_LOCAL_WRITER_PROBE/);
 assert.match(writer,/CP17_LOCAL_BULK_PROBE/);
 assert.match(writer,/for step in bulk bulk-readback bulk-deny bulk-final/);
 assert.match(writer,/clone" != 'cp_native15_staging_clone'/);
 assert.match(clone,/trap cleanup EXIT/);
 assert.doesNotMatch(writer,/supabase db push|supabase migration|--project-ref/);
});
test('two distinct existing-module assignments execute in a single transaction',()=>{
 assert.match(bulk,/BEGIN;/);
 assert.match(bulk,/COMMIT;/);
 assert.match(bulk,/'a1500000-0000-4000-8000-000000000002','order-intake','User',true/);
 assert.match(bulk,/'a1500000-0000-4000-8000-000000000003','time-tracker','Employee',true/);
 assert.match(bulk,/wm_admin_set_application_role/);
 assert.doesNotMatch(bulk,/arbitrary-new-app/);
});
test('clone membership reinstatement remains local and uses one fixture workspace',()=>{
 assert.match(bulk,/current_database\(\)<>'cp_native15_staging_clone'/);
 assert.match(bulk,/INSERT INTO public\.workspace_members/);
 assert.match(bulk,/request\.jwt\.claim\.sub/);
});
test('independent readback verifies both members and original domain audit',()=>{
 assert.match(readback,/wm_workspace_application_roles/g);
 assert.match(readback,/wm_application_role_audit/);
 assert.match(readback,/action='grant'/);
 assert.match(readback,/CP17 individual\/batch persisted readback failed/);
});
test('original role writer refuses nonadmin actor and inactive workspace member',()=>{
 assert.match(deny,/'a1500000-0000-4000-8000-000000000003'/);
 assert.match(deny,/Member unexpectedly assigned another member role/);
 assert.match(deny,/active=false/);
 assert.match(deny,/Inactive member unexpectedly assigned role/);
 assert.match(deny,/ROLLBACK;/);
});
test('no missing CRM backend or unregistered writer is asserted as activated',()=>{
 assert.match(final,/apsyntra_role_user_management_snapshot/);
 assert.match(final,/apsyntra_native_application_registry/);
 assert.match(final,/work_boards/);
 assert.match(writer,/NOT VERIFIED: real signed Auth sessions or arbitrary new-module writer/);
});
test('no unfinished experimental Auth bootstrap path is shipped',()=>{
 assert.doesNotMatch(clone,/cp-native-app-autosync-17-gotrue-qa\.py/);
 assert.doesNotMatch(writer,/GOTRUE_JWT|GOTRUE_DB_DATABASE_URL/);
});
