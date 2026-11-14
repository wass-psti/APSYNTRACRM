import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114024500_cp_db_cpu_04_batch_import_realtime_broadcasts.sql',import.meta.url),'utf8');
const sync=readFileSync(new URL('../platform-sync.js',import.meta.url),'utf8');

test('Realtime row trigger exits before actor lookup and JSON serialization during an import',()=>{
 assert.match(sql,/actor_id uuid := auth\.uid\(\)/);
 assert.match(sql,/actor_id uuid;/);
 assert.match(sql,/pg_catalog\.current_setting\(''apsyntra\.realtime_suppress'', true\) = ''on''/);
 assert.match(sql,/if tg_op = ''DELETE'' then return old; end if/);
 assert.match(sql,/return new/);
 assert.match(sql,/actor_id := auth\.uid\(\)/);
 const triggerStart=sql.indexOf("needle := E'begin");
 const triggerReplacementStart=sql.indexOf('replacement :=',triggerStart);
 const triggerReplacementEnd=sql.indexOf('occurrences :=',triggerReplacementStart);
 const triggerReplacement=sql.slice(triggerReplacementStart,triggerReplacementEnd);
 assert.ok(triggerReplacement.indexOf('current_setting')<triggerReplacement.indexOf('actor_id := auth.uid()'));
 assert.match(sql,/Expected one Realtime trigger row-serialization anchor/);
});

test('both import RPCs enable transaction-local suppression only after authorization and locking',()=>{
 assert.match(sql,/wm_import_board_wizard_extended_atomic\(uuid,timestamp with time zone,jsonb\)/);
 assert.match(sql,/wm_import_board_wizard_atomic\(uuid,timestamp with time zone,jsonb\)/);
 assert.match(sql,/work_board_members where board_id=p_board_id for share/);
 assert.match(sql,/set_config\(''apsyntra\.realtime_suppress'', ''on'', true\)/);
 assert.match(sql,/Expected one extended-import suppression anchor/);
 assert.match(sql,/Expected one atomic-import suppression anchor/);
 assert.match(sql,/definition := pg_catalog\.replace\(definition, needle, replacement\);\n  EXECUTE definition;/);
});

test('each import emits one private board-change invalidation instead of row-level events',()=>{
 assert.match(sql,/realtime\.send\(/);
 assert.match(sql,/''entity'', ''board''/);
 assert.match(sql,/''action'', ''BULK_IMPORT''/);
 assert.match(sql,/''board-change''/);
 assert.match(sql,/''board:'' \|\| p_board_id::text/);
 assert.match(sql,/''change_count'', created_items \+ updated_items \+ created_columns \+ created_groups/);
 assert.match(sql,/Expected one extended-import return anchor/);
 assert.match(sql,/Expected one atomic-import return anchor/);
});

test('existing Realtime client accepts the summary event and performs signed invalidation reads',()=>{
 assert.match(sync,/const ENTITIES=new Set\(\['board','member','group','item','column','cell','update','file'\]\)/);
 assert.match(sync,/payload\?\.event!=='board-change'/);
 assert.match(sync,/change\?\.board_id!==id\|\|!ENTITIES\.has\(change\?\.entity\)/);
 assert.match(sync,/syncNow\('broadcast',ids\)/);
});

test('no row data, permissions, trigger enablement, or persistent suppression state is changed',()=>{
 assert.doesNotMatch(sql,/ALTER\s+TABLE[\s\S]{0,100}DISABLE\s+TRIGGER/i);
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE\s+POLICY|DROP\s+TRIGGER|CREATE\s+TABLE|INSERT\s+INTO|DELETE\s+FROM)\b/i);
 assert.match(sql,/set_config\(''apsyntra\.realtime_suppress'', ''on'', true\)/);
});
