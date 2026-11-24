import { ORDER_INTAKE_STATUSES } from '../../frontend/order-intake-native.js';
import { previewOrderFinancials } from '../../frontend/order-intake-projections.js';
export const poKey=value=>typeof value==='string'?value.trim().toUpperCase():'';
export function decimalMinor(value,{signed=false}={}) {
 if(typeof value!=='string') throw new Error('Decimal string required');
 const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
 if(!match||(!signed&&match[1])||match[2].replace(/^0+(?=\d)/,'').length>16) throw new Error('Invalid decimal');
 const amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
 return match[1]?-amount:amount;
}
export function formatMinor(value) {
 const abs=value<0n?-value:value;
 return (value<0n?'-':'')+abs/100n+'.'+String(abs%100n).padStart(2,'0');
}
function validDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateOrder(row) {
 const issues=[],warnings=[];
 for(const key of ['poNumber','clientName','company','industry']) {
  if(typeof row[key]!=='string'||!row[key].trim()||[...row[key].trim()].length>240) issues.push('INVALID_'+key);
 }
 for(const key of ['sourceItemId','sourceGroup']) {
  if(typeof row[key]!=='string'||!row[key].trim()) issues.push('MISSING_'+key);
 }
 if(row.archived!==false) issues.push(row.archived===true?'SOURCE_ARCHIVED_REQUIRES_HISTORY_PLAN':'UNKNOWN_ARCHIVE_STATE');
 if(!ORDER_INTAKE_STATUSES.includes(row.status)) issues.push('UNSUPPORTED_STATUS');
 if(!['PHP','USD','EUR'].includes(row.currency)) issues.push('UNSUPPORTED_OR_MISSING_CURRENCY');
 for(const key of ['poDate','dateReceived','deliveryDate']) if(!validDate(row[key])) issues.push('INVALID_'+key);
 if(validDate(row.poDate)&&validDate(row.deliveryDate)&&row.deliveryDate<row.poDate) issues.push('DELIVERY_BEFORE_PO');
 if(validDate(row.dateReceived)) {
  const year=Number(row.dateReceived.slice(0,4));
  if(year<1900||year>2300) issues.push('FISCAL_YEAR_OUT_OF_RANGE');
  const group=/^FY\s+(\d{4})$/i.exec(row.sourceGroup||'');
  if(group&&Number(group[1])!==year) issues.push('FISCAL_GROUP_DATE_MISMATCH');
 }
 if(/^hold$/i.test(row.sourceGroup||'')) issues.push('HOLD_GROUP_REQUIRES_MAPPING');
 for(const [key,max] of Object.entries({accountManager:240,buyerInCharge:1000,endUserInCharge:1000,notes:12000})) {
  if(row[key]!=null&&(typeof row[key]!=='string'||[...row[key]].length>max)) issues.push('INVALID_'+key);
 }
 if(typeof row.accountManager!=='string'||!row.accountManager.trim()) warnings.push('ACCOUNT_MANAGER_MISSING_EXISTING_RPC_DEFAULT');
 let amount=null,expenses=null,derived=null;
 try {amount=decimalMinor(row.poAmount);if(amount<=0n)throw new Error();}catch{amount=null;issues.push('INVALID_PO_AMOUNT');}
 try {expenses=decimalMinor(row.procurementExpenses);}catch{issues.push('INVALID_PROCUREMENT_EXPENSES');}
 if(typeof row.vatRate!=='string'||!/^\d{1,4}(?:\.\d{1,4})?$/.test(row.vatRate)) issues.push('INVALID_OR_MISSING_VAT_RATE');
 else if(amount!==null&&expenses!==null) {
  try{derived=previewOrderFinancials({amount:formatMinor(amount),expenses:formatMinor(expenses),vatRate:row.vatRate});}
  catch{issues.push('INVALID_FINANCIAL_CALCULATION');}
 }
 if(derived) for(const key of ['vatExclusiveAmount','vatAmount','grossProfit']) {
  if(row[key]===undefined||row[key]===null||row[key]==='') warnings.push('SOURCE_'+key+'_NOT_AVAILABLE');
  else try{if(decimalMinor(row[key],{signed:true})!==decimalMinor(derived[key],{signed:true}))issues.push('FINANCIAL_MISMATCH_'+key);}
  catch{issues.push('INVALID_SOURCE_'+key);}
 }
 return {issues,warnings,amount,expenses,derived};
}
