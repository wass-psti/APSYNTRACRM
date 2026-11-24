import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';
import { addExact, projectUnifiedOrders } from './order-intake-unified-read.js';

const terminal=new Set(['Collected','Closed','Cancelled']);
const measures=[['po_amount','amount'],['procurement_expenses','expenses'],['gross_profit','profit']];
function countBy(rows,key,missing) {
 const counts=new Map();
 for(const row of rows){
  const label=row[key]||missing;
  counts.set(label,(counts.get(label)||0)+1);
 }
 return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
function monthOf(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value.slice(0,7):null;
}
function financialGroups(rows){
 const groups=new Map();
 for(const row of rows){
  if(!/^[A-Z]{3}$/.test(row.currency||''))continue;
  const basis=row.record_kind==='legacy'?'historical':'native';
  const key=basis+'|'+row.currency;
  if(!groups.has(key))groups.set(key,{basis,currency:row.currency,count:0,
   amount:null,amountCount:0,expenses:null,expensesCount:0,profit:null,profitCount:0});
  const group=groups.get(key);
  group.count++;
  for(const [column,field] of measures){
   const value=row[column];
   if(value==null||! /^-?\d+(?:\.\d+)?$/.test(String(value)))continue;
   group[field]=addExact(group[field]??'0',value);
   group[field+'Count']++;
  }
 }
 return [...groups.values()].sort((a,b)=>a.basis.localeCompare(b.basis)||a.currency.localeCompare(b.currency));
}
// All measures use the same filtered collection; unknowns never become zero.
export function projectSalesIntelligence(rows){
 const visible=rows.filter(row=>row.archived!==true);
 const base=projectUnifiedOrders(visible);
 const open=visible.filter(row=>ORDER_INTAKE_STATUSES.includes(row.status)&&!terminal.has(row.status));
 const months=new Map();
 let unknownReceived=0;
 for(const row of visible){
  const month=monthOf(row.date_received);
  if(!month){unknownReceived++;continue;}
  months.set(month,(months.get(month)||0)+1);
 }
 return {total:base.totalOrders,legacy:base.legacyCount,native:visible.length-base.legacyCount,
  open:open.length,openArchiveUnknown:open.filter(row=>row.archived==null).length,
  collected:visible.filter(row=>row.status==='Collected').length,
  cancelled:visible.filter(row=>row.status==='Cancelled').length,
  unknownStatus:visible.filter(row=>!ORDER_INTAKE_STATUSES.includes(row.status)).length,
  unknownArchive:visible.filter(row=>row.archived==null).length,
  unknownCurrency:visible.filter(row=>! /^[A-Z]{3}$/.test(row.currency||'')).length,
  unknownReceived,finance:financialGroups(visible),
  managers:countBy(visible,'account_manager','Unassigned'),
  companies:countBy(visible,'company','Unknown company'),
  industries:countBy(visible,'industry','Unknown industry'),
  statuses:countBy(visible,'status','Unknown status'),
  months:[...months].sort(([a],[b])=>a.localeCompare(b)).map(([label,count])=>({label,count}))};
}
