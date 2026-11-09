import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardPreferenceStore,PREFERENCE_DB,PREFERENCE_SCHEMA,PREFERENCE_STORE,
 PREFERENCE_TTL_MS,PREFERENCE_ENTRY_LIMIT,PREFERENCE_MAX_BYTES} from '../board-preferences-idb.js';
import {preferenceKey,normalizeLayout,loadBoardLayout,saveBoardLayout,resetBoardLayout} from '../board-presentation.js';
const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
const context={user_id:user,workspace_id:workspace};
const key=preferenceKey(context,board);
const layout=normalizeLayout({tabs:['issues','items'],columns:['record','status','owner'],
 hidden:['owner'],widths:{record:150,status:180,owner:235}},
 ['issues','items'],['record','status','owner']);
test('v1 store accepts only safe, small, scoped normalized board layouts',async()=>{
 const store=new BoardPreferenceStore({idb:null});
 assert.equal(PREFERENCE_DB,'apsyntra-public-ui-preferences');
 assert.equal(PREFERENCE_SCHEMA,1);
 assert.equal(PREFERENCE_STORE,'board-layouts');
 assert.ok(PREFERENCE_TTL_MS>=24*60*60*1000);
 assert.ok(PREFERENCE_ENTRY_LIMIT<=64&&PREFERENCE_MAX_BYTES<=8192);
 assert.equal(saveBoardLayout(context,board,layout,store),true);
 assert.deepEqual(loadBoardLayout(context,board,['issues','items'],
  ['record','status','owner'],store),layout);
 assert.equal(store.getItem(key),JSON.stringify(layout));
 store.setItem(key,JSON.stringify({...layout,token:'synthetic-secret'}));
 // Unrecognized top-level payloads cannot be saved even accidentally.
 assert.ok(!store.getItem(key).includes('synthetic-secret'));
 store.setItem(key,JSON.stringify({rows:[{title:'private'}]}));
 assert.ok(!store.getItem(key).includes('private'));
 store.setItem('user:other-key',JSON.stringify(layout));
 assert.equal(store.getItem('user:other-key'),null);
 assert.equal(resetBoardLayout(context,board,store),true);
 assert.equal(store.getItem(key),null);
});
test('identity scope and absence of authenticated data remain separate',async()=>{
 const store=new BoardPreferenceStore({idb:null});
 saveBoardLayout(context,board,layout,store);
 for(const other of [{...context,user_id:'44444444-4444-4444-8444-444444444444'},
  {...context,workspace_id:'55555555-5555-4555-8555-555555555555'}]){
  assert.equal(await store.hydrate(other,board,{legacyStorage:null}),false);
  assert.deepEqual(loadBoardLayout(other,board,['items','issues'],
   ['record','status','owner'],store).tabs,['items','issues']);
 }
 store.clearMemory();
 assert.equal(store.getItem(key),null);
});
test('legacy preference migration validates strictly and does not persist arbitrary payloads',async()=>{
 const map=new Map([[key,JSON.stringify({...layout,authToken:'never'})]]);
 const local={getItem:k=>map.get(k),removeItem:k=>map.delete(k)};
 const store=new BoardPreferenceStore({idb:null});
 assert.equal(await store.hydrate(context,board,{legacyStorage:local}),false);
 assert.equal(store.getItem(key),null);
 assert.equal(map.has(key),true,'failed migration preserves old layout for rollback');
});
test('existing signed application uses scoped adapter after verified board access',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/const boardPreferences=new BoardPreferenceStore\(\)/);
 assert.match(source,/if\(!view\)throw new ApiError\('Board view access changed\.'/);
 assert.match(source,/await boardPreferences\.hydrate\(state\.context,boardId\)/);
 assert.match(source,/loadBoardLayout\(state\.context,state\.boardId,tabs,columns,boardPreferences\)/);
 assert.match(source,/resetBoardLayout\(state\.context,state\.boardId,boardPreferences\)/);
 assert.match(source,/auth\.onExpired=\(\)=>\{boardCacheChannel\.stop\(\);db\.invalidateBoardCache\(\);boardPreferences\.clearMemory\(\)/);
 const module=readFileSync(new URL('../board-preferences-idb.js',import.meta.url),'utf8');
 assert.doesNotMatch(module,/fetch\(|sessionStorage|localStorage\.setItem|auth\.session|bearer|service_role/);
});

test('blocked IndexedDB operations never make a board wait indefinitely',async()=>{
 const blocked=new BoardPreferenceStore({idb:{open:()=>({})}});
 const started=Date.now();
 assert.equal(await blocked.hydrate(context,board,{legacyStorage:null}),false);
 assert.ok(Date.now()-started<1800,'bound preference hydration independently of the backend');
});
test('preferences reject oversized JSON and malformed cross-workspace cache identifiers',()=>{
 const store=new BoardPreferenceStore({idb:null});
 store.setItem(key,JSON.stringify(layout));
 const first=store.getItem(key);
 store.setItem(key,JSON.stringify({...layout,columns:['x'.repeat(5000)]}));
 assert.equal(store.getItem(key),first);
 store.setItem('apsyntra.board-layout.v1:bad-user:'+workspace+':'+board,first);
 assert.equal(store.getItem('apsyntra.board-layout.v1:bad-user:'+workspace+':'+board),null);
});

test('restricted storage getters do not break board preference hydration',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked')}});
  const store=new BoardPreferenceStore({idb:null});
  assert.equal(await store.hydrate(context,board),false);
 }finally{
  if(original)Object.defineProperty(globalThis,'localStorage',original);
  else delete globalThis.localStorage;
 }
});
