import test from 'node:test';
import assert from 'node:assert/strict';
import {DomainApi} from '../data.js';
const board='11111111-1111-4111-8111-111111111111';
const item='22222222-2222-4222-8222-222222222222';
const column='33333333-3333-4333-8333-333333333333';
const shell={board:{id:board,workspace_id:'44444444-4444-4444-8444-444444444444'},
 groups:[],items:[],columns:[],values:[]};
test('CP-BIMP-14 signed board read integrates existing extended references after refresh',async()=>{
 const api=new DomainApi({userId:'55555555-5555-4555-8555-555555555555'});
 let calls=0;
 api.rpc=async(name)=>{
  if(name==='wm_get_board')return structuredClone(shell);
  assert.equal(name,'wm_import_extended_refs_read');calls++;
  return [{item_id:item,column_id:column,value:'https://example.invalid/'+ 'x'.repeat(7200)}];
 };
 const first=await api.board(board),second=await api.board(board);
 assert.equal(first.values[0].value.length,7224);
 assert.deepEqual(second.values,first.values);
 assert.equal(calls,2);
 assert.equal(api.extendedRefsSupported,true);
});
test('CP-BIMP-14 old backend function absence preserves standard board read',async()=>{
 const api=new DomainApi({});let missing=0;
 api.rpc=async(name)=>{
  if(name==='wm_get_board')return structuredClone(shell);
  missing++;const error=new Error('Unknown RPC');error.status=404;error.code='PGRST202';throw error;
 };
 assert.deepEqual((await api.board(board)).values,[]);
 assert.deepEqual((await api.board(board)).values,[]);
 assert.equal(missing,1);
 assert.equal(api.extendedRefsSupported,false);
});
test('CP-BIMP-14 denied extended reads never fall back to an incomplete board',async()=>{
 const api=new DomainApi({});
 api.rpc=async(name)=>{
  if(name==='wm_get_board')return structuredClone(shell);
  const error=new Error('Access denied');error.status=403;throw error;
 };
 await assert.rejects(()=>api.board(board),/Access denied/);
});

test('same-board refresh starts independent signed board and extended-reference reads concurrently',async()=>{
 const api=new DomainApi({});
 let releaseBoard,releaseRefs;
 const boardGate=new Promise(resolve=>{releaseBoard=resolve;});
 const refsGate=new Promise(resolve=>{releaseRefs=resolve;});
 const started=[];
 api.rpc=(name)=>{
  started.push(name);
  return name==='wm_get_board'?boardGate:refsGate;
 };
 const pending=api.board(board,{parallelExtendedRefs:true});
 assert.deepEqual(started,['wm_import_extended_refs_read','wm_get_board']);
 releaseRefs([{item_id:item,column_id:column,value:'https://example.invalid/parallel'}]);
 releaseBoard(structuredClone(shell));
 const result=await pending;
 assert.equal(result.values[0].value,'https://example.invalid/parallel');
 assert.equal(api.extendedRefsSupported,true);
});
test('parallel refresh preserves denied optional-reference reads and legacy absence behavior',async()=>{
 const denied=new DomainApi({});
 denied.rpc=async name=>{
  if(name==='wm_get_board')return structuredClone(shell);
  throw Object.assign(new Error('Access denied'),{status:403});
 };
 await assert.rejects(()=>denied.board(board,{parallelExtendedRefs:true}),/Access denied/);
 const legacy=new DomainApi({});let refCalls=0;
 legacy.rpc=async name=>{
  if(name==='wm_get_board')return structuredClone(shell);
  refCalls++;throw Object.assign(new Error('RPC unavailable'),{status:404,code:'PGRST202'});
 };
 assert.deepEqual((await legacy.board(board,{parallelExtendedRefs:true})).values,[]);
 assert.deepEqual((await legacy.board(board,{parallelExtendedRefs:true})).values,[]);
 assert.equal(refCalls,1);
});
test('parallel refresh preserves no-board denial rather than accepting reference data',async()=>{
 const api=new DomainApi({});
 api.rpc=async name=>name==='wm_get_board'?null:
  [{item_id:item,column_id:column,value:'https://example.invalid/'}];
 await assert.rejects(()=>api.board(board,{parallelExtendedRefs:true}),/not found or is unavailable/);
});
