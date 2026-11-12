import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canRetainVisibleBoard,replaceVisibleBoardContent} from '../board-background-update.js';
const ID='3c92c3a3-2799-4264-95cc-77b2daf65ca7';
const ACTOR='11111111-1111-4111-8111-111111111111';
const WS='22222222-2222-4222-8222-222222222222';
const state=()=>({view:'board',boardId:ID,tab:'items',loading:false,error:null,
 context:{user_id:ACTOR,workspace_id:WS},board:{board:{id:ID,workspace_id:WS}}});
test('only a verified same-scope, already-rendered items or sourcing board skips initial loading',()=>{
 const s=state(),opts={boardId:ID,tab:'items',userId:ACTOR,signed:true};
 assert.equal(canRetainVisibleBoard(s,opts),true);
 assert.equal(canRetainVisibleBoard({...s,tab:'sourcing'}, {...opts,tab:'sourcing'}),true);
 for(const [key,value] of [['view','boards'],['loading',true],['error','Failed'],['boardId','another']])
  assert.equal(canRetainVisibleBoard({...s,[key]:value},opts),false,key);
 assert.equal(canRetainVisibleBoard({...s,board:null},opts),false);
 assert.equal(canRetainVisibleBoard({...s,board:{board:{id:ID,workspace_id:'other'}}},opts),false);
 assert.equal(canRetainVisibleBoard(s,{...opts,tab:'attendance'}),false);
 assert.equal(canRetainVisibleBoard(s,{...opts,userId:'other'}),false);
 assert.equal(canRetainVisibleBoard(s,{...opts,signed:false}),false);
});
test('visible fragment replacement fails safely without an established host or valid markup',()=>{
 assert.equal(replaceVisibleBoardContent(null,'<div data-board-live-content></div>'),false);
 assert.equal(replaceVisibleBoardContent({querySelector:()=>null},'<div data-board-live-content></div>'),false);
});
test('live refresh keeps the board and editing context while signed server reads execute',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const refresh=app.slice(app.indexOf('async function refreshVisibleBoard('),app.indexOf('async function loadBoard('));
 assert.match(refresh,/db\.board\(boardId,\{parallelExtendedRefs:true\}\)/);
 assert.match(refresh,/db\.allowed\(boardId,'view'\)/);
 assert.match(refresh,/db\.allowed\(boardId,'edit'\)/);
 assert.match(refresh,/db\.allowed\(boardId,'manage'\)/);
 assert.match(refresh,/boardStructureClient\.read\(boardId\)/);
 assert.match(refresh,/detail\.board\.workspace_id!==workspace/);
 assert.match(refresh,/seq===routeSerial/);
 assert.match(refresh,/visibleBoardRefreshSerial/);
 assert.doesNotMatch(refresh,/state\.loading=true|state\.board=null;state\.boardUi=null;state\.boardManage=false;state\.error=null/);
 assert.match(refresh,/if\(changed\)deferVisibleBoardContent\(\)/);
 const loader=app.slice(app.indexOf('async function loadBoard('),app.indexOf('/** CP-TL-03D:'));
 assert.match(loader,/if\(canRetainVisibleBoard\(state,/);
 assert.match(loader,/return refreshVisibleBoard\(boardId,tab\)/);
 assert.ok(loader.indexOf('return refreshVisibleBoard(boardId,tab)')<loader.indexOf("state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true"));
});
test('board patch defers during unsaved editors and keeps the shell, sidebar and search mounted',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf('function deferVisibleBoardContent('),app.indexOf('async function refreshVisibleBoard('));
 assert.match(handler,/modal\?\.isConnected\|\|state\.inlineCell/);
 assert.match(handler,/state\.groupEditId\|\|state\.groupEditBusy/);
 assert.match(handler,/focusedEditor/);
 assert.match(handler,/details\[open\]/);
 assert.match(handler,/replaceVisibleBoardContent\(root,boardPage\(\)/);
 assert.match(handler,/mountBoardWindows\(root,syncBoardSelectionUi\)/);
 assert.match(handler,/applyBoardItemFilter\(state\.boardItemSearch\)/);
 assert.match(app,/<div data-board-live-content>/);
 assert.match(app,/document\.addEventListener\('focusout'/);
 assert.match(app,/flushVisibleBoardContent\(\{afterLocalSave:true\}\)/);
 assert.match(app,/if\(\['items','sourcing'\]\.includes\(tab\)\)deferVisibleBoardContent\(\)/);
});
