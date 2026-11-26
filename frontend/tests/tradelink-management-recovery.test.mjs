import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,normalizeTradeLinkDraftListFilters} from '../tradelink-draft-workspace.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('async function readTradeLinkManagementAccess()'),source.indexOf('// Server-wide TradeLink search'));
const listing=source.slice(source.indexOf('async function loadTradeLinkDrafts(seq='),source.indexOf('async function openTradeLinkDraft(documentId)'));
function harness(outcomes,initialManage=false){
 const auth={isSignedIn:true,userId:'actor'};
 const state={context:{user_id:'actor',workspace_id:'workspace'},boardId:TRADELINK_BOARD_ID,
  tab:'tradelink',tradeLinkSection:'documents',boardManage:initialManage,tradeLinkDraft:initialTradeLinkDraftView()};
 const calls=[];
 const db={async allowed(board,required){
  calls.push([board,required]);
  const value=outcomes.shift();
  if(value instanceof Error)throw value;
  if(typeof value==='function')return value(auth,state);
  return value;
 }};
 const current=()=>auth.isSignedIn&&state.context.user_id===auth.userId;
 const deps={auth,state,db,routeSerial:1,TRADELINK_BOARD_ID,
  tradeLinkAuthorizedListRoute:current,tradeLinkCanCreate:()=>state.boardManage,
  TL03_DOMAIN_READS_ENABLED:true,normalizeTradeLinkDraftListFilters,render:()=>{},
  tradeLinkDraftWorkspace:{searchPage:async()=>({status:'AUTHORIZED_READ',rows:[]})}};
 const run=new Function(...Object.keys(deps),
  'let tradeLinkDocumentsPageRpcUnavailable=false;'+helper+listing+';return {readTradeLinkManagementAccess,loadTradeLinkDrafts};')(...Object.values(deps));
 return {...run,state,auth,calls};
}
const failure=status=>Object.assign(new Error('read failed'),{status});
test('temporary management read failure recovers from the existing signed decision',async()=>{
 const h=harness([failure(503),true]);
 assert.equal(await h.readTradeLinkManagementAccess(),true);
 assert.deepEqual(h.calls,[[TRADELINK_BOARD_ID,'manage'],[TRADELINK_BOARD_ID,'manage']]);
});
test('explicit denial never retries or enables the toolbar',async()=>{
 const h=harness([false,true],true);
 await h.loadTradeLinkDrafts(1,{recheckManage:true});
 assert.equal(h.state.boardManage,false);
 assert.equal(h.calls.length,1);
 assert.equal(h.state.tradeLinkDraft.status,'AUTHORIZED_READ');
 assert.equal(h.state.tradeLinkDraft.error,'');
});
test('authorization errors are not retried',async()=>{
 const h=harness([failure(403),true]);
 await assert.rejects(h.readTradeLinkManagementAccess(),/read failed/);
 assert.equal(h.calls.length,1);
});
test('explicit Refresh recovers previously unavailable management capability',async()=>{
 const h=harness([failure(0),true]);
 await h.loadTradeLinkDrafts(1,{recheckManage:true});
 assert.equal(h.state.boardManage,true);
 assert.equal(h.state.tradeLinkDraft.status,'AUTHORIZED_READ');
 assert.equal(h.state.tradeLinkDraft.error,'');
});
test('persistent read failure remains fail-closed, offers Refresh and retains shared list',async()=>{
 const h=harness([failure(503),failure(503),true],true);
 await h.loadTradeLinkDrafts(1,{recheckManage:true});
 assert.equal(h.state.boardManage,false);
 assert.equal(h.state.tradeLinkDraft.status,'AUTHORIZED_READ');
 assert.match(h.state.tradeLinkDraft.error,/Select Refresh to retry/);
 assert.equal(h.calls.length,2);
 await h.loadTradeLinkDrafts(1,{recheckManage:true});
 assert.equal(h.state.boardManage,true);
 assert.equal(h.state.tradeLinkDraft.error,'');
});
test('stale identity and workspace decisions cannot enable the toolbar',async()=>{
 const h=harness([(auth)=>{auth.userId='new-actor';return true;}]);
 assert.equal(await h.readTradeLinkManagementAccess(),false);
 const w=harness([(auth,state)=>{state.context.workspace_id='new-workspace';return true;}]);
 assert.equal(await w.readTradeLinkManagementAccess(),false);
});
test('initial load, background refresh, explicit Refresh and route reuse use the signed management check',()=>{
 assert.match(source,/nativeModuleId==='tradelink'\?readTradeLinkManagementAccess\(\):/);
 assert.match(source,/nativeModuleId==='tradelink'\?readTradeLinkManagementAccess\(\)\.catch\(error=>/);
 const refresh=source.slice(source.indexOf("case 'tradelink-documents-refresh':"),source.indexOf("case 'tradelink-documents-export-selection':"));
 assert.match(refresh,/recheckManage:true/);
 const reuse=source.slice(source.indexOf('if(reuseTradeLinkBoard){'),source.indexOf("state.nativeInitialRead=['attendance'"));
 assert.match(reuse,/loadTradeLinkDrafts\(seq,\{recheckManage:true\}\)/);
 const mutation=source.slice(source.indexOf('async function applyTradeLinkDocumentBulkAction('),source.indexOf('async function changeTradeLinkDraftState('));
 assert.match(mutation,/!state\.boardManage/);
});


test('initial All Documents load rechecks a missing management decision for a signed General Manager',()=>{
 const initial=source.slice(source.indexOf("state.nativeInitialRead=['attendance'"),source.indexOf("if(tab==='attendance'&&moduleByBoardName(state.board.board?.name)?.key==='timetracker')"));
 assert.match(initial,/state\.tradeLinkSection==='documents'&&!state\.boardManage&&\s*state\.tradeLinkModuleRole==='General Manager'\)\s*await loadTradeLinkDrafts\(seq,\{recheckManage:true\}\)/);
});

test('initial permission fan-out preserves the four signed result slots for native and ordinary boards',async()=>{
 const start=source.indexOf('const remainingReads=Promise.all([',source.indexOf('async function loadBoard('));
 const end=source.indexOf('if(nativeModuleId&&(!resolvedNative',start);
 assert.ok(start>=0&&end>start);
 const snippet=source.slice(start,end);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('nativeModuleId','nativeContext','db','boardId','tab',
  'readVisibleBoardSnapshot','readTradeLinkManagementAccess','boardStructureClient','viewRead',
  'seq','routeSerial','boardPreferences','state','ApiError',
  snippet+'return {detail,edit,manage,boardUi};');
 const detail={board:{id:'board'}};
 for(const native of [true,false]){
  for(const permitted of [true,false]){
   const nativeContext={detail};
   const ui={layout:'table'};
   const calls=[];
   const result=await run(native?'tradelink':null,native?nativeContext:null,
    {allowed:async(id,kind)=>{calls.push(kind);return kind==='edit'?!permitted:permitted;}},
    'board','items',async()=>detail,async()=>{calls.push('manage');return permitted;},
    {read:async()=>ui},Promise.resolve(true),1,1,{hydrate:async()=>true},{context:{}},Error);
   assert.deepEqual(result,{detail,edit:!permitted,manage:permitted,boardUi:native?null:ui});
   assert.deepEqual(calls,['edit','manage']);
  }
 }
});
test('an already retried transport failure does not trigger another management lookup',async()=>{
 const error=Object.assign(failure(503),{retryAttempts:1});
 const h=harness([error,true]);
 await assert.rejects(h.readTradeLinkManagementAccess(),observed=>observed===error);
 assert.equal(h.calls.length,1);
});
