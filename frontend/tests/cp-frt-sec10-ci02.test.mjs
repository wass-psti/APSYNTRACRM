import test from 'node:test';
import assert from 'node:assert/strict';
import {dbUrlFromStatus,adaptDisposableFixture,executeCI02}
 from '../../scripts/cp-frt-sec10-ci02.mjs';
import {runIsolatedSEC10} from '../../scripts/cp-frt-sec10-nonprod-acceptance.mjs';
const env={CI:'true',GITHUB_ACTIONS:'true',SEC10_CI_AUTH_SMOKE:'EPHEMERAL_ONLY',
 SEC10_CI02:'EPHEMERAL_ONLY'};
const status='API_URL="http://127.0.0.1:54321"\n'+
 'ANON_KEY="ci-anon-key"\nSERVICE_ROLE_KEY="ci-service-key"\n'+
 'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\n';
const ids={admin:'11111111-1111-4111-8111-111111111111',
 member:'22222222-2222-4222-8222-222222222222',
 outsider:'33333333-3333-4333-8333-333333333333'};
test('native DB URL parser rejects hosted databases and non-CI invocation',()=>{
 assert.equal(dbUrlFromStatus(status,env),'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
 for(const url of [
  'postgresql://postgres:postgres@db.jtlusodorfnyzgyuewkz.supabase.co:5432/postgres',
  'postgresql://postgres:postgres@192.168.1.100:54322/postgres',
  'postgresql://postgres:postgres@localhost.evil.test:54322/postgres',
  'https://127.0.0.1:54322/postgres',
  'postgresql://postgres:postgres@127.0.0.1:54322/production'
 ]){
  assert.throws(()=>dbUrlFromStatus(status.replace(
   'postgresql://postgres:postgres@127.0.0.1:54322/postgres',url),env),
   /NONLOOPBACK_DB_REJECTED/);
 }
 assert.throws(()=>dbUrlFromStatus(status,{...env,CI:'false'}),/CI_ONLY/);
});
test('fixture transformation retains canonical roles but never recreates native GoTrue schema',()=>{
 const fixture=String.raw`-- Disposable PostgreSQL 17 fixture ONLY
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-00000000000a'),
 ('00000000-0000-4000-8000-00000000000b'),
 ('00000000-0000-4000-8000-00000000000c');
INSERT INTO public.profiles (id) VALUES
 ('00000000-0000-4000-8000-00000000000a'),
 ('00000000-0000-4000-8000-00000000000b'),
 ('00000000-0000-4000-8000-00000000000c');
`;
 const sql=adaptDisposableFixture(fixture,ids);
 assert.match(sql,/CREATE SCHEMA IF NOT EXISTS private/);
 assert.match(sql,/11111111-1111-4111-8111-111111111111/);
 assert.match(sql,/33333333-3333-4333-8333-333333333333/);
 assert.doesNotMatch(sql,/CREATE SCHEMA auth|CREATE ROLE anon|INSERT INTO auth.users/);
 assert.doesNotMatch(sql,/00000000-0000-4000-8000-00000000000[abc]/);
});
test('untrusted execution context stops before HTTP or SQL calls',async()=>{
 let count=0;
 const forbidden=()=>{count++;throw Error('SHOULD_NOT_CONNECT');};
 await assert.rejects(executeCI02(status,{...env,SEC10_CI02:'NO'},forbidden),
  /CI02_ENVIRONMENT_DENIED/);
 assert.equal(count,0);
});

test('CI02 guarded transition accepts validated loopback port and rejects cloud',async()=>{
 const config={url:'http://127.0.0.1:54321',publishableKey:'local-only-key',
  workspaceId:'00000000-0000-4000-8000-000000000001',
  boardId:'00000000-0000-4000-8000-00000000000d',
  bootstrapEmail:'bootstrap@example.invalid',bootstrapPassword:'fixture',
  memberEmail:'member@example.invalid',memberPassword:'fixture'};
 let networkCalls=0;
 const fake=async()=>{networkCalls++;return {ok:false,status:401,
  json:async()=>({message:'deliberately blocked'})}};
 const result=await runIsolatedSEC10(env,fake,config);
 assert.equal(networkCalls,1,'verified loopback must reach disposable Auth API');
 assert.equal(result.status,'BLOCKED');
 const oldCount=networkCalls;
 const blocked=await runIsolatedSEC10(env,fake,{...config,
  url:'https://jtlusodorfnyzgyuewkz.supabase.co'});
 assert.equal(blocked.reason,'NONPRODUCTION_CONFIG_NOT_VERIFIED');
 assert.equal(networkCalls,oldCount,'cloud host must not be contacted');
});
