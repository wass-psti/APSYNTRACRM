import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_BULK02_ENABLED} from '../board-bulk02-client.js';
const app=readFileSync('frontend/app.js','utf8');
test('new bulk buttons remain default disabled until separately approved production RPCs',()=>{
 assert.equal(BOARD_BULK02_ENABLED,false);
 assert.match(app,/BOARD_BULK02_ENABLED&&state\.edit&&canBulkEditBoard\(b\)/);
 assert.match(app,/Requires separately authorized atomic SQL activation/);
 assert.match(app,/case 'bulk-status'/);
 assert.match(app,/case 'bulk-archive'/);
 assert.match(app,/case 'group-delete-empty'/);
 assert.match(app,/state\.board\.items\?\.some\(item=>item\.group_id===group\.id\)/);
 assert.match(app,/await db\.allowed\(state\.boardId,'manage'\)/);
 assert.match(app,/await boardBulkClient\.group\(state\.board\.board,group,'delete_empty'\)/);
 assert.match(app,/await boardBulkClient\.group\(fresh\.board,original,'rename',\{title\}\)/);
 assert.doesNotMatch(app,/db\.deleteGroup|wm_delete_board_group/);
});
test('bulk writes are never implemented by loops over legacy single-item mutation endpoints',()=>{
 assert.match(app,/await boardBulkClient\.apply\(board,action,selected,\{status\}\)/);
 assert.match(app,/itemSelection\.clear\(\);await loadBoard\(board\.id,'items'\)/);
 assert.doesNotMatch(app,/itemSelection\.ids[\s\S]{0,200}\.forEach\(.*updateItem/);
});
