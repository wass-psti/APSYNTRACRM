import test from 'node:test';
import assert from 'node:assert/strict';
import {searchFuelTransTickets} from '../fueltrans/supabase-client.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const board='33333333-3333-4333-8333-333333333333';
function context({current=true}={}){
 const calls=[];
 const auth={
  async getVerifiedUser(){calls.push('verified-user');return {id:user};},
  async token(){calls.push('token');return 'signed-test-token';}
 };
 const api={
  async context(){calls.push('context');return {user_id:user,workspace_id:workspace};},
  async board(id){calls.push(['board',id]);return {board:{id,workspace_id:workspace,name:'FuelTrans Standalone'}};},
  async allowed(id,action){calls.push(['allowed',id,action]);return true;},
  async rpc(name,args){calls.push(['rpc',name,args]);return true;}
 };
 return {calls,value:{auth,api,boardId:board,workspaceId:workspace,userId:user,
  isCurrent:()=>current&&authUserIsCurrent(auth)},auth};
}
function authUserIsCurrent(auth){return auth!==null;}

test('FuelTrans native search uses the existing signed client and a bounded safe projection',async()=>{
 const prior=globalThis.fetch,c=context();let requested=null;
 globalThis.fetch=async(url,options)=>{
  requested={url:String(url),options};
  return new Response(JSON.stringify([{
   workspace_id:workspace,id:'fueltrans-ticket-1',ticket_number:'FT-2026-001',
   client_code:'UNIOIL',status:'Open',created_at:'2026-11-16T08:00:00Z',
   updated_at:'2026-11-16T09:00:00Z',payload:{issueDetails:'must not escape'}
  }]),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const rows=await searchFuelTransTickets(c.value,{query:'FT-2026-001',limit:12});
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{
   id:'fueltrans-ticket-1',ticketNumber:'FT-2026-001',clientCode:'UNIOIL',
   status:'Open',createdAt:'2026-11-16T08:00:00Z',updatedAt:'2026-11-16T09:00:00Z'
  });
  const url=new URL(requested.url);
  assert.equal(url.pathname.endsWith('/rest/v1/fueltrans_tickets'),true);
  assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspace);
  assert.equal(url.searchParams.get('archived'),'eq.false');
  assert.equal(url.searchParams.get('limit'),'12');
  assert.equal(url.searchParams.get('select'),
   'workspace_id,id,ticket_number,client_code,status,created_at,updated_at');
  assert.match(url.searchParams.get('or'),/ticket_number\.ilike/);
  assert.equal(url.searchParams.has('payload'),false);
  assert.equal(requested.options.headers.Authorization,'Bearer signed-test-token');
  assert.ok(c.calls.some(call=>Array.isArray(call)&&call[0]==='rpc'&&call[1]==='has_module_access'));
  assert.ok(c.calls.some(call=>Array.isArray(call)&&call[0]==='allowed'&&call[2]==='view'));
 }finally{globalThis.fetch=prior;}
});

test('FuelTrans native search short queries perform no API or network work',async()=>{
 const prior=globalThis.fetch,c=context();let requests=0;
 globalThis.fetch=async()=>{requests++;throw new Error('unexpected request');};
 try{
  assert.deepEqual(await searchFuelTransTickets(c.value,{query:'x'}),[]);
  assert.equal(requests,0);
  assert.equal(c.calls.length,0);
 }finally{globalThis.fetch=prior;}
});

test('FuelTrans native search rejects stale host context before reading',async()=>{
 const prior=globalThis.fetch,c=context({current:false});let requests=0;
 globalThis.fetch=async()=>{requests++;throw new Error('unexpected request');};
 try{
  await assert.rejects(searchFuelTransTickets(c.value,{query:'FT-2026'}),/authorized CRM board/);
  assert.equal(requests,0);
 }finally{globalThis.fetch=prior;}
});
