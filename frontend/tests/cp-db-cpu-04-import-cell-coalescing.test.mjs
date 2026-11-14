import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114020300_cp_db_cpu_04_import_cell_write_coalescing.sql',import.meta.url),'utf8');

test('internal import cell writer preserves value validation and system/custom cell behavior',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION private\.wm_import_set_board_cell/);
 assert.match(sql,/WHERE id = p_item_id\s+AND board_id = p_board_id/);
 assert.match(sql,/WHERE id = p_column_id\s+AND board_id = p_board_id/);
 assert.match(sql,/public\.work_board_validate_column_value\(p_board_id, c\.id, p_value\)/);
 for(const key of ['title','status','assignee','due_date','notes'])
  assert.match(sql,new RegExp(`WHEN '${key}' THEN`));
 assert.match(sql,/INSERT INTO public\.work_board_item_values/);
 assert.match(sql,/ON CONFLICT \(item_id, column_id\)/);
 assert.match(sql,/DELETE FROM public\.work_board_item_values/);
});

test('per-cell audit is preserved while parent board touch is omitted from the helper',()=>{
 const helper=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION private.wm_import_set_board_cell'),sql.indexOf('REVOKE ALL ON FUNCTION'));
 assert.match(helper,/public\.work_board_log\(/);
 assert.match(helper,/item\.cell_updated/);
 assert.doesNotMatch(helper,/UPDATE public\.work_boards/);
 assert.match(sql,/one authoritative parent-board timestamp update/);
});

test('only the extended import RPC cell writer is replaced and exact-one guard is enforced',()=>{
 assert.match(sql,/public\.wm_import_board_wizard_extended_atomic\(uuid,timestamp with time zone,jsonb\)/);
 assert.match(sql,/perform public\.wm_set_board_cell\(v_import_item_id,source_column_id,mapped_value\);/);
 assert.match(sql,/perform private\.wm_import_set_board_cell\(p_board_id,v_import_item_id,source_column_id,mapped_value\);/);
 assert.match(sql,/IF occurrences <> 1 THEN/);
 assert.match(sql,/EXECUTE pg_catalog\.replace\(definition, needle, replacement\)/);
});

test('helper is private and cannot be invoked directly by client roles',()=>{
 assert.match(sql,/SET search_path TO ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.wm_import_set_board_cell\(uuid, uuid, uuid, jsonb\)\s+FROM PUBLIC, anon, authenticated/);
 assert.doesNotMatch(sql,/\bGRANT\b/i);
});

test('migration performs no destructive schema or data operations',()=>{
 assert.doesNotMatch(sql,/\b(?:DROP\s+TABLE|DROP\s+FUNCTION|TRUNCATE|DELETE\s+FROM\s+public\.work_boards)\b/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION private\.wm_import_set_board_cell/);
});
