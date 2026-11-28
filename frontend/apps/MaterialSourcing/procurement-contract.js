// Candidate client. Not wired into the production route before SQL activation.
import {authorizeMaterialSourcingViewer,authorizeMaterialSourcingItem,revalidateMaterialSourcingSession} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../../material-sourcing-schema-plan.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commands=['create','add_quote','amend_quote','select_quote','link_po','cancel','reopen'];
const currencies=['PHP','USD','EUR'];
const validId=v=>typeof v==='string'&&UUID.test(v);
const fail=message=>{throw Error(message);};
const scope=input=>({...input,boardId:MATERIAL_SOURCING_BOARD_ID});
function revision(value){return Number.isSafeInteger(value)&&value>0;}

// Exact fixed-point arithmetic, no currency conversion or new pricing engine.
// Numeric inputs must be in the candidate's four-decimal domain.
function scaled(value){
 const raw=String(value);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(raw))fail('Invalid quotation number.');
 const [whole,decimal='']=raw.split('.');
 const n=BigInt(whole)*10000n+BigInt(decimal.padEnd(4,'0'));
 if(n>10000000000000n)fail('Quotation number out of range.');
 return n;
}
function formatScaled(n,places){
 const s=n.toString().padStart(places+1,'0');
 return s.slice(0,-places)+'.'+s.slice(-places);
}
export function compareProcurementQuotes(quotes,{asOf}={}){
 if(!Array.isArray(quotes)||quotes.length<2) return {comparable:false,reason:'At least two quotations required.'};
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf))fail('Explicit comparison date required.');
 const first=quotes[0],qty=scaled(first.quantity);
 if(qty===0n||!currencies.includes(first.currency)||!['tax_exclusive','tax_inclusive'].includes(first.tax_basis))
  return {comparable:false,reason:'Quantity, currency or tax basis unavailable.'};
 if(quotes.some(q=>scaled(q.quantity)!==qty||q.currency!==first.currency||
   q.shipping_currency!==first.currency||q.tax_basis!==first.tax_basis||
   typeof q.issued_on!=='string'||typeof q.valid_until!=='string'||q.issued_on>asOf||q.valid_until<asOf))
  return {comparable:false,reason:'Different or expired quotation terms; compare individually.'};
 const totals=quotes.map(q=>({id:q.id,total:scaled(q.unit_price)*qty+scaled(q.shipping_total)*10000n}));
 totals.sort((a,b)=>a.total<b.total?-1:a.total>b.total?1:0);
 return {comparable:true,currency:first.currency,taxBasis:first.tax_basis,
  totals:totals.map(t=>({id:t.id,quotedTotal:formatScaled(t.total,8)}))};
}
function normalizePage(raw,itemId,limit){
 if(raw?.item_id!==itemId||typeof raw.has_more!=='boolean'||!Array.isArray(raw.rows)||raw.rows.length>limit)
  fail('Invalid procurement readback.');
 const seen=new Set();
 for(const row of raw.rows){
  const s=row?.snapshot,key=row?.rfq_id+':'+row?.revision;
  if(!validId(row?.rfq_id)||!revision(row.revision)||seen.has(key)||!s||
    !['open','selected','po_linked','cancelled'].includes(s.status)||!Array.isArray(s.quotes)||s.quotes.length>50)
   fail('Invalid procurement history.');
  seen.add(key);
  const ids=new Set();
  for(const q of s.quotes){
   if(!validId(q.id)||!revision(q.revision)||ids.has(q.id))fail('Invalid quotation identity.');
   ids.add(q.id);
  }
  if(s.selection!=null&&!s.quotes.some(q=>q.id===s.selection.quote_id&&q.revision===s.selection.quote_revision))
   fail('Invalid selected quotation revision.');
 }
 return raw;
}
export async function readProcurement(input,{rfqId=null,beforeRevision=null,limit=50,offset=0}={}){
 const s=scope(input),{api,itemId,isCurrent=()=>true}=s;
 if((rfqId!==null&&!validId(rfqId))||(beforeRevision!==null&&(!rfqId||!revision(beforeRevision)))||
  !Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail('Invalid procurement page.');
 const actor=await authorizeMaterialSourcingViewer(s);
 if(!isCurrent())fail('Material view changed.');
 const raw=await api.rpc('mrh_procurement_read',{p_item:itemId,p_rfq:rfqId,p_before_revision:beforeRevision,p_limit:limit,p_offset:offset});
 await revalidateMaterialSourcingSession(s,actor);
 if(!isCurrent())fail('Material view changed.');
 return normalizePage(raw,itemId,limit);
}
export async function applyProcurementCommand(input,command){
 const s=scope(input),{api,itemId,isCurrent=()=>true}=s;
 if(!validId(command?.rfqId)||!validId(command.operationId)||!commands.includes(command.command)||
  !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
  !command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))fail('Invalid procurement command.');
 const actor=await authorizeMaterialSourcingItem({...s,edit:true});
 if(!isCurrent())fail('Material view changed.');
 // Caller owns the reviewed command and stable operation ID. No auto-retry.
 const receipt=await api.rpc('mrh_procurement_apply',{p_item:itemId,p_rfq:command.rfqId,p_operation:command.operationId,
  p_expected_revision:command.expectedRevision,p_command:command.command,p_payload:command.payload});
 await revalidateMaterialSourcingSession(s,actor);
 if(!isCurrent()||receipt?.rfq_id!==command.rfqId||receipt.operation_id!==command.operationId||
    receipt.revision!==command.expectedRevision+1||typeof receipt.replayed!=='boolean')
  fail('Procurement outcome requires reconciliation. Preserve the operation identifier.');
 const page=await readProcurement(s,{rfqId:command.rfqId,beforeRevision:receipt.revision+1,limit:1});
 const row=page.rows[0];
 if(row?.rfq_id!==command.rfqId||row?.revision!==receipt.revision||row.command!==command.command)
  fail('Procurement receipt readback unavailable. Preserve the operation identifier.');
 return {receipt,row};
}
