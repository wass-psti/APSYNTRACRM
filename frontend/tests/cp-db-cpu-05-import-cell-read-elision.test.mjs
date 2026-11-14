import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114031500_cp_db_cpu_05_import_cell_read_elision.sql',import.meta.url),'utf8');
const helper=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION private.wm_import_set_board_cell_cached'),sql.indexOf('REVOKE ALL ON FUNCTION'));
const patch=sql.slice(sql.indexOf('DO $migration$'));

test('cached import cell writer removes redundant item and column reads',()=>{
 assert.doesNotMatch(helper,/SELECT\s+\*\s+INTO\s+\w+\s+FROM\s+public\.work_board_items/i);
 assert.doesNotMatch(helper,/SELECT\s+\*\s+INTO\s+\w+\s+FROM\s+public\.work_board_columns/i);
 assert.match(helper,/public\.work_board_validate_column_value\(p_board_id, p_column_id, p_value\)/);
 assert.match(helper,/WHERE id = p_item_id AND board_id = p_board_id/);
});

test('column metadata is read from authoritative locked board columns and cached per source',()=>{
 assert.match(patch,/column_meta_by_source jsonb := ''\{\}''::jsonb/);
 assert.match(patch,/select c\.name, c\.data_type, c\.system_key, c\.column_key/);
 assert.match(patch,/column_meta_by_source := column_meta_by_source \|\| jsonb_build_object/);
 assert.match(patch,/column_meta->>''id'' is distinct from source_column_id::text/);
 assert.match(patch,/column_meta->>''system_key''/);
 assert.match(patch,/column_meta->>''data_type'' is null/);
});

test('extended references reuse cached type metadata and normal cells use the cached helper',()=>{
 assert.match(patch,/extended_type := column_meta->>''data_type''/);
 assert.match(patch,/Extended references require a custom column/);
 const extendedStart=patch.indexOf('replacement :=',patch.indexOf("needle := E'        select c.data_type into extended_type"));
 const extendedEnd=patch.indexOf('occurrences :=',extendedStart);
 assert.doesNotMatch(patch.slice(extendedStart,extendedEnd),/select c\.data_type into extended_type/);
 assert.match(patch,/wm_import_set_board_cell_cached\(p_board_id,v_import_item_id,source_column_id,mapped_value/);
 const callStart=patch.indexOf('replacement :=',patch.indexOf("needle := 'perform private.wm_import_set_board_cell("));
 const callEnd=patch.indexOf('occurrences :=',callStart);
 assert.doesNotMatch(patch.slice(callStart,callEnd),/perform private\.wm_import_set_board_cell\(/);
});

test('the original validator, system/custom writes, and per-cell audit remain authoritative',()=>{
 assert.match(helper,/public\.work_board_validate_column_value/);
 for(const key of ['title','status','assignee','due_date','notes']) assert.match(helper,new RegExp(`WHEN '${key}' THEN`));
 assert.match(helper,/INSERT INTO public\.work_board_item_values/);
 assert.match(helper,/ON CONFLICT \(item_id, column_id\)/);
 assert.match(helper,/DELETE FROM public\.work_board_item_values/);
 assert.match(helper,/public\.work_board_log\(/);
 assert.match(helper,/item\.cell_updated/);
 assert.doesNotMatch(helper,/UPDATE public\.work_boards/);
});

test('new helper remains private and receives no client execution grant',()=>{
 assert.match(helper,/SET search_path TO ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.wm_import_set_board_cell_cached\([\s\S]*?\) FROM PUBLIC, anon, authenticated/);
 assert.doesNotMatch(sql,/\bGRANT\b/i);
});

test('migration requires exact-one source anchors and performs only function changes',()=>{
 assert.match(patch,/occurrences <> 1/);
 assert.match(patch,/EXECUTE definition/);
 assert.doesNotMatch(sql,/\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM\s+public\.work_boards|ALTER\s+TABLE|CREATE\s+POLICY)\b/i);
});
