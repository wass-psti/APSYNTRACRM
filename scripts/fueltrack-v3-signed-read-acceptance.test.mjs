import test from 'node:test';
import assert from 'node:assert/strict';
import {runFuelTrackSignedReadAcceptance} from './fueltrack-v3-signed-read-acceptance.mjs';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='00000000-0000-4000-8000-000000000001';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env=(role='Admin')=>({
 FT3_SUPABASE_URL:'https://jtlusodorfnyzgyuewkz.supabase.co',
 FT3_PUBLISHABLE_KEY:'sb_publishable_mock_only',
 FT3_ACCESS_TOKEN:'synthetic.'+'x'.repeat(40),
 FT3_WORKSPACE_ID:workspace,FT3_EXPECTED_ROLE:role
});
function fake(role='Admin',badScope=false){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const name=url.split('/').pop();
  const isSigned=!!options.headers?.Authorization;
  calls.push({name,method:options.method,body:options.body,token:options.headers?.Authorization});
  let status=200,data;
  if(name==='user')data={id:user};
  else if(!isSigned)({status,data}={status:403,data:{message:'Denied'}});
  else if(name==='fueltrack_v3_read'){
   if(JSON.parse(options.body).p_board_id!==board)({status,data}={status:403,data:{message:'Denied'}});
   else data={status:'VERIFIED_READ',boardId:board,
    workspaceId:badScope?'22222222-2222-4222-8222-222222222222':workspace,
    role,rows:[],summary:{total:0}};
  }else if(name==='fueltrack_v3_analytics')
   data={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,daily:[]};
  else if(name==='fueltrack_v3_audit_read')
   role==='Admin'?data={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,events:[]}:
   ({status,data}={status:403,data:{message:'Denied'}});
  else throw new Error('Unexpected endpoint '+name);
  return {ok:status>=200&&status<300,status,json:async()=>data};
 };
 return {calls,fetchImpl};
}
test('Admin signed read-only acceptance verifies identity, scope, analytics, audit and denials',async()=>{
 const {calls,fetchImpl}=fake('Admin');
 const outcome=await runFuelTrackSignedReadAcceptance({env:env(),fetchImpl});
 assert.equal(outcome.status,'READ_ONLY_ACCEPTANCE_PASS');
 assert.equal(outcome.checks.length,6);
 assert.ok(calls.every(c=>c.method==='POST'||c.method==='GET'));
 assert.equal(calls.some(c=>/submit|complete|decide|attach/.test(c.name)),false);
});
test('User signed acceptance proves Admin audit denial without any writes',async()=>{
 const {fetchImpl}=fake('User');
 const outcome=await runFuelTrackSignedReadAcceptance({env:env('User'),fetchImpl});
 assert.ok(outcome.checks.includes('USER_AUDIT_DENIED'));
});
test('a mismatched signed workspace fails closed',async()=>{
 const {fetchImpl}=fake('Admin',true);
 await assert.rejects(runFuelTrackSignedReadAcceptance({env:env(),fetchImpl}),
  /read scope, role, or response contract mismatch/);
});
test('a different production project target is rejected before network access',async()=>{
 let called=false;
 await assert.rejects(runFuelTrackSignedReadAcceptance({
  env:{...env(),FT3_SUPABASE_URL:'https://different.supabase.co'},
  fetchImpl:async()=>{called=true;throw Error('unexpected');}
 }),/approved existing WatchdogWorkspace/);
 assert.equal(called,false);
});
test('missing login session token fails before network access',async()=>{
 let called=false;
 await assert.rejects(runFuelTrackSignedReadAcceptance({
  env:{...env(),FT3_ACCESS_TOKEN:''},
  fetchImpl:async()=>{called=true;throw Error('unexpected');}
 }),/Missing signed access token/);
 assert.equal(called,false);
});
test('missing RPC refuses acceptance even with a signed identity',async()=>{
 const {fetchImpl}=fake();
 await assert.rejects(runFuelTrackSignedReadAcceptance({env:env(),fetchImpl:async(url,args)=>{
  if(url.endsWith('/fueltrack_v3_read'))return {ok:false,status:404,json:async()=>({})};
  return fetchImpl(url,args);
 }}),/unavailable or signed read denied/);
});
