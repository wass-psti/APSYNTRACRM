import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planMaterialSourcingPublicChanges,saveMaterialSourcingPublicChange,
 verifyMaterialSourcingPublicChanges} from '../material-sourcing-public-edit.js';
import {renderMaterialSourcingPublicOverview} from '../material-sourcing-detail-tabs.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';
import {materialAddPublicColumns} from '../material-sourcing-add-material.js';
const id='11111111-1111-4111-8111-111111111111';
const column=(name,type,i)=>({id:'22222222-2222-4222-8222-'+String(i).padStart(12,'0'),
 name,data_type:type,visible:true,system_key:null,column_key:'custom:'+i});
const cols=[column('Source Type','dropdown',1),column('Brand','text',2),
 column('Material description','long_text',3),column('RFQ Ref No','text',4),
 column('Quantity','number',5),column('Date required','date',6),
 column('Leadtime in Weeks','number',7)];
const detail=()=>({board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'},
 groups:[MATERIAL_SOURCING_GROUP],items:[{id,title:'002',group_id:MATERIAL_SOURCING_GROUP.id}],
 columns:cols,values:[{item_id:id,column_id:cols[1].id,value:'Brand'},
 {item_id:id,column_id:cols[4].id,value:1}]});
test('Identification and Supplier & Schedule have approved edit controls',()=>{
 const html=renderMaterialSourcingPublicOverview({partNumber:'002',source:'Local',
  rfq:'RFQ',description:'Specification',brand:'Brand',quantity:'1',due:'2026-11-11',lead:'1'},
  {editing:true,enabledFields:['partNumber','source','rfq','description','brand','quantity','due','lead']});
 for(const key of ['partNumber','source','rfq','description','brand','quantity','due','lead'])
  assert.match(html,new RegExp('data-mrh-public-field="'+key+'"'));
 assert.doesNotMatch(html,/data-mrh-public-field="(group|created)"/);
 const read=renderMaterialSourcingPublicOverview({partNumber:'002'}, {editing:false});
 assert.doesNotMatch(read,/data-mrh-public-field=/);
});
test('ordinary board CAS plans only changed values and validates before write',async()=>{
 const board=detail();
 const changes=planMaterialSourcingPublicChanges(board,id,{
  partNumber:'002',brand:'New brand',quantity:'2',due:'2026-11-12'});
 assert.deepEqual(changes.map(x=>x.key),['brand','quantity','due']);
 assert.equal(changes[0].expectedValue,'Brand');
 assert.equal(changes[1].value,2);
 assert.equal(changes[2].expectedValue,null);
 const calls=[],api={setBoardCellCas:async(...params)=>calls.push(params)};
 for(const change of changes)await saveMaterialSourcingPublicChange({api,itemId:id,change});
 assert.equal(calls.length,3);
 assert.deepEqual(calls[0],[id,cols[1].id,'New brand','Brand']);
 assert.throws(()=>planMaterialSourcingPublicChanges(board,id,{quantity:'-1'}),/nonnegative/);
 assert.throws(()=>planMaterialSourcingPublicChanges(board,id,{due:'2026-02-30'}),/valid required date/);
 assert.throws(()=>planMaterialSourcingPublicChanges(board,id,{group:'Other'}),/Unknown material field/);
 assert.throws(()=>planMaterialSourcingPublicChanges({...board,columns:[]},id,{brand:'Changed'}),/unavailable/);
});
test('reloaded board verifies every public value including title and prevents false positive',()=>{
 const board=detail();const changes=planMaterialSourcingPublicChanges(board,id,{partNumber:'003',brand:'New brand'});
 assert.equal(verifyMaterialSourcingPublicChanges(board,id,changes),false);
 board.items[0].title='003';board.values[0].value='New brand';
 assert.equal(verifyMaterialSourcingPublicChanges(board,id,changes),true);
 board.items[0].group_id='33333333-3333-4333-8333-333333333333';
 assert.equal(verifyMaterialSourcingPublicChanges(board,id,changes),false);
});
test('verified material edit mode renders ordinary fields with the same edit control as protected fields',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const part=app.slice(app.indexOf('async function openBoardItemDetails('),app.indexOf('async function openBoardMembers('));
 assert.match(part,/editing=editing&&\(canPublicEdit\|\|canProtectedEdit\)/);
 assert.match(part,/editToggle\.hidden=!\(canPublicEdit\|\|canProtectedEdit\)/);
 assert.match(part,/renderMaterialSourcingPublicOverview\(publicRow\(\),\{/);
 assert.match(part,/groupTitle:group\?\.title\|\|'Main group',editing,/);
 assert.doesNotMatch(part,/editing:editing&&canPublicEdit/);
 const board=detail();
 // Live MRH schema has custom Source Type/Brand/etc. and a legacy Quantity column.
 board.columns[4]={...board.columns[4],column_key:'col_dca08a7992654706b800fb45657cf0d5'};
 const enabled=['partNumber',...Object.entries({source:'sourceType',rfq:'rfq',description:'description',
  brand:'brand',quantity:'quantity',due:'due',lead:'lead'})
  .filter(([,key])=>materialAddPublicColumns(board)[key]).map(([key])=>key)];
 assert.equal(enabled.length,8);
 const html=renderMaterialSourcingPublicOverview({partNumber:'002',source:'Local',
  rfq:'1',description:'testing',brand:'testing',quantity:'1',due:'2026-11-11',lead:'1'},
 {editing:true,enabledFields:enabled});
 assert.equal((html.match(/data-mrh-public-field=/g)||[]).length,8);
});
test('drawer uses existing signed board CAS with one Save action and no page refresh',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const part=app.slice(app.indexOf('async function openBoardItemDetails('),app.indexOf('async function openBoardMembers('));
 assert.match(part,/planMaterialSourcingPublicChanges\(publicDetail,itemId,rawPublicDraft\(\)\)/);
 assert.match(part,/saveMaterialSourcingPublicChange\(\{api:db,itemId,change\}\)/);
 assert.match(part,/verifyMaterialSourcingPublicChanges\(board,itemId,publicChanges\)/);
 assert.match(part,/data-mrh-save-all hidden>Save changes/);
 assert.doesNotMatch(part,/window\.location\.reload\(/);
});

test('atomic edit adapter is staged without replacing the production path',async()=>{
 const {MATERIAL_SOURCING_ATOMIC_EDIT_ENABLED}=await import('../material-sourcing-public-edit.js');
 assert.equal(MATERIAL_SOURCING_ATOMIC_EDIT_ENABLED,false);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/if\(MATERIAL_SOURCING_ATOMIC_EDIT_ENABLED\)\{/);
 assert.match(app,/saveMaterialSourcingAtomic\(\{\.\.\.input,publicChanges,privateChanges:changes\}\)/);
});
test('atomic edit issues a single transaction and verifies receipt, public values and private revisions',async()=>{
 const {saveMaterialSourcingAtomic}=await import('../material-sourcing-public-edit.js');
 const workspace='33333333-3333-4333-8333-333333333333',actor='44444444-4444-4444-8444-444444444444';
 const fresh=detail();fresh.board.workspace_id=workspace;
 const publicChanges=planMaterialSourcingPublicChanges(fresh,id,{brand:'New'});
 fresh.values[0].value='New';
 const calls=[];
 let role='ADMIN',revision=2,receiptCount=1,failWrite=false;
 const auth={isSignedIn:true,userId:actor,getVerifiedUser:async()=>({id:actor})};
 const api={context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>true,board:async()=>fresh,
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_edit_material_atomic'){
    if(failWrite)throw Error('response lost');
    return {item_id:id,public_count:receiptCount,private_count:args.p_private_changes.length};
   }
   if(name==='mrh_sourcing_board_viewer_read')return {'Buying Price':{value:12,revision}};
   throw Error('unexpected RPC');
  }};
 const options={api,auth,workspaceId:workspace,boardId:MATERIAL_SOURCING_BOARD_ID,itemId:id,publicChanges,
  privateChanges:[{fieldName:'Buying Price',value:12,expectedRevision:1}]};
 assert.equal((await saveMaterialSourcingAtomic(options)).persisted['Buying Price'].revision,2);
 assert.equal(calls.filter(([name])=>name==='mrh_edit_material_atomic').length,1);
 assert.deepEqual(calls.find(([name])=>name==='mrh_edit_material_atomic')[1].p_public_changes,
  [{column_id:cols[1].id,value:'New',expected_value:'Brand'}]);
 revision=3;await assert.rejects(()=>saveMaterialSourcingAtomic(options),/readback/);
 revision=2;receiptCount=0;await assert.rejects(()=>saveMaterialSourcingAtomic(options),/receipt/);
 receiptCount=1;failWrite=true;
 const before=calls.filter(([name])=>name==='mrh_edit_material_atomic').length;
 await assert.rejects(()=>saveMaterialSourcingAtomic(options),/response lost/);
 assert.equal(calls.filter(([name])=>name==='mrh_edit_material_atomic').length,before+1);
 failWrite=false;role='VIEWER';
 await saveMaterialSourcingAtomic({...options,privateChanges:[]});
 await assert.rejects(()=>saveMaterialSourcingAtomic(options),/Restricted/);
});
