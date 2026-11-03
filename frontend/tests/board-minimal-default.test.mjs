import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardStructureClient,normalizeBoardUi} from '../board-structure-admin.js';
import {genericBoardColumns} from '../board-inline-items.js';
import {boardTable} from '../board-presentation.js';
import {
 ITEM_ONLY_MODE,isItemOnlyBoard,enableItemOnlyBoard,createItemOnlyBoard
} from '../board-minimal-default.js';
const boardId='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const group='44444444-4444-4444-8444-444444444444';
const col='55555555-5555-4555-8555-555555555555';
function fixture({items=[],columns=[],manage=true,name='New board',readRevision=0}={}){
 const detail={board:{id:boardId,name,workspace_id:ws,status:'active',created_by:actor},
  items,columns,groups:[{id:group}]};
 const state={creates:0,saves:[],detail};
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={
  context:async()=>({user_id:actor,workspace_id:ws,profile:{status:'active'}}),
  createBoard:async()=>{state.creates++;return boardId;},
  allowed:async(id,role)=>id===boardId&&role==='manage'&&manage,
  board:async()=>detail
 };
 const structure={
  read:async()=>({status:'VERIFIED_READ',boardId,revision:readRevision,
   primaryLabel:'Record',tabs:[],columnLabels:{},schemaMode:'legacy'}),
  save:async(_d,settings)=>{state.saves.push(settings);return settings;}
 };
 return {api,auth,structure,state,detail};
}
test('new ordinary board persists Item-only settings through authorized writer without physical schema mutations',async()=>{
 const f=fixture();
 const id=await createItemOnlyBoard({...f,name:'Test board',description:'Owned by team'});
 assert.equal(id,boardId);
 assert.equal(f.state.creates,1);
 assert.equal(f.state.saves.length,1);
 assert.equal(f.state.saves[0].primaryLabel,'Item');
 assert.equal(f.state.saves[0].schemaMode,ITEM_ONLY_MODE);
 assert.deepEqual(f.state.saves[0].tabs.map(x=>x.key),['items','issues']);
 assert.equal(f.state.detail.columns.length,0);
 assert.equal(f.state.detail.items.length,0);
});
test('existing boards retain legacy columns unless their server settings explicitly enable Item-only mode',()=>{
 const detail={board:{id:boardId,name:'Contacts'}};
 assert.equal(isItemOnlyBoard(detail,{status:'VERIFIED_READ',schemaMode:'legacy'}),false);
 assert.equal(isItemOnlyBoard(detail,{status:'VERIFIED_READ',schemaMode:ITEM_ONLY_MODE}),true);
 assert.equal(isItemOnlyBoard({board:{id:boardId,name:'TimeTracker Attendance'}},
  {status:'VERIFIED_READ',schemaMode:ITEM_ONLY_MODE}),false);
 const legacy=genericBoardColumns({...detail,columns:[]});
 assert.deepEqual(legacy.map(c=>c.key),['record','status','owner','due','actions']);
 const minimal=genericBoardColumns({...detail,columns:[]},
  {primaryTitle:'Item',minimal:true});
 assert.deepEqual(minimal.map(c=>c.title),['Item']);
});
test('explicit custom columns remain in a minimal board, with their saved types and identity preserved',()=>{
 const custom={id:col,name:'Estimated Cost',position:0,visible:true,
  system_key:null,data_type:'number'};
 const detail={columns:[custom]};
 assert.deepEqual(genericBoardColumns(detail,{primaryTitle:'Item',minimal:true})
  .map(c=>c.key),['record','col:'+col]);
});
test('a server-backed settings read preserves the mode even after Item display name changes',async()=>{
 const raw={board_id:boardId,revision:3,primary_label:'Client',
  tabs:[{key:'items',label:'Items',visible:true,schema_mode:ITEM_ONLY_MODE},
   {key:'issues',label:'Issues',visible:true}],column_labels:{}};
 const read=normalizeBoardUi(raw,boardId);
 assert.equal(read.schemaMode,ITEM_ONLY_MODE);
 assert.equal(read.primaryLabel,'Client');
 const rpc=[];
 const client=new BoardStructureClient({
  allowed:async()=>true,
  rpc:async(name,args)=>{rpc.push({name,args});return raw;}
 });
 await client.save({board:{id:boardId},columns:[]},read);
 const t=rpc[0].args.p_tabs;
 assert.equal(t.find(x=>x.key==='items').schema_mode,ITEM_ONLY_MODE);
 assert.equal(t.find(x=>x.key==='issues').schema_mode,undefined);
 assert.equal(rpc[0].args.p_primary_label,'Client');
});
test('signed nonmanager, occupied creation and protected module boards cannot be automatically converted',async()=>{
 const notManager=fixture({manage:false});
 await assert.rejects(()=>enableItemOnlyBoard({...notManager,boardId}),/authorized ordinary-board managers/);
 assert.equal(notManager.state.saves.length,0);
 const occupied=fixture({items:[{id:group}]});
 await assert.rejects(()=>enableItemOnlyBoard({...occupied,boardId,strictEmpty:true}),/already contains records/);
 assert.equal(occupied.state.saves.length,0);
 const module=fixture({name:'TimeTracker Attendance'});
 await assert.rejects(()=>enableItemOnlyBoard({...module,boardId}),/authorized ordinary-board managers/);
});
test('a failed post-create settings write never retries board creation or invents successful persistence',async()=>{
 const f=fixture();
 f.structure.save=async()=>{throw Error('Server unavailable');};
 await assert.rejects(()=>createItemOnlyBoard({...f,name:'New board'}),/Do not retry creation/);
 assert.equal(f.state.creates,1);
});
test('Item-plus-Add-Column is one data column plus an explicit accessible command',()=>{
 const html=boardTable({groupId:group,columns:[{key:'record',title:'Item'}],
  rows:[],addColumn:true,summaries:{record:'0 items'}});
 assert.equal((html.match(/data-column-key="record"/g)||[]).length,2);
 assert.match(html,/data-action="board-add-column"/);
 assert.match(html,/aria-label="Add a new board column"/);
 assert.match(html,/colspan="2"/);
});
test('the deployed board creation and manager add-column actions use the signed configuration workflow',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/createItemOnlyBoard\(/);
 assert.match(app,/case 'board-add-column'/);
 assert.match(app,/data-structure-enable-item-only/);
 assert.match(app,/addColumn:minimal&&state\.boardManage/);
 assert.match(app,/genericBoardColumns\(state\.board,\{primaryTitle,columnLabels,minimal\}\)/);
});
