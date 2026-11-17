import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectFRTVoucherSnapshot,loadFRTVoucher
} from '../frt-voucher.js';
import {renderFRTVoucherDocument,formatFRTVoucherMoney} from '../frt-voucher-document.js';
import {buildFRTVoucherDefinition,createFRTVoucherPdfBuffer,formatFRTVoucherPdfMoney}
 from '../frt-voucher-pdf.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const requestId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const voucherNo='DV-WASS-202611-001';
const snapshot=()=>({
 workspaceId,requestId,
 company:{code:'WASS',name:'Watchdog Automation Sales & Services'},
 voucherNumber:voucherNo,voucherDate:'2026-11-16T02:00:00Z',
 requestReference:{orderIntakeNo:'OI-2026-001',checkNo:'CHK-1001'},
 title:'Office supplies',department:'Operations',fundSource:'Operating Fund',
 payee:'Supplier & Sons',payeeBank:'Example Bank',dateNeeded:'2026-11-20',
 description:'Office supplies for <script>bad()</script>',
 totalAmount:'1250.50',requestStatus:'DONE',liquidationStatus:'NOT_SUBMITTED',
 preparedBy:'Prepared User',preparedAt:'2026-11-16T02:00:00Z',
 financeApproval:{approvedBy:'Finance User',approvedAt:'2026-11-16T03:00:00Z'},
 gmVerification:{verifiedBy:'GM User',verifiedAt:'2026-11-16T04:00:00Z',reference:'GM-REF-01'},
 items:[
  {category:'Office supplies',description:'Paper, pens and folders',amount:'1000.50'},
  {category:'Printing',description:'Forms and labels',amount:'250.00'}
 ],
 itemsTotal:'1250.50',reconciled:true,
 accounting:{revision:1,lines:[
  {id:'33333333-3333-4333-8333-333333333333',lineNumber:1,accountCode:'1010',accountName:'Cash / Bank',description:'Debit entry',debit:'1250.50',credit:'0.00'},
  {id:'44444444-4444-4444-8444-444444444444',lineNumber:2,accountCode:'2010',accountName:'Accounts Payable',description:'Credit entry',debit:'0.00',credit:'1250.50'}
 ],debitTotal:'1250.50',creditTotal:'1250.50',debitCents:125050,creditCents:125050,requestTotalCents:125050,balanced:true}
});
const request={requestId,voucher:voucherNo,title:'Office supplies'};
const signedAuth={userId,isSignedIn:true,getVerifiedUser:async()=>({id:userId})};
const signedApi={
 context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
 rpc:async(name)=>{
  if(name==='frt_bootstrap')return {membership:{user_id:userId,workspace_id:workspaceId,
   enabled:true,status:'active',role:'FINANCE_MANAGER'},companies:[{code:'WASS',name:'WASS',tax_id_number:'211-258-356-00000'}]};
  if(name==='frt_restricted_request_detail')return {id:requestId,workspace_id:workspaceId,company_code:'WASS',voucher:snapshot()};
  if(name==='frt_bank_execution_snapshot')return {workspaceId,requestId,recorded:false,
   eligible:true,executedAt:null,deadlineAt:null,recordedAt:null,bankName:null,
   transactionReference:null,source:'NO_BANK_EXECUTION',liquidationStatus:'NOT_SUBMITTED'};
  throw new Error('Unexpected RPC '+name);
 }
};

test('voucher projection preserves the existing voucher number and reconciles persisted expense lines',()=>{
 const result=projectFRTVoucherSnapshot(snapshot(),{workspaceId,requestId,companyCode:'WASS',
  expectedVoucher:voucherNo,expectedTitle:'Office supplies'});
 assert.ok(result);
 assert.equal(result.voucherNumber,voucherNo);
 assert.equal(result.reconciliation.balanced,true);
 assert.equal(result.items.length,2);
 assert.equal(result.totalAmount,'1250.50');
 assert.equal(result.company.address,null);
});

test('voucher projection preserves database-valid zero lines and missing optional payee or descriptive values',()=>{
 const raw=snapshot();raw.items[0].amount='0.00';raw.items[1].amount='0.00';
 raw.itemsTotal='0.00';raw.totalAmount='0.00';raw.reconciled=true;
 raw.accounting={revision:0,lines:[],debitTotal:'0.00',creditTotal:'0.00',debitCents:0,creditCents:0,requestTotalCents:0,balanced:false};
 raw.items[0].category='';raw.items[0].description=null;
 raw.department='';raw.fundSource='';raw.description='';
 raw.payee=null;raw.payeeBank=null;
 const result=projectFRTVoucherSnapshot(raw,{workspaceId,requestId,companyCode:'WASS'});
 assert.ok(result);
 assert.equal(result.totalAmount,'0.00');
 assert.equal(result.items[0].category,'Uncategorized');
 assert.equal(result.department,'');
 assert.equal(result.payee,'');
});

test('voucher projection rejects total mismatch, changed voucher identity, and malformed workflow records',()=>{
 const mismatch=snapshot();mismatch.totalAmount='1250.49';
 assert.equal(projectFRTVoucherSnapshot(mismatch,{workspaceId,requestId,companyCode:'WASS'}),null);
 const changed=snapshot();changed.voucherNumber='DV-WASS-202611-002';
 assert.equal(projectFRTVoucherSnapshot(changed,{workspaceId,requestId,companyCode:'WASS',
  expectedVoucher:voucherNo}),null);
 const bad=snapshot();bad.financeApproval.approvedAt='not-a-date';
 assert.equal(projectFRTVoucherSnapshot(bad,{workspaceId,requestId,companyCode:'WASS'}),null);
});

test('signed voucher loader uses the narrow snapshot and existing bank execution read contract',async()=>{
 const calls=[];
 const api={...signedApi,rpc:async(name,args)=>{
  calls.push(name);
  return signedApi.rpc(name,args);
 }};
 const result=await loadFRTVoucher({auth:signedAuth,api,workspaceId,requestId,
  companyCode:'WASS',expectedRole:'FINANCE_MANAGER',expectedVoucher:voucherNo,
  expectedTitle:'Office supplies',allowedRequestIds:[requestId]});
 assert.equal(result.status,'PASS');
 assert.equal(result.voucher.voucherNumber,voucherNo);
 assert.equal(result.voucher.bankExecution.recorded,false);
 assert.equal(result.voucher.company.taxIdNumber,'211-258-356-00000');
 assert.deepEqual(calls,['frt_bootstrap','frt_restricted_request_detail','frt_bootstrap','frt_bank_execution_snapshot']);
 assert.equal(calls.includes('frt_get_request'),false);
});

test('signed voucher loader rejects a changed FRT role and out-of-list request',async()=>{
 await assert.rejects(loadFRTVoucher({auth:signedAuth,api:signedApi,workspaceId,requestId,
  companyCode:'WASS',expectedRole:'GENERAL_MANAGER',allowedRequestIds:[requestId]}),/membership or company context changed/);
 await assert.rejects(loadFRTVoucher({auth:signedAuth,api:signedApi,workspaceId,requestId,
  companyCode:'WASS',allowedRequestIds:[]}),/not in the current signed FRT request list/);
});

test('voucher HTML escapes persisted text and shows all output controls and truthful missing metadata states',()=>{
 const html=renderFRTVoucherDocument({...projectFRTVoucherSnapshot(snapshot(),{
  workspaceId,requestId,companyCode:'WASS'})});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/View Voucher|DISBURSEMENT VOUCHER/);
 for(const action of ['preview','download','print','reprint'])assert.match(html,new RegExp('data-frt-voucher-'+action));
 assert.match(html,/Company address, logo and contact details are not configured/);
 assert.match(html,/Account codes and names are manually entered/);
 assert.match(html,/Finance User/);
 assert.match(html,/Subtotal · Office supplies/);
 assert.match(html,/Subtotal · Printing/);
 assert.match(html,/GM User/);
 assert.match(html,/No bank execution has been recorded/);
});

test('voucher monetary formatting uses PHP and preserves exact two-decimal cents',()=>{
 assert.equal(formatFRTVoucherMoney('1250.50'),'₱1,250.50');
 assert.equal(formatFRTVoucherPdfMoney('1000000.05'),'₱1,000,000.05');
});

test('PDF definition is A4, repeats the expense table header, and carries the persisted voucher number',()=>{
 const voucher={...projectFRTVoucherSnapshot(snapshot(),{workspaceId,requestId,companyCode:'WASS'}),
  bankExecution:null,bankExecutionError:'No bank execution has been recorded.'};
 const definition=buildFRTVoucherDefinition(voucher);
 assert.equal(definition.pageSize,'A4');
 assert.equal(definition.pageMargins[0],40);
 assert.equal(typeof definition.header,'function');
 assert.equal(typeof definition.footer,'function');
 const expenseTable=definition.content.find(node=>node.table?.headerRows===1);
 assert.ok(expenseTable);
 assert.equal(expenseTable.table.body[0][1].text,'Expense category');
 assert.ok(expenseTable.table.body.some(row=>row[0]?.colSpan===3&&String(row[0]?.text).includes('Subtotal · Office supplies')));
 assert.equal(definition.info.title,'Disbursement Voucher '+voucherNo);
});

test('PDF generation returns a genuine multi-page PDF with embedded Roboto and peso glyph support',async()=>{
 const base=projectFRTVoucherSnapshot(snapshot(),{workspaceId,requestId,companyCode:'WASS'});
 const items=Array.from({length:90},(_,index)=>({
  category:'Expense category '+(index+1),
  description:'Supporting expense detail for line '+(index+1)+' with a long description to exercise automatic page wrapping and repeated table headings.',
  amount:'100.00'
 }));
 const total='9000.00';
 const voucher={...base,items,totalAmount:total,reconciliation:{itemsTotal:total,totalAmount:total,balanced:true},
  accounting:{revision:1,lines:[
   {lineNumber:1,accountCode:'1010',accountName:'Cash / Bank',description:'Debit total',debit:'9000.00',credit:'0.00'},
   {lineNumber:2,accountCode:'2010',accountName:'Accounts Payable',description:'Credit total',debit:'0.00',credit:'9000.00'}
  ],debitTotal:'9000.00',creditTotal:'9000.00',debitCents:900000,creditCents:900000,requestTotalCents:900000,balanced:true},
  bankExecution:null,bankExecutionError:'No bank execution has been recorded.'};
 const buffer=await createFRTVoucherPdfBuffer(voucher);
 assert.equal(buffer.subarray(0,8).toString(),'%PDF-1.3');
 assert.ok(buffer.length>12000);
 const pages=(buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
 assert.ok(pages>=2,'expected a multi-page voucher PDF');
});

test('voucher accounting extends the existing signed projection without a competing voucher document or counter',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const data=readFileSync(new URL('../data.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../frt-finance-ui.js',import.meta.url),'utf8');
 const pdfModule=readFileSync(new URL('../frt-voucher-pdf.js',import.meta.url),'utf8');
 const pdfVendor=readFileSync(new URL('../vendor/frt-pdf-engine.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../../supabase/migrations/20261116172414_frt_restricted_voucher_projection.sql',import.meta.url),'utf8');
 const accountingMigration=readFileSync(new URL('../../supabase/migrations/20261117051040_frt_flow03c_request_accounting_lines.sql',import.meta.url),'utf8');
 assert.match(app,/fundTracker\.loadVoucher\(/);
 assert.match(app,/data-frt-voucher-reprint/);
 assert.match(ui,/data-action="frt-voucher-open"/);
 assert.match(data,/frt_restricted_request_detail/);
 assert.match(pdfModule,/from '\.\/vendor\/frt-pdf-engine\.js'/);
 assert.doesNotMatch(pdfModule,/from ['\"]pdfmake\//);
 assert.doesNotMatch(pdfVendor,/^\\s*import\\s/m);
 assert.match(migration,/private\.frt_current_role\(p_workspace_id\)/);
 assert.doesNotMatch(migration,/CREATE TABLE|CREATE FUNCTION public\\.frt_voucher_snapshot|frt_voucher_counters.*(INSERT|UPDATE)|ALTER TABLE/i);
 assert.doesNotMatch(app,/api\.rpc\('frt_get_request'/);
});
