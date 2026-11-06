/**
 * CP-WS-02D/B3: real HTTPS + GoTrue + PostgREST RLS acceptance (isolated).
 * All identities and data are synthetic; NO production API access.
 * Real JWT signature validation occurs in GoTrue and independently
 * in PostgREST. The staged handler also checks live auth.sessions rows.
 */
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createB3TrustedReadStagingFixture}
 from '../server/ws02d-b3-signed-read-staging.mjs';
const PG='gotrue_disposable';
const LOCAL='https://127.0.0.1:9443';
const ORIGINAL='https://jtlusodorfnyzgyuewkz.supabase.co/';
const AUTH='http://127.0.0.1:9999';
const REST='http://127.0.0.1:3000';
const ORIGIN='https://wass-psti.github.io';
const PK='sb_publishable_isolated_test_only_12345';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WA='00000000-0000-4000-8000-000000000001';
const WB='00000000-0000-4000-8000-000000000002';
if(process.env.CI!=='true'||process.env.WS02D_B3_LOCAL_GOTRUE!=='true'||
 process.env.PGDATABASE!==PG||process.env.PGHOST!=='127.0.0.1'||
 process.env.PGUSER!=='postgres'||
 !process.env.WS02D_TLS_CERT||!process.env.WS02D_TLS_KEY||
 !process.env.NODE_EXTRA_CA_CERTS)
 throw Error('Blocked: requires isolated CI database and trusted ephemeral TLS');

function sql(command){
 return execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1',
  '-d',PG,'-c',command],{encoding:'utf8',timeout:12000,maxBuffer:8192}).trim();
}
assert.equal(sql("SELECT current_database()"),PG);
assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.workspace_members'::regclass"),'t');
function bindQuery(query,[actor,session]){
 assert.ok(UUID.test(actor)&&UUID.test(session));
 // Exact immutable server adapter query, bound using PREPARE UUID params.
 const result=sql('PREPARE b3_verify(uuid,uuid) AS '+query+'; '+
  "EXECUTE b3_verify('"+actor+"','"+session+"'); DEALLOCATE b3_verify;");
 if(result!=='t'&&result!=='f')throw Error('Unexpected session SQL output');
 return {rows:[{active:result==='t'}]};
}
const db={query:async(query,args)=>bindQuery(query,args)};
let upstreamRequests=0;
const localOnlyFetch=async(url,options={})=>{
 let path;
 if(url.startsWith(ORIGINAL)){
  path=url.slice(ORIGINAL.length);
  if(!['auth/v1/user','rest/v1/rpc/wm_auth_access_context',
    'rest/v1/rpc/has_module_access'].includes(path))
    throw Error('Unapproved upstream request');
 }else{
  throw Error('External project network blocked');
 }
 upstreamRequests++;
 return fetch(LOCAL+'/'+path,{...options,redirect:'error'});
};
const handler=createB3TrustedReadStagingFixture({
 enabled:true,projectUrl:ORIGINAL,publishableKey:PK,
 fetchImpl:localOnlyFetch,db
});
const tls={
 key:readFileSync(process.env.WS02D_TLS_KEY),
 cert:readFileSync(process.env.WS02D_TLS_CERT)
};
const server=https.createServer(tls,async(req,res)=>{
 try{
  const pathname=new URL(req.url,LOCAL).pathname;
  if(pathname==='/health'){
   res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});
   res.end('isolated_https_ready');return;
  }
  if(pathname==='/ws02d-b3-read'){
   const r=new Request(LOCAL+req.url,{
    method:req.method,headers:req.headers
   });
   const reply=await handler(r);
   res.writeHead(reply.status,Object.fromEntries(reply.headers.entries()));
   res.end(await reply.text());return;
  }
  let target;
  if(pathname==='/auth/v1/user'&&req.method==='GET'){
   target=AUTH+'/user';
  }else if(pathname.startsWith('/rest/v1/')&&
   (req.method==='POST'||req.method==='GET')){
   // Only user-scoped test RPC and read-only table routes.
   if(![
    '/rest/v1/rpc/wm_auth_access_context',
    '/rest/v1/rpc/has_module_access',
    '/rest/v1/workspace_members',
    '/rest/v1/profiles'
   ].includes(pathname)){
    res.writeHead(404);res.end();return;
   }
   target=REST+req.url.slice('/rest/v1'.length);
  }else{
   res.writeHead(404);res.end();return;
  }
  let body='';
  for await(const chunk of req){
   body+=chunk.toString('utf8');
   if(body.length>8192)throw Error('Oversized request');
  }
  const u=await fetch(target,{
   method:req.method,
   headers:{
    accept:'application/json',
    ...(req.headers.authorization?{authorization:req.headers.authorization}:{}),
    ...(req.headers['content-type']?
       {'content-type':req.headers['content-type']}:{}),
    ...(req.headers.prefer?{prefer:req.headers.prefer}:{})
   },
   ...(req.method==='POST'?{body}:{}),
   redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(7500)
  });
  const reply=await u.text();
  if(reply.length>8192)throw Error('Oversized response');
  res.writeHead(u.status,{
   'content-type':u.headers.get('content-type')||'application/json',
   'cache-control':'no-store','x-content-type-options':'nosniff'
  });
  res.end(reply);
 }catch{
  res.writeHead(503,{'cache-control':'no-store'});
  res.end('BLOCKED');
 }
});
await new Promise((resolve,reject)=>{
 server.once('error',reject);
 server.listen(9443,'127.0.0.1',resolve);
});
try{
 const tlsOk=await fetch(LOCAL+'/health');
 assert.equal(tlsOk.status,200);
 assert.equal(await tlsOk.text(),'isolated_https_ready');
 const pw='Ci4!'+randomBytes(24).toString('base64url');
 async function createUser(which,ws,mods){
  const email='ws02d-b3-https-'+which+'@example.invalid';
  const signup=await fetch(AUTH+'/signup',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({email,password:pw}),
   signal:AbortSignal.timeout(8000)
  });
  assert.equal(signup.status,200,'Local GoTrue synthetic signup denied');
  const data=await signup.json();
  let jwt=data.access_token;
  if(!jwt){
   const r=await fetch(AUTH+'/token?grant_type=password',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email,password:pw}),
    signal:AbortSignal.timeout(8000)
   });
   assert.equal(r.ok,true,'Local GoTrue synthetic login denied');
   jwt=(await r.json()).access_token;
  }
  const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());
  assert.ok(UUID.test(claims.sub)&&UUID.test(claims.session_id));
  const id=claims.sub,sid=claims.session_id;
  sql("INSERT INTO public.profiles VALUES ('"+id+"','active'); "+
      "INSERT INTO public.workspace_members VALUES ('"+ws+"','"+id+"',true);");
  for(const moduleId of mods){
   assert.match(moduleId,/^[a-z-]+$/);
   sql("INSERT INTO public.ws02d_b3_module_acl VALUES ('"+id+"','"+moduleId+"');");
  }
  return {jwt,id,sid,ws};
 }
 const a=await createUser('identity-one',WA,['time-tracker','order-intake']);
 const b=await createUser('identity-two',WB,['tradelink']);
 const request=(token,route='/ws02d-b3-read',origin=ORIGIN,method='GET')=>
   fetch(LOCAL+route,{
    method,headers:{
     origin,authorization:token?'Bearer '+token:'',
     accept:'application/json'
    },redirect:'error',cache:'no-store'
   });
 const A=await request(a.jwt);
 assert.equal(A.status,200,'Signed user A staging check must pass');
 assert.equal(A.headers.get('access-control-allow-origin'),ORIGIN);
 const reportA=await A.json();
 assert.equal(reportA.status,'PASS');
 assert.equal(reportA.moduleProbeCount,12);
 assert.equal(reportA.authorizedModuleCount,2);
 assert.equal(reportA.writesAttempted,0);
 assert.equal(reportA.identifiersDisclosed,0);
 assert.equal(reportA.domainWritesVerified,0);
 assert.equal(reportA.providerDeliveriesVerified,0);
 assert.equal(reportA.trustBoundary,'SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ');
 const B=await request(b.jwt);
 assert.equal(B.status,200);
 const reportB=await B.json();
 assert.equal(reportB.authorizedModuleCount,1);
 for(const x of [a,b]){
  const r=await request(x.jwt,
   '/rest/v1/workspace_members?select=user_id,workspace_id');
  assert.equal(r.status,200,'Signed SQL RLS membership read failed');
  const rows=await r.json();
  assert.equal(rows.length,1,'Cross-workspace membership leaked');
  assert.deepEqual(rows[0],{user_id:x.id,workspace_id:x.ws});
  const p=await request(x.jwt,
   '/rest/v1/profiles?select=id,status');
  assert.equal(p.status,200);
  assert.deepEqual(await p.json(),[{id:x.id,status:'active'}]);
 }
 // A real second user's signed JWT never authorizes A's tenant.
 const anon=await request('', '/rest/v1/profiles?select=id');
 assert.notEqual(anon.status,200,'Anon should not read profiles');
 // Deny direct cross-principal entitlement inspection in *disposable*
 // fixture; this does not imply production p_user_id has been hardened.
 const cross=await fetch(LOCAL+'/rest/v1/rpc/has_module_access',{
  method:'POST',headers:{
   authorization:'Bearer '+a.jwt,'content-type':'application/json'
  },body:JSON.stringify({p_module_id:'tradelink',p_user_id:b.id})
 });
 assert.ok(cross.status===401||cross.status===403,
  'Cross-principal entitlement inspection should not be exposed');
 const malformed=a.jwt.split('.');
 const claims=JSON.parse(Buffer.from(malformed[1],'base64url').toString());
 claims.sub=b.id;
 malformed[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const forged=malformed.join('.');
 const forgedResponse=await request(forged);
 assert.equal(forgedResponse.status,401,'Unsigned actor substitution accepted');
 assert.equal((await request(a.jwt,'/ws02d-b3-read','https://evil.invalid')).status,403);
 // Revoked session must deny the trusted endpoint despite a JWT that
 // would otherwise remain valid until cryptographic expiry.
 sql("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='"+a.sid+"';");
 assert.equal((await request(a.jwt)).status,401);
 sql("UPDATE auth.sessions SET not_after=NULL WHERE id='"+a.sid+"';");
 assert.equal((await request(a.jwt)).status,200);
 sql("DELETE FROM auth.sessions WHERE id='"+a.sid+"';");
 assert.equal((await request(a.jwt)).status,401);
 assert.equal((await request(b.jwt)).status,200);
 assert.ok(upstreamRequests>=30);
 for(const text of [JSON.stringify(reportA),JSON.stringify(reportB)]){
  assert.ok(!text.includes(a.id)&&!text.includes(b.id));
  assert.ok(!text.includes(a.jwt)&&!text.includes(b.jwt));
  assert.ok(!text.includes('example.invalid'));
 }
 console.log('WS02D_B3_HTTPS_POSTGREST_RLS_PASS '+
 'real_local_gotrue=YES cryptographic_jwt=YES tls_verified=YES '+
 'rls_signed_rows=ISOLATED unsigned_actor=DENIED '+
 'cross_principal_rpc=DENIED revoked_session=DENIED '+
 'twelve_module_reads=PASS writes=0 provider_delivery=0 '+
 'production_requests=0');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
