import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';
import { previewOrderFinancials } from './order-intake-projections.js';

export const ORDER_CURRENCIES = Object.freeze(['PHP','USD','EUR']);
const fields = [
 ['poNumber','po_number','PO number',240],['clientName','client_name','Client name',240],
 ['poDate','po_date','PO date'],['dateReceived','date_received','Date received'],['deliveryDate','delivery_date','Delivery date'],
 ['company','company','Company',240],['industry','industry','Industry',240],
 ['accountManager','account_manager','Account manager',240],['buyerInCharge','buyer_in_charge','Buyer in charge',1000],
 ['endUserInCharge','end_user_in_charge','End user in charge',1000],['currency','currency','Currency'],
 ['poAmount','po_amount','PO amount (VAT-inclusive)'],['vatRate','vat_rate','VAT rate (%)'],
 ['procurementExpenses','procurement_expenses','Procurement expenses'],
 ['status','status','Status'],['notes','notes','Notes',12000]
];
const required = new Set(['poNumber','clientName','company','industry']);
const dates = new Set(['poDate','dateReceived','deliveryDate']);
const money = new Set(['poAmount','procurementExpenses']);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function nativeEditable(row) {
 return row?.record_kind==='native' && row.archived===false && Number.isSafeInteger(row.revision) && row.revision>0;
}
export function orderEditorDraft(row=null) {
 if(row&&!nativeEditable(row))throw new Error('Historical orders retain their original source data.');
 if(row)return Object.fromEntries(fields.map(([key,column])=>[key,String(row[column]??'')]));
 return {poNumber:'',clientName:'',poDate:'',dateReceived:'',deliveryDate:'',company:'',industry:'',
  accountManager:'',buyerInCharge:'',endUserInCharge:'',currency:'PHP',poAmount:'',vatRate:'12',
  procurementExpenses:'0.00',status:'Working on it',notes:''};
}
function validDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateOrderDraft(draft) {
 const order={};
 for(const [key,,label,max] of fields) {
  const value=String(draft[key]??'').trim();
  if(required.has(key)&&!value)throw new Error(label+' is required.');
  if(max&&value.length>max)throw new Error(label+' is too long.');
  if(dates.has(key)&&!validDate(value))throw new Error('Enter a valid '+label.toLowerCase()+'.');
  if(money.has(key)&&(!/^\d{1,16}(?:\.\d{1,2})?$/.test(value)||BigInt(value.split('.')[0])===9999999999999999n&&/[1-9]/.test(value.split('.')[1]||'')))throw new Error(label+' must be a non-negative amount with at most two decimal places.');
  if(key==='vatRate'&&(!/^\d{1,4}(?:\.\d{1,4})?$/.test(value)||Number(value)>9999))throw new Error('Enter a valid VAT rate (0–9999, at most four decimal places).');
  order[key]=value;
 }
 if(order.deliveryDate<order.poDate)throw new Error('Delivery date cannot precede PO date.');
 if(Number(order.dateReceived.slice(0,4))<1900||Number(order.dateReceived.slice(0,4))>2300)throw new Error('Date received must be within fiscal years 1900–2300.');
 if(!ORDER_CURRENCIES.includes(order.currency)||!ORDER_INTAKE_STATUSES.includes(order.status))throw new Error('Select a supported currency and status.');
 if(BigInt(order.poAmount.replace('.',''))===0n)throw new Error('PO amount must be greater than zero.');
 const preview=previewOrderFinancials({amount:order.poAmount,vatRate:order.vatRate,expenses:order.procurementExpenses});
 return {order,preview};
}
export function orderEditorMarkup(draft) {
 return '<div class="oi-editor">'+fields.map(([key,,label,max])=>{
  const value=esc(draft[key]);
  const title='<label>'+esc(label);
  if(key==='notes')return title+'<textarea name="'+key+'" maxlength="'+max+'" rows="3">'+value+'</textarea></label>';
  if(key==='currency'||key==='status')return title+'<select name="'+key+'" required>'+ (key==='currency'?ORDER_CURRENCIES:ORDER_INTAKE_STATUSES).map(option=>'<option value="'+esc(option)+'"'+(draft[key]===option?' selected':'')+'>'+esc(option)+'</option>').join('')+'</select></label>';
  const numeric=money.has(key)||key==='vatRate';
  return title+'<input name="'+key+'" type="'+(dates.has(key)?'date':'text')+'" value="'+value+'"'+(numeric?' inputmode="decimal"':'')+(max?' maxlength="'+max+'"':'')+(required.has(key)||dates.has(key)||numeric?' required':'')+'></label>';
 }).join('')+'<div class="oi-editor-preview" aria-live="polite" data-oi-preview></div><p role="alert" data-oi-editor-error></p></div>';
}
export function updateOrderEditorPreview(form) {
 const target=form.querySelector('[data-oi-preview]');
 if(!target)return;
 try{
  const data=Object.fromEntries(new FormData(form));
  const result=previewOrderFinancials({amount:data.poAmount,vatRate:data.vatRate,expenses:data.procurementExpenses});
  target.textContent='VAT-exclusive: '+data.currency+' '+result.vatExclusiveAmount+' · VAT: '+result.vatAmount+' · Gross profit: '+result.grossProfit;
 }catch{target.textContent='Enter a valid amount, VAT rate and expenses for the financial preview.';}
}
const normalizedDecimal = value => {
 const m=/^(\d+)(?:\.(\d+))?$/.exec(String(value));
 return m ? BigInt(m[1]).toString()+'.'+(m[2]||'').replace(/0+$/,'') : String(value);
};
export function matchesSavedOrder(row,order) {
 return nativeEditable(row)&&fields.every(([key,column])=>{
  const expected=key==='accountManager'?(order[key]||'Unassigned'):order[key];
  return money.has(key)||key==='vatRate'?normalizedDecimal(row[column])===normalizedDecimal(expected):String(row[column]??'')===expected;
 });
}
// A stable key is retained for the same create payload on retries. Never reuse
// one key for a different payload. Revision checks remain server-authoritative.
export function createOrderEditorSave({client,row=null,newId=()=>crypto.randomUUID(),isCurrent=()=>true}) {
 let requestId=null,serialized=null,busy=false,uncertain=false,savedId=null;
 if(row&&!nativeEditable(row))throw new Error('Historical records are read-only.');
 const save=async draft=>{
  if(busy)throw new Error('A save is already in progress.');
  if(!isCurrent())throw new Error('Order Intake session changed. Reopen the editor.');
  const {order,preview}=validateOrderDraft(draft);
  const next=JSON.stringify(order);
  if(uncertain&&serialized!==next)throw new Error('Previous save outcome is uncertain. Retry the original values or check All Orders before starting a different order.');
  if(serialized!==next){requestId=row?null:newId();serialized=next;savedId=null;}
  busy=true;
  try{
   if(!savedId){
    try{
     const result=row?await client.update(row.id,row.revision,order):await client.create(order,requestId);
     savedId=result.id;
    }catch(error){
     // A lost update response can be reconciled by authoritative revision and field readback.
     if(row&&isCurrent()){
      const actual=await client.detail(row.id).catch(()=>null);
      if(actual?.revision===row.revision+1&&matchesSavedOrder(actual,order))savedId=actual.id;
     }
     if(!savedId){uncertain=!(Number(error?.status)>=400&&Number(error?.status)<500&&![408,429].includes(Number(error.status)));throw error;}
    }
   }
   if(!isCurrent())throw new Error('Save may have completed. Reopen Order Intake to verify.');
   const actual=await client.detail(savedId);
   if(!matchesSavedOrder(actual,order)||actual.vat_exclusive_amount!==preview.vatExclusiveAmount||
    actual.vat_amount!==preview.vatAmount||actual.gross_profit!==preview.grossProfit)throw new Error('Save outcome could not be reconciled. Retry readback using the original values.');
   uncertain=false;
   return actual;
  }catch(error){if(savedId)uncertain=true;throw error;}
  finally{busy=false;}
 };
 save.pendingDraft=()=>uncertain&&serialized?JSON.parse(serialized):null;
 return save;
}
