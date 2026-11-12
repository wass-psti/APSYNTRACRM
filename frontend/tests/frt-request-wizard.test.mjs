import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFRTRequestWizard,collectFRTWizardRequest} from '../frt-request-wizard.js';
import {createSignedFRTRequest} from '../frt-filing-workflow.js';
const ws='22222222-2222-4222-8222-222222222222',
 user='11111111-1111-4111-8111-111111111111',
 id='33333333-3333-4333-8333-333333333333';
const companies=[{code:'WASS',name:'Watchdog Automation Sales & Services'},
 {code:'WAO',name:'Watchdog Automation OPC'}];
test('reference wizard exposes 3 semantic stages and only authorized escaped company choices',()=>{
 const html=renderFRTRequestWizard({companies:[...companies,{code:'INVALID<script>',name:'Unsafe'}],selectedCompany:'WASS'});
 for(const text of ['New Fund Request','Basic Info','Recipient','Details','Company Account',
  'Fund Source Account','Date Needed','Expense Categories','Add Category','Check #',
  'Payee / Supplier','Selected Saved Account','Account Name','Bank','Account Number',
  'QR Code','Expense Description','Order / Project No.','On Behalf Of','Not Filed'])
  if(text!=='New Fund Request')assert.ok(html.includes(text),text);
 assert.match(html,/value="WASS" selected/);
 assert.match(html,/data-frt-step="2"[^>]*hidden/);
 assert.match(html,/data-frt-step="3"[^>]*hidden/);
 assert.match(html,/name="expenseCategory" required/);
 assert.match(html,/name="expenseAmount" required/);
 assert.doesNotMatch(html,/INVALID<script>|<script>/);
});
test('no false saved-account or QR upload persistence is advertised',()=>{
 const html=renderFRTRequestWizard({companies,selectedCompany:'WAO'});
 assert.match(html,/Saved accounts not connected/);
 assert.match(html,/QR upload not connected/);
 assert.match(html,/Proxy submission not connected/);
 assert.doesNotMatch(html,/type="file"/);
});
test('form payload maps every category and supported optional field, excluding unsupported controls',()=>{
 const fd=new FormData();
 for(const [key,value] of Object.entries({companyCode:'WASS',requestName:'November supplies',
  department:'Operations',fundSource:'Company funds',dateNeeded:'2026-11-30',
  description:'Project materials purchase',recipientName:'ABC Supplier',
  recipientBank:'Example Bank',recipientAccount:'123456789',
  checkNo:'CHK-101',orderIntakeNo:'OI-101'}))fd.set(key,value);
 fd.append('expenseCategory','Office supplies');fd.append('expenseAmount','180.50');
 fd.append('expenseCategory','Fuel');fd.append('expenseAmount','250');
 const data=collectFRTWizardRequest(fd);
 assert.deepEqual(data.items,[{category:'Office supplies',amount:'180.50'},
  {category:'Fuel',amount:'250'}]);
 assert.equal(data.recipientAccount,'123456789');
 assert.equal(data.orderIntakeNo,'OI-101');
 assert.equal(data.title,'November supplies');
 assert.ok(!('recipientAccountName' in data));
});
test('multi-expense and recipient fields reach original RPC once and verify Not Filed readback',async()=>{
 let payload,createCalls=0;
 const auth={userId:user,async getVerifiedUser(){return {id:user};}};
 const api={async context(){return {user_id:user,workspace_id:ws,profile:{status:'active'}};},
  async rpc(name,args){
   if(name==='frt_bootstrap')return {membership:{workspace_id:ws,user_id:user,role:'GENERAL_MANAGER',
    enabled:true,status:'active'},companies};
   if(name==='frt_create_request'){
    createCalls++;payload=args.p_payload;
    return {id,workspace_id:ws,requestor_id:user,title:payload.title,filing_status:'NOT_FILED'};
   }
   if(name==='frt_board_list_safe')return [{id,filing_status:'NOT_FILED'}];
   throw Error(name);
  }};
 const data={title:'Project expense',department:'Operations',fundSource:'Cash fund',
  description:'Two project categories',dateNeeded:'2026-11-30',recipientName:'Supplier A',
  recipientBank:'Bank A',recipientAccount:'AC123',checkNo:'C001',orderIntakeNo:'OI002',
  items:[{category:'Materials',amount:'120.50'}, {category:'Freight',amount:'180.25'}]};
 const result=await createSignedFRTRequest({auth,api,workspaceId:ws,companyCode:'WASS',
  role:'GENERAL_MANAGER',data});
 assert.equal(result.status,'SAVED');assert.equal(createCalls,1);
 assert.deepEqual(payload.items,[{category:'Materials',amount:120.5},{category:'Freight',amount:180.25}]);
 assert.equal(payload.recipientName,'Supplier A');
 assert.equal(payload.recipientBank,'Bank A');
 assert.equal(payload.recipientAccount,'AC123');
 assert.equal(payload.checkNo,'C001');
 assert.equal(payload.orderIntakeNo,'OI002');
});
test('invalid or excessive expense rows are denied before touching RPC',async()=>{
 let called=0;
 const api={async context(){return{};},async rpc(){called++;}};
 const auth={userId:user,async getVerifiedUser(){return{id:user};}};
 const base={title:'Request',department:'Finance',fundSource:'Cash',
  description:'Office purchase',dateNeeded:'2026-11-30'};
 for(const items of [[],[{category:'',amount:'2'}],
  [{category:'A',amount:'-2'}],[{category:'A',amount:'1.001'}],
  Array.from({length:101},()=>({category:'A',amount:'1'}))]){
  await assert.rejects(()=>createSignedFRTRequest({auth,api,workspaceId:ws,
   companyCode:'WASS',role:'GENERAL_MANAGER',data:{...base,items}}));
 }
 assert.equal(called,0);
});
test('wizard styling and modal integration remain scoped to FRT',()=>{
 const css=readFileSync(new URL('../frt-reference-dashboard.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(css,/\.frt-wizard-backdrop \.frt-wizard-modal/);
 assert.match(css,/\.frt-wizard-page\[hidden\]/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(app,/enhanceFRTRequestWizard\(modal\)/);
 assert.match(app,/collectFRTWizardRequest\(form\)/);
 assert.match(app,/createSignedFRTRequest/);
});
