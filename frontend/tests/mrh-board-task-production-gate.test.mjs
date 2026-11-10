import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../sql/tests/mrh-board-item-tasks-production-readiness-readonly.sql',import.meta.url),'utf8');
const candidate=readFileSync(new URL('../../sql/mrh-board-item-tasks-CANDIDATE-NOT-APPLIED.sql',import.meta.url),'utf8');
test('read-only preflight does not mutate real board, users or schema',()=>{
 assert.match(sql,/STRUCTURAL_PREFLIGHT_FAIL__DO_NOT_ACTIVATE/);
 assert.match(sql,/BACKUP_RESTORE_AND_SIGNED_ITEM_ACCEPTANCE_STILL_REQUIRED/);
 assert.doesNotMatch(sql,/^\s*(?:create|insert|update|delete|alter|grant|revoke|truncate|drop|set\s+role|do\s+\$\$)\b/im);
 assert.match(sql,/g\.title='Main group'/);
 assert.match(sql,/g\.position=0/);
 assert.match(sql,/columns=8/);
 assert.match(sql,/new_table_not_installed/);
 assert.match(sql,/read_rpc_not_installed/);
 assert.match(sql,/write_rpc_not_installed/);
 assert.match(sql,/migration_owner_bypassrls/);
 assert.match(sql,/signed_role_not_bypassrls/);
});
test('activation candidate does not modify legacy materials or original board rows',()=>{
 assert.match(candidate,/create table private\.mrh_board_item_tasks/);
 assert.match(candidate,/references public\.work_board_items\(id\)/);
 assert.match(candidate,/force row level security/);
 assert.match(candidate,/private\.mrh_sourcing_scope\(p_board_id,p_item_id\)/);
 assert.match(candidate,/work_board_access\(p_board_id,'edit'\)/);
 assert.match(candidate,/g\.title='Main group'/);
 assert.match(candidate,/i\.archived_at is null/);
 assert.doesNotMatch(candidate,/^\s*(?:update|delete|truncate)\s+(?:public\.work_board_items|public\.work_board_groups|public\.material_tracker_)/im);
});
