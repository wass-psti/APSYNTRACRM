import test from 'node:test';
import assert from 'node:assert/strict';
import {
 projectFRTICSnapshot,createFRTICObligation,recordFRTICSettlement
} from '../frt-intercompany-client.js';

const workspace='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-00000000000b';
const id1='44444444-4444-4444-8444-444444444441';
const id2='44444444-4444-4444-8444-444444444442';
const id3='44444444-4444-4444-8444-444444444443';
const companies=[
 {id:'044fe766-cd40-41ba-8bc5-e47f4cae8a8e',code:'WAO',name:'Watchdog Automation OPC'},
 {id:'9b5fad85-97fa-47ea-95c8-182d0a511892',code:'WASS',name:'Watchdog Automation Sales & Services'},
 {id:'09ec5c72-4297-4c35-96d0-96557193bc93',code:'PSTI',name:'Process Solutions Technology Inc.'}
];
const matrix=(pairs,transpose=false)=>companies.flatMap(row=>companies.map(column=>{
 const creditor=transpose?column.code:row.code;
 const debtor=transpose?row.code:column.code;
 return {row_company_code:row.code,column_company_code:column.code,
  amount:pairs[creditor+'|'+debtor]||'0.00'};
}));
function snapshot(){
 const receivablePairs={'WAO|WASS':'600000.00','PSTI|WAO':'250000.00'};
 const payablesPairs={'WAO|WASS':'600000.00','PSTI|WAO':'250000.00'};
 return {workspace_id:workspace,as_of_date:'2026-11-13',companies:companies.map(c=>({...c})),
  entities:[
   {company_code:'WAO',company_name:companies[0].name,receivables:'600000.00',payables:'250000.00',net_position:'350000.00'},
   {company_code:'WASS',company_name:companies[1].name,receivables:'0.00',payables:'600000.00',net_position:'-600000.00'},
   {company_code:'PSTI',company_name:companies[2].name,receivables:'250000.00',payables:'0.00',net_position:'250000.00'}
  ],
  receivables_matrix:matrix(receivablePairs),
  payables_matrix:matrix(payablesPairs,true),
  summary:{total_receivables:'850000.00',total_payables:'850000.00',
   net_intercompany_position:'0.00',active_obligation_count:2,active_loan_count:1,
   active_loan_balance:'600000.00',overdue_count:1,due_soon_count:0,
   high_exposure_pair_count:1,exposure_threshold:'500000.00',
   ledger_balanced:true,ledger_balance_basis:'BILATERAL_SINGLE_SOURCE'},
  obligations:[
   {id:id1,reference:'IC01-LOAN-001',kind:'LOAN',creditor_code:'WAO',debtor_code:'WASS',
    description:'Intercompany loan',principal_amount:'600000.00',settled_amount:'0.00',
    outstanding_amount:'600000.00',issued_on:'2026-09-14',due_on:'2026-11-03',
    created_at:'2026-09-14T00:00:00Z',risk_status:'OVERDUE'},
   {id:id2,reference:'IC01-REC-001',kind:'RECEIVABLE',creditor_code:'PSTI',debtor_code:'WAO',
    description:'Intercompany receivable',principal_amount:'250000.00',settled_amount:'0.00',
    outstanding_amount:'250000.00',issued_on:'2026-10-24',due_on:'2026-12-28',
    created_at:'2026-10-24T00:00:00Z',risk_status:'CURRENT'}
  ],
  loans:[
   {id:id1,reference:'IC01-LOAN-001',lender_code:'WAO',borrower_code:'WASS',
    original_amount:'600000.00',settled_amount:'0.00',outstanding_balance:'600000.00',
    issue_date:'2026-09-14',maturity_date:'2026-11-03',days_outstanding:60,
    days_to_maturity:-10,risk_status:'OVERDUE'}
  ],
  disclosure:'Receivables and payables are opposite sides of the same recorded obligation. Internal balance is not external counterparty confirmation.'
 };
}
function afterCreateSnapshot(payload){
 const result=snapshot();
 result.entities=[
  {company_code:'WAO',company_name:companies[0].name,receivables:'125000.00',payables:'0.00',net_position:'125000.00'},
  {company_code:'WASS',company_name:companies[1].name,receivables:'0.00',payables:'125000.00',net_position:'-125000.00'},
  {company_code:'PSTI',company_name:companies[2].name,receivables:'0.00',payables:'0.00',net_position:'0.00'}
 ];
 result.receivables_matrix=matrix({'WAO|WASS':'125000.00'});
 result.payables_matrix=matrix({'WAO|WASS':'125000.00'},true);
 Object.assign(result.summary,{total_receivables:'125000.00',total_payables:'125000.00',
  active_obligation_count:1,active_loan_count:0,active_loan_balance:'0.00',
  overdue_count:0,high_exposure_pair_count:0});
 result.loans=[];
 result.obligations=[{id:id3,reference:payload.reference,kind:payload.kind,
  creditor_code:payload.creditorCode,debtor_code:payload.debtorCode,
  description:payload.description||'',principal_amount:payload.amount,
  settled_amount:'0.00',outstanding_amount:payload.amount,
  issued_on:payload.issuedOn,due_on:payload.dueOn,
  created_at:'2026-11-13T00:00:00Z',risk_status:'NO_MATURITY'}];
 return result;
}
function afterSettlementSnapshot(){
 const result=snapshot();
 Object.assign(result.entities[0],{receivables:'400000.00',net_position:'150000.00'});
 Object.assign(result.entities[1],{payables:'400000.00',net_position:'-400000.00'});
 result.receivables_matrix=matrix({'WAO|WASS':'400000.00','PSTI|WAO':'250000.00'});
 result.payables_matrix=matrix({'WAO|WASS':'400000.00','PSTI|WAO':'250000.00'},true);
 Object.assign(result.summary,{total_receivables:'650000.00',total_payables:'650000.00',
  active_loan_balance:'400000.00',high_exposure_pair_count:0});
 Object.assign(result.obligations[0],{settled_amount:'200000.00',outstanding_amount:'400000.00'});
 Object.assign(result.loans[0],{settled_amount:'200000.00',outstanding_balance:'400000.00'});
 return result;
}
function signedApi(role='FINANCE_MANAGER',{readbackError=false,staleReadback=false}={}){

 const calls=[];
 const auth={userId:user,getVerifiedUser:async()=>({id:user})};
 let lastWrite=null;
 const api={
  context:async()=>({user_id:user,workspace_id:workspace,profile:{status:'active'}}),
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{workspace_id:workspace,user_id:user,
    role,enabled:true,status:'active'},companies};
   if(name==='frt_ic_create_obligation'){lastWrite={type:'create',payload:args.p_payload};return {ok:true,id:id3,reference:args.p_payload.reference};}
   if(name==='frt_ic_record_settlement'){lastWrite={type:'settle',payload:args.p_payload};return {ok:true,id:id3,
    obligation_id:args.p_obligation_id,remaining_amount:'400000.00'};}
   if(name==='frt_ic_snapshot'){
    if(readbackError)throw Error('Temporarily unavailable');
    if(staleReadback)return snapshot();
    return lastWrite?.type==='create'?afterCreateSnapshot(lastWrite.payload):afterSettlementSnapshot();
   }
   throw new Error('Unexpected RPC '+name);
  }
 };
 return {auth,api,calls};
}

test('CP-FRT-IC-01 projects a signed bilateral snapshot and preserves negative entity net positions',()=>{
 const projected=projectFRTICSnapshot(snapshot(),workspace,companies);
 assert.ok(projected);
 assert.equal(projected.entities.find(x=>x.companyCode==='WASS').netPosition,'-600000.00');
 assert.equal(projected.summary.totalReceivables,'850000.00');
 assert.equal(projected.loans[0].riskStatus,'OVERDUE');
 assert.equal(projected.receivablesMatrix.find(x=>x.rowCompanyCode==='WAO'&&x.columnCompanyCode==='WASS').amount,'600000.00');
});

test('CP-FRT-IC-01 rejects cross-workspace, unrostered company and asymmetric matrix payloads',()=>{
 assert.equal(projectFRTICSnapshot(snapshot(),'00000000-0000-4000-8000-000000000002',companies),null);
 const unknown=snapshot();unknown.companies[2]={...unknown.companies[2],code:'OTHER'};
 assert.equal(projectFRTICSnapshot(unknown,workspace,companies),null);
 const asymmetric=snapshot();
 asymmetric.payables_matrix.find(x=>x.row_company_code==='WASS'&&x.column_company_code==='WAO').amount='1.00';
 assert.equal(projectFRTICSnapshot(asymmetric,workspace,companies),null);
});

test('CP-FRT-IC-01 rejects invalid signed dates and unbalanced entity totals',()=>{
 const invalidDate=snapshot();
 invalidDate.obligations[0].issued_on='2026-02-31';
 assert.equal(projectFRTICSnapshot(invalidDate,workspace,companies),null);
 const unbalanced=snapshot();
 unbalanced.entities[0].net_position='349999.99';
 assert.equal(projectFRTICSnapshot(unbalanced,workspace,companies),null);
});

test('CP-FRT-IC-01 creates a real ledger obligation using the existing finance role and signed scope',async()=>{
 const {auth,api,calls}=signedApi();
 const receipt=await createFRTICObligation({auth,api,workspaceId:workspace,payload:{
  kind:'RECEIVABLE',reference:'IC-REAL-001',creditorCode:'WAO',debtorCode:'WASS',
  amount:'125000.00',issuedOn:'2026-11-13',dueOn:'',description:'Source invoice'
 }});
 assert.equal(receipt.ok,true);
 const write=calls.find(x=>x.name==='frt_ic_create_obligation');
 assert.ok(write);
 assert.equal(write.args.p_payload.dueOn,null);
 assert.equal(calls.filter(x=>x.name==='frt_bootstrap').length,1);
 assert.equal(calls.filter(x=>x.name==='frt_ic_snapshot').length,1);
});

test('CP-FRT-IC-01 does not add finance write capability to the existing REQUESTOR role',async()=>{
 const {auth,api,calls}=signedApi('REQUESTOR');
 await assert.rejects(()=>createFRTICObligation({auth,api,workspaceId:workspace,payload:{
  kind:'RECEIVABLE',reference:'IC-REQ-001',creditorCode:'WAO',debtorCode:'WASS',
  amount:'10.00',issuedOn:'2026-11-13'
 }}),/existing FRT finance role/);
 assert.equal(calls.some(x=>x.name==='frt_ic_create_obligation'),false);
});

test('CP-FRT-IC-01 records partial settlements through the signed RPC and rechecks session',async()=>{
 const {auth,api,calls}=signedApi();
 const receipt=await recordFRTICSettlement({auth,api,workspaceId:workspace,
  obligationId:id1,payload:{amount:'200000.00',settledOn:'2026-11-13',
   reference:'IC-SET-001',notes:'Verified payment record'}});
 assert.equal(receipt.remaining_amount,'400000.00');
 assert.equal(calls.filter(x=>x.name==='frt_ic_record_settlement').length,1);
 assert.equal(calls.filter(x=>x.name==='frt_bootstrap').length,1);
 assert.equal(calls.filter(x=>x.name==='frt_ic_snapshot').length,1);
});

test('CP-FRT-IC-01 rejects malformed client-side ledger payloads before RPC writes',async()=>{
 const {auth,api,calls}=signedApi();
 await assert.rejects(()=>createFRTICObligation({auth,api,workspaceId:workspace,payload:{
  kind:'LOAN',reference:'IC-BAD-001',creditorCode:'WAO',debtorCode:'WAO',
  amount:'10.00',issuedOn:'2026-02-31',dueOn:'2026-11-20'
 }}),/valid amount, date/);
 assert.equal(calls.some(x=>x.name==='frt_ic_create_obligation'),false);
});

test('CP-FRT-IC-01B an acknowledged creation without readable persistence is not called verified',async()=>{
 const {auth,api,calls}=signedApi('FINANCE_MANAGER',{readbackError:true});
 await assert.rejects(()=>createFRTICObligation({auth,api,workspaceId:workspace,payload:{
  kind:'RECEIVABLE',reference:'IC-REAL-001',creditorCode:'WAO',debtorCode:'WASS',
  amount:'125000.00',issuedOn:'2026-11-13',dueOn:'',description:'Source invoice'
 }}),/write was acknowledged, but persistence could not be verified/);
 assert.equal(calls.filter(x=>x.name==='frt_ic_create_obligation').length,1);
});

test('CP-FRT-IC-01B stale settlement readback is rejected without repeating the write',async()=>{
 const {auth,api,calls}=signedApi('FINANCE_MANAGER',{staleReadback:true});
 await assert.rejects(()=>recordFRTICSettlement({auth,api,workspaceId:workspace,
  obligationId:id1,payload:{amount:'200000.00',settledOn:'2026-11-13',
   reference:'IC-SET-001',notes:'Payment reference'}}),/remaining balance could not be confirmed/);
 assert.equal(calls.filter(x=>x.name==='frt_ic_record_settlement').length,1);
});
