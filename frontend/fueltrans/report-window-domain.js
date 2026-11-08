// FuelTrans v0.5.0 ReportsHub read-only operationalDate window.
// Only source-recorded operationalDate is considered. No inferred financial data.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validCalendarDay(value){
 if(typeof value!=='string'||!DAY.test(value))return false;
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
 if(year<1900||year>9999)return false;
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
export function parseReportWindow({from='',to=''}={}){
 if(from&&!validCalendarDay(from))throw Error('Report start date is invalid.');
 if(to&&!validCalendarDay(to))throw Error('Report end date is invalid.');
 if(from&&to&&from>to)throw Error('Report start date must not exceed end date.');
 return Object.freeze({from,to,filtered:Boolean(from||to)});
}
export function recordedOperationalDay(row){
 // Original React ReportsHub aggregates by operationalDate (not ticket creation date).
 const p=row?.payload;
 const value=p&&typeof p==='object'?p.operationalDate:null;
 return validCalendarDay(value)?value:null;
}
export function applyReportWindow(rows,range){
 if(!Array.isArray(rows))throw Error('Report records are unavailable.');
 const window=parseReportWindow(range);
 if(!window.filtered)return {rows,excludedMissingOperationalDate:0,excludedOutOfWindow:0,range:window};
 const selected=[];let excludedMissingOperationalDate=0,excludedOutOfWindow=0;
 for(const row of rows){
  const day=recordedOperationalDay(row);
  if(!day){excludedMissingOperationalDate++;continue;}
  if((window.from&&day<window.from)||(window.to&&day>window.to)){excludedOutOfWindow++;continue;}
  selected.push(row);
 }
 return {rows:selected,excludedMissingOperationalDate,excludedOutOfWindow,range:window};
}
export function reportWindowLabel(range){const w=parseReportWindow(range);return w.filtered?`Operational dates ${w.from||'earliest'} through ${w.to||'latest'} (inclusive)`:'All recorded tickets (no date filter)';}
