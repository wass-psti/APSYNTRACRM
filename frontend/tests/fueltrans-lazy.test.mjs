import test from 'node:test';
import assert from 'node:assert/strict';
import {createLazyFuelTransSync} from '../fueltrans-lazy.js';
import {readFileSync} from 'node:fs';
const deferred=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const container=()=>({isConnected:true,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v}});
test('does not load optional FuelTrans feature for default routes, logout or signed startup',async()=>{
 let loads=0;const actions=[];
 const sync=createLazyFuelTransSync({load:()=>{loads++;return Promise.resolve({syncFuelTrans:x=>actions.push(x)})}});
 sync({container:null});sync({container:null});await flush();
 assert.equal(loads,0);assert.deepEqual(actions,[]);
});
test('first feature visit imports once, retains options, and closes synchronously thereafter',async()=>{
 let loads=0;const received=[];const holder=container();
 const sync=createLazyFuelTransSync({load:()=>{loads++;return Promise.resolve({syncFuelTrans:opts=>received.push(opts)})}});
 const options={container:holder,workspaceId:'synthetic',boardId:'synthetic',auth:{},api:{}};
 sync(options);await flush();assert.equal(loads,1);assert.deepEqual(received,[options]);
 sync({container:null});assert.equal(received.at(-1).container,null);
 sync(options);assert.equal(loads,1);assert.equal(received.at(-1),options);
});
test('stale workspace/board/route cannot mount after a pending import',async()=>{
 const promise=deferred();let loads=0;const calls=[];
 const sync=createLazyFuelTransSync({load:()=>{loads++;return promise.promise}});
 const first=container(),next=container();
 sync({container:first,workspaceId:'workspace-a'});
 sync({container:null});
 sync({container:next,workspaceId:'workspace-b'});
 await flush();assert.equal(loads,1);
 promise.resolve({syncFuelTrans:opts=>calls.push(opts)});await flush();
 assert.equal(calls.length,1);assert.equal(calls[0].workspaceId,'workspace-b');
 sync({container:null});assert.equal(calls.at(-1).container,null);
});
test('disconnected container and rejected imports do not resurrect stale content',async()=>{
 const wait=deferred(),calls=[];const holder=container();
 const sync=createLazyFuelTransSync({load:()=>wait.promise});
 sync({container:holder});holder.isConnected=false;
 await flush();wait.resolve({syncFuelTrans:opts=>calls.push(opts)});await flush();
 assert.deepEqual(calls,[]);
 const rejected=deferred(),other=container();
 const syncFailure=createLazyFuelTransSync({load:()=>rejected.promise});
 syncFailure({container:other});await flush();rejected.reject(Error('private URL and credential'));
 await flush();assert.equal(other.attrs.role,'alert');
 assert.equal(other.textContent,'FuelTrans could not load. Reload the page to retry.');
 assert.doesNotMatch(other.textContent,/credential|private URL/);
});
test('source integrates feature-only dynamic imports and preserves signed access checks',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/import \{syncFuelTrans\} from '\.\/fueltrans-lazy\.js'/);
 assert.doesNotMatch(app,/from '\.\/fueltrans-native\.js'/);
 assert.doesNotMatch(app,/from '\.\/board-import-ui\.js'/);
 assert.doesNotMatch(app,/from '\.\/board-operational-qa\.js'/);
 assert.match(app,/const \{openBoardImportWizard\}=await import\('\.\/board-import-ui\.js'\)/);
 assert.match(app,/const \{runTwelveBoardQa\}=await import\('\.\/board-operational-qa\.js'\)/);
 assert.match(app,/if\(state\.boardId!==selected\|\|!auth\.isSignedIn/);
 assert.match(app,/syncFuelTrans\(\{container:null\}\)/);
});
