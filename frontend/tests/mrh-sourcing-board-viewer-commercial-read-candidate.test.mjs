import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=new URL('../../sql/mrh-sourcing-board-viewer-commercial-read-CANDIDATE-NOT-APPLIED.sql',import.meta.url);
const sql=readFileSync(path,'utf8');
test('new isolated read RPC does not mutate existing admin task and write security',()=>{
 assert.match(sql,/create or replace function public\.mrh_sourcing_board_viewer_read/);
 assert.doesNotMatch(sql,/create or replace function private\.mrh_sourcing_scope/);
 assert.doesNotMatch(sql,/mrh_sourcing_sensitive_write|mrh_board_item_tasks_write/);
 assert.doesNotMatch(sql,/^\s*(?:update|delete|truncate|drop|alter)\s+(?:public|private)\./im);
 assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete)\s+on\s+private\.mrh_sourcing_sensitive_cells/i);
});
test('signed board access, current workspace membership, live group and item are required',()=>{
 assert.match(sql,/v_actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/work_board_access\(p_board_id,'view'\)/);
 assert.match(sql,/workspace_members m/);
 assert.match(sql,/m\.user_id=v_actor and m\.active=true/);
 assert.match(sql,/p\.status='active'/);
 assert.match(sql,/i\.archived_at is null/);
 assert.match(sql,/g\.title='Main group'/);
 assert.match(sql,/g\.id='21566a87-b287-4a61-b521-bb233956e09e'/);
 assert.match(sql,/s\.workspace_id=v_workspace/);
});
test('anonymous denied, no direct sensitive table grants, no change to task RPCs',()=>{
 assert.match(sql,/revoke all on function public\.mrh_sourcing_board_viewer_read\(uuid,uuid\)/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.mrh_sourcing_board_viewer_read\(uuid,uuid\)/);
 assert.match(sql,/to authenticated/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path to ''/);
 assert.doesNotMatch(sql,/grant execute .* to anon/);
});
