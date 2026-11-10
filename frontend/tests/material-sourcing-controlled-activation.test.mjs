import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardGridColumns} from '../board-grid.js';
import {MATERIAL_SOURCING_ADDITIONS,MATERIAL_SOURCING_EXISTING,
 MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 isMaterialSourcingRestrictedColumn} from '../material-sourcing-schema-plan.js';
import {activateApprovedPublicSourcingColumns,
 MATERIAL_SOURCING_ACTIVATION_ACK} from '../material-sourcing-controlled-activation.js';

const USER='11111111-1111-4111-8111-111111111111';
const WS='22222222-2222-4222-8222-222222222222';
const uuid=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
function fixture({permission=true,groupName='Main group',wrongWorkspace=false,failWrite=false,moduleRole='ADMIN'}={}){
 const columns=MATERIAL_SOURCING_EXISTING.map((f,i)=>({
  id:uuid(i+1),name:f.name,data_type:f.type,position:i,
  column_key:'col_'+i,system_key:null,visible:true
 }));
 const calls=[],auth={isSignedIn:true,userId:USER,getVerifiedUser:async()=>({id:USER})};
 let revision=0; const api={
  allowed:async(id,permissionName)=>{
   calls.push(['allowed',id,permissionName]);return permission;
  },
  context:async()=>({user_id:USER,workspace_id:WS,profile:{status:'active'}}),
  board:async()=>({
   board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',
    status:'active',workspace_id:wrongWorkspace?uuid(77):WS,
    updated_at:new Date(1700000000000+revision*1000).toISOString()},
   groups:[{id:MATERIAL_SOURCING_GROUP.id,title:groupName,position:0}],
   columns:structuredClone(columns)
  }),
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name==='material_request_hub_bootstrap')
    return {workspaceId:WS,role:moduleRole};
   assert.equal(name,'wm_board_schema_mutate');
   if(failWrite)throw Object.assign(new Error('Simulated denied write'),{status:403});
   assert.equal(args.p_action,'create');
   assert.equal(args.p_expected_updated_at,new Date(1700000000000+revision*1000).toISOString());
   const id=uuid(100+columns.length);
   columns.push({id,name:args.p_name,data_type:args.p_data_type,
    position:columns.length,column_key:'custom:'+id,system_key:null,
    visible:true,config:args.p_config});
   ++revision;
   return {board_id:MATERIAL_SOURCING_BOARD_ID,action:'create',
    column_id:id,updated_at:new Date(1700000000000+revision*1000).toISOString()};
  }
 };
 return {auth,api,calls,columns};
}
test('no signed RPC or write without separate activation acknowledgement',async()=>{
 const f=fixture();
 await assert.rejects(()=>activateApprovedPublicSourcingColumns({
  auth:f.auth,api:f.api
 }),/separately approved/);
 assert.deepEqual(f.calls,[]);
});
test('authorized activation creates only ordinary fields via authoritative CAS',async()=>{
 const f=fixture();
 const result=await activateApprovedPublicSourcingColumns({
  ...f,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
 });
 const expected=MATERIAL_SOURCING_ADDITIONS.filter(x=>x.exposure==='ordinary');
 assert.equal(result.status,'PUBLIC_COLUMNS_VERIFIED');
 assert.deepEqual(result.created,expected.map(x=>x.name));
 assert.equal(f.calls.filter(x=>x[0]==='rpc'&&x[1]==='wm_board_schema_mutate').length,expected.length);
 assert.equal(f.columns.length,8+expected.length);
 assert.equal(result.groupName,'Main group');
 assert.equal(f.columns.some(c=>c.name==='Selling Price (VAT-EX)'),false);
 assert.equal(f.columns.some(c=>c.name==='Requestor'),false);
 assert.equal(f.columns.some(c=>c.name==='PHP Equivalent'),false);
 const sourceType=f.calls.find(c=>c[0]==='rpc'&&c[1]==='wm_board_schema_mutate'&&c[2].p_name==='Source Type');
 assert.deepEqual(sourceType[2].p_config,{options:['Local','Import']});
 const again=await activateApprovedPublicSourcingColumns({
  ...f,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
 });
 assert.deepEqual(again.created,[]);
 assert.equal(f.columns.length,8+expected.length);
});
test('denied manager and incorrect authoritative workspace cannot mutate',async()=>{
 for(const flags of [{permission:false},{wrongWorkspace:true},{groupName:'Engineering Services'},{moduleRole:'VIEWER'}]){
  const f=fixture(flags);
  await assert.rejects(()=>activateApprovedPublicSourcingColumns({
   ...f,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
  }));
  assert.equal(f.calls.some(x=>x[0]==='rpc'&&x[1]==='wm_board_schema_mutate'),false);
 }
});
test('denied write is not blindly retried',async()=>{
 const f=fixture({failWrite:true});
 await assert.rejects(()=>activateApprovedPublicSourcingColumns({
  ...f,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
 }));
 assert.equal(f.calls.filter(x=>x[0]==='rpc'&&x[1]==='wm_board_schema_mutate').length,1);
 assert.equal(f.columns.length,8);
});
test('generic board UI never displays restricted sourcing column, even with allowCustom',()=>{
 const columns=[
  {id:uuid(71),name:'Vendor Details',column_key:'custom:a',system_key:null,
   visible:true,data_type:'long_text'},
  {id:uuid(72),name:'Selling Price (VAT-EX)',column_key:'custom:b',
   system_key:null,visible:true,data_type:'number'},
  {id:uuid(73),name:'Brand',column_key:'custom:c',system_key:null,
   visible:true,data_type:'text'}
 ];
 const material={board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub'},columns};
 const names=boardGridColumns(material,{allowCustom:true}).map(x=>x.title);
 assert.ok(names.includes('Brand'));
 assert.ok(!names.includes('Vendor Details'));
 assert.ok(!names.includes('Selling Price (VAT-EX)'));
 assert.equal(isMaterialSourcingRestrictedColumn(material.board,columns[0]),true);
 assert.equal(isMaterialSourcingRestrictedColumn({id:uuid(77)},columns[0]),false);
});
test('private SQL candidate never relaxes generic board read permissions',()=>{
 const sql=readFileSync('sql/mrh-sourcing-sensitive-vault-CANDIDATE-NOT-APPLIED.sql','utf8');
 assert.match(sql,/STAGED CANDIDATE ONLY; NOT APPLIED TO PRODUCTION/);
 assert.match(sql,/private\.mrh_sourcing_sensitive_cells/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/revoke all on private\.mrh_sourcing_sensitive_cells from public, anon, authenticated/);
 assert.match(sql,/private\.material_request_hub_current_role\(v_workspace\)/);
 assert.match(sql,/is distinct from 'ADMIN'/);
 assert.match(sql,/public\.work_board_access\(p_board_id,'view'\)/);
 assert.match(sql,/public\.work_board_access\(p_board_id,'edit'\)/);
 assert.match(sql,/p_expected_revision/);
 assert.match(sql,/on conflict do nothing/);
 assert.match(sql,/revision=p_expected_revision/);
 assert.match(sql,/grant execute on function public\.mrh_sourcing_sensitive_read/);
 assert.doesNotMatch(sql,/create or replace function public\.wm_get_board|alter table public\.work_board_item_values|grant (?:select|all) on private\.mrh_sourcing_sensitive_cells to authenticated/i);
 for(const field of MATERIAL_SOURCING_ADDITIONS.filter(x=>x.derived))
  assert.ok(!sql.includes("'"+field.name+"'"),'computed field must be excluded: '+field.name);
});

test('module bootstrap must confirm role, and not general board manage alone',async()=>{
 const f=fixture({moduleRole:'REQUESTOR'});
 await assert.rejects(()=>activateApprovedPublicSourcingColumns({
  ...f,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
 }),/ADMIN membership/);
 assert.equal(f.columns.length,8);
 assert.equal(f.calls.filter(x=>x[1]==='wm_board_schema_mutate').length,0);
});
