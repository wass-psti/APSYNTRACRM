// FuelTrans v0.5.0 ReportsHub — static browser-native, read-only projection.
// Financial estimates intentionally omitted because original source's rates are assumptions.
import {CLIENTS,STATUS,csvQuote} from './ticket-domain.js';
import {collectReadOnlySnapshot} from './export-domain.js';

export const REPORTS = Object.freeze([
 {id:'executive',name:'Executive Dashboard',description:'Source-derived operational KPIs'},
 {id:'client-performance',name:'Client Performance',description:'Tickets and resolution by client'},
 {id:'technician-productivity',name:'Technician Productivity',description:'L1/L2 assignment workload'},
 {id:'downtime-impact',name:'Downtime & Impact',description:'Recorded downtime; no assumed cost rates'},
]);
export const REPORT_LIMIT=10000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDuration(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1000000?v:null;}
function safeStatus(row){return STATUS.includes(row.status)?row.status:'Unknown';}
function normalizeClient(row){const c=String(row.client_code||'').toUpperCase();return CLIENTS.includes(c)?c:'Unknown';}
function reportRoleAuthorized(role){return ['admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist','viewer'].includes(role);}
export function canReadReports(m){return m?.enabled===true&&m?.status==='active'&&UUID.test(String(m.workspace_id||''))&&reportRoleAuthorized(m.role);}

export async function collectReportRows({workspaceId,member,readPage,readCount}){
 if(!canReadReports(member)||member.workspace_id!==workspaceId)throw Error('Report permission denied.');
 const snapshot=await collectReadOnlySnapshot({workspaceId,readPage,readCount,maxRecords:REPORT_LIMIT});
 return snapshot.records;
}

export function summarizeReports(rows,{workspaceId}={}){
 if(!UUID.test(String(workspaceId||''))||!Array.isArray(rows)||rows.length>REPORT_LIMIT)throw Error('Invalid report data scope.');
 const seen=new Set();
 const statuses=Object.fromEntries([...STATUS,'Unknown'].map(s=>[s,0]));
 const clients=Object.fromEntries([...CLIENTS,'Unknown'].map(c=>[c,{name:c,tickets:0,resolved:0,active:0,unknownStatus:0,downtimeMinutes:0,knownDowntimeTickets:0}]));
 const technicians=new Map(),systems=new Map();
 let active=0,resolved=0,archived=0,unknownStatus=0,knownDowntimeTickets=0,downtimeMinutes=0;
 for(const row of rows){
  if(!row||row.workspace_id!==workspaceId||typeof row.id!=='string'||!row.id||seen.has(row.id))throw Error('Report contains a duplicate or out-of-scope ticket.');
  seen.add(row.id);
  if(row.archived===true){archived++;continue;}
  const status=safeStatus(row),client=clients[normalizeClient(row)],down=validDuration(row.payload?.downtimeMinutes);
  statuses[status]++;if(status==='Resolved'){resolved++;client.resolved++;}else if(status==='Unknown'){unknownStatus++;client.unknownStatus++;}else {active++;client.active++;}
  client.tickets++;
  if(down!==null){client.knownDowntimeTickets++;client.downtimeMinutes+=down;knownDowntimeTickets++;downtimeMinutes+=down;
   const type=String(row.payload?.systemType||'Unspecified').trim().slice(0,80)||'Unspecified';const v=systems.get(type)||{name:type,tickets:0,minutes:0};v.tickets++;v.minutes+=down;systems.set(type,v);
  }
  for(const [stage,id] of [['L1',row.assigned_l1],['L2',row.assigned_l2]]){
   if(!UUID.test(String(id||'')))continue;
   const key=`${stage}:${id}`;const v=technicians.get(key)||{name:`${stage} · ${id}`,level:stage,tickets:0,resolved:0};v.tickets++;if(status==='Resolved')v.resolved++;technicians.set(key,v);
  }
 }
 return {
  totalRows:rows.length,archived,active,resolved,unknownStatus,unarchived:rows.length-archived,
  statuses,clients:CLIENTS.map(c=>clients[c]).concat(clients.Unknown.tickets?[clients.Unknown]:[]),
  technicians:[...technicians.values()].sort((a,b)=>b.tickets-a.tickets||a.name.localeCompare(b.name)),
  systems:[...systems.values()].sort((a,b)=>b.minutes-a.minutes||a.name.localeCompare(b.name)),
  downtimeMinutes,knownDowntimeTickets,unknownDowntimeTickets:rows.length-archived-knownDowntimeTickets
 };
}

export function reportCsvRows(summary,tab){
 if(!REPORTS.some(r=>r.id===tab))throw Error('Unknown report tab.');
 let rows;
 if(tab==='executive')rows=[['Metric','Value'],['Visible tickets',summary.unarchived],['Active',summary.active],['Resolved',summary.resolved],['Unknown status',summary.unknownStatus],['Archived (excluded)',summary.archived],...STATUS.map(s=>[s,summary.statuses[s]])];
 else if(tab==='client-performance')rows=[['Client','Tickets','Active','Resolved','Unknown status','Recorded downtime (minutes)'],...summary.clients.map(v=>[v.name,v.tickets,v.active,v.resolved,v.unknownStatus,v.downtimeMinutes])];
 else if(tab==='technician-productivity')rows=[['Assigned technician','Level','Assigned tickets','Resolved tickets'],...summary.technicians.map(v=>[v.name,v.level,v.tickets,v.resolved])];
 else rows=[['System','Tickets with recorded downtime','Total recorded downtime (minutes)'],...summary.systems.map(v=>[v.name,v.tickets,v.minutes]),['Unknown downtime count',summary.unknownDowntimeTickets,'']];
 return rows;
}
export function reportCsv(summary,tab){return reportCsvRows(summary,tab).map(row=>row.map(csvQuote).join(',')).join('\r\n')+'\r\n';}
