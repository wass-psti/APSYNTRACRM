import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemainingNativeSearchAdapters,readNativeSearchRecordDetail,renderNativeSearchRecordDetail} from '../global-search-native-apps.js';
import {createNativeSearchRegistry} from '../global-search-adapters.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const boards=[
 ['tools','Tool Traceability'],['toolbox','Toolbox Issues'],['materials','Material Request Hub'],
 ['evaluation','Employee Evaluation'],['charter','Charter Navigator'],['orders','Order Intake'],['aims','APS AIMS']
].map(([key,name],index)=>({id:`${String(index+1).padStart(8,'0')}-0000-4000-8000-000000000001`,name,status:'active',key}));
const byKey=key=>boards.find(board=>board.key===key);
const ids={tool:'tool-01',request:'request-01',issue:'42',material:'mrh-01',evaluation:'eval-01',charter:'charter-01',order:'order-01',aims:'aims-01',fm1:'44444444-4444-4444-8444-444444444444'};
function makeClients(){
 const calls=[];
 const auth={userId:user,async getVerifiedUser(){calls.push(['verified-user']);return {id:user};},async authorized(path,options={}){
  calls.push(['authorized',path,options]);
  if(path.includes('/rpc/charter_dispatch')){
   return options.body.p_path==='/items/query'?{items:[{id:ids.charter,name:'Pump charter',bookingStatus:'Confirmed',tripDate:'2026-11-20'}]}:
    {id:ids.charter,name:'Pump charter',bookingStatus:'Confirmed'};
  }
  if(path.includes('/order_intake_orders'))return path.includes('id=eq.')?
   [{id:ids.order,workspace_id:workspace,po_number:'PO-PUMP-01',client_name:'Pump client',status:'Open'}]:
   [{id:ids.order,workspace_id:workspace,po_number:'PO-PUMP-01',client_name:'Pump client',status:'Open',company:'PumpCo'}];
  if(path.includes('/aps_aims_entities'))return path.includes('id=eq.')?
   [{id:ids.aims,workspace_id:workspace,entity_type:'asset',payload:{name:'Pump motor',assetTag:'PUMP-01'}}]:
   [{id:ids.aims,workspace_id:workspace,entity_type:'asset',payload:{name:'Pump motor',assetTag:'PUMP-01'}}];
  throw new Error('Unexpected authorized path '+path);
 }};
 const api={async context(){calls.push(['context']);return {user_id:user,workspace_id:workspace,profile:{status:'active'}};},async rpc(name,args){
  calls.push(['rpc',name,args]);
  switch(name){
   case 'fm1_list_tickets_v1':return {items:[{id:ids.fm1,workspace_id:workspace,ticket_number:'FM1-2026-000001',subject:'Pump motor failure',requester_name:'Pump Operator',priority_effective:'P1',status:'New',revision:1,received_at:'2026-11-16T08:00:00Z'}],total:1,limit:20,offset:0};
   case 'fm1_ticket_detail_v1':return {ticket:{id:ids.fm1,workspace_id:workspace,ticket_number:'FM1-2026-000001',subject:'Pump motor failure',status:'New',revision:1,received_at:'2026-11-16T08:00:00Z'},obligations:[],events:[],milestones:[],holds:[],audit:[],conversations:[]};
   case 'tool_traceability_list_tools':return {items:[{id:ids.tool,name:'Pump wrench',category:'Pump tools',itemType:'Tool',availability:'Available'}]};
   case 'tool_traceability_list_requests':return {items:[{id:ids.request,name:'Pump service',reference:'TRC-PUMP-01',requestStatus:'Borrowed',extensionState:'None'}]};
   case 'toolbox_issues_list_issues':return {items:[{id:ids.issue,name:'Pump vibration issue',status:'Open',date:'2026-11-16',person:[]}]};
   case 'material_request_hub_list_requests':return {items:[{id:ids.material,name:'Pump replacement',approvalStatus:'Pending',typeOfRequest:'Project BOM',sourceInventory:'WASS Inventory'}]};
   case 'employee_evaluation_management_snapshot':return {employees:[{id:'employee-1',name:'Pump Operator'}],evaluations:[{id:ids.evaluation,employee_id:'employee-1',period:'2026-Q4',status:'Submitted',overall_score:4.5}]};
   case 'employee_evaluation_my_snapshot':throw Object.assign(new Error('self snapshot unavailable'),{status:403});
   case 'tool_traceability_get_item':return {id:args.p_item_id,name:'Pump wrench',availability:'Available'};
   case 'toolbox_issues_get_issue':return {id:args.p_issue_id,name:'Pump vibration issue',status:'Open'};
   case 'material_request_hub_get_request':return {id:args.p_request_id,name:'Pump replacement',approvalStatus:'Pending'};
   case 'employee_evaluation_my_snapshot':return {evaluations:[]};
   default:throw new Error('Unexpected RPC '+name);
  }
 }};
 return {auth,api,calls};
}

test('registry capacity includes all existing and newly integrated application adapters',()=>{
 const {auth,api}=makeClients();
 const remaining=createRemainingNativeSearchAdapters({auth,api,getBoards:()=>boards});
 const registry=createNativeSearchRegistry([...remaining,...remaining]);
 assert.equal(registry.adapters.length,18);
});

test('all remaining native application adapters search existing records and emit exact native record routes',async()=>{
 const {auth,api,calls}=makeClients();
 const adapters=createRemainingNativeSearchAdapters({auth,api,getBoards:()=>boards});
 assert.equal(adapters.length,9);
 const registry=createNativeSearchRegistry(adapters,{limit:20});
 const result=await registry.search('pump',{userId:user,workspaceId:workspace});
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));
 assert.equal(result.results.length,9);
 assert.equal(calls.filter(call=>call[0]==='context').length,1);
 assert.equal(calls.filter(call=>call[0]==='verified-user').length,1);
 const idsSeen=new Set(result.results.map(row=>row.recordId));
 for(const id of Object.values(ids))assert.ok(idsSeen.has(id),'missing '+id);
 for(const row of result.results){
  if(row.applicationId==='fm1')assert.match(row.href,/^#\/fm1\/ticket\//);
  else if(row.applicationId==='orders')assert.match(row.href,/^#\/order-intake\/all-orders\/record\//);
  else assert.match(row.href,new RegExp('^#/boards/'+row.href.split('/')[2]+'/native/'));
  assert.ok(row.href.includes(encodeURIComponent(row.recordId)));
 }
 assert.ok(calls.some(call=>call[1]==='tool_traceability_list_tools'));
 assert.ok(calls.some(call=>call[1]==='tool_traceability_list_requests'));
 assert.ok(calls.some(call=>call[1]==='toolbox_issues_list_issues'));
 assert.ok(calls.some(call=>call[1]==='material_request_hub_list_requests'));
 assert.ok(calls.some(call=>call[1]==='employee_evaluation_management_snapshot'));
 assert.ok(calls.some(call=>call[1]==='fm1_list_tickets_v1'));
 const fm1Result=result.results.find(row=>row.recordId===ids.fm1);
 assert.equal(fm1Result.href,'#/fm1/ticket/'+ids.fm1);
 assert.ok(calls.some(call=>call[0]==='authorized'&&call[1].includes('/rpc/charter_dispatch')));
 assert.ok(calls.some(call=>call[0]==='authorized'&&call[1].includes('/order_intake_orders')));
 assert.ok(calls.some(call=>call[0]==='authorized'&&call[1].includes('/aps_aims_entities')));
 const material=adapters.find(adapter=>adapter.id==='material-request-hub');
 const multi=await material.read('pump replacement',{userId:user,workspaceId:workspace,limit:20});
 assert.equal(multi.length,1);
 assert.equal(multi[0].id,ids.material);
 assert.ok(calls.filter(call=>call[0]==='rpc'&&call[1]==='material_request_hub_list_requests').length>=4);
});

test('does not add client-side role/profile gates beyond the existing signed application APIs',async()=>{
 const {auth,api}=makeClients();
 api.context=async()=>({user_id:user,workspace_id:workspace});
 const adapters=createRemainingNativeSearchAdapters({auth,api,getBoards:()=>boards});
 const tools=adapters.find(adapter=>adapter.id==='tool-traceability-tools');
 const rows=await tools.read('pump',{userId:user,workspaceId:workspace,limit:20});
 assert.equal(rows.length,1);
 const detail=await readNativeSearchRecordDetail({applicationId:'tools',recordId:ids.tool,
  navigationScope:'tools',auth,api,workspaceId:workspace});
 assert.equal(detail.id,ids.tool);
});

test('native detail readers use the matching existing application detail contracts',async()=>{
 const {auth,api,calls}=makeClients();
 const cases=[
  ['tools',ids.tool,'tools','tool_traceability_get_item'],
  ['tools',ids.request,'requests','tool_traceability_get_item'],
  ['toolbox',ids.issue,'','toolbox_issues_get_issue'],
  ['materials',ids.material,'','material_request_hub_get_request'],
  ['evaluation',ids.evaluation,'','employee_evaluation_management_snapshot'],
  ['charter',ids.charter,'','charter_dispatch'],
  ['orders',ids.order,'','order_intake_orders'],
  ['aims',ids.aims,'','aps_aims_entities'],
  ['fm1',ids.fm1,'','fm1_ticket_detail_v1']
 ];
 for(const [applicationId,recordId,navigationScope] of cases){
  const detail=await readNativeSearchRecordDetail({applicationId,recordId,navigationScope,auth,api,workspaceId:workspace});
  assert.ok(detail&&typeof detail==='object');
  if(applicationId==='evaluation')assert.equal(detail.employeeName,'Pump Operator');
 }
 const toolCall=calls.find(call=>call[1]==='tool_traceability_get_item');
 assert.equal(toolCall[2].p_board,'tools');
 const requestCalls=calls.filter(call=>call[1]==='tool_traceability_get_item');
 assert.equal(requestCalls[1][2].p_board,'requests');
 assert.ok(calls.some(call=>call[0]==='authorized'&&call[1].includes('/rpc/charter_dispatch')&&call[2].body.p_method==='GET'));
 assert.ok(calls.some(call=>call[1]==='fm1_ticket_detail_v1'&&call[2].p_ticket_id===ids.fm1));
});

test('native detail rendering escapes all values and keeps bounded field output',()=>{
 const html=renderNativeSearchRecordDetail({name:'<script>alert(1)</script>',notes:'<img src=x>',huge:'x'.repeat(3000)},
  {escape:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 assert.ok(html.length<4000);
});
