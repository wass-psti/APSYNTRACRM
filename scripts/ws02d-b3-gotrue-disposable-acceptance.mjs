/**
 * CP-WS-02D/B3: REAL Supabase GoTrue HTTP JWTs against ephemeral PostgreSQL.
 * NOT a production Supabase project and NOT the user's signed session.
 * Intended only for the pinned gotrue + PG17 GitHub Actions fixture.
 * The only HTTP network peer is localhost; no SMTP, provider, invite, emails
 * or real credentials. JWT/password/user IDs are NEVER printed.
 */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createTrustedSignedActorReadVerifier}
 from '../server/ws02d-gotrue-live-read-adapters.mjs';
import {WS02D_ACTIVE_SESSION_SQL}
 from '../server/ws02d-gotrue-live-read-adapters.mjs';

const GOTRUE_URL='http://127.0.0.1:9999';
const PROJECT_URL='https://jtlusodorfnyzgyuewkz.supabase.co/';
const DB_NAME='gotrue_disposable';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORKSPACE_A='00000000-0000-4000-8000-000000000001';
const WORKSPACE_B='00000000-0000-4000-8000-000000000002';
const PUBLISHABLE='sb_publishable_ephemeral_ci_only_no_remote_access';
if(process.env.CI!=='true'||
   process.env.WS02D_B3_LOCAL_GOTRUE!=='true'||
   process.env.PGHOST!=='127.0.0.1'||
   process.env.PGUSER!=='postgres'||
   process.env.PGDATABASE!==DB_NAME)
 throw Error('Blocked: requires ephemeral isolated GoTrue/PG17 CI environment');

function sql(statement){
 const result=execFileSync('psql',[
  '-X','-qAt','-v','ON_ERROR_STOP=1','-d',DB_NAME,'-c',statement
 ],{encoding:'utf8',timeout:12000,maxBuffer:3000,env:process.env}).trim();
 return result;
}
assert.equal(sql("SELECT CASE WHEN current_database()='gotrue_disposable' AND current_setting('server_version_num')::integer>=170000 THEN 'SAFE_PG17' ELSE 'DENIED' END"),'SAFE_PG17');
assert.equal(sql("SELECT to_regclass('auth.users') IS NOT NULL AND to_regclass('auth.sessions') IS NOT NULL"),'t');
for(const name of ['deleted_at','banned_until']){
 assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='"+name+"'"),'1');
}
assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='sessions' AND column_name='not_after'"),'1');

const password='Ci4!'+randomBytes(21).toString('base64url');
async function gotrue(path,body,token){
 const r=await fetch(GOTRUE_URL+path,{
  method:body?'POST':'GET',
  headers:{
   accept:'application/json',
   ...(body?{'content-type':'application/json'}:{}),
   ...(token?{authorization:'Bearer '+token}:{})
  },
  ...(body?{body:JSON.stringify(body)}:{}),
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)
 });
 let data;
 try{data=await r.json();}catch{data=null;}
 return {status:r.status,ok:r.ok,data};
}
function claimsFor(jwt){
 assert.equal(typeof jwt,'string');
 const parts=jwt.split('.');
 assert.equal(parts.length,3);
 const data=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 assert.ok(UUID.test(data.sub)&&UUID.test(data.session_id));
 assert.equal(data.role,'authenticated');
 return data;
}
async function createSignedTestUser(label){
 const email='ws02d-b3-'+label+'@example.invalid';
 const signUp=await gotrue('/signup',{email,password});
 if(!signUp.ok)throw Error('Local GoTrue synthetic signup HTTP '+signUp.status);
 let jwt=signUp.data?.access_token;
 if(!jwt){
  const login=await gotrue('/token?grant_type=password',{email,password});
  if(!login.ok)throw Error('Local GoTrue synthetic password login HTTP '+login.status);
  jwt=login.data?.access_token;
 }
 const claims=claimsFor(jwt);
 const profile=await gotrue('/user',null,jwt);
 if(!profile.ok||profile.data?.id!==claims.sub)
  throw Error('Local GoTrue JWT was not verified by the Auth /user endpoint');
 return {jwt,id:claims.sub,sessionId:claims.session_id};
}
const a=await createSignedTestUser('owner');
const b=await createSignedTestUser('foreign');
assert.notEqual(a.id,b.id);
assert.notEqual(a.sessionId,b.sessionId);

// All identifiers have been checked as UUIDs before inclusion in local
// SQL literals. The actual adapter's SQL is separately parameterized.
for(const x of [a.id,a.sessionId,b.id,b.sessionId])
 assert.ok(UUID.test(x));
sql([
 'CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL);',
 'CREATE TABLE public.workspace_members(',
 'workspace_id uuid NOT NULL,user_id uuid NOT NULL,active boolean NOT NULL,',
 'PRIMARY KEY(workspace_id,user_id));',
 "INSERT INTO public.profiles VALUES ('"+a.id+"','active'),('"+b.id+"','active');",
 "INSERT INTO public.workspace_members VALUES ('"+WORKSPACE_A+"','"+a.id+"',true),",
 "('"+WORKSPACE_B+"','"+b.id+"',true);"
].join('\n'));

let actualAuthReads=0;
const localAuthTransport=async(url,options)=>{
 // Redirect only the exact trusted project's Auth user lookup to a *real*
 // locally started GoTrue server; no requests reach production.
 if(url!==PROJECT_URL+'auth/v1/user')
  throw Error('Nonlocal Auth request blocked in disposable staging test');
 actualAuthReads++;
 return fetch(GOTRUE_URL+'/user',{
  method:'GET',
  headers:{authorization:options?.headers?.authorization,
           accept:'application/json'},
  redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(8000)
 });
};

let sqlReads=0;
const db={
 query:async(statement,[actorId,sessionId])=>{
  assert.equal(statement,WS02D_ACTIVE_SESSION_SQL);
  assert.ok(UUID.test(actorId)&&UUID.test(sessionId));
  sqlReads++;
  // PostgreSQL PREPARE binds the actor and session as UUID parameters.
  // There is no user-controlled SQL anywhere in the production adapter.
  const result=sql(
   'PREPARE ws02d_b3_check(uuid,uuid) AS '+statement+';'+
   " EXECUTE ws02d_b3_check('"+actorId+"','"+sessionId+"');"+
   ' DEALLOCATE ws02d_b3_check;'
  );
  if(result!=='t'&&result!=='f')throw Error('Unexpected local DB boolean');
  return {rows:[{active:result==='t'}]};
 }
};
const verify=createTrustedSignedActorReadVerifier({
 enabled:true,projectUrl:PROJECT_URL,publishableKey:PUBLISHABLE,
 fetchImpl:localAuthTransport,db
});
async function mustAccept(token,identity){
 const result=await verify(token);
 assert.equal(result.id,identity.id);
 assert.equal(result.sessionId,identity.sessionId);
 assert.equal(result.active,true);
 assert.equal(result.verified,true);
}
async function mustReject(token){
 await assert.rejects(verify(token),/Signed invitation authentication denied/);
}
await mustAccept(a.jwt,a);
await mustAccept(b.jwt,b);
// Forging a cross-actor claim breaks the REAL GoTrue signature check.
const chunks=a.jwt.split('.');
const forged=JSON.parse(Buffer.from(chunks[1],'base64url').toString('utf8'));
forged.sub=b.id;
const tampered=[
 chunks[0],Buffer.from(JSON.stringify(forged)).toString('base64url'),chunks[2]
].join('.');
await mustReject(tampered);

// The access JWT is still cryptographically valid here, but the
// independent live PostgreSQL session authority must deny these states.
sql("UPDATE public.workspace_members SET active=false WHERE user_id='"+a.id+"';");
await mustReject(a.jwt);
sql("UPDATE public.workspace_members SET active=true WHERE user_id='"+a.id+"';");
sql("UPDATE public.profiles SET status='disabled' WHERE id='"+a.id+"';");
await mustReject(a.jwt);
sql("UPDATE public.profiles SET status='active' WHERE id='"+a.id+"';");
sql("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='"+a.sessionId+"';");
await mustReject(a.jwt);
sql("UPDATE auth.sessions SET not_after=NULL WHERE id='"+a.sessionId+"';");
await mustAccept(a.jwt,a);
sql("DELETE FROM auth.sessions WHERE id='"+a.sessionId+"';");
await mustReject(a.jwt);
// Foreign user's own token remains valid and cannot assume A's identity.
await mustAccept(b.jwt,b);
assert.ok(actualAuthReads>=9&&sqlReads>=8);
process.stdout.write(
 'CP_WS_02D_B3_LOCAL_GOTRUE_ACCEPTANCE_PASS '+
 'auth=REAL_LOCAL_GOTRUE signed_jwt=YES independent_pg_sessions=YES '+
 'valid=2 forged_actor=DENIED disabled_profile=DENIED '+
 'removed_membership=DENIED expired_session=DENIED '+
 'revoked_session=DENIED foreign_identity_isolated=YES '+
 'production_requests=0 production_mutations=0 external_email=0\n'
);
