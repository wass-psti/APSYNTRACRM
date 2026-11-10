import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('guarded production SQL strictly preserves the original board',()=>{
 const sql=read('../../sql/mrh-board-item-tasks-PRODUCTION-ACTIVATED-20261110.sql');
 assert.match(sql,/mrh_activation_guard/);
 assert.match(sql,/g\.title='Main group'/);
 assert.match(sql,/g\.position=0/);
 assert.match(sql,/create table private\.mrh_board_item_tasks/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/grant execute on function public\.mrh_board_item_tasks_write/);
 assert.doesNotMatch(sql,/^\s*(?:update|delete|truncate|drop)\s+(?:public\.work_board|public\.material_tracker_)/im);
});
test('postflight verifies exact security grants and cannot write data',()=>{
 const sql=read('../../sql/tests/mrh-board-item-tasks-production-postflight-readonly.sql');
 assert.match(sql,/PRODUCTION_TASK_SCHEMA_ACTIVATION_PASS__SIGNED_ITEM_TRANSACTION_PENDING/);
 assert.match(sql,/PRODUCTION_TASK_SCHEMA_ACTIVATION_FAIL__CONTAIN_API/);
 assert.match(sql,/signed_insert_denied/);
 assert.match(sql,/private_rls_forced/);
 assert.match(sql,/five_foreign_keys/);
 assert.doesNotMatch(sql,/^\s*(?:create|drop|alter|insert|update|delete|grant|revoke)\b/im);
});
test('emergency containment retains all saved task records',()=>{
 const sql=read('../../sql/mrh-board-item-tasks-RPC-CONTAINMENT-NO-DATA-LOSS.sql');
 assert.match(sql,/revoke execute on function public\.mrh_board_item_tasks_read/);
 assert.match(sql,/revoke execute on function public\.mrh_board_item_tasks_write/);
 assert.doesNotMatch(sql,/^\s*(?:drop|delete|truncate|update|insert)\b/im);
});
