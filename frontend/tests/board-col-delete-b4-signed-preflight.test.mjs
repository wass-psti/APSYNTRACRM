import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 runB4SignedRecoveryPreflight,renderB4SignedRecoveryPreflight,
 sanitizeB4SignedRecoveryReport
} from '../board-col-delete-b4-signed-preflight.js';
import {B4_QA_BOARD_ID,B4_QA_BOARD_NAME,B4_QA_EXPIRES_AT}
 from '../board-column-recovery.js';

const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const column='33333333-3333-4333-8333-333333333333';
const group='44444444-4444-4444-8444-444444444444';
const now=Date.parse('2026-11-06T03:35:00Z');
const pairs=[
 ['B2 QA item 1','B2-QA-Alpha'],
 ['B2 QA item 2','B2-QA-Beta'],
 ['B2 QA item 3','B2-QA-Gamma'],
 ['B2 QA item 4','B2-QA-Delta']
];

function mock({signed=true,manage=true,scope='active',owner=true,foreign=false}={}){
 const calls=[];
 const userId='11111111-1111-4111-8111-111111111111';
 const data={
  board:{id:B4_QA_BOARD_ID,name:B4_QA_BOARD_NAME,
   workspace_id:workspace,created_by:owner?actor:workspace,status:'active'},
  groups:[{id:group}],
  columns:[{id:column,name:'Recovery Status',system_key:null,
   column_key:'custom:recovery-status',data_type:'text'}],
  items:pairs.map(([title],i)=>({
   id:`55555555-5555-4555-8555-${String(i+1).repeat(12)}`,
   title,created_by:actor,archived_at:null
  })),
  values:pairs.map(([,value],i)=>({
   item_id:`55555555-5555-4555-8555-${String(i+1).repeat(12)}`,
   column_id:column,value
  }))
 };
 const auth={userId:signed?userId:workspace,
  getVerifiedUser:async()=>{calls.push('verified-user');return {id:actor}}};
 const api={
  context:async()=>{calls.push('context');return {
   user_id:actor,workspace_id:workspace,profile:{status:'active'}
  }},
  boards:async()=>{calls.push('boards');return [data.board]},
  board:async()=>{calls.push('board');return structuredClone(data)},
  allowed:async()=>{calls.push('allowed');return manage},
  rpc:async(name,args)=>{
   calls.push('rpc');
   assert.equal(name,'wm_list_recoverable_board_columns');
   assert.deepEqual(args,{p_board_id:B4_QA_BOARD_ID});
   if(foreign)throw Error('scope denied: hidden server detail');
   return scope==='existing'?[{deletion_id:column}]:[];
  }
 };
 return {auth,api,calls};
}

test('B4 signed index preflight accepts original owner and four-cell fixture without writes',async()=>{
 const m=mock();
 const r=await runB4SignedRecoveryPreflight({...m,now});
 assert.equal(r.status,'PASS');
 assert.equal(r.stage,'completed');
 assert.equal(r.reason,'NONE');
 assert.equal(r.readOnly,true);
 assert.equal(r.recoveryWritesAttempted,0);
 assert.equal(m.calls.filter(x=>x==='rpc').length,1);
 assert.equal(m.calls.filter(x=>x==='verified-user').length,2);
 assert.equal(m.calls.some(x=>['createBoard','addItem','setBoardCellCas','delete','restore'].includes(x)),false);
});

test('B4 preflight rejects missing identity, wrong owner and denied manager before RPC',async()=>{
 for(const cfg of [{signed:false},{owner:false},{manage:false}]){
  const m=mock(cfg);
  const r=await runB4SignedRecoveryPreflight({...m,now});
  assert.equal(r.status,'BLOCKED');
  assert.equal(m.calls.includes('rpc'),false);
 }
});

test('B4 expired preflight blocks without any signed or recovery API calls',async()=>{
 const m=mock();
 const r=await runB4SignedRecoveryPreflight({...m,now:B4_QA_EXPIRES_AT});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'RECOVERY_WINDOW_EXPIRED');
 assert.deepEqual(m.calls,[]);
});

test('B4 signed RPC denial fails closed and existing snapshot asks for review',async()=>{
 const denied=mock({foreign:true});
 const r=await runB4SignedRecoveryPreflight({...denied,now});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_RECOVERY_INDEX_DENIED');
 const existing=mock({scope:'existing'});
 const pending=await runB4SignedRecoveryPreflight({...existing,now});
 assert.equal(pending.status,'PENDING');
 assert.equal(pending.reason,'EXISTING_RECOVERY_SNAPSHOT');
});

test('B4 report and interface cannot leak actor, board or provider tokens',()=>{
 const json=sanitizeB4SignedRecoveryReport({
  status:'PASS',stage:'completed',reason:'NONE',access_token:'SECRET',
  actor,boardId:B4_QA_BOARD_ID
 });
 assert.equal(JSON.parse(json).status,'PASS');
 assert.equal(JSON.parse(json).boardIdentifierDisclosed,false);
 assert.doesNotMatch(json,/SECRET|8491b933|11111111/);
 assert.match(json,/SIGNED_RECOVERY_INDEX_READ_ONLY/);
 const html=renderB4SignedRecoveryPreflight({report:{status:'PASS',reason:'NONE'}});
 assert.match(html,/security-b4-qa-preflight/);
 assert.match(html,/security-b4-qa-copy/);
 assert.doesNotMatch(html,/SECRET|8491b933/);
});

test('B4 Security action dispatches read-only preflight and clears stale state',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'security-b4-qa-preflight':/);
 assert.match(app,/case 'security-b4-qa-copy':/);
 assert.match(app,/await runB4SignedRecoveryPreflight\(\{auth,api:db\}\)/);
 assert.match(app,/renderB4SignedRecoveryPreflight\(\{busy:state\.b4QaBusy,report:state\.b4QaReport\}\)/);
 assert.match(app,/state\.b4QaRunId\+\+;state\.b4QaBusy=false;state\.b4QaReport=null/);
});
