import {TRADELINK_MAX_ITEMS,TRADELINK_MAX_PAYLOAD_BYTES,tradeLinkJsonbTextByteLength} from './tradelink/limits.js';
/** CP-TL-FINAL-08 — advisory only, non-mutating source-submit readiness.
 * The signed PostgreSQL RPC is ALWAYS authoritative for actual submission.
 * Never use this preview as a replacement for server validation or permissions.
 */
const TYPES=new Set(['esi','quotation','po','packing','delivery','payment']);
const present=value=>typeof value==='string'&&value.trim().length>0;
const amount=value=>{
 if(typeof value==='number')return Number.isFinite(value)?value:NaN;
 if(typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim()))return Number(value);
 return NaN;
};
export function inspectTradeLinkSubmitReadiness(record){
 const type=record?.document_type;
 if(!TYPES.has(type)||!record.content||typeof record.content!=='object'||
  Array.isArray(record.content))return {ready:false,destination:null,
  missing:['Valid signed document content']};
 const c=record.content,missing=[];
 const need=(ok,label)=>{if(!ok)missing.push(label);};
 need(c.documentType===type&&c.documentNumber===record.document_number,
  'Document type and number consistency');
 need(present(c.customerName),'Customer or supplier name');
 const priced=['esi','quotation','po'].includes(type);
 if(['esi','quotation','po','packing','delivery'].includes(type)){
  need(Array.isArray(c.items)&&c.items.length>=1&&c.items.length<=TRADELINK_MAX_ITEMS&&
   c.items.every(item=>item&&present(item.description)&&
    amount(item.quantity)>0&&(!priced||amount(item.unitPrice)>0)),
   'Valid line items (description, positive quantity'+(priced?' and unit price':'')+')');
 }
 need(tradeLinkJsonbTextByteLength(c)<=TRADELINK_MAX_PAYLOAD_BYTES,
  'Document payload within 2 MiB capacity');
 if(['packing','delivery'].includes(type))
  need(present(c.referenceNumber),'Shipment reference number');
 if(type==='delivery'){
  need(present(c.checkedBy),'Checked by');
  need(present(c.deliveredBy),'Delivered by');
 }
 if(type==='esi'){
  need(present(c.customerTin),'Customer TIN');
  need(present(c.verifiedBy),'Verified by');
  need(present(c.approvedBy),'Intended approver');
 }
 if(type==='quotation'){
  need(present(c.customerEmail)||present(c.customerPhone),'Customer contact');
  need(present(c.validity),'Quotation validity');
  need(present(c.deliveryCommitment),'Delivery commitment');
  need(present(c.paymentTerms),'Payment terms');
  need(present(c.approvedBy),'Intended approver');
 }
 if(type==='po'){
  need(present(c.targetDeliveryDate),'Target delivery date');
  need(present(c.paymentTerms),'Payment terms');
  need(present(c.verifiedBy),'Verified by');
  need(present(c.approvedBy),'Intended approver');
 }
 if(type==='payment'){
  const cash=amount(c.cashAmount??0),cheque=amount(c.chequeAmount??0);
  need(present(c.paymentParticulars),'Payment particulars');
  need(present(c.receivedBy),'Received by');
  need(present(c.verifiedBy),'Verified by');
  need(Number.isFinite(cash)&&Number.isFinite(cheque)&&cash+cheque>0,
   'Positive cash or cheque amount');
  if(cheque>0){
   need(present(c.bankName),'Cheque bank');
   need(present(c.chequeNumber),'Cheque number');
  }
 }
 return {ready:missing.length===0,
  destination:type==='packing'?'completed':'submitted',missing};
}

/** Status text intentionally includes no document field values or private data. */
export function summarizeTradeLinkSubmitReadiness(record){
 const report=inspectTradeLinkSubmitReadiness(record);
 if(report.ready)return 'Read-only Submit preflight: source-required fields appear complete. Expected destination: '+
  report.destination+'. This does not change the document; the signed server validates submission.';
 return 'Read-only Submit preflight: review '+report.missing.join(', ')+
  '. No changes were saved. The signed server remains authoritative.';
}
