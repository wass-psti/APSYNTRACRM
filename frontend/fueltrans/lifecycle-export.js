// Build a standards-compliant, dependency-free XLSX lifecycle export.
// Every value is written as an inline string or a numeric cell; formulas are never evaluated.
import {CLIENTS,STATUS} from './ticket-domain.js';

export const LIFECYCLE_HEADERS=Object.freeze([
 'Ticket ID','Date Reported','Client','Site ID','Station Name','Title','Category',
 'Status','Priority','System Type','Impact Level','Reporting Channel','Created Date',
 'Age','Response Time','Resolution Time','Downtime (min)','Problem Description','Resolution Details'
]);
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const encoder=new TextEncoder();
const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
const date=value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():'—';};
const elapsed=(start,end)=>{
 const a=Date.parse(start||''),b=Date.parse(end||'');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return '—';
 const seconds=Math.floor((b-a)/1000),days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60);
 if(days)return days+'d '+hours+'h';
 if(hours)return hours+'h '+minutes+'m';
 if(minutes)return minutes+'m '+(seconds%60)+'s';
 return seconds+'s';
};
function cellValue(row,key,fallback='—'){return row.payload?.[key]??fallback;}
export function buildLifecycleExportRows(rows,{client,workspaceId,now=Date.now()}={}){
 if(!CLIENTS.includes(client))throw Error('Choose exactly one client before exporting.');
 if(!Array.isArray(rows)||rows.length>10000)throw Error('Lifecycle export rows are invalid or exceed 10,000 records.');
 const seen=new Set(),selected=[];
 for(const row of rows){
  if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id))throw Error('Lifecycle export contains a duplicate or invalid ticket.');
  if(workspaceId&&row.workspace_id!==workspaceId)throw Error('Lifecycle export contains an out-of-workspace ticket.');
  seen.add(row.id);
  if(String(row.client_code||'').toUpperCase()!==client)continue;
  const p=row.payload&&typeof row.payload==='object'?row.payload:{};
  const created=row.created_at||p.createdAt;
  const closed=p.closureDate||null;
  const end=closed||new Date(now).toISOString();
  const status=STATUS.includes(row.status)?row.status:String(row.status||'Unknown');
  selected.push([
   row.ticket_number||p.ticketId||row.id,p.operationalDate||date(created),client,
   p.stationId||'—',p.stationName||'—',p.name||p.title||'—',p.category||'Unspecified',
   row.archived===true?status+' · Archived':status,p.priorityLevel||p.priority||'—',
   p.systemType||'—',p.impactLevel||'—',p.reportingChannel||'—',date(created),
   elapsed(created,end),elapsed(created,p.l1ResponseDate),elapsed(p.l1ResponseDate,closed),
   typeof p.downtimeMinutes==='number'&&Number.isFinite(p.downtimeMinutes)?p.downtimeMinutes:'—',
   p.issueDetails||p.description||'—',p.resolutionDetails||'—'
  ]);
 }
 return [Array.from(LIFECYCLE_HEADERS),...selected];
}
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function join(parts){
 const size=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(size);let offset=0;
 for(const part of parts){out.set(part,offset);offset+=part.length;}
 return out;
}
function zipStore(entries){
 const local=[],central=[];let offset=0;
 for(const entry of entries){
  const name=encoder.encode(entry.name),data=encoder.encode(entry.data),crc=crc32(data);
  const header=new Uint8Array(30+name.length),view=new DataView(header.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);
  view.setUint16(8,0,true);view.setUint16(10,0,true);view.setUint16(12,33,true);
  view.setUint32(14,crc,true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);
  view.setUint16(26,name.length,true);view.setUint16(28,0,true);header.set(name,30);
  local.push(header,data);
  const directory=new Uint8Array(46+name.length),directoryView=new DataView(directory.buffer);
  directoryView.setUint32(0,0x02014b50,true);directoryView.setUint16(4,20,true);directoryView.setUint16(6,20,true);
  directoryView.setUint16(8,0x0800,true);directoryView.setUint16(10,0,true);
  directoryView.setUint16(12,0,true);directoryView.setUint16(14,33,true);
  directoryView.setUint32(16,crc,true);directoryView.setUint32(20,data.length,true);directoryView.setUint32(24,data.length,true);
  directoryView.setUint16(28,name.length,true);directoryView.setUint16(30,0,true);directoryView.setUint16(32,0,true);
  directoryView.setUint16(34,0,true);directoryView.setUint16(36,0,true);directoryView.setUint32(38,0,true);
  directoryView.setUint32(42,offset,true);directory.set(name,46);central.push(directory);
  offset+=header.length+data.length;
 }
 const centralBytes=join(central),end=new Uint8Array(22),view=new DataView(end.buffer);
 view.setUint32(0,0x06054b50,true);view.setUint16(4,0,true);view.setUint16(6,0,true);
 view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);
 view.setUint32(12,centralBytes.length,true);view.setUint32(16,offset,true);view.setUint16(20,0,true);
 return join([...local,centralBytes,end]);
}
function columnName(index){
 let name='',value=index+1;
 while(value){const remainder=(value-1)%26;name=String.fromCharCode(65+remainder)+name;value=Math.floor((value-1)/26);}
 return name;
}
function worksheetXml(rows){
 const content=rows.map((row,rowIndex)=>{
  const cells=row.map((value,columnIndex)=>{
   const reference=columnName(columnIndex)+(rowIndex+1);
   if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+reference+'" t="n"><v>'+value+'</v></c>';
   return '<c r="'+reference+'" t="inlineStr"'+(rowIndex===0?' s="1"':'')+'><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
  }).join('');
  return '<row r="'+(rowIndex+1)+'">'+cells+'</row>';
 }).join('');
 const lastColumn=columnName(Math.max(0,(rows[0]?.length||1)-1));
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'+content+'</sheetData><autoFilter ref="A1:'+lastColumn+rows.length+'"/></worksheet>';
}
export function buildLifecycleExportWorkbook(rows,options){
 const matrix=buildLifecycleExportRows(rows,options);
 const entries=[
  {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
  {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FuelTrans Lifecycle" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
  {name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24415E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
  {name:'xl/worksheets/sheet1.xml',data:worksheetXml(matrix)}
 ];
 return new Blob([zipStore(entries)],{type:MIME});
}
