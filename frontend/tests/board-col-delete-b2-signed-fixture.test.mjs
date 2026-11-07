import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 B2_QA_FIXTURE_BOARD_NAME,B2_QA_FIXTURE_COLUMN_NAME,
 createB2SignedQaFixture,inspectB2SignedQaFixture,
 sanitizeB2QaFixtureReport,renderB2SignedQaFixture
} from '../board-col-delete-b2-signed-fixture.js';

const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const boardId='33333333-3333-4333-8333-333333333333';
const groupId='44444444-4444-4444-8444-444444444444';
const columnId='55555555-5555-4555-8555-555555555555';
const items=Array.from({length:4},(_,i)=>String(i+6).repeat(8)+'-6666-4666-8666-'+String(i+6).repeat(12));

function fixture({identity='signed',existing=false,mode='pass'}={}){
 const calls=[];let detail=existing?{
  board:{id:boardId,name:B2_QA_FIXTURE_BOARD_NAME,workspace_id:workspace,
   status:'active',created_by:actor,updated_at:new Date().toISOString()},
  groups:[{id:groupId}],items:[],columns:[],values:[]
 }:null;
 const auth={userId:identity==='drift'?workspace:actor,
  getVerifiedUser:async()=>{calls.push('getVerifiedUser');return {id:actor}}};
 const api={
  context:async()=>{calls.push('context');return {user_id:actor,workspace_id:workspace,
    profile:{status:'active'}}},
  boards:async()=>{calls.push('boards');return detail?[detail.board]:[]},
  createBoard:async(name,description)=>{
   calls.push('createBoard');
   assert.equal(name,B2_QA_FIXTURE_BOARD_NAME);
   assert.match(description,/Nonproduction/);
   if(mode==='uncertain-create')throw new TypeError('connection lost');
   detail={board:{id:boardId,name,workspace_id:workspace,status:'active',
     created_by:actor,updated_at:new Date().toISOString()},
    groups:[{id:groupId}],items:[],columns:[],values:[]};
   return boardId;
  },
  board:async(id)=>{calls.push('board');assert.equal(id,boardId);return structuredClone(detail)},
  allowed:async(id,role)=>{calls.push('allowed');assert.equal(id,boardId);
   assert.equal(role,'manage');return mode!=='denied'},
  addItem:async(id,group,title)=>{
   calls.push('addItem');assert.equal(id,boardId);assert.equal(group,groupId);
   const index=detail.items.length;
   const itemId=items[index];detail.items.push({id:itemId,title,created_by:actor,archived_at:null});
   return itemId;
  },
  setBoardCellCas:async(item,col,val,expected)=>{
   calls.push('cell');
   assert.equal(expected,null);assert.equal(col,columnId);
   if(mode==='uncertain-cell')throw new TypeError('network disconnected');
   detail.values.push({item_id:item,column_id:col,value:val});
  }
 };
 const structure={mutate:async(d,opts)=>{
  calls.push('createColumn');
  assert.equal(d.board.id,boardId);
  assert.deepEqual(opts,{action:'create',name:B2_QA_FIXTURE_COLUMN_NAME,
   type:'text',config:{}});
  detail.columns.push({id:columnId,name:B2_QA_FIXTURE_COLUMN_NAME,
   column_key:'custom:fixture-status',data_type:'text',system_key:null});
  return {column_id:columnId};
 }};
 return {auth,api,structure,calls,peek:()=>structuredClone(detail)};
}
test('B2 missing signed tools refuse writes and disclose no credentials',async()=>{
 const r=await createB2SignedQaFixture({});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.reason,'SIGNED_SESSION_UNAVAILABLE');
 assert.equal(r.boardId,null);
 assert.equal(r.completedCells,0);
});
test('B2 identity drift and duplicate QA name deny new boards',async()=>{
 for(const config of [{identity:'drift'},{existing:true}]){
  const f=fixture(config);
  const r=await createB2SignedQaFixture(f);
  assert.equal(r.status,config.existing?'PENDING':'BLOCKED');
  assert.equal(f.calls.includes('createBoard'),false);
 }
});
test('B2 refuses to create a second QA board with another approved marker name',async()=>{
 const f=fixture({existing:true});
 f.api.boards=async()=>[{id:boardId,name:'CP-BOARD-COL-DELETE QA Another fixture'}];
 const result=await createB2SignedQaFixture(f);
 assert.equal(result.status,'PENDING');
 assert.equal(result.reason,'DUPLICATE_FIXTURE');
 assert.equal(f.calls.filter(x=>x==='createBoard').length,0);
 const inspection=await inspectB2SignedQaFixture(f);
 assert.equal(inspection.status,'BLOCKED');
 assert.equal(inspection.reason,'DUPLICATE_FIXTURE');
});
test('B2 genuine-session contract creates one ordinary QA board and exact 4 cell fixture',async()=>{
 const f=fixture(),r=await createB2SignedQaFixture(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.stage,'completed');
 assert.equal(r.reason,'NONE');
 assert.equal(r.boardId,boardId);
 assert.equal(r.completedCells,4);
 assert.equal(r.activationChanged,false);
 assert.equal(r.recoveryWritesAttempted,0);
 assert.equal(f.calls.filter(x=>x==='createBoard').length,1);
 assert.equal(f.calls.filter(x=>x==='createColumn').length,1);
 assert.equal(f.calls.filter(x=>x==='addItem').length,4);
 assert.equal(f.calls.filter(x=>x==='cell').length,4);
 const stored=f.peek();
 assert.equal(stored.items.length,4);
 assert.deepEqual(stored.values.map(v=>v.value),
  ['B2-QA-Alpha','B2-QA-Beta','B2-QA-Gamma','B2-QA-Delta']);
 const inspect=await inspectB2SignedQaFixture(f);
 assert.equal(inspect.status,'PASS');
 assert.equal(inspect.completedCells,4);
 assert.equal(inspect.boardId,boardId);
});
test('B2 initially missing QA board reports PENDING without creating anything',async()=>{
 const f=fixture(),r=await inspectB2SignedQaFixture(f);
 assert.equal(r.status,'PENDING');
 assert.equal(r.reason,'NOT_CREATED');
 assert.equal(f.calls.some(x=>['createBoard','addItem','cell'].includes(x)),false);
});
test('B2 uncertain board creation is not automatically retried',async()=>{
 const f=fixture({mode:'uncertain-create'});
 const r=await createB2SignedQaFixture(f);
 assert.equal(r.status,'UNCERTAIN');
 assert.equal(r.reason,'UNVERIFIED_WRITE_OUTCOME');
 assert.equal(f.calls.filter(x=>x==='createBoard').length,1);
 assert.equal(f.calls.filter(x=>x==='addItem').length,0);
});
test('B2 partial writes preserve board/records without retries or cleanup',async()=>{
 const f=fixture({mode:'uncertain-cell'});
 const r=await createB2SignedQaFixture(f);
 assert.equal(r.status,'UNCERTAIN');
 assert.equal(r.boardId,boardId);
 assert.equal(r.reason,'UNVERIFIED_WRITE_OUTCOME');
 assert.equal(f.calls.filter(x=>x==='createBoard').length,1);
 assert.equal(f.calls.filter(x=>x==='addItem').length,1);
 assert.equal(f.calls.filter(x=>x==='cell').length,1);
 assert.equal(f.calls.includes('deleteBoard'),false);
 assert.equal(f.peek().items.length,1);
});
test('B2 denied signed manager stops after board creation; no column or cell writes',async()=>{
 const f=fixture({mode:'denied'});
 const r=await createB2SignedQaFixture(f);
 assert.equal(r.status,'PARTIAL');
 assert.equal(r.reason,'MISSING_MANAGER_ACCESS');
 assert.equal(r.boardId,boardId);
 assert.equal(f.calls.includes('createColumn'),false);
 assert.equal(f.calls.includes('cell'),false);
});
test('B2 sanitized report and UI never expose a token or actor/workspace IDs',()=>{
 const serialized=sanitizeB2QaFixtureReport({
  status:'PASS',stage:'completed',reason:'NONE',completedCells:4,
  boardId,access_token:'secretToken',user_id:actor,workspace_id:workspace
 });
 assert.equal(JSON.parse(serialized).boardIdentifierDisclosed,false);
 assert.doesNotMatch(serialized,/secretToken|33333333|11111111|22222222/);
 assert.match(serialized,/SIGNED_QA_SETUP_ONLY_NOT_DELETE_OR_ACTIVITY_RESTORATION/);
 const html=renderB2SignedQaFixture({result:{status:'PASS',boardId,completedCells:4,reason:'NONE'}});
 assert.match(html,/Create signed B2 QA fixture/);
 assert.match(html,/data-action="security-b2-qa-inspect"/);
 assert.match(html,/Open QA board/);
 assert.match(html,/disabled/);
});
test('B2 Security UI wires a real user click and clears state on signout',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'security-b2-qa-inspect':/);
 assert.match(app,/case 'security-b2-qa-create':/);
 assert.match(app,/const create=name==='security-b2-qa-create';/);
 assert.doesNotMatch(app,/const create=action==='security-b2-qa-create';/);
 assert.match(app,/await createB2SignedQaFixture\(\{auth,api:db,structure:boardStructureClient\}\)/);
 assert.match(app,/renderB2SignedQaFixture\(\{busy:state.b2QaBusy,result:state.b2QaReport\}\)/);
 assert.match(app,/state.b2QaRunId\+\+;state.b2QaBusy=false;state.b2QaReport=null/);
});
