import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_BULK02_ENABLED} from '../board-bulk02-client.js';
const app=readFileSync('frontend/app.js','utf8');
test('bulk controls remain fail-closed before genuine per-session preflight',()=>{
 assert.equal(BOARD_BULK02_ENABLED,false);
 assert.match(app,/bulkReadyFor\(b\)/);
 assert.match(app,/canRequestBulk\(b\)/);
 assert.match(app,/ensureSignedBulkReady\(state\.board\.board\)/);
 assert.match(app,/data-action="bulk02-verify"/);
 assert.match(app,/case 'bulk02-verify'/);
 assert.match(app,/boardBulkClient\.enabled=true/);
 assert.match(app,/case 'bulk-status'/);
 assert.match(app,/case 'bulk-archive'/);
 assert.match(app,/case 'group-delete-empty'/);
 assert.match(app,/fresh\.items\?\.some\(item=>item\.group_id===candidate\.id\)/);
 assert.match(app,/if\(!activeBoardLayout\(\)\|\|!state\.boardManage\)return/);
 assert.match(app,/await db\.deleteEmptyGroupCas\(boardId,candidate\)/);
 assert.match(app,/await db\.updateGroupCas\(boardId,original,title\)/);
 assert.match(app,/clearBulkActivation\(\)/);
 assert.doesNotMatch(app,/db\.deleteGroup|wm_delete_board_group/);
});
test('bulk writes are never implemented by loops over legacy single-item mutation endpoints',()=>{
 assert.match(app,/await boardBulkClient\.apply\(board,action,selected,\{status\}\)/);
 assert.match(app,/itemSelection\.clear\(\);await loadBoard\(board\.id,'items'\)/);
 assert.doesNotMatch(app,/itemSelection\.ids[\s\S]{0,200}\.forEach\(.*updateItem/);
});
