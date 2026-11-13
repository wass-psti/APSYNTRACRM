/** CP-FRT-WF-02: signed receipt readback and revision-bound submission. */
import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const amount=/^\d{1,12}(?:\.\d{1,2})?$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
const cents=v=>{const [whole,fraction='']=v.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
const money=c=>(c/100n).toString()+'.'+(c%100n).toString().padStart(2,'0');
const err=(message,status=400)=>new ApiError(message,status);
const validDate=v=>date.test(v)&&!Number.isNaN(Date.parse(v))&&
 new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validateFRTReceipts(items){
 if(!Array.isArray(items)||items.length<1||items.length>100)
  throw err('Add between 1 and 100 receipts.');
 let total=0n;
 const parsed=items.map((r,i)=>{
  const description=String(r.description??'').trim();
  const vendor=String(r.vendor??'').trim();
  const orInvoiceNo=String(r.orInvoiceNo??'').trim();
  const receiptDate=String(r.receiptDate??'');
  const value=String(r.amount??'').trim();
  if(!description||description.length>500||vendor.length>250||
   orInvoiceNo.length>150||!validDate(receiptDate)||!amount.test(value)||
   cents(value)<=0n)
   throw err('Receipt '+(i+1)+' requires a valid date, purpose, and positive amount (2 decimals maximum).');
  total+=cents(value);
  if(total>99999999999999n)throw err('Receipt total exceeds supported financial precision.');
  return {description,vendor,orInvoiceNo,receiptDate,amount:money(cents(value))};
 });
 return {items:parsed,total:money(total)};
}
async function signed({auth,api,workspaceId}){
 const user=await auth?.getVerifiedUser();
 const context=await api?.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||
  context?.user_id!==user.id||context?.workspace_id!==workspaceId||
  context?.profile?.status!=='active')
  throw err('Signed financial session is unavailable.',403);
 const boot=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 if(boot?.membership?.user_id!==user.id||boot.membership.workspace_id!==workspaceId||
  boot.membership.status!=='active'||boot.membership.enabled!==true)
  throw err('Fund Tracker membership is not active.',403);
 return user.id;
}
export async function loadFRTLiquidation({auth,api,workspaceId,requestId,allowedRequestIds}){
 if(!uuid.test(workspaceId||'')||!uuid.test(requestId||'')||
  !allowedRequestIds?.includes(requestId))throw err('Request is not in the signed list.',403);
 await signed({auth,api,workspaceId});
 const data=await api.rpc('frt_liquidation_snapshot',{
  p_workspace_id:workspaceId,p_request_id:requestId});
 if(data?.workspaceId!==workspaceId||data?.requestId!==requestId||
  !Array.isArray(data.items)||typeof data.requestedAmount!=='string'||
  typeof data.spentAmount!=='string'||typeof data.remainingAmount!=='string'||
  !['NOT_SUBMITTED','BALANCED','UNLIQUIDATED','OVERAGE_RECORDED'].includes(data.reconciliationState)||
  (data.revision!==null&&typeof data.revision!=='string'))
  throw err('Liquidation readback contract is invalid.',409);
 return data;
}
export async function submitFRTLiquidation({
 auth,api,workspaceId,requestId,allowedRequestIds,snapshot,items,notes='',submissionKey
}){
 if(!uuid.test(workspaceId||'')||!uuid.test(requestId||'')||
  !allowedRequestIds?.includes(requestId)||!uuid.test(submissionKey||'')||
  snapshot?.requestId!==requestId||snapshot?.workspaceId!==workspaceId||
  !snapshot.eligible||typeof notes!=='string'||notes.length>2000)
  throw err('Liquidation is not eligible or submission is invalid.',403);
 const validated=validateFRTReceipts(items);
 await signed({auth,api,workspaceId});
 // The database locks the request and compares revisions atomically.
 // Repeating an acknowledged submission key must bypass a stale client revision.
 let reply;
 try{
  reply=await api.rpc('frt_submit_liquidation_v2',{
   p_workspace_id:workspaceId,p_request_id:requestId,
   p_payload:{...validated,notes,expectedRevision:snapshot.revision,submissionKey}
  });
 }catch(error){
  if(error?.code==='40001'||error?.status===409)throw err('Liquidation changed. Reload before submitting.',409);
  throw error;
 }
 if(reply?.ok!==true||typeof reply.revision!=='string')
  throw err('Liquidation outcome is uncertain. Refresh before retrying.',409);
 const readback=await loadFRTLiquidation({auth,api,workspaceId,requestId,allowedRequestIds});
 const canonical=rows=>rows.map(row=>JSON.stringify({
  description:row.description,receiptDate:row.receiptDate,
  amount:row.amount,vendor:row.vendor||'',orInvoiceNo:row.orInvoiceNo||''
 })).sort();
 if(readback.revision!==reply.revision||readback.spentAmount!==reply.spentAmount||
  JSON.stringify(canonical(readback.items))!==JSON.stringify(canonical(validated.items)))
  throw err('Save acknowledged but readback differs. Refresh before retrying.',409);
 return readback;
}
