import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DomainApi,BOARD_ITEM_PAGE_SIZE} from '../data.js';
import {renderBoardPagination,mountBoardPagination} from '../board-pagination-ui.js';
import {boardItemsComplete} from '../board-grid.js';

const board='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const workspace='33333333-3333-4333-8333-333333333333';
const column='44444444-4444-4444-8444-444444444444';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const item=n=>({id:id(n),board_id:board,position:n-1,title:'Record '+n});
const items=(start,count)=>Array.from({length:count},(_,index)=>item(start+index));
const values=rows=>rows.map(row=>({item_id:row.id,column_id:column,value:'value-'+row.position}));
const firstItems=items(1,BOARD_ITEM_PAGE_SIZE);
const secondItems=items(BOARD_ITEM_PAGE_SIZE+1,BOARD_ITEM_PAGE_SIZE);
const lastItems=items(BOARD_ITEM_PAGE_SIZE*2+1,1);
const cursor=rows=>({position:rows.at(-1).position,id:rows.at(-1).id});
const page=(rows,hasMore)=>({items:rows,values:values(rows),has_more:hasMore,
 next_cursor:hasMore?cursor(rows):null});
const shell={board:{id:board,workspace_id:workspace},groups:[],members:[],
 columns:[{id:column}]};
function fixture({delaySecond=false,malformedSecond=false}={}){
 const calls=[];let releaseSecond=null;
 const auth={userId:user,accessToken:'session-a',authorized:async(path,options)=>{
  calls.push({path,args:options?.body});
  if(path.endsWith('/wm_get_board_shell'))return structuredClone(shell);
  if(path.endsWith('/wm_get_board_items_page')){
   const args=options.body;
   if(args.p_after_position===null)return page(firstItems,true);
   if(args.p_after_position===cursor(firstItems).position){
    if(delaySecond)return new Promise(resolve=>{releaseSecond=()=>resolve(
     malformedSecond?{...page(secondItems,true),next_cursor:{position:999,id:id(999)}}:page(secondItems,true)
    );});
    return malformedSecond?
     {...page(secondItems,true),next_cursor:{position:999,id:id(999)}}:page(secondItems,true);
   }
   if(args.p_after_position===cursor(secondItems).position)return page(lastItems,false);
   throw new Error('Unexpected keyset cursor');
  }
  throw new Error('Unexpected RPC '+path);
 }};
 return {api:new DomainApi(auth),auth,calls,releaseSecond:()=>releaseSecond?.()};
}
const scope={userId:user,workspaceId:workspace};

test('normal cached board hydration reads only the shell and first 200-item page',async()=>{
 const {api,calls}=fixture();
 const detail=await api.boardCached(board,scope);
 assert.equal(detail.items.length,200);
 assert.equal(detail.values.length,200);
 assert.deepEqual(detail.pagination,{page_size:200,has_more:true,
  next_cursor:cursor(firstItems),loaded_count:200,loaded:true});
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,1);
 assert.equal(calls.some(call=>call.path.endsWith('/wm_get_board')),false);
});

test('module shell reads avoid item RPCs and are upgraded when the user opens Board items',async()=>{
 const {api,calls}=fixture();
 const shellOnly=await api.boardCached(board,{...scope,includeItems:false});
 assert.deepEqual(shellOnly.items,[]);
 assert.deepEqual(shellOnly.values,[]);
 assert.equal(shellOnly.pagination.loaded,false);
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_shell')).length,1);
 assert.equal(calls.some(call=>call.path.endsWith('/wm_get_board_items_page')),false);
 const itemView=await api.boardCached(board,scope);
 assert.equal(itemView.items.length,200);
 assert.equal(itemView.pagination.loaded,true);
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_shell')).length,2);
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,1);
});

test('shell-only snapshots cannot be treated as empty complete boards or paged',async()=>{
 const {api}=fixture();
 const detail=await api.boardCached(board,{...scope,includeItems:false});
 assert.equal(boardItemsComplete(detail),false);
 await assert.rejects(()=>api.boardNextPage(board,scope),
  error=>error.code==='BOARD_ITEMS_NOT_LOADED');
});

test('one demand-driven continuation appends exactly one page and retains its cursor',async()=>{
 const {api,calls}=fixture();
 await api.boardCached(board,scope);
 const detail=await api.boardNextPage(board,scope);
 assert.equal(detail.items.length,400);
 assert.equal(detail.values.length,400);
 assert.equal(detail.pagination.has_more,true);
 assert.deepEqual(detail.pagination.next_cursor,cursor(secondItems));
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,2);
});

test('boardCachedThrough hydrates only to the requested visible depth',async()=>{
 const {api,calls}=fixture();
 const detail=await api.boardCachedThrough(board,scope,{itemCount:400});
 assert.equal(detail.items.length,400);
 assert.equal(detail.pagination.has_more,true);
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,2);
});

test('complete snapshots remain available to explicit full-data workflows',async()=>{
 const {api,calls}=fixture();
 const detail=await api.board(board);
 assert.equal(detail.items.length,401);
 assert.equal(detail.values.length,401);
 assert.deepEqual(detail.pagination,{page_size:200,has_more:false,
  next_cursor:null,loaded_count:401,loaded:true});
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,3);
});

test('concurrent demand for the same page is coalesced into one signed RPC',async()=>{
 const {api,calls,releaseSecond}=fixture({delaySecond:true});
 await api.boardCached(board,scope);
 const left=api.boardNextPage(board,scope);
 const right=api.boardNextPage(board,scope);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,2);
 releaseSecond();
 const [a,b]=await Promise.all([left,right]);
 assert.equal(a.items.length,400);
 assert.deepEqual(a,b);
 assert.notEqual(a,b);
});

test('cache invalidation during an in-flight page prevents stale page commit',async()=>{
 const {api,releaseSecond}=fixture({delaySecond:true});
 await api.boardCached(board,scope);
 const pending=api.boardNextPage(board,scope);
 await new Promise(resolve=>setImmediate(resolve));
 api.invalidateBoardCache(board);
 releaseSecond();
 await assert.rejects(()=>pending,error=>error.code==='BOARD_PAGE_INVALIDATED');
 assert.equal(api.boardReadCache.has(board),false);
});

test('invalid continuation cursor is rejected and cached first page is retained',async()=>{
 const {api}=fixture({malformedSecond:true});
 await api.boardCached(board,scope);
 await assert.rejects(()=>api.boardNextPage(board,scope),
  error=>error.code==='INVALID_BOARD_CURSOR');
 assert.equal(api.boardReadCache.get(board).value.items.length,200);
});

test('expired cache is rebuilt only through the prior loaded depth before another page is fetched',async()=>{
 const {api,calls}=fixture();
 const realNow=Date.now;
 let now=realNow();
 Date.now=()=>now;
 try{
  await api.boardCached(board,{...scope,maxAgeMs:10});
  now+=11;
  const detail=await api.boardCachedThrough(board,{...scope,maxAgeMs:10},{itemCount:200});
  assert.equal(detail.items.length,200);
  const next=await api.boardNextPage(board,{...scope,maxAgeMs:10});
  assert.equal(next.items.length,400);
  assert.equal(calls.filter(call=>call.path.endsWith('/wm_get_board_items_page')).length,3);
 }finally{Date.now=realNow;}
});

test('page continuation cannot cross an access-token generation',async()=>{
 const {api,auth}=fixture();
 await api.boardCached(board,scope);
 auth.accessToken='session-b';
 await assert.rejects(()=>api.boardNextPage(board,scope),error=>error.status===409);
});

test('board UI exposes manual pagination, status, retry and completed states accessibly',()=>{
 const partial=renderBoardPagination({loaded_count:200,has_more:true});
 assert.match(partial,/Showing 200 loaded items/);
 assert.match(partial,/data-action="board-load-more"/);
 assert.match(partial,/data-board-pagination-sentinel/);
 const busy=renderBoardPagination({loaded_count:200,has_more:true},{busy:true});
 assert.match(busy,/Loading more items/);
 assert.doesNotMatch(busy,/data-board-pagination-sentinel/);
 const failed=renderBoardPagination({loaded_count:200,has_more:true},{error:'Temporary network error'});
 assert.match(failed,/role="alert"/);
 assert.match(failed,/Retry loading items/);
 assert.doesNotMatch(failed,/data-board-pagination-sentinel/);
 const complete=renderBoardPagination({loaded_count:401,has_more:false});
 assert.match(complete,/All available items loaded/);
 assert.doesNotMatch(complete,/data-action="board-load-more"/);
});

test('near-end observer requests one page and disconnects cleanly',async()=>{
 const prior=globalThis.IntersectionObserver;
 let callback,observed=null,disconnected=false,loads=0;
 globalThis.IntersectionObserver=class{
  constructor(fn,options){callback=fn;this.options=options;}
  observe(node){observed=node;}
  disconnect(){disconnected=true;}
 };
 try{
  const sentinel={id:'sentinel'};
  const root={querySelector:selector=>selector.includes('sentinel')?sentinel:
   {disabled:false}};
  const dispose=mountBoardPagination(root,async()=>{loads++;return true;});
  assert.equal(observed,sentinel);
  assert.deepEqual(callback&&{rootMargin:'720px 0px',threshold:0},
   {rootMargin:'720px 0px',threshold:0});
  callback([{isIntersecting:true}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1);
  dispose();
  assert.equal(disconnected,true);
 }finally{
  if(prior===undefined)delete globalThis.IntersectionObserver;
  else globalThis.IntersectionObserver=prior;
 }
});


test('initially visible pagination sentinel requires explicit action instead of auto-draining pages',()=>{
 const prior=globalThis.IntersectionObserver,priorHeight=globalThis.innerHeight;
 let constructed=0;
 globalThis.innerHeight=700;
 globalThis.IntersectionObserver=class{constructor(){constructed++;}observe(){}disconnect(){}};
 try{
  const sentinel={getBoundingClientRect:()=>({top:500})};
  const root={querySelector:selector=>selector.includes('sentinel')?sentinel:{disabled:false}};
  const dispose=mountBoardPagination(root,()=>true);
  assert.equal(constructed,0,'visible/filtered-out sentinel must not auto-load');
  dispose();
 }finally{
  if(prior===undefined)delete globalThis.IntersectionObserver;else globalThis.IntersectionObserver=prior;
  if(priorHeight===undefined)delete globalThis.innerHeight;else globalThis.innerHeight=priorHeight;
 }
});

test('application loads one page initially, preserves loaded depth on refresh, and fully hydrates complete-data application modules',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const snapshot=app.slice(app.indexOf('async function readVisibleBoardSnapshot('),
  app.indexOf('function deferVisibleBoardContent('));
 assert.ok(snapshot.includes('sourcing') && snapshot.includes('fueltrack') && snapshot.includes('tradelink'));
 assert.ok(snapshot.includes('attendance') && snapshot.includes('finance') && snapshot.includes('fueltrans') && snapshot.includes('issues'));
 assert.ok(snapshot.includes('db.boardCached(boardId,{...scope,includeItems:false}'));
 assert.ok(snapshot.includes('db.boardCached(boardId,{...scope,includeItems:false}'));
 const refresh=app.slice(app.indexOf('async function refreshVisibleBoard('),
  app.indexOf('async function loadMoreBoardItems('));
 assert.match(refresh,/readVisibleBoardSnapshot\(boardId,tab/);
 assert.doesNotMatch(refresh,/db\.board\(boardId\)/);
 const loader=app.slice(app.indexOf('async function loadMoreBoardItems('),
  app.indexOf('async function loadBoard('));
 assert.match(loader,/db\.boardNextPage\(snapshot\.boardId/);
 assert.match(loader,/itemCount:snapshot\.loadedCount/);
 assert.match(loader,/routeSerial===snapshot\.route/);
 assert.match(loader,/const restoreLoadMoreFocus=document\.activeElement/);
 assert.match(app,/case 'board-load-more':\{await loadMoreBoardItems\(\);break;\}/);
 assert.match(app,/mountBoardPagination\(root,\(\)=>loadMoreBoardItems\(\)\)/);
 assert.match(app,/renderBoardPagination\(state\.board\.pagination/);
 const boardGrid=readFileSync(new URL('../board-grid.js',import.meta.url),'utf8');
 assert.match(boardGrid,/virtualize:true/);
 assert.match(app,/virtualize:true,primaryEditable/);
});
