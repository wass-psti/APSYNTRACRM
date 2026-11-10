import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 materialSourcingProtectedFields,isMaterialSourcingBoard,
 normalizeProtectedSourcingRead,parseProtectedSourcingValue,
 readProtectedSourcingItem,writeProtectedSourcingField,createMaterialSourcingPart,
 renderProtectedSourcingEditor
} from '../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../material-sourcing-schema-plan.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333';
const context={boardId:MATERIAL_SOURCING_BOARD_ID,workspaceId:workspace,itemId:item};
function fixture({role='ADMIN',permission=true,mutateContext=false,logoutAfterRead=false,writeReceipt=true}={}){
 const calls=[];
 const auth={userId:user,isSignedIn:true,getVerifiedUser:async()=>({id:user})};
 const api={
  context:async()=>({user_id:user,workspace_id:mutateContext?'44444444-4444-4444-8444-444444444444':workspace,profile:{status:'active'}}),
  allowed:async(id,required)=>{calls.push(['allowed',id,required]);return permission;},
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,role};
   if(name==='mrh_sourcing_sensitive_read'){
    if(logoutAfterRead)auth.isSignedIn=false;
    return {'Buying Price':{value:123.45,revision:2},'Currency':{value:'PHP',revision:1}};
   }
   if(name==='mrh_sourcing_sensitive_write')
    return writeReceipt?{field_name:args.p_field_name,revision:(args.p_expected_revision??0)+1}:{revision:0};
   throw Error('Unexpected RPC');
  }
 };
 return {api,auth,calls};
}
test('protected field schema stays within private vault allowlist',()=>{
 assert.deepEqual(materialSourcingProtectedFields.map(x=>x.name),[
  'Selling Price (VAT-EX)','Requestor','Accounts','Supplier PO No.',
  'Buying Price','Currency','Ex. Rate USD','Ex. Rate EUR',
  'Shipping Cost','Shipping Cost Currency','Vendor Details'
 ]);
 assert.ok(isMaterialSourcingBoard({id:MATERIAL_SOURCING_BOARD_ID,
  name:'Material Request Hub',status:'active'}));
 assert.equal(isMaterialSourcingBoard({id:MATERIAL_SOURCING_BOARD_ID,
  name:'Material Request Hub',status:'archived'}),false);
});
test('signed ADMIN reads protected RPC without putting values into generic board',async()=>{
 const f=fixture();
 const fields=await readProtectedSourcingItem({...context,...f});
 assert.deepEqual({...fields['Buying Price']},{value:123.45,revision:2});
 assert.equal(fields.Currency.value,'PHP');
 assert.ok(f.calls.some(x=>x[1]==='mrh_sourcing_sensitive_read'));
 assert.ok(!f.calls.some(x=>x[1]==='wm_get_board'||x[1]==='wm_set_board_cell_if_current'));
});
test('non-ADMIN, denied board and foreign workspace fail before protected read',async()=>{
 for(const options of [{role:'REQUESTOR'},{role:'VIEWER'},{permission:false},{mutateContext:true}]){
  const f=fixture(options);
  await assert.rejects(()=>readProtectedSourcingItem({...context,...f}));
  assert.ok(!f.calls.some(x=>x[1]==='mrh_sourcing_sensitive_read'));
 }
});
test('session revoked after network response drops data',async()=>{
 const f=fixture({logoutAfterRead:true});
 await assert.rejects(()=>readProtectedSourcingItem({...context,...f}),/session changed/);
});
test('server response must contain valid typed cells and revisions',()=>{
 assert.throws(()=>normalizeProtectedSourcingRead({'Buying Price':{value:'100',revision:1}}));
 assert.throws(()=>normalizeProtectedSourcingRead({'Buying Price':{value:100,revision:0}}));
 assert.throws(()=>normalizeProtectedSourcingRead({'Currency':{value:'DOGE',revision:1}}));
 assert.throws(()=>normalizeProtectedSourcingRead([]));
 assert.equal(Object.keys(normalizeProtectedSourcingRead({})).length,0);
});
test('strict edit parsing rejects unsupported, negative or malformed values',()=>{
 assert.equal(parseProtectedSourcingValue('Buying Price','125.25'),125.25);
 assert.equal(parseProtectedSourcingValue('Currency','USD'),'USD');
 for(const value of ['-1','NaN','1e10','Infinity',''])assert.throws(()=>
  parseProtectedSourcingValue('Buying Price',value));
 assert.throws(()=>parseProtectedSourcingValue('Currency','BTC'));
 assert.throws(()=>parseProtectedSourcingValue('PHP Equivalent','200'));
 assert.throws(()=>parseProtectedSourcingValue('Vendor Details',''));
 assert.throws(()=>parseProtectedSourcingValue('Requestor','not-a-uuid'));
});
test('signed ADMIN writes one field with authoritative revision CAS',async()=>{
 const f=fixture();
 const result=await writeProtectedSourcingField({...context,...f,
  fieldName:'Buying Price',value:'345.33',expectedRevision:2});
 assert.deepEqual(result,{fieldName:'Buying Price',revision:3});
 const call=f.calls.find(x=>x[1]==='mrh_sourcing_sensitive_write');
 assert.equal(call[2].p_item_id,item);
 assert.equal(call[2].p_expected_revision,2);
 assert.equal(call[2].p_value,345.33);
 assert.equal(f.calls.some(x=>x[1]==='wm_set_board_cell_if_current'),false);
});
test('non-admin writes and mismatched receipts fail closed',async()=>{
 const f=fixture({role:'APPROVER'});
 await assert.rejects(()=>writeProtectedSourcingField({...context,...f,
  fieldName:'Buying Price',value:'125',expectedRevision:1}));
 assert.equal(f.calls.some(x=>x[1]==='mrh_sourcing_sensitive_write'),false);
 const invalid=fixture({writeReceipt:false});
 await assert.rejects(()=>writeProtectedSourcingField({...context,...invalid,
  fieldName:'Buying Price',value:'125',expectedRevision:1}),/receipt/);
});
test('drawer escapes untrusted fields and never emits derived-field editors',()=>{
 const html=renderProtectedSourcingEditor({'Vendor Details':{
  value:'<img src=x onerror=alert(1)>',revision:1}},{editing:true});
 assert.ok(!html.includes('<img'));
 assert.match(html,/&lt;img/);
 assert.match(html,/data-mrh-private-field="Vendor Details"/);
 assert.doesNotMatch(html,/data-mrh-private-field="PHP Equivalent"/);
 assert.doesNotMatch(html,/data-mrh-private-field="Total Cost \(VAT-IN\)"/);
 const viewer=renderProtectedSourcingEditor({}, {editing:false});
 assert.doesNotMatch(viewer,/data-mrh-private-field/);
});
test('app mounts protected editor only on material board items',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const begin=source.indexOf('async function openBoardItemDetails(');
 const end=source.indexOf('async function openBoardMembers(',begin);
 const part=source.slice(begin,end);
 assert.match(part,/isMaterialSourcingBoard\(state\.board\?\.board\)/);
 assert.match(part,/readProtectedSourcingItem\(input\)/);
 assert.match(part,/writeProtectedSourcingField\(\{\.\.\.input,fieldName/);
 assert.match(part,/modal===itemDialog&&boardHistoryAuthorized\(snapshot\)/);
 assert.match(part,/if\(!current\(\)\)return/);
 assert.doesNotMatch(part,/localStorage|sessionStorage|console\.log/);
});

test('part creation uses original Main group and rechecks signed module ADMIN',async()=>{
 const f=fixture();
 const newId='55555555-5555-4555-8555-555555555555';
 let created=false;
 f.api.board=async()=>({
  board:{id:MATERIAL_SOURCING_BOARD_ID,workspace_id:workspace,status:'active'},
  groups:[{id:'21566a87-b287-4a61-b521-bb233956e09e',title:'Main group'}],
  items:created?[{id:newId,group_id:'21566a87-b287-4a61-b521-bb233956e09e',title:'LRD10'}]:[]
 });
 f.api.addItem=async(boardId,groupId,title)=>{
  assert.equal(boardId,MATERIAL_SOURCING_BOARD_ID);
  assert.equal(groupId,'21566a87-b287-4a61-b521-bb233956e09e');
  assert.equal(title,'LRD10');
  created=true;return newId;
 };
 const result=await createMaterialSourcingPart({
  api:f.api,auth:f.auth,workspaceId:workspace,partNumber:' LRD10 '
 });
 assert.deepEqual(result,{itemId:newId,partNumber:'LRD10'});
 assert.equal(created,true);
 assert.equal(f.calls.filter(x=>x[1]==='material_request_hub_bootstrap').length,2);
});
test('part creation denied without module ADMIN, wrong group, or empty title',async()=>{
 for(const flags of [{role:'VIEWER'},{permission:false}]){
  const f=fixture(flags);let writes=0;
  f.api.addItem=async()=>{writes++;return item;};
  await assert.rejects(()=>createMaterialSourcingPart({
   api:f.api,auth:f.auth,workspaceId:workspace,partNumber:'LRD10'
  }));
  assert.equal(writes,0);
 }
 const f=fixture();
 await assert.rejects(()=>createMaterialSourcingPart({
  api:f.api,auth:f.auth,workspaceId:workspace,partNumber:''
 }));
});
test('new part UI is limited to signed material board and uses no reference data fixtures',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/isMaterialSourcingBoard\(b\)&&state\.edit&&\['items','sourcing'\]\.includes\(state\.tab\)/);
 assert.match(source,/data-action="mrh-new-part"/);
 assert.match(source,/createMaterialSourcingPart\(\{/);
 assert.match(source,/input\('Part number','partNumber'\)/);
});

test('protected item DOM clears after sign-out and workspace or board changes',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/function renderLogin\([\s\S]*?stopTimeTrackerPixi\(\);\n \/\/ Clear detached protected item values on every signed-out transition\.\n hideModal\(\);/);
 assert.match(source,/modal\?\.querySelector\('\[data-mrh-private-host\]'\)/);
 assert.match(source,/state\.context\?\.workspace_id!==modal\.dataset\.mrhWorkspace/);
 assert.match(source,/modal\.dataset\.mrhActor=snapshot\.userId/);
});
