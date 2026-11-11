import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importChoiceLabels,choiceCreationPreview,
 provisionImportChoiceColumn} from '../board-import-choice-setup.js';
import {initialImportMappings,buildImportPlan} from '../board-import-core.js';
const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const ownerId='33333333-3333-4333-8333-333333333333';
const createdId='44444444-4444-4444-8444-444444444444';
const groupId='55555555-5555-4555-8555-555555555555';
const revision='2026-11-05T08:00:00Z';
const detail={board:{id:boardId,name:'Contacts',workspace_id:workspaceId,status:'active',updated_at:revision},
 columns:[],groups:[{id:groupId,title:'Import'}],items:[],values:[]};
const sheet={headers:['Name','Status'],rows:[
 ['Alpha','Active'],['Beta','Pending'],['Gamma','active'],['Delta','']],
 worksheet:'monday export',rowNumbers:[2,3,4,5]};
const auth={userId:ownerId,getVerifiedUser:async()=>({id:ownerId})};
function fixture(type='status',{permitted=true,updatedAt=revision,workspace=workspaceId}={}){
 const calls=[];
 const config=type==='status'?
  {labels:[{id:'status_active',name:'Active',color:'#4f7df3',active:true},
   {id:'status_pending',name:'Pending',color:'#7f8a9a',active:true}]}:
  {options:['Active','Pending']};
 const updated={...detail,board:{...detail.board,updated_at:'2026-11-05T08:00:02Z'},
  columns:[{id:createdId,name:'Status',data_type:type,
   system_key:null,column_key:'custom:'+createdId,config}]};
 let reads=0;
 const api={
  context:async()=>({user_id:ownerId,workspace_id:workspace,profile:{status:'active'}}),
  board:async()=>{reads++;return reads===1?
   {...detail,board:{...detail.board,updated_at:updatedAt}}:updated;},
  allowed:async()=>permitted,
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='wm_board_ui_read')return {board_id:boardId};
   return {board_id:boardId,action:'create',column_id:createdId,updated_at:updated.board.updated_at};
  }
 };
 return {api,calls,updated};
}
test('missing monday Status is reviewed as an explicit configuration, not an unsupported atomic create',()=>{
 const manager=initialImportMappings(sheet,detail,{canCreate:true});
 assert.equal(manager[0].action,'item');
 assert.equal(manager[1].action,'configure');
 assert.equal(manager[1].choiceType,'status');
 assert.throws(()=>buildImportPlan({sheet,detail,mappings:manager,
  group:{action:'existing',groupId}}),/Invalid or repeated column mapping/);
 const editor=initialImportMappings(sheet,detail,{canCreate:false});
 assert.equal(editor[1].action,'skip');
});
test('choice detection deduplicates case-insensitively while preserving exported labels and blank values',()=>{
 assert.deepEqual(importChoiceLabels(sheet,'Status'),['Active','Pending']);
 assert.deepEqual(choiceCreationPreview({sheet,source:'Status',type:'status',
  detail}),{source:'Status',type:'status',name:'Status',labels:['Active','Pending']});
 assert.deepEqual(choiceCreationPreview({sheet,source:'Status',type:'dropdown',
  detail}).labels,['Active','Pending']);
});
test('choice setup rejects ambiguous and unsafe labels without backend calls',()=>{
 assert.throws(()=>choiceCreationPreview({sheet,source:'Status',type:'formula',detail}),/Only Status or Dropdown/);
 assert.throws(()=>choiceCreationPreview({sheet,source:'Status',type:'status',
  detail:{...detail,columns:[{name:'STATUS'}]}}),/already contains/);
 assert.deepEqual(choiceCreationPreview({sheet,source:'Status',type:'status',
  name:'Imported Status',detail:{...detail,columns:[{name:'STATUS'}]}}).name,
  'Imported Status');
 assert.throws(()=>importChoiceLabels({...sheet,rows:[['A','=HYPERLINK()']]},'Status'),
  /Formula-like option/);
 assert.throws(()=>importChoiceLabels({...sheet,rows:[['A','x'.repeat(81)]]},'Status'),
  /row 2.*exceeds 80/);
 assert.throws(()=>importChoiceLabels({...sheet,rows:[['A','']]},'Status'),
  /at least one nonblank/);
 assert.throws(()=>importChoiceLabels({...sheet,rows:
  Array.from({length:51},(_,i)=>['Item '+i,'Label '+i])},'Status'),/at most 50/);
});
test('signed manager setup uses exactly one audited CAS mutation after active session read',async()=>{
 const {api,calls,updated}=fixture();
 const result=await provisionImportChoiceColumn({
  api,auth,boardId,detail,sheet,source:'Status',type:'status',name:'Status'
 });
 assert.equal(result.columnId,createdId);
 assert.equal(result.detail,updated);
 assert.deepEqual(result.labels,['Active','Pending']);
 assert.deepEqual(calls.map(x=>x.name),['wm_board_ui_read','wm_board_schema_mutate']);
 assert.deepEqual(calls[1].args,{
  p_board_id:boardId,p_expected_updated_at:revision,p_action:'create',
  p_column_id:null,p_name:'Status',p_data_type:'status',
  p_config:{options:['Active','Pending']},p_visible:true,p_confirm_delete:false
 });
});
test('authorized manager can also create configured Dropdown with same signed contract',async()=>{
 const {api,calls}=fixture('dropdown');
 const result=await provisionImportChoiceColumn({api,auth,boardId,detail,
  sheet,source:'Status',type:'dropdown',name:'Status'});
 assert.equal(result.columnId,createdId);
 assert.equal(calls[1].args.p_config.options.length,2);
});
test('denied role, stale revision, and foreign workspace never submit a schema mutation',async()=>{
 for(const options of [{permitted:false},{updatedAt:'2026-11-05T09:00:00Z'},
  {workspace:'99999999-9999-4999-8999-999999999999'}]){
  const {api,calls}=fixture('status',options);
  await assert.rejects(()=>provisionImportChoiceColumn({
   api,auth,boardId,detail,sheet,source:'Status',type:'status',name:'Status'
  }));
  assert.equal(calls.some(x=>x.name==='wm_board_schema_mutate'),false);
 }
});
test('ambiguous configured-column mutation cannot be retried without verifying board state',async()=>{
 for(const mode of ['network','server','receipt','readback']){
  const {api,calls}=fixture();
  let mutations=0,reads=0;
  const originalRpc=api.rpc,originalBoard=api.board;
  api.rpc=async(name,args)=>{
   if(name==='wm_board_schema_mutate'){
    mutations++;
    if(mode==='network')throw new TypeError('Failed to fetch');
    if(mode==='server'){
     const error=new Error('Upstream response lost');error.status=503;throw error;
    }
    if(mode==='receipt')return {action:'create',board_id:boardId,column_id:'invalid'};
   }
   return originalRpc(name,args);
  };
  api.board=async(...args)=>{
   reads++;
   if(mode==='readback'&&reads===2)throw new Error('Lost read-back connection');
   return originalBoard(...args);
  };
  await assert.rejects(()=>provisionImportChoiceColumn({
   api,auth,boardId,detail,sheet,source:'Status',type:'status',name:'Status'
  }),error=>error.schemaOutcomeUncertain===true&&/refresh the board/.test(error.message));
  assert.equal(mutations,1,'one writer call; no blind retry in '+mode);
 }
});
test('definitive schema CAS denial is distinct from an uncertain server outcome',async()=>{
 const {api}=fixture();
 api.rpc=async(name)=>{
  if(name==='wm_board_ui_read')return {board_id:boardId};
  const error=new Error('Board revision is stale');error.status=409;throw error;
 };
 await assert.rejects(()=>provisionImportChoiceColumn({
  api,auth,boardId,detail,sheet,source:'Status',type:'status',name:'Status'
 }),error=>error.status===409&&error.schemaOutcomeUncertain!==true);
});
test('UI integrates manager-only choice setup with a direct explicit create action',()=>{
 const ui=readFileSync('frontend/board-import-ui.js','utf8');
 assert.match(ui,/Configure new Status/);
 assert.match(ui,/Configure new Dropdown/);
 assert.match(ui,/remains available if you cancel the later record import/);
 assert.doesNotMatch(ui,/data-imp-choice-consent/);
 assert.match(ui,/data-imp-choice-create/);
 assert.match(ui,/data-imp-choice-name/);
 assert.match(ui,/provisionImportChoiceColumn/);
 assert.match(ui,/schemaOutcomeUncertain/);
 assert.match(ui,/state\.allowColumns=false;state\.choiceConsent=\{\}/);
});
