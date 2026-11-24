import {tradeLinkCompanyProfileSnapshot,tradeLinkCompanyTemplateSnapshot} from './tradelink-official-templates.js';
import {previewOrderFinancials} from './order-intake-projections.js';
import {compareOrderDecimals} from './order-intake-search.js';

export const CONFIRMATION_CURRENCIES=Object.freeze(['PHP','USD','EUR','GBP','JPY','SGD','AUD','CAD']);
export const CONFIRMATION_SIGNATORIES=Object.freeze(['Alex P. Señagan','Melchor R. Vasquez','Dionny P. Señagan']);
const entities=[['watchdog-sales','+639171183176','info@watchdogautomation.com.ph'],['watchdog-opc','+639178883003','info@watchdogautomation.com.ph'],['plc-systems','+639171183176','dsenagan@plcsystems.com.ph']];
export const CONFIRMATION_ENTITIES=Object.freeze(entities.map(([id,phone,email])=>Object.freeze({...tradeLinkCompanyProfileSnapshot(id),phone,email,accent:tradeLinkCompanyTemplateSnapshot(id).tableText})));
const normalize=value=>String(value??'').trim().toLowerCase();
export function confirmationEntity(row){
 const aliases={'wass':'watchdog-sales','waopc':'watchdog-opc','wa opc':'watchdog-opc','psti':'plc-systems'};
 return CONFIRMATION_ENTITIES.find(e=>normalize(e.name)===normalize(row.company)||e.id===aliases[normalize(row.company)])?.id||'';
}
function field(value,label,max=500,required=true){
 const result=String(value??'').trim();
 if((required&&!result)||result.length>max)throw Error('Enter valid '+label+'.');
 return result;
}
function date(value,label){
 const result=field(value,label,10);
 const parsed=new Date(result+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==result)throw Error('Enter valid '+label+'.');
 return result;
}
function decimal(value,scale,label){
 const pattern=new RegExp('^\\d{1,16}(?:\\.\\d{1,'+scale+'})?$');
 const raw=String(value??'').trim();
 if(!pattern.test(raw))throw Error('Enter valid '+label+' (up to '+scale+' decimal places).');
 const [a,b='']=raw.split('.');
 return BigInt(a)*10n**BigInt(scale)+BigInt(b.padEnd(scale,'0'));
}
export const formatConfirmationAmount=cents=>String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
export function calculateConfirmationItems(items){
 if(!Array.isArray(items)||!items.length||items.length>100)throw Error('Enter 1–100 line items.');
 let total=0n;
 const lines=items.map(item=>{
  const description=field(item.description,'item description',1000),unit=field(item.unit,'unit',40);
  const quantity=decimal(item.quantity,4,'quantity'),price=decimal(item.unitPrice,2,'unit price');
  if(quantity<=0n)throw Error('Quantity must be positive.');
  const amount=(quantity*price+5000n)/10000n;total+=amount;
  return {description,unit,quantity:String(item.quantity).trim(),unitPrice:formatConfirmationAmount(price),amount:formatConfirmationAmount(amount)};
 });
 if(total<=0n||total>999999999999999999n)throw Error('Total must be positive and within supported precision.');
 return {items:lines,total:formatConfirmationAmount(total)};
}
export function buildConfirmation(row,input){
 if(!row?.id||!row.workspace_id||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Load the saved order first.');
 const entity=CONFIRMATION_ENTITIES.find(e=>e.id===input.entity);
 if(!entity)throw Error('Choose a configured legal entity.');
 const inferred=confirmationEntity(row),legacy=row.record_kind==='legacy';
 if(inferred&&inferred!==entity.id)throw Error('Selected entity differs from the recorded company.');
 if(!inferred&&!input.confirmEntity)throw Error('Confirm the issuing entity against the source PO.');
 const currency=field(input.currency,'currency',3);
 if(!CONFIRMATION_CURRENCIES.includes(currency)||row.currency&&row.currency!==currency)throw Error('Currency must match the recorded PO currency, if known.');
 const client=field(row.client_name||input.client,'verified client name',240);
 const poDate=date(row.po_date||input.poDate,'PO date'),deliveryDate=date(row.delivery_date||input.deliveryDate,'delivery date');
 if(deliveryDate<poDate)throw Error('Delivery date cannot precede PO date.');
 const rate=String(row.vat_rate??input.vatRate??'').trim();decimal(rate,4,'VAT rate');
 const {items,total}=calculateConfirmationItems(input.items);
 const sourceAmount=row.po_amount;
 if(sourceAmount!=null&&compareOrderDecimals(sourceAmount,total)!==0)throw Error('Item total must equal the recorded VAT-inclusive PO amount exactly.');
 if(legacy&&(!row.client_name||!row.po_date||!row.delivery_date||!row.currency||row.vat_rate==null||sourceAmount==null)&&!input.confirmHistorical)throw Error('Verify missing historical document details against the original PO.');
 const financials=previewOrderFinancials({amount:total,vatRate:rate,expenses:'0.00'});
 if(!CONFIRMATION_SIGNATORIES.includes(input.signatory))throw Error('Choose a configured signatory.');
 return {orderId:row.id,workspaceId:row.workspace_id,revision:row.revision,recordKind:row.record_kind,
  poNumber:field(row.po_number,'PO number',240),client,poDate,deliveryDate,currency,entity,
  quotation:field(input.quotation,'quotation reference',240,false),payment:field(input.payment,'payment terms',1000),
  warranty:field(input.warranty,'warranty terms',2000),signatory:input.signatory,
  items,total,vatRate:rate,vatExclusiveAmount:financials.vatExclusiveAmount,vatAmount:financials.vatAmount};
}
