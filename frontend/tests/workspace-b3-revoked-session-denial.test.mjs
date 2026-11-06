import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthClient} from '../session.js';
import {
 runWs02dB3LocalSessionRevocation,
 sanitizeWs02dB3LocalRevocationReport,
 renderWs02dB3LocalRevocation
} from '../workspace-b3-revoked-session-denial.js';
import {SUPABASE_PUBLISHABLE_KEY} from '../config.js';

const payload=exp=>Buffer.from(JSON.stringify({exp,sub:'11111111-1111-4111-8111-111111111111'})).toString('base64url');
const token=exp=>'eyJhbGciOiJIUzI1NiJ9.'+payload(exp)+'.validlookingbutnotsigned_testonly';
const now=1700000000000,good=token(Math.floor((now+3600000)/1000));
function setup({post=401,ack=true,pre='PASS',t=good}={}){
 let loggedOut=0,sent=0,read=0;
 const auth={accessToken:t,token:async()=>t,
  signOut:async({scope})=>{
   assert.equal(scope,'local');
   loggedOut++;
   auth.accessToken=null;
   return ack;
  }
 };
 const readRunner=async({auth:source,origin})=>{
  read++;
  assert.equal(source,auth);
  assert.equal(origin,'https://wass-psti.github.io');
  return {status:pre,genuineDeployedReadVerified:pre==='PASS'};
 };
 const fetchImpl=async(url,request)=>{
  sent++;
  assert.equal(url,'https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read');
  assert.equal(request.method,'GET');
  assert.equal(request.headers.Authorization,'Bearer '+t);
  assert.equal(request.headers.apikey,SUPABASE_PUBLISHABLE_KEY);
  assert.equal(request.cache,'no-store');
  if(post===null)throw Error('Never expose request or token');
  return {status:post};
 };
 return {auth,readRunner,fetchImpl,origin:'https://wass-psti.github.io',
  clock:()=>now,counts:()=>({loggedOut,sent,read})};
}

test('genuine previously accepted old JWT denied 401 after acknowledged local logout => scoped PASS',async()=>{
 const x=setup();
 const result=await runWs02dB3LocalSessionRevocation(x);
 assert.equal(result.status,'PASS');
 assert.equal(result.stage,'revoked-session-denied');
 assert.equal(result.revokedSessionDenialVerified,true);
 assert.equal(result.localSignoutAcknowledged,true);
 assert.equal(result.logoutScope,'local');
 assert.deepEqual(x.counts(),{loggedOut:1,sent:1,read:1});
 assert.doesNotMatch(sanitizeWs02dB3LocalRevocationReport(result),/validlookingbutnotsigned|11111111|sb_publishable_/);
});

test('still accepted old JWT is genuine security FAIL and not a false PASS',async()=>{
 const x=setup({post:200});
 const r=await runWs02dB3LocalSessionRevocation(x);
 assert.equal(r.status,'FAIL');
 assert.equal(r.stage,'revoked-jwt-still-accepted');
 assert.equal(r.revokedSessionDenialVerified,false);
 assert.equal(x.counts().loggedOut,1);
});

test('logout acknowledgment absent, prior read not PASS, other HTTP or network are INCONCLUSIVE',async()=>{
 for(const options of [{ack:false},{pre:'BLOCKED'},{post:403},{post:null}]){
  const x=setup(options);
  const r=await runWs02dB3LocalSessionRevocation(x);
  assert.equal(r.status,'INCONCLUSIVE');
  assert.equal(r.revokedSessionDenialVerified,false);
  assert.equal(x.counts().loggedOut,1);
 }
});

test('old JWT too close to expiry never certifies revocation even on observed 401',async()=>{
 const x=setup({t:token(Math.floor((now+12000)/1000))});
 const r=await runWs02dB3LocalSessionRevocation(x);
 assert.equal(r.stage,'token-too-close-to-expiration');
 assert.equal(r.status,'INCONCLUSIVE');
 assert.deepEqual(x.counts(),{loggedOut:1,sent:0,read:0});
});

test('wrong origin does not trigger logout or token requests',async()=>{
 const x=setup();
 const r=await runWs02dB3LocalSessionRevocation({...x,origin:'https://foreign.invalid'});
 assert.equal(r.status,'BLOCKED');
 assert.deepEqual(x.counts(),{loggedOut:0,sent:0,read:0});
});

test('existing AuthClient keeps global logout default, but explicit local uses current-session scope',async()=>{
 const calls=[];
 const client=new AuthClient({
  fetchImpl:async(url,options)=>{
   calls.push({url,method:options.method});
   return new Response(null,{status:204});
  },
  storage:{setItem(){},removeItem(){}},
  clock:()=>now
 });
 const save=()=>client.save({access_token:good,refresh_token:'synthetic_refresh_token',
  user:{id:'11111111-1111-4111-8111-111111111111'},expires_in:3600});
 save();assert.equal(await client.signOut({scope:'local'}),true);
 assert.ok(calls[0].url.endsWith('/auth/v1/logout?scope=local'));
 save();assert.equal(await client.signOut(),true);
 assert.ok(calls[1].url.endsWith('/auth/v1/logout'));
 assert.equal(calls[1].url.includes('?scope='),false);
 await assert.rejects(client.signOut({scope:'others'}),/Unsupported sign-out scope/);
});

test('sanitizer rejects forged PASS, UI requires explicit confirmation and labels local scope',()=>{
 const forged=JSON.parse(sanitizeWs02dB3LocalRevocationReport({
  status:'PASS',stage:'revoked-session-denied',
  revokedSessionDenialVerified:true,localSignoutAcknowledged:false,
  priorGenuineSignedReadVerified:true,secret:good
 }));
 assert.equal(forged.status,'BLOCKED');
 assert.equal(forged.revokedSessionDenialVerified,false);
 assert.doesNotMatch(JSON.stringify(forged),/synthetic_refresh_token|validlookingbutnotsigned/);
 const unarmed=renderWs02dB3LocalRevocation({});
 const armed=renderWs02dB3LocalRevocation({armed:true});
 assert.match(unarmed,/Prepare current-session revocation test/);
 assert.doesNotMatch(unarmed,/data-action="security-ws02d-b3-revoke-run"/);
 assert.match(armed,/data-action="security-ws02d-b3-revoke-run"/);
 assert.match(armed,/scope=local/);
});
