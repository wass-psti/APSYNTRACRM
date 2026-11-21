import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createOtpRequestControl} from '../ws02d-otp-request-control.js';
const html=readFileSync(new URL('../ws02d-staging-signin.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
const executableScript=script?.replace(/^import \{createOtpRequestControl\} from ['"]\.\/ws02d-otp-request-control\.js['"];?\s*/m,'');
function createStorage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}
test('staging sign-in is an isolated HTML entry point with no production credentials or auth calls',()=>{
 assert.ok(script); assert.match(html,/<meta name="referrer" content="no-referrer"/);
 assert.match(script,/https:\/\/jeqwjlxubntsddeauvqa\.supabase\.co/);
 assert.doesNotMatch(script,/jtlusodorfnyzgyuewkz|service_role|sb_secret_|sessionStorage|indexedDB|document\.cookie|console\.log|window\.location/);
 assert.match(script,/createOtpRequestControl/);
 assert.match(script,/recordRateLimit/);
 assert.match(script,/email_confirmed_at/);assert.match(script,/is_anonymous===true/);
 assert.match(script,/a\.id===b\.id/);
 assert.match(script,/type:'email'/);
});
test('two-account sign-in uses GoTrue password or email OTP, never admin identity mutation',()=>{
 assert.match(script,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(script,/\/auth\/v1\/otp/);
 assert.match(script,/\/auth\/v1\/verify/);
 assert.match(script,/\/auth\/v1\/user/);
 assert.doesNotMatch(script,/\/auth\/v1\/admin|updateUserById|email_confirmed_at\s*=|INSERT INTO auth/);
 assert.match(script,/field\.value=''/);
});
test('invitation controls remain user-initiated and validate isolated workspace and inbox token',()=>{
 assert.match(script,/crypto\.randomUUID\(\)/);
 assert.match(script,/INVITE_TOKEN\.test\(token\)/);
 assert.match(script,/UUID\.test\(id\)/);
 assert.match(script,/ws02d-\x27\+route/);
 assert.match(script,/async function readiness\(\)/);
 assert.match(script,/operation:'readiness'/);
 assert.match(script,/new URLSearchParams\(location\.search\)\.get\('workspaceId'\)/);
 assert.match(script,/const inviter=await identity\('inviter'\)/);
 assert.match(script,/await identity\('recipient'\)/);
 assert.doesNotMatch(script,/const \{recipient\}=await pair\(\)/);
 assert.match(script,/if\(!slots\.inviter\?\.access_token\)/);
 assert.match(script,/if\(!await readiness\(\)\)return/);
 assert.match(script,/item\.id===invitationId&&item\.state==='accepted'/);
 assert.match(script,/item\.deliveryState==='submitted'/);
 assert.match(script,/manager\.delivery/);
 assert.match(html,/Read invitation statuses/);
 assert.match(script,/const manager=await edge\('manage'/);
 for(const id of ['pair','readiness','send','list','accept']) assert.match(script,new RegExp('\\$\\(\\x27'+id+'\\x27\\)\\.addEventListener'));
});
test('staging script parses as JavaScript in an ES module',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});test('OTP request is staging-scoped, does not register users, and names the exact staging redirect',async()=>{
 const buttons=new Map(),elements=new Map(),calls=[];
 const make=(id,value='')=>{const x={value,textContent:'',disabled:false,addEventListener(){}};elements.set(id,x);return x};
 make('inviter-email','lmsenagan@watchdogautomation.com.ph');make('recipient-email','jspagsuguiron@watchdogautomation.com.ph');
 make('inviter-status');make('recipient-status');make('workspace');
 const document={
  getElementById:id=>elements.get(id)??make(id),
  querySelectorAll:selector=>['inviter','recipient'].map(which=>({
   dataset:{[selector.slice(6,-1)]:which},textContent:selector==='[data-otp]'?'Request numeric email code':'',disabled:false,
   addEventListener:(_name,callback)=>buttons.set(selector+'-'+which,callback)
  }))
 };
 const workspaceId='6a051705-e141-44d2-bb87-cf8a124ab17e';
 const wrapper={document,location:{search:'?workspaceId='+workspaceId},URLSearchParams,fetch:async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:200,json:async()=>({})};
 },encodeURIComponent,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'}};
 runInNewContext(executableScript,{...wrapper,createOtpRequestControl,localStorage:createStorage(),setTimeout:()=>1});
 assert.equal(elements.get('workspace').value,workspaceId);
 await buttons.get('[data-otp]-inviter')();
 assert.equal(calls.length,1);
 const target=calls[0];
 assert.equal(target.url,'https://jeqwjlxubntsddeauvqa.supabase.co/auth/v1/otp?redirect_to='+encodeURIComponent('https://wass-psti.github.io/APSYNTRACRM/frontend/ws02d-staging-signin.html'));
 assert.deepEqual(JSON.parse(target.options.body),{email:'lmsenagan@watchdogautomation.com.ph',create_user:false});
 assert.match(elements.get('inviter-status').textContent,/Magic Link email template/);
 assert.equal(elements.get('inviter-status').textContent.includes('cooldown'),true);
 await buttons.get('[data-otp]-recipient')();
 assert.equal(calls.length,1,'the shared cooldown prevents a second account from sending immediately');
});
test('HTTP 429 applies persistent cooldown to both account OTP buttons and never retries automatically',async()=>{
 const handlers=new Map(),elements=new Map(),calls=[],store=createStorage();
 const make=(id,value='')=>{const x={value,textContent:'',disabled:false,addEventListener(){}};elements.set(id,x);return x};
 make('inviter-email','lmsenagan@watchdogautomation.com.ph');make('recipient-email','jspagsuguiron@watchdogautomation.com.ph');
 make('inviter-status');make('recipient-status');make('workspace');make('result');
 const otpButtons=[];
 const document={getElementById:id=>elements.get(id)??make(id),querySelectorAll:selector=>['inviter','recipient'].map(which=>{
  const button={dataset:{[selector.slice(6,-1)]:which},textContent:'Request numeric email code',disabled:false,
   addEventListener:(_event,fn)=>handlers.set(selector+'-'+which,fn)};
  if(selector==='[data-otp]')otpButtons.push(button);
  return button;
 })};
 const fetch=async(url)=>{calls.push(url);return {ok:false,status:429,headers:{get:()=>null},json:async()=>({message:'email rate limit exceeded'})}};
 runInNewContext(executableScript,{document,location:{search:''},URLSearchParams,fetch,encodeURIComponent,
 createOtpRequestControl,localStorage:store,setTimeout:()=>1,crypto:{randomUUID:()=>''}});
 await handlers.get('[data-otp]-inviter')();
 assert.equal(calls.length,1);
 assert.match(elements.get('inviter-status').textContent,/Provider email rate limit reached/);
 assert.match(elements.get('inviter-status').textContent,/No automatic retry/);
 assert.match(elements.get('result').textContent,/both staging accounts/);
 assert.equal(otpButtons.every(button=>button.disabled),true);
 const persisted=[...store.values.values()].join(' ');
 assert.match(persisted,/notBefore/);
 await handlers.get('[data-otp]-recipient')();
 assert.equal(calls.length,1,'the recipient button is blocked by the shared provider cooldown');
});

test('numeric verification uses email OTP and rejects malformed codes before network calls',async()=>{
 const handlers=new Map(),elements=new Map(),calls=[];
 const input=(id,value='')=>{const x={value,textContent:'',addEventListener(){}};elements.set(id,x);return x};
 input('inviter-email','lmsenagan@watchdogautomation.com.ph');
 input('recipient-email','jspagsuguiron@watchdogautomation.com.ph');
 input('inviter-code','not-a-code');input('recipient-code','');
 input('inviter-status');input('recipient-status');
 const document={getElementById:id=>elements.get(id)??input(id),
 querySelectorAll:selector=>['inviter','recipient'].map(which=>({dataset:{[selector.slice(6,-1)]:which},textContent:'Request numeric email code',disabled:false,
 addEventListener:(_event,fn)=>handlers.set(selector+'-'+which,fn)}))};
 runInNewContext(executableScript,{document,location:{search:''},URLSearchParams,fetch:async(url,opts)=>{calls.push({url,opts});return {ok:false,status:403,json:async()=>({message:'invalid code'})}},encodeURIComponent,crypto:{randomUUID:()=>''},createOtpRequestControl,localStorage:createStorage(),setTimeout:()=>1});
 await handlers.get('[data-verify]-inviter')();
 assert.equal(calls.length,0);
 assert.equal(elements.get('inviter-code').value,'');
 elements.get('inviter-code').value='123456';
 await handlers.get('[data-verify]-inviter')();
 assert.equal(calls.length,0,'six-digit values must not be submitted for staging configured with eight-digit OTP');
 elements.get('inviter-code').value='12345678';
 await handlers.get('[data-verify]-inviter')();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://jeqwjlxubntsddeauvqa.supabase.co/auth/v1/verify');
 assert.deepEqual(JSON.parse(calls[0].opts.body),{email:'lmsenagan@watchdogautomation.com.ph',token:'12345678',type:'email'});
 assert.match(elements.get('inviter-status').textContent,/Invalid, expired, or already-used email code/);
});

function independentDeviceFixture(which){
 const handlers=new Map(),elements=new Map(),calls=[];
 const make=(id,value='')=>{
  const e={value,textContent:'',disabled:false,addEventListener(event,fn){handlers.set(id+':'+event,fn)}};
  elements.set(id,e);return e;
 };
 for(const key of ['inviter','recipient']){
  make(key+'-email',key==='inviter'?'lmsenagan@watchdogautomation.com.ph':'jspagsuguiron@watchdogautomation.com.ph');
  make(key+'-password',key===which?'local-test-only':'');
  make(key+'-code');make(key+'-status');
 }
 make('result');make('workspace');make('invitation-token');
 const document={getElementById:id=>elements.get(id)??make(id),querySelectorAll:selector=>{
  const attr=selector.match(/^\[data-(otp|login|verify)\]$/)?.[1];
  if(!attr)return [];
  return ['inviter','recipient'].map(key=>({dataset:{[attr]:key},textContent:'Request numeric email code',disabled:false,
   addEventListener(event,fn){handlers.set(attr+':'+key+':'+event,fn)}}));
 }};
 const workspaceId='6a051705-e141-44d2-bb87-cf8a124ab17e';
 const invitationId='00000000-0000-4000-8000-000000000011';
 const userId=which==='inviter'?'00000000-0000-4000-8000-000000000021':'00000000-0000-4000-8000-000000000022';
 const fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null;
  calls.push({url,body,authorization:!!options.headers?.authorization});
  let payload={};
  if(url.includes('/auth/v1/token?'))payload={access_token:'t'.repeat(100)};
  else if(url.endsWith('/auth/v1/user'))payload={id:userId,email:elements.get(which+'-email').value,email_confirmed_at:'2026-11-21T00:00:00Z',is_anonymous:false};
  else if(url.endsWith('/functions/v1/ws02d-manage')&&body.operation==='readiness')
   payload={schemaVersion:1,authorized:true,ready:true,reason:'ready',workspaceId};
  else if(url.endsWith('/functions/v1/ws02d-invite'))payload={state:'delivery-submitted',invitationId};
  else if(url.endsWith('/functions/v1/ws02d-manage')&&body.operation==='list')
   payload={authorized:true,workspaceId,invitations:[{id:invitationId,state:'pending'}],delivery:[{invitationId,deliveryState:'submitted'}]};
  else if(url.endsWith('/functions/v1/ws02d-accept'))payload={state:'accepted',role:'member',switched:false,workspaceId};
  else throw Error('Unexpected endpoint: '+url);
  return {ok:true,status:200,json:async()=>payload};
 };
 runInNewContext(executableScript,{document,location:{search:'?workspaceId='+workspaceId},URLSearchParams,fetch,
  encodeURIComponent,createOtpRequestControl,localStorage:createStorage(),setTimeout:()=>1,
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000033'}});
 return {handlers,elements,calls,workspaceId,invitationId};
}

test('inviter-only tab can check signed readiness and issue one invitation without a recipient session',async()=>{
 const f=independentDeviceFixture('inviter');
 await f.handlers.get('login:inviter:click')();
 assert.match(f.elements.get('inviter-status').textContent,/Authenticated/);
 assert.equal(f.elements.get('recipient-status').textContent,'');
 await f.handlers.get('send:click')();
 assert.match(f.elements.get('result').textContent,/pending invitation and submitted delivery ledger/);
 const requests=f.calls.filter(c=>c.url.includes('/functions/v1/'));
 assert.deepEqual(requests.map(c=>c.url.split('/').at(-1)),['ws02d-manage','ws02d-invite','ws02d-manage']);
 assert.ok(requests.every(c=>c.authorization));
 const issued=requests[1].body;
 assert.equal(issued.email,'jspagsuguiron@watchdogautomation.com.ph');
 assert.equal(issued.workspaceId,f.workspaceId);
 assert.equal(issued.role,'member');
});

test('recipient-only tab accepts independently without needing inviter session or privileged manager read',async()=>{
 const f=independentDeviceFixture('recipient');
 await f.handlers.get('login:recipient:click')();
 assert.match(f.elements.get('recipient-status').textContent,/Authenticated/);
 f.elements.get('invitation-token').value=f.invitationId+'.'+'a'.repeat(64);
 await f.handlers.get('accept:click')();
 assert.equal(f.elements.get('invitation-token').value,'');
 assert.match(f.elements.get('result').textContent,/Recipient signed acceptance receipt confirmed/);
 assert.match(f.elements.get('result').textContent,/not yet independently verified/);
 const endpoints=f.calls.filter(c=>c.url.includes('/functions/v1/'));
 assert.equal(endpoints.length,1);
 assert.ok(endpoints[0].url.endsWith('/ws02d-accept'));
 assert.equal(endpoints[0].authorization,true);
});
