import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114013428_cp_db_cpu_04_grouped_board_counts.sql',import.meta.url),'utf8');

test('grouped board counts preserve the existing signed workspace and membership contract',()=>{
 assert.match(sql,/RETURNS TABLE\([\s\S]*item_count bigint/);
 assert.match(sql,/LANGUAGE sql\s+STABLE\s+SECURITY DEFINER/);
 assert.match(sql,/SET search_path TO 'public'/);
 assert.match(sql,/WITH caller AS MATERIALIZED/);
 assert.match(sql,/public\.current_workspace_id\(auth\.uid\(\)\)/);
 assert.match(sql,/public\.is_platform_admin\(auth\.uid\(\)\)/);
 assert.match(sql,/visible_boards AS MATERIALIZED/);
 assert.match(sql,/m\.board_id = b\.id AND m\.user_id = c\.uid/);
 assert.match(sql,/c\.platform_admin OR m\.user_id IS NOT NULL/);
 assert.match(sql,/b\.workspace_id = c\.workspace_id/);
});

test('active item counts are grouped once for visible boards and joined without changing output ordering',()=>{
 assert.match(sql,/item_counts AS MATERIALIZED/);
 assert.match(sql,/JOIN public\.work_board_items i\s+ON i\.board_id = b\.id/);
 assert.match(sql,/i\.archived_at IS NULL/);
 assert.match(sql,/GROUP BY i\.board_id/);
 assert.match(sql,/LEFT JOIN item_counts ic ON ic\.board_id = b\.id/);
 assert.match(sql,/coalesce\(ic\.item_count, 0\) AS item_count/);
 assert.match(sql,/b\.status = coalesce\(nullif\(p_status, ''\), 'active'\)/);
 assert.match(sql,/ORDER BY b\.updated_at DESC, b\.created_at DESC/);
 assert.doesNotMatch(sql,/\(SELECT count\(\*\) FROM public\.work_board_items/);
});

test('board list optimization does not add grants, RLS policies, schema columns or indexes',()=>{
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE\s+POLICY|ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX)\b/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.wm_list_boards/);
});
