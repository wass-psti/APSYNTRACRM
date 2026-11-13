import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261113194500_cp_db_perf06_board_list_sql.sql',import.meta.url),'utf8');
test('board list keeps signed workspace and membership authorization',()=>{
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/public\.current_workspace_id\(auth\.uid\(\)\)/);
 assert.match(sql,/public\.is_platform_admin\(auth\.uid\(\)\)/);
 assert.match(sql,/m\.board_id=b\.id AND m\.user_id=c\.uid/);
 assert.match(sql,/c\.platform_admin OR m\.user_id IS NOT NULL/);
 assert.match(sql,/b\.workspace_id=c\.workspace_id/);
});
test('board list retains active item count, status and stable ordering',()=>{
 assert.match(sql,/i\.board_id=b\.id AND i\.archived_at IS NULL/);
 assert.match(sql,/b\.status=coalesce\(nullif\(p_status,''\),'active'\)/);
 assert.match(sql,/ORDER BY b\.updated_at DESC,b\.created_at DESC/);
 assert.match(sql,/WITH caller AS MATERIALIZED/);
});
