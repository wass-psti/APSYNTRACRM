import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthClient,ApiError} from '../session.js';

const authWith=fetchImpl=>new AuthClient({
 fetchImpl,storage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
});

test('successful malformed JSON is surfaced with a stable response-decoding code',async()=>{
 const auth=authWith(async()=>new Response('<html>gateway response</html>',{
  status:200,headers:{'Content-Type':'text/html'}
 }));
 await assert.rejects(()=>auth.call('/rest/v1/rpc/wm_import_board_wizard_atomic'),error=>{
  assert.ok(error instanceof ApiError);
  assert.equal(error.status,200);
  assert.equal(error.code,'INVALID_JSON_RESPONSE');
  assert.equal(error.cause?.name,'SyntaxError');
  assert.equal(error.message,'The service returned an invalid JSON response.');
  assert.doesNotMatch(error.message,/gateway response|<html>/);
  return true;
 });
});

test('successful JSON is decoded exactly once and returned unchanged',async()=>{
 let reads=0;
 const auth=authWith(async()=>({ok:true,status:200,text:async()=>{
  reads++;return '{"created":2,"updated":1,"skipped":0,"columnsCreated":0,"groupsCreated":0}';
 }}));
 assert.deepEqual(await auth.call('/rest/v1/rpc/wm_import_board_wizard_atomic'),{
  created:2,updated:1,skipped:0,columnsCreated:0,groupsCreated:0
 });
 assert.equal(reads,1);
});

test('204 and empty successful responses retain the existing null contract',async()=>{
 const auth=authWith(async()=>new Response(null,{status:204}));
 assert.equal(await auth.call('/rest/v1/rpc/example'),null);
 const empty=authWith(async()=>new Response('',{status:200}));
 assert.equal(await empty.call('/rest/v1/rpc/example'),null);
});

test('malformed error responses preserve authoritative HTTP status without exposing body',async()=>{
 const auth=authWith(async()=>new Response('upstream proxy failed',{
  status:502,headers:{'Content-Type':'text/plain'}
 }));
 await assert.rejects(()=>auth.call('/rest/v1/rpc/example'),error=>{
  assert.ok(error instanceof ApiError);
  assert.equal(error.status,502);
  assert.equal(error.code,'');
  assert.equal(error.message,'Request failed (502)');
  return true;
 });
});

test('JSON-only fetch test doubles remain supported',async()=>{
 const auth=authWith(async()=>({ok:true,status:200,json:async()=>({ok:true})}));
 assert.deepEqual(await auth.call('/auth/v1/user'),{ok:true});
});
