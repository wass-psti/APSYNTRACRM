import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 MRH_APPLICATION_ROUTE,materialRequestHubHref,parseMaterialRequestHubRoute
} from '../apps/MaterialRequestHub/route.js';
import {
 MaterialRequestHubClient,normalizeMaterialRequestRow,
 normalizeMaterialRequestBootstrap,normalizeMaterialRequestPage,materialRequestDraft
} from '../apps/MaterialRequestHub/client.js';
import {renderMaterialRequestHub} from '../apps/MaterialRequestHub/ui.js';

const user='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const request='mrh-33333333-3333-4333-8333-333333333333';
const row={id:request,name:'Equipment spare parts',approvalStatus:'⏳ Pending',
 version:2,creator:{id:user,name:'Employee'},sourceInventory:['WASS Inventory'],
 typeOfRequest:['Client PO'],typeOfInvoice:['Sales Invoice'],createdAt:'2026-11-12T00:00:00Z',
 releasedDate:null,requestedQty:5,remarks:'Operational test'};
function fixture({role='ADMIN',workspaceChanged=false,version=2}={}){
 const calls=[];
 const auth={isSignedIn:true,userId:user,getVerifiedUser:async()=>({id:user})};
 const api={
  context:async()=>({user_id:user,workspace_id:workspaceChanged?
   '44444444-4444-4444-8444-444444444444':workspace,profile:{status:'active'}}),
  rpc:async(name,args,options={})=>{
   calls.push({name,args,options});
   if(name==='material_request_hub_bootstrap')return {workspaceId:workspace,user:{id:user,name:'Employee'},
    role,capabilities:role==='ADMIN'?['view','create','edit','approve','reject','release','comment']:
     role==='APPROVER'?['view','approve','reject']:['view']};
   if(name==='material_request_hub_get_request')return {...row,version};
   if(name==='material_request_hub_list_requests')return {items:[row],cursor:null};
   if(name==='material_request_hub_aggregates')return [];
   if(name==='material_request_hub_approve_request')return {...row,approvalStatus:'✅ Approved',version:3};
   throw new Error('Unexpected RPC '+name);
  }
 };
 return {api,auth,calls,client:new MaterialRequestHubClient({auth,api,userId:user,workspaceId:workspace})};
}
test('Material Request Hub route is a dedicated CRM app, with bounded request deep links',()=>{
 assert.equal(MRH_APPLICATION_ROUTE,'#/material-request-hub');
 assert.equal(materialRequestHubHref('overview'),'#/material-request-hub/overview');
 assert.equal(materialRequestHubHref('requests',request),'#/material-request-hub/requests/'+request);
 assert.equal(parseMaterialRequestHubRoute(['material-request-hub']).section,'overview');
 assert.equal(parseMaterialRequestHubRoute(['material-request-hub','approvals']).section,'approvals');
 assert.equal(parseMaterialRequestHubRoute(['material-request-hub','requests',request]).requestId,request);
 assert.equal(parseMaterialRequestHubRoute(['material-request-hub','requests','%2Funsafe']),null);
 assert.equal(parseMaterialRequestHubRoute(['boards']),null);
});
test('Material Request Hub role and row contracts fail closed for mismatched scope or malformed data',()=>{
 assert.equal(normalizeMaterialRequestRow(row).status,'pending');
 assert.equal(normalizeMaterialRequestPage({items:[row],cursor:'25'}).cursor,'25');
 assert.throws(()=>normalizeMaterialRequestPage({items:[row,row],cursor:null}),/duplicate/);
 assert.throws(()=>normalizeMaterialRequestRow({...row,approvalStatus:'invalid'}),/invalid request/);
 assert.throws(()=>normalizeMaterialRequestBootstrap({workspaceId:workspace,role:'ADMIN',
   capabilities:['view'],user:{id:'wrong'}},{userId:user,workspaceId:workspace}));
 assert.throws(()=>normalizeMaterialRequestBootstrap({workspaceId:workspace,role:'ADMIN',
   capabilities:['admin'],user:{id:user}},{userId:user,workspaceId:workspace}));
});
test('client executes existing signed SQL RPCs with scope checks and no independent backend',async()=>{
 const f=fixture();
 const bootstrap=await f.client.bootstrap();
 assert.equal(bootstrap.role,'ADMIN');
 const page=await f.client.list({section:'approvals'});
 assert.equal(page.items[0].id,request);
 assert.deepEqual(f.calls.find(c=>c.name==='material_request_hub_list_requests').args,{
  p_workspace_id:workspace,p_where:{approvalStatus:['⏳ Pending']},
  p_sort:{},p_limit:25,p_cursor:null
 });
 assert.ok(f.calls.every(c=>c.args.p_workspace_id===workspace));
 assert.equal(f.calls.find(c=>c.name==='material_request_hub_list_requests').options.requestKind,'read');
 const foreign=fixture({workspaceChanged:true});
 await assert.rejects(()=>foreign.client.list(),/workspace changed/);
 assert.equal(foreign.calls.length,0);
});
test('approval uses a fresh exact read and expected-version CAS; denied role makes no write',async()=>{
 const f=fixture();
 const approved=await f.client.decide('approve',request,2);
 assert.equal(approved.id,request);
 const mutation=f.calls.find(c=>c.name==='material_request_hub_approve_request');
 assert.equal(mutation.args.p_expected_version,2);
 assert.equal(mutation.options.requestKind,'mutation');
 const stale=fixture({version:3});
 await assert.rejects(()=>stale.client.decide('approve',request,2),/changed/);
 assert.equal(stale.calls.some(c=>c.name==='material_request_hub_approve_request'),false);
 const viewer=fixture({role:'VIEWER'});
 await assert.rejects(()=>viewer.client.decide('approve',request,2),/not permitted/);
 assert.equal(viewer.calls.some(c=>c.name==='material_request_hub_approve_request'),false);
});
test('request form validation preserves standalone field names but does not import local demo records',()=>{
 assert.deepEqual(materialRequestDraft({name:'Stock request',typeOfRequest:'Client PO',
  sourceInventory:'IFAB',typeOfInvoice:'No Invoice',requestedQty:'2.5',remarks:''}),{
   name:'Stock request',typeOfRequest:'Client PO',sourceInventory:'IFAB',
   typeOfInvoice:'No Invoice',requestedQty:2.5,remarks:''
  });
 assert.throws(()=>materialRequestDraft({name:' ',requestedQty:'1'}),/name/);
 assert.throws(()=>materialRequestDraft({name:'A',requestedQty:'-3'}),/nonnegative/);
 assert.throws(()=>materialRequestDraft({name:'A',sourceInventory:'FAKE'}),/Invalid/);
});
test('source-aligned native UI exposes real workflow views and never fabricates operational records',()=>{
 const denied=renderMaterialRequestHub();
 assert.match(denied,/Signed access required/);
 assert.doesNotMatch(denied,/DEMO-REQ-|Alex P\.|Local Test/);
 const access={role:'ADMIN',userId:user,userName:'Employee',
  capabilities:['view','create','edit','approve','reject','release','comment']};
 const ui=renderMaterialRequestHub({access,section:'requests',items:[normalizeMaterialRequestRow(row)]});
 for(const label of ['Overview','New Request','All Requests','Approvals','Release'])
  assert.ok(ui.includes(label));
 assert.match(ui,/Material Request Hub application/);
 assert.match(ui,/href="#\/material-request-hub\/requests\/mrh-/);
 assert.doesNotMatch(ui,/DEMO-REQ-|Local Test|server\/data\/db\.json/);
 const pending=renderMaterialRequestHub({access,section:'approvals',items:[normalizeMaterialRequestRow(row)]});
 assert.match(pending,/data-mrh-decision="approve"/);
 const viewer=renderMaterialRequestHub({access:{...access,role:'VIEWER',capabilities:['view']},
  section:'approvals',items:[normalizeMaterialRequestRow(row)]});
 assert.doesNotMatch(viewer,/data-mrh-decision="approve"/);
});
test('host integration stays separate from Material Sourcing board and uses existing CRM session',()=>{
 const host=readFileSync('frontend/app.js','utf8');
 const module=readFileSync('frontend/apps/MaterialRequestHub/index.js','utf8');
 const client=readFileSync('frontend/apps/MaterialRequestHub/client.js','utf8');
 const html=readFileSync('index.html','utf8');
 const data=readFileSync('frontend/data.js','utf8');
 assert.match(host,/sidebarNav\(MRH_APPLICATION_ROUTE,'Material Request Hub'/);
 assert.match(host,/parseMaterialRequestHubRoute\(parts\)/);
 assert.match(host,/mountMaterialRequestHubApplication/);
 assert.match(module,/MaterialRequestHubClient/);
 assert.match(client,/material_request_hub_bootstrap/);
 assert.match(client,/material_request_hub_list_requests/);
 assert.match(client,/material_request_hub_approve_request/);
 assert.match(client,/material_request_hub_release_request/);
 assert.match(data,/material_request_hub_aggregates/);
 assert.match(html,/apps\/MaterialRequestHub\/material-request-hub.css/);
 assert.doesNotMatch(module,/new AuthClient|localStorage|DEMO-REQ|server\/data\/db/);
});
