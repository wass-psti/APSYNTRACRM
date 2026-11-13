import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardCacheChannel,BOARD_CACHE_CHANNEL} from '../board-cache-channel.js';
import {DomainApi} from '../data.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const scope={userId:user,workspaceId:workspace};
const now=1783670000000;
class FakeChannel {
 static list=[];
 constructor(name){assert.equal(name,BOARD_CACHE_CHANNEL);this.closed=false;FakeChannel.list.push(this);}
 postMessage(value){for(const peer of FakeChannel.list){if(peer!==this&&!peer.closed)peer.onmessage?.({data:value});}}
 close(){this.closed=true;}
}
function create(sender){
 const auth={userId:user,isSignedIn:true,accessToken:'token',authorized:async()=>null};
 const received=[];
 const sync=new BoardCacheChannel({auth,Channel:FakeChannel,sender,clock:()=>now,
  onInvalidate:value=>received.push(value)});
 sync.start(scope);
 return {auth,received,sync};
}
test('cross-tab invalidation sends identifiers only to matching active signed scope',()=>{
 FakeChannel.list=[];
 const a=create('tab-a'),b=create('tab-b');
 assert.equal(a.sync.publish(boardId,'2026-11-09T08:00:00Z'),true);
 assert.equal(b.received.length,1);
 assert.deepEqual(b.received[0],{boardId,revision:'2026-11-09T08:00:00Z',...scope});
 const message=JSON.stringify(b.received[0]);
 assert.doesNotMatch(message,/token|items|groups|content|permission/i);
 a.sync.stop();b.sync.stop();
});
test('foreign workspace, foreign user, stale sequence and malformed events are rejected',()=>{
 FakeChannel.list=[];
 const b=create('tab-b');
 const message={version:1,type:'invalidate',sender:'tab-a',sequence:1,
  ...scope,boardId,revision:null,at:now};
 assert.equal(b.sync.receive({...message,workspaceId:foreign}),false);
 assert.equal(b.sync.receive({...message,userId:other}),false);
 assert.equal(b.sync.receive({...message,boardId:'not-a-uuid'}),false);
 assert.equal(b.sync.receive({...message,at:now-121000}),false);
 assert.equal(b.sync.receive({...message,revision:'not-a-revision'}),false);
 assert.equal(b.sync.receive(message),true);
 assert.equal(b.sync.receive(message),false);
 assert.equal(b.sync.receive({...message,sequence:0}),false);
 assert.equal(b.received.length,1);
 b.auth.userId=other;
 assert.equal(b.sync.receive({...message,sequence:2}),false);
 b.sync.stop();
});
test('workspace change closes prior listener and session expiry prevents messages',()=>{
 FakeChannel.list=[];
 const a=create('tab-a'),b=create('tab-b');
 b.sync.start({...scope,workspaceId:foreign});
 a.sync.publish(boardId);
 assert.equal(b.received.length,0);
 b.sync.start(scope);
 b.auth.isSignedIn=false;
 a.sync.publish(boardId);
 assert.equal(b.received.length,0);
 b.sync.stop();a.sync.stop();
});
test('unsupported BroadcastChannel is a safe no-op',()=>{
 const auth={isSignedIn:true,userId:user};
 const sync=new BoardCacheChannel({auth,Channel:null,sender:'tab-z',clock:()=>now});
 assert.equal(sync.start(scope),true);
 assert.equal(sync.publish(boardId),false);
 sync.stop();
});
test('strictly older authoritative board version hints cannot evict a newer snapshot',async()=>{
 let reads=0;
 const auth={userId:user,accessToken:'token',authorized:async(path)=>{
  if(path.endsWith('/wm_get_board_shell')){
   reads++;return {board:{id:boardId,workspace_id:workspace,updated_at:'2026-11-09T10:00:00Z'},
    groups:[],members:[],columns:[]};
  }
  if(path.endsWith('/wm_get_board_items_page'))
   return {items:[],values:[],has_more:false,next_cursor:null};
  return true;
 }};
 const api=new DomainApi(auth);
 api.extendedRefsSupported=false; // Import references are disabled; shell and item pages remain authoritative.
 await api.boardCached(boardId,scope);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T09:00:00Z'}),false);
 await api.boardCached(boardId,scope);
 assert.equal(reads,1);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T10:00:00Z'}),true);
 await api.boardCached(boardId,scope);
 assert.equal(reads,2);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T10:01:00Z'}),true);
 await api.boardCached(boardId,scope);
 assert.equal(reads,3);
});
test('successful mutating RPC publishes one scoped hint, failed RPC publishes none',async()=>{
 let events=[];
 const auth={userId:user,accessToken:'token',authorized:async(path,options)=>{
  if(path.includes('deny_me'))throw Error('denied');
  if(path.endsWith('wm_list_board_events'))return [];
  return path.endsWith('wm_board_group_cas')?{updated_at:'2026-11-09T10:00:00Z'}:true;
 }};
 const api=new DomainApi(auth);
 api.onBoardMutation=hint=>events.push(hint);
 await api.allowed(boardId,'view');
 await api.boardEvents(boardId);
 await api.rpc('tl03_documents_page',{p_board_id:boardId});
 assert.equal(events.length,0);
 await api.rpc('wm_board_group_cas',{p_board_id:boardId});
 assert.deepEqual(events,[{boardId,revision:null}]);
 await assert.rejects(()=>api.rpc('deny_me',{p_board_id:boardId}));
 assert.equal(events.length,1);
});
test('UI hooks source-cache invalidation into signed reconciliation and lifecycle',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/boardCacheChannel\.start\(\{userId:state\.context\?\.user_id,workspaceId:state\.context\?\.workspace_id\}\)/);
 assert.match(app,/onInvalidate:\(\{boardId,revision,userId,workspaceId\}\)=>\{/);
 assert.match(app,/db\.invalidateBoardCache\(boardId,\{revision\}\)/);
 assert.match(app,/reconcilePlatformSync\(\{boardIds:/);
 assert.match(app,/auth\.onExpired=\(\)=>\{boardCacheChannel\.stop\(\)/);
 assert.doesNotMatch(readFileSync(new URL('../board-cache-channel.js',import.meta.url),'utf8'),/localStorage|sessionStorage|indexedDB/);
});
