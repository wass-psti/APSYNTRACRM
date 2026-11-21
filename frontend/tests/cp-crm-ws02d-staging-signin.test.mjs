import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../ws02d-staging-signin.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
test('staging sign-in is an isolated HTML entry point with no production credentials or auth calls',()=>{
 assert.ok(script); assert.match(html,/<meta name="referrer" content="no-referrer"/);
 assert.match(script,/https:\/\/jeqwjlxubntsddeauvqa\.supabase\.co/);
 assert.doesNotMatch(script,/jtlusodorfnyzgyuewkz|service_role|sb_secret_|localStorage|sessionStorage|indexedDB|document\.cookie|console\.log|window\.location/);
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
 assert.match(script,/const \{recipient\}=await pair\(\)/);
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
 const make=(id,value='')=>{const x={value,textContent:'',addEventListener(){}};elements.set(id,x);return x};
 make('inviter-email','lmsenagan@watchdogautomation.com.ph');make('recipient-email','jspagsuguiron@watchdogautomation.com.ph');
 make('inviter-status');make('recipient-status');make('workspace');
 const document={
  getElementById:id=>elements.get(id)??make(id),
  querySelectorAll:selector=>['inviter','recipient'].map(which=>({
   dataset:{[selector.slice(6,-1)]:which},
   addEventListener:(_name,callback)=>buttons.set(selector+'-'+which,callback)
  }))
 };
 const workspaceId='6a051705-e141-44d2-bb87-cf8a124ab17e';
 const wrapper={document,location:{search:'?workspaceId='+workspaceId},URLSearchParams,fetch:async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:200,json:async()=>({})};
 },encodeURIComponent,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'}};
 runInNewContext(script,wrapper);
 assert.equal(elements.get('workspace').value,workspaceId);
 await buttons.get('[data-otp]-inviter')();
 assert.equal(calls.length,1);
 const target=calls[0];
 assert.equal(target.url,'https://jeqwjlxubntsddeauvqa.supabase.co/auth/v1/otp?redirect_to='+encodeURIComponent('https://wass-psti.github.io/APSYNTRACRM/frontend/ws02d-staging-signin.html'));
 assert.deepEqual(JSON.parse(target.options.body),{email:'lmsenagan@watchdogautomation.com.ph',create_user:false});
 assert.match(elements.get('inviter-status').textContent,/Magic Link email template/);
});
test('numeric verification uses email OTP and rejects malformed codes before network calls',async()=>{
 const handlers=new Map(),elements=new Map(),calls=[];
 const input=(id,value='')=>{const x={value,textContent:'',addEventListener(){}};elements.set(id,x);return x};
 input('inviter-email','lmsenagan@watchdogautomation.com.ph');
 input('recipient-email','jspagsuguiron@watchdogautomation.com.ph');
 input('inviter-code','not-a-code');input('recipient-code','');
 input('inviter-status');input('recipient-status');
 const document={getElementById:id=>elements.get(id)??input(id),
 querySelectorAll:selector=>['inviter','recipient'].map(which=>({dataset:{[selector.slice(6,-1)]:which},
 addEventListener:(_event,fn)=>handlers.set(selector+'-'+which,fn)}))};
 runInNewContext(script,{document,location:{search:''},URLSearchParams,fetch:async(url,opts)=>{calls.push({url,opts});return {ok:false,status:403,json:async()=>({message:'invalid code'})}},encodeURIComponent,crypto:{randomUUID:()=>''}});
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
