import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {AuthClient,ApiError,STORE_KEY} from '../session.js';

const UID='11111111-1111-4111-8111-111111111111';
const access={access_token:'synthetic.jwt',refresh_token:'synthetic.refresh',
 expires_at:Date.now()+1800000,user:{id:UID}};
const memory=()=>{
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k),has:k=>map.has(k)};
};
const response=(status,data)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json'}
});
function guardFixture(){
 const timers=new Map(),listeners=new Map(),elements=[];
 let id=0,reloads=0;
 const label={textContent:'Preparing frontend…'};
 const content={children:[],append(node){this.children.push(node)}};
 const overlay={dataset:{phase:'startup'},attrs:{},removeAttribute(k){delete this.attrs[k]},
  setAttribute(k,v){this.attrs[k]=v},
  querySelector(q){return q==='#apsyntra-init-phase'?label:
   q==='.aps-init-content'?content:null}};
 const document={
  getElementById:id=>id==='apsyntra-init'?overlay:null,
  createElement:tag=>{
   const el={tag,attrs:{},children:[],textContent:'',focused:false,
    setAttribute(k,v){this.attrs[k]=v},
    addEventListener(k,fn){this['on'+k]=fn},
    append(...nodes){this.children.push(...nodes)},
    focus(){this.focused=true}};
   elements.push(el);return el;
  }
 };
 const window={location:{reload(){reloads++}},
  addEventListener(event,fn){listeners.set(event,fn)}};
 const context={window,document,setTimeout(fn,ms){const n=++id;timers.set(n,{fn,ms});return n},
  clearTimeout(n){timers.delete(n)}};
 vm.runInNewContext(readFileSync('frontend/startup-guard.js','utf8'),context,{
  filename:'startup-guard.js'});
 const fire=(time)=>{for(const [n,entry] of [...timers])
  if(entry.ms===time){timers.delete(n);entry.fn();}};
 return {window,document,overlay,label,content,timers,elements,listeners,fire,
  get reloads(){return reloads}};
}
test('no module execution: entry deadline exposes actionable fatal state, no infinite overlay',()=>{
 const g=guardFixture();
 assert.equal(g.window.__APSYNTRA_STARTUP.state,'INITIALIZING');
 assert.equal(g.timers.size,1);
 g.fire(12000);
 assert.equal(g.window.__APSYNTRA_STARTUP.state,'FATAL_ERROR');
 assert.equal(g.label.textContent,'Startup could not finish');
 assert.equal(g.overlay.dataset.phase,'fatal');
 const panel=g.content.children[0];
 assert.equal(panel.attrs.role,'alert');
 const button=panel.children[2];
 assert.equal(button.textContent,'Retry loading application');
 assert.equal(button.focused,true);
 button.onclick();
 assert.equal(g.reloads,1);
 assert.equal(g.timers.size,0);
});
test('module import failure reports immediately without exposing errors or auth tokens',()=>{
 const g=guardFixture();
 g.listeners.get('error')({message:'bad/module.js?access_token=private'});
 assert.equal(g.window.__APSYNTRA_STARTUP.state,'FATAL_ERROR');
 const text=g.content.children[0].children.map(c=>c.textContent).join(' ');
 assert.doesNotMatch(text,/bad\/module|access_token=private/);
 assert.match(text,/existing account session has not been cleared/);
});
test('authenticated/unauthenticated state completion clears watchdog, and errors remain recoverable',()=>{
 const g=guardFixture(),guard=g.window.__APSYNTRA_STARTUP;
 assert.equal(guard.begin(),true);
 assert.equal(guard.begin(),false);
 assert.equal(g.timers.size,1);
 assert.equal(guard.resolve('AUTHENTICATED'),true);
 assert.equal(guard.state,'AUTHENTICATED');
 assert.equal(g.timers.size,0);
 g.listeners.get('unhandledrejection')();
 assert.equal(guard.state,'AUTHENTICATED');
 assert.equal(guard.begin(),false); // no duplicate settled-start transaction
 const other=guardFixture(),next=other.window.__APSYNTRA_STARTUP;
 next.begin();
 assert.equal(next.resolve('RECOVERABLE_ERROR'),true);
 assert.equal(next.begin(),true);
 assert.equal(next.state,'INITIALIZING');
 assert.equal(next.resolve('UNAUTHENTICATED'),true);
 assert.equal(next.state,'UNAUTHENTICATED');
 assert.equal(other.timers.size,0);
});
test('persistent session on transient network failure supports same-page retry without refresh or signout',async()=>{
 const storage=memory();storage.setItem(STORE_KEY,JSON.stringify(access));
 let online=false,calls=0;
 const auth=new AuthClient({storage,fetchImpl:async u=>{
  calls++;
  if(!online)throw Error('network interrupted');
  assert.match(u,/auth\/v1\/user/);
  return response(200,{id:UID});
 }});
 await assert.rejects(()=>auth.restore(),err=>
  err instanceof ApiError&&err.code==='NETWORK_UNAVAILABLE');
 assert.equal(auth.isSignedIn,true);
 assert.equal(storage.has(STORE_KEY),true);
 online=true;
 assert.equal(await auth.restore(),true);
 assert.equal(auth.userId,UID);
 assert.equal(calls,2);
});
test('500 and 429 from provider preserve saved signed session until verification',async()=>{
 for(const status of [429,500,503]){
  const storage=memory();storage.setItem(STORE_KEY,JSON.stringify(access));
  const auth=new AuthClient({storage,fetchImpl:async()=>response(status,{message:'provider unavailable'})});
  await assert.rejects(()=>auth.restore(),e=>e.status===status);
  assert.equal(auth.isSignedIn,true);
  assert.equal(storage.has(STORE_KEY),true);
 }
});
test('revoked auth, identity mismatch and malformed saved session fail closed',async()=>{
 const storage=memory();storage.setItem(STORE_KEY,JSON.stringify(access));
 const auth=new AuthClient({storage,fetchImpl:async()=>response(401,{message:'invalid token'})});
 assert.equal(await auth.restore(),false);
 assert.equal(auth.isSignedIn,false);
 assert.equal(storage.has(STORE_KEY),false);
 storage.setItem(STORE_KEY,JSON.stringify(access));
 const swapped=new AuthClient({storage,fetchImpl:async()=>response(200,{id:'22222222-2222-4222-8222-222222222222'})});
 assert.equal(await swapped.restore(),false);
 assert.equal(storage.has(STORE_KEY),false);
 storage.setItem(STORE_KEY,'{truncated');
 assert.equal(await swapped.restore(),false);
 assert.equal(storage.has(STORE_KEY),false);
});
test('hung fetches and hung JSON bodies obey bounded deadline and abort without clearing session',async()=>{
 for(const mode of ['fetch','json']){
  const storage=memory();storage.setItem(STORE_KEY,JSON.stringify(access));
  let signal;
  const auth=new AuthClient({storage,requestTimeoutMs:25,fetchImpl:async(_url,init)=>{
   signal=init.signal;
   if(mode==='fetch')return new Promise(()=>{});
   return {ok:true,status:200,json:async()=>new Promise(()=>{})};
  }});
  const started=Date.now();
  await assert.rejects(()=>auth.restore(),e=>e.code==='REQUEST_TIMEOUT');
  assert.ok(Date.now()-started<2000);
  assert.equal(signal.aborted,true);
  assert.equal(auth.isSignedIn,true);
  assert.equal(storage.has(STORE_KEY),true);
 }
});
test('startup code preserves signed backend RBAC and provides same-page recovery path',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const index=readFileSync('index.html','utf8');
 assert.ok(index.indexOf('frontend/startup-guard.js')<
  index.indexOf('type="module" src="./frontend/app.js"'));
 assert.match(app,/case 'retry-startup'/);
 assert.match(app,/await boot\(\);/);
 assert.match(app,/if\(startupBusy\)return;/);
 assert.match(app,/await auth\.restore\(\)/);
 assert.match(app,/await refreshWorkspace\(\)/);
 assert.match(app,/await onRoute\(\)/);
 assert.match(app,/state\.context\?\.user_id!==auth\.userId/);
 assert.match(app,/window\.__APSYNTRA_STARTUP\?\.resolve\(outcome\)/);
 assert.match(app,/renderBootstrapFailure\(err\)/);
 assert.doesNotMatch(app,/catch\(err\)\{await auth\.signOut\(\);state\.context=null;renderLogin/);
 const core=readFileSync('frontend/initialization-core.js','utf8');
 assert.doesNotMatch(core,/await import\('.*auth|fetch\(/);
});
