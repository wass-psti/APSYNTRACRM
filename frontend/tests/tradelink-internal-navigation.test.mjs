import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const loadBoard=source.slice(
 source.indexOf('async function loadBoard(boardId,tab,draftType=null,draftEditId=null){'),
 source.indexOf('/** CP-TL-03D: authority and route bound Draft UI',source.indexOf('async function loadBoard('))
);
test('same signed TradeLink board route reuses existing verified board without resetting full-screen loading',()=>{
 const fast=loadBoard.slice(loadBoard.indexOf('if(reuseTradeLinkBoard){'),loadBoard.indexOf("state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true;"));
 assert.match(fast,/render\(\)/);
 assert.match(fast,/loadTradeLinkActivity\(seq\)/);
 assert.match(fast,/loadTradeLinkDrafts\(seq\)/);
 assert.match(fast,/return;/);
 assert.doesNotMatch(fast,/db\.board\(|boardStructureClient\.read\(|state\.loading=true|state\.board=null|state\.boardManage=false/);
 assert.match(loadBoard,/state\.view='board';state\.boardId=boardId;state\.tab=tab;state\.loading=true;state\.board=null/);
});
test('fast path is strictly bounded to active signed same-board same-workspace authenticated navigation',()=>{
 for(const condition of [
  "tab==='tradelink'","state.tab==='tradelink'","state.view==='board'",
  '!state.loading','!state.error','state.boardId===boardId',
  'state.board?.board?.id===boardId',
  'state.board.board.workspace_id===state.context?.workspace_id',
  'state.context?.user_id===auth.userId','auth.isSignedIn'
 ]) assert.ok(loadBoard.includes(condition),condition);
 assert.ok(loadBoard.indexOf('const seq=++routeSerial;')<loadBoard.indexOf('if(reuseTradeLinkBoard){'));
 assert.match(loadBoard,/state\.tradeLinkDraft=initialTradeLinkDraftView\(/);
 assert.match(loadBoard,/if\(tab==='tradelink'&&state\.tradeLinkSection==='drafts'&&validUuid\(draftEditId\)\)/);
});
test('signed lists and edit deep links remain bound to route serial and signed reads',()=>{
 assert.match(source,/const same=\(\)=>seq===routeSerial&&tradeLinkAuthorizedListRoute\(\)/);
 assert.match(source,/const record=await tradeLinkDraftWorkspace\.read\(target\)/);
 assert.match(source,/if\(same\(\)\)await openTradeLinkDraft\(target\)/);
 assert.match(source,/if\(nextHash!==approvedRouteHash&&tradeLinkDraftRoute\(\)&&/);
 assert.match(source,/tradeLinkDraftHasUnsavedChanges\(state\.tradeLinkDraft\)/);
});
