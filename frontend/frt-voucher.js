/** CP-FRT-FLOW-03 — signed, narrow projection of persisted voucher source records. */
import {ApiError} from './session.js';
import {loadFRTBankExecution} from './frt-bank-execution.js';
import {loadFRTCompanyLogoDataUrl} from './frt-company-profile.js';
import {projectFRTAccountingSnapshot,parseFRTAccountingCents} from './frt-accounting.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const amountPattern=/^\d{1,15}(?:\.\d{1,2})?$/;
const statuses=new Set(['PENDING_APPROVAL','IN_PROGRESS','DONE','BLOCKED','CLOSED','REJECTED']);
const liquidationStatuses=new Set(['NOT_SUBMITTED','SUBMITTED','UNDER_REVIEW','APPROVED','RETURNED']);
const fail=(message,status=409,code='FRT_VOUCHER_UNAVAILABLE')=>new ApiError(message,status,code);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const optionalText=(value,max)=>value===null||value===undefined||value===''||
 (typeof value==='string'&&value.length<=max);
const validTimestamp=value=>typeof value==='string'&&value.length<=80&&Number.isFinite(Date.parse(value));
const cents=value=>{
 if(typeof value!=='string'||!amountPattern.test(value))return null;
 const [whole,fraction='']=value.split('.');
 try{return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}catch{return null;}
};
const validDate=value=>typeof value==='string'&&date.test(value)&&
 !Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export function projectFRTVoucherSnapshot(raw,{workspaceId,requestId,companyCode,
 expectedVoucher,expectedTitle}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  raw.workspaceId!==workspaceId||raw.requestId!==requestId||
  !uuid.test(workspaceId||'')||!uuid.test(requestId||'')||
  !raw.company||raw.company.code!==companyCode||
  !text(raw.company.name,180)||!optionalText(raw.company.taxIdNumber,32)||
  !text(raw.voucherNumber,100)||
  (expectedVoucher&&raw.voucherNumber!==expectedVoucher)||
  !text(raw.title,250)||(expectedTitle&&raw.title!==expectedTitle)||
  !validTimestamp(raw.voucherDate)||!validDate(raw.dateNeeded)||
  !optionalText(raw.department,180)||!optionalText(raw.fundSource,180)||
  !optionalText(raw.description,2500)||!optionalText(raw.payee,250)||
  !optionalText(raw.payeeBank,120)||!statuses.has(raw.requestStatus)||
  !liquidationStatuses.has(raw.liquidationStatus)||
  !optionalText(raw.preparedBy,180)||!validTimestamp(raw.preparedAt)||
  !raw.requestReference||!optionalText(raw.requestReference.orderIntakeNo,150)||
  !optionalText(raw.requestReference.checkNo,80)||
  !Array.isArray(raw.items)||raw.items.length<1||raw.items.length>100||
  typeof raw.reconciled!=='boolean'||typeof raw.itemsTotal!=='string'||
  typeof raw.totalAmount!=='string')return null;

 const total=cents(raw.totalAmount),itemsTotal=cents(raw.itemsTotal);
 if(total===null||itemsTotal===null||itemsTotal!==total||raw.reconciled!==true)return null;
 let sum=0n;
 const items=[];
 for(const item of raw.items){
  if(!item||!optionalText(item.category,180)||!optionalText(item.description,500)||
   typeof item.amount!=='string')return null;
  const amount=cents(item.amount);
  if(amount===null)return null;
  sum+=amount;
  items.push({category:item.category?.trim()||'Uncategorized',description:item.description||'',amount:item.amount});
 }
 if(sum!==total)return null;

 const approval=raw.financeApproval,gm=raw.gmVerification;
 if(!approval||!optionalText(approval.approvedBy,180)||
  !(approval.approvedAt===null||validTimestamp(approval.approvedAt))||
  !gm||!optionalText(gm.verifiedBy,180)||
  !(gm.verifiedAt===null||validTimestamp(gm.verifiedAt))||
  !optionalText(gm.reference,180))return null;

 return {
  workspaceId,requestId,company:{code:raw.company.code,name:raw.company.name,
   address:optionalText(raw.company.address,500)?raw.company.address||null:null,
   phone:optionalText(raw.company.phone,120)?raw.company.phone||null:null,
   email:optionalText(raw.company.email,180)?raw.company.email||null:null,
   taxIdNumber:optionalText(raw.company.taxIdNumber,32)?raw.company.taxIdNumber||null:null,
   logoPath:optionalText(raw.company.logoPath,500)?raw.company.logoPath||null:null},
  voucherNumber:raw.voucherNumber,voucherDate:raw.voucherDate,
  requestReference:{orderIntakeNo:raw.requestReference.orderIntakeNo||'',
   checkNo:raw.requestReference.checkNo||''},
  title:raw.title,department:raw.department||'',fundSource:raw.fundSource||'',
  payee:raw.payee||'',payeeBank:raw.payeeBank||'',dateNeeded:raw.dateNeeded,
  description:raw.description||'',totalAmount:raw.totalAmount,
  requestStatus:raw.requestStatus,liquidationStatus:raw.liquidationStatus,
  preparedBy:raw.preparedBy||null,preparedAt:raw.preparedAt,
  financeApproval:{approvedBy:approval.approvedBy||null,approvedAt:approval.approvedAt},
  gmVerification:{verifiedBy:gm.verifiedBy||null,verifiedAt:gm.verifiedAt,
   reference:gm.reference||''},
  items,reconciliation:{itemsTotal:raw.itemsTotal,totalAmount:raw.totalAmount,balanced:true},
  accounting:projectFRTAccountingSnapshot(raw.accounting||{
   revision:0,lines:[],debitTotal:'0.00',creditTotal:'0.00',
   requestTotalCents:parseFRTAccountingCents(raw.totalAmount),balanced:false
  },{expectedTotal:raw.totalAmount})
 };
}

export async function loadFRTVoucher({auth,api,workspaceId,requestId,companyCode,
 expectedRole,expectedVoucher,expectedTitle,allowedRequestIds}={}){
 if(!auth||!api||!uuid.test(workspaceId||'')||!uuid.test(requestId||'')||
  !/^[A-Za-z0-9_-]{1,32}$/.test(companyCode||'')||
  !Array.isArray(allowedRequestIds)||!allowedRequestIds.includes(requestId))
  throw fail('Voucher request is not in the current signed FRT request list.',403,'FRT_VOUCHER_SCOPE_INVALID');

 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||
  context?.user_id!==user.id||context?.workspace_id!==workspaceId||
  context?.profile?.status!=='active')
  throw fail('Signed FRT session is unavailable.',403,'FRT_VOUCHER_SESSION_INVALID');

 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const membership=bootstrap?.membership;
 if(membership?.user_id!==user.id||membership?.workspace_id!==workspaceId||
  membership?.enabled!==true||membership?.status!=='active'||
  (expectedRole&&membership.role!==expectedRole)||
  !Array.isArray(bootstrap?.companies)||
  !bootstrap.companies.some(company=>company?.code===companyCode))
  throw fail('FRT membership or company context changed. Reopen the request.',403,'FRT_VOUCHER_CONTEXT_CHANGED');

 const raw=await api.rpc('frt_restricted_request_detail',{
  p_workspace_id:workspaceId,p_request_id:requestId
 });
 if(raw?.id!==requestId||raw?.workspace_id!==workspaceId||
  raw?.company_code!==companyCode)
  throw fail('Signed request detail no longer matches the selected request.',409,'FRT_VOUCHER_DETAIL_MISMATCH');
 const companyProfile=bootstrap.companies.find(company=>company?.code===companyCode);
 const voucherSource=raw?.voucher&&typeof raw.voucher==='object'?
  {...raw.voucher,company:{...raw.voucher.company,
   taxIdNumber:companyProfile?.tax_id_number||null}}:raw?.voucher;
 let voucher=projectFRTVoucherSnapshot(voucherSource,{workspaceId,requestId,companyCode,
  expectedVoucher,expectedTitle});
 if(!voucher)throw fail('Persisted voucher details or expense totals failed validation.',409,'FRT_VOUCHER_SNAPSHOT_INVALID');
 if(voucher.company.logoPath){
  const logoDataUrl=await loadFRTCompanyLogoDataUrl({auth,api,workspaceId,companyCode,logoPath:voucher.company.logoPath});
  voucher={...voucher,company:{...voucher.company,logoDataUrl}};
 }

 let bankExecution=null,bankExecutionError='';
 try{
  bankExecution=await loadFRTBankExecution({auth,api,workspaceId,requestId,allowedRequestIds});
 }catch{
  bankExecutionError='Bank execution details are unavailable.';
 }
 if(bankExecution&&bankExecution.recorded&&
  (!validTimestamp(bankExecution.executedAt)||!validTimestamp(bankExecution.deadlineAt)||
   !text(bankExecution.bankName,120)||!text(bankExecution.transactionReference,180)))
  throw fail('Bank execution snapshot is inconsistent.',409,'FRT_VOUCHER_BANK_SNAPSHOT_INVALID');

 const again=await auth.getVerifiedUser(),after=await api.context();
 if(again?.id!==user.id||auth.userId!==user.id||after?.user_id!==user.id||
  after?.workspace_id!==workspaceId||after?.profile?.status!=='active')
  throw fail('FRT session changed while retrieving the voucher.',403,'FRT_VOUCHER_SESSION_CHANGED');

 return {status:'PASS',voucher:{...voucher,bankExecution},bankExecutionError,writesAttempted:0};
}
