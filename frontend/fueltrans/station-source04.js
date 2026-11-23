import {CLIENTS} from './ticket-domain.js';

// A source candidate is never promoted to an authoritative station registry by parsing.
export const STATION_SOURCE_MAX_BYTES=1024*1024;
export const STATION_SOURCE_MAX_ROWS=5000;
const FIELDS={
 client:new Set(['client','clientcode','clientorganization','network']),
 stationId:new Set(['stationid','siteid','sitecode','stationcode']),
 stationName:new Set(['stationname','sitename','station'])
};
const key=(value)=>String(value??'').trim().toUpperCase();
const normalizeHeader=(value)=>String(value??'').replace(/^\uFEFF/,'').toLowerCase().replace(/[\s_-]/g,'');

function splitCsv(text){
 const rows=[];
 let row=[],value='',quoted=false,afterQuote=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){
   if(char==='"'&&text[i+1]==='"'){value+='"';i++;}
   else if(char==='"'){quoted=false;afterQuote=true;}
   else value+=char;
  }else if(char===','){
   row.push(value);value='';afterQuote=false;
  }else if(char==='\r'||char==='\n'){
   if(char==='\r'&&text[i+1]==='\n')i++;
   row.push(value);
   if(row.some(field=>field.trim()!==''))rows.push(row);
   row=[];value='';afterQuote=false;
  }else if(char==='"'&&value===''&&!afterQuote)quoted=true;
  else if(afterQuote&&char===' '){/* Whitespace after closing quote is ignored. */}
  else if(afterQuote||char==='"')throw Error('Malformed CSV quoting.');
  else value+=char;
 }
 if(quoted)throw Error('Unterminated CSV quoted field.');
 row.push(value);
 if(row.some(field=>field.trim()!==''))rows.push(row);
 return rows;
}

function findColumns(header){
 const indices={};
 for(const [field,aliases] of Object.entries(FIELDS)){
  const matches=header.flatMap((label,index)=>aliases.has(normalizeHeader(label))?[index]:[]);
  if(matches.length!==1)throw Error('CSV needs exactly one '+field+' column.');
  indices[field]=matches[0];
 }
 return indices;
}

export function parseStationSourceCsv(text,{assignedClient=null}={}){
 if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>STATION_SOURCE_MAX_BYTES){
  throw Error('Station CSV must be text smaller than 1 MB.');
 }
 const parsed=splitCsv(text);
 if(!parsed.length)throw Error('Station CSV is empty.');
 const columns=findColumns(parsed[0]);
 if(parsed.length-1>STATION_SOURCE_MAX_ROWS)throw Error('Station CSV exceeds 5,000 data rows.');
 if(assignedClient!==null&&!CLIENTS.includes(assignedClient))throw Error('Invalid existing client scope.');
 const rows=[],issues=[],seen=new Map();
 let duplicates=0;
 for(let index=1;index<parsed.length;index++){
  const values=parsed[index],line=index+1;
  const client=key(values[columns.client]);
  const stationId=String(values[columns.stationId]??'').trim().toUpperCase();
  const stationName=String(values[columns.stationName]??'').trim();
  if(values.length!==parsed[0].length){
   issues.push({line,reason:'Column count differs from header.'});continue;
  }
  if(!CLIENTS.includes(client)||assignedClient&&assignedClient!==client){
   issues.push({line,reason:'Client is invalid or outside the active FuelTrans scope.'});continue;
  }
  if(!/^[A-Z0-9][A-Z0-9 _-]{2,59}$/.test(stationId)){
   issues.push({line,reason:'Station ID must have 3–60 ordinary characters.'});continue;
  }
  if(stationName.length<3||stationName.length>160||/[\x00-\x1F\x7F]/.test(stationName)){
   issues.push({line,reason:'Station name must have 3–160 printable characters.'});continue;
  }
  const identity=client+'\u0000'+stationId;
  const previous=seen.get(identity);
  if(previous){
   if(previous.stationName.toLocaleLowerCase()!==stationName.toLocaleLowerCase()){
    issues.push({line,reason:'Station ID has conflicting names in the source.'});
   }else duplicates++;
   continue;
  }
  const record=Object.freeze({client,stationId,stationName});
  seen.set(identity,record);rows.push(record);
 }
 return Object.freeze({rows:Object.freeze(rows),issues:Object.freeze(issues),duplicates,totalDataRows:parsed.length-1,ignoredColumnCount:parsed[0].length-3});
}

export function reconcileStationSource(candidateRows,recordedStations){
 if(!Array.isArray(candidateRows)||!Array.isArray(recordedStations))throw Error('Invalid comparison records.');
 const recorded=new Map(recordedStations.map(row=>[key(row.client)+'\u0000'+key(row.stationId),row]));
 return Object.freeze(candidateRows.map(row=>{
  const observed=recorded.get(key(row.client)+'\u0000'+key(row.stationId));
  const status=!observed?'not_on_visible_page':
   String(observed.stationName).trim().toLocaleLowerCase()===row.stationName.toLocaleLowerCase()?'matched_on_visible_page':'name_difference_on_visible_page';
  return Object.freeze({...row,status,recordedStationName:observed?.stationName??''});
 }));
}

// Exports only the three approved station metadata fields and derived comparison status.
function csvCell(value){
 const safe=String(value??'');
 return '"'+(/^[=+@\-\t\r]/.test(safe)?"'":"")+safe.replaceAll('"','""')+'"';
}
export function stationReconciliationCsv(rows,{ticketPage=1}={}){
 if(!Array.isArray(rows)||!Number.isSafeInteger(ticketPage)||ticketPage<1)throw Error('Invalid reconciliation report.');
 const head=['Client','Station ID','Candidate Station Name','Visible Ticket Page','Comparison','Recorded Name On Page'];
 const entries=rows.map(row=>[row.client,row.stationId,row.stationName,ticketPage,row.status,row.recordedStationName]);
 return [head,...entries].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
