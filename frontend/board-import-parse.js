import {normalizeExcelCellDate,normalizeTextDate,excelDateFormat} from './excel-date-normalization.js';
/** BIMP-01: bounded, dependency-free CSV/XLSX data reader. No workbook formula evaluation. */
const MAX_BYTES=8*1024*1024,MAX_ROWS=5000,MAX_COLUMNS=30,MAX_UNCOMPRESSED_BYTES=24*1024*1024;
const invalid=message=>{throw new Error(message);};
export function validateImportSheet(headers,rows){
 if(!Array.isArray(headers)||headers.length<1||headers.length>MAX_COLUMNS)
  invalid('Import requires 1–30 header columns.');
 const names=headers.map(x=>String(x??'').trim());
 if(names.some(x=>!x||x.length>240)||new Set(names.map(x=>x.toLocaleLowerCase())).size!==names.length)
  invalid('File headers must be nonempty, unique, and at most 240 characters.');
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)
  invalid('Import requires 1–5,000 data rows.');
 for(const row of rows){
  if(!Array.isArray(row)||row.length>MAX_COLUMNS)invalid('Invalid spreadsheet row width.');
  if(row.some(x=>String(x??'').length>5000))invalid('An imported cell exceeds 5,000 characters.');
 }
 return {headers:names,rows};
}
export function parseDelimited(text,delimiter){
 if(typeof text!=='string')invalid('CSV content is not text.');
 text=text.replace(/^\uFEFF/,'');
 if(text.length>MAX_BYTES)invalid('CSV exceeds the supported limit.');
 if(!delimiter){
  const first=text.split(/\r?\n/,3).join('\n'),counts={',':0,';':0,'\t':0};
  let quoted=false;
  for(const c of first){if(c==='"')quoted=!quoted;else if(!quoted&&Object.hasOwn(counts,c))counts[c]++;}
  delimiter=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
 }
 if(![',',';','\t'].includes(delimiter))invalid('Unsupported CSV delimiter.');
 const matrix=[],row=[];let value='',quoted=false,closed=false;
 const endCell=()=>{row.push(value);value='';closed=false;};
 const endRow=()=>{endCell();matrix.push(row.splice(0));if(matrix.length>MAX_ROWS+2)invalid('CSV exceeds 5,000 rows.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){value+='"';i++;}
   else if(!quoted&&value==='')quoted=true;
   else if(quoted) {quoted=false;closed=true;}
   else invalid('Malformed CSV quoting.');
  }else if(!quoted&&c===delimiter)endCell();
  else if(!quoted&&(c==='\n'||c==='\r')){
   if(c==='\r'&&text[i+1]==='\n')i++;
   endRow();
  }else{
   if(closed&&c!==' '&&c!=='\t')invalid('Unexpected content after quoted CSV field.');
   if(!closed)value+=c;
  }
  if(value.length>5000)invalid('An imported cell exceeds 5,000 characters.');
  if(row.length>MAX_COLUMNS)invalid('CSV exceeds 30 columns.');
 }
 if(quoted)invalid('CSV has an unterminated quoted field.');
 if(value||row.length||(!text.endsWith('\n')&&!text.endsWith('\r')))endRow();
 while(matrix.length&&matrix.at(-1).every(x=>!String(x??'').trim()))matrix.pop();
 if(!matrix.length)invalid('CSV has no header.');
 const headers=matrix.shift().map(x=>String(x).trim());
 const data=matrix.filter(r=>r.some(x=>String(x??'').trim()));
 for(let i=0;i<data.length;i++){
  if(data[i].length>headers.length&&
     data[i].slice(headers.length).some(x=>String(x??'').trim()))
   invalid('CSV row '+(i+2)+' contains values beyond its header columns.');
  // Short rows are valid CSV; missing trailing fields are empty cells.
  data[i]=Array.from({length:headers.length},(_,col)=>data[i][col]??'');
 }
 return validateImportSheet(headers,data);
}
function decodedText(buffer){
 const data=new Uint8Array(buffer);
 if(data[0]===0xff&&data[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(data.subarray(2));
 if(data[0]===0xfe&&data[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(data.subarray(2));
 return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
function xmlDocument(text){
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))
  invalid('Workbook XML entity and document declarations are not supported.');
 if(typeof DOMParser==='undefined')invalid('XLSX XML parsing is unavailable.');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)invalid('Workbook contains invalid XML.');
 return doc;
}
const nodes=(parent,name)=>Array.from(parent.getElementsByTagNameNS('*',name));
const first=(parent,name)=>nodes(parent,name)[0]||null;
const textNode=(parent,name)=>first(parent,name)?.textContent||'';
const le=(view,pos,n)=>n===2?view.getUint16(pos,true):view.getUint32(pos,true);
function zipCrc32(data){
 let crc=0xffffffff;
 for(const byte of data){
  crc^=byte;
  for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function zipDirectory(buffer){
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);
 let eocd=-1;
 for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--){
  if(le(view,p,4)===0x06054b50){eocd=p;break;}
 }
 if(eocd<0||le(view,eocd+4,2)||le(view,eocd+6,2))invalid('Not a supported XLSX ZIP workbook.');
 const count=le(view,eocd+10,2),offset=le(view,eocd+16,4);
 if(count===0xffff||offset===0xffffffff||count>300||offset>=buffer.byteLength)
  invalid('Unsupported ZIP64 workbook or oversized ZIP directory.');
 const entries=new Map();let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>buffer.byteLength||le(view,p,4)!==0x02014b50)invalid('Damaged XLSX directory.');
  const flags=le(view,p+8,2),method=le(view,p+10,2),
   crc=le(view,p+16,4),packed=le(view,p+20,4),raw=le(view,p+24,4);
  const nameLen=le(view,p+28,2),extra=le(view,p+30,2),comment=le(view,p+32,2),local=le(view,p+42,4);
  if(flags&1)invalid('Encrypted XLSX workbook entries are not supported.');
  if(![0,8].includes(method))invalid('Unsupported XLSX compression method.');
  if(raw===0xffffffff||packed===0xffffffff)
   invalid('ZIP64 XLSX workbook entries are not supported.');
  if(packed>MAX_BYTES)
   invalid('XLSX compressed entry exceeds the 8 MB input limit.');
  total+=raw;
  if(total>MAX_UNCOMPRESSED_BYTES)
   invalid('Workbook expands beyond the 24 MB uncompressed XML limit.');
  const end=p+46+nameLen+extra+comment;
  if(end>buffer.byteLength)invalid('Damaged XLSX entry name.');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nameLen));
  if(name.includes('..')||name.startsWith('/')||name.includes('\\')||entries.has(name))
   invalid('Unsafe or duplicate XLSX path.');
  entries.set(name,{method,packed,raw,local,crc});
  p=end;
 }
 return {entries,view,bytes};
}
async function unzipEntry(zip,path){
 const info=zip.entries.get(path);
 if(!info)invalid('Workbook entry is missing: '+path);
 const p=info.local,v=zip.view;
 if(p+30>v.byteLength||le(v,p,4)!==0x04034b50)invalid('Damaged XLSX local entry.');
 const at=p+30+le(v,p+26,2)+le(v,p+28,2);
 if(at+info.packed>v.byteLength)invalid('Truncated XLSX entry.');
 let data=zip.bytes.slice(at,at+info.packed);
 if(info.method===8){
  if(typeof DecompressionStream==='undefined')
   invalid('XLSX decompression requires a browser supporting deflate-raw.');
  let stream;
  try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
  catch{invalid('XLSX decompression requires a browser supporting deflate-raw.');}
  // Do not trust central-directory size claims enough to use Response.arrayBuffer:
  // a dishonest ZIP stream could expand well past the 4 MB per-entry limit.
  const reader=stream.getReader(),expanded=new Uint8Array(info.raw);
  let written=0;
  try{
   while(true){
    const {value,done}=await reader.read();
    if(done)break;
    if(written+value.byteLength>info.raw)
     invalid('Workbook ZIP entry expands beyond its declared safe size.');
    expanded.set(value,written);
    written+=value.byteLength;
   }
  }catch(error){
   try{await reader.cancel();}catch{}
   throw error;
  }finally{reader.releaseLock();}
  if(written!==info.raw)invalid('XLSX entry length does not match.');
  data=expanded;
 }
 if(data.byteLength!==info.raw)invalid('Damaged XLSX entry size.');
 if(zipCrc32(data)!==info.crc)invalid('XLSX checksum mismatch.');
 return new TextDecoder('utf-8',{fatal:true}).decode(data);
}

/** Excel built-in number formats; custom formats are parsed separately. */
function styleDates(doc){
 const formats=new Map(nodes(doc,'numFmt').map(x=>
  [Number(x.getAttribute('numFmtId')),x.getAttribute('formatCode')||'']));
 const xfs=nodes(first(doc,'cellXfs')||doc,'xf');
 return xfs.map(x=>{
  const id=Number(x.getAttribute('numFmtId'));
  if(id>=14&&id<=17||id>=27&&id<=36||id>=50&&id<=58)
   return {date:true,time:false};
  if(id>=18&&id<=21||id>=45&&id<=47)
   return {date:false,time:true};
  if(id===22)return {date:true,time:true};
  return formats.has(id)?excelDateFormat(formats.get(id)):null;
 });
}
function cellColumn(address){
 const match=String(address||'').match(/^([A-Z]+)([1-9][0-9]*)$/i);
 if(!match)return 0;
 let col=0;
 for(const ch of match[1].toUpperCase())
  col=col*26+ch.charCodeAt(0)-64;
 return col;
}
function contextualError(sheet,row,address,column,raw,reason){
 const excerpt=String(raw??'').slice(0,96);
 const name=column?' · column "'+column+'"':'';
 return new Error('Worksheet "'+sheet+'" · row '+row+
  ' · cell '+address+name+' · value "'+excerpt+'": '+reason);
}
function headerCandidate(values){
 if(!values?.[0]||values.length>MAX_COLUMNS)return null;
 const last=values.reduce((n,v,i)=>String(v??'').trim()?i+1:n,0);
 if(last<2)return null;
 const header=Array.from({length:last},(_,i)=>String(values[i]??'').trim());
 if(header.some(x=>!x||x.length>240))return null;
 if(new Set(header.map(x=>x.toLocaleLowerCase())).size!==last)return null;
 return header;
}
function sameHeader(values,header){
 if(!header)return false;
 const candidate=headerCandidate(values);
 return !!candidate&&candidate.length===header.length&&
  candidate.every((name,i)=>name.toLocaleLowerCase()===header[i].toLocaleLowerCase());
}
function rowLabel(entry){
 const present=entry.values.filter(x=>String(x??'').trim());
 return present.length===1&&String(entry.values[0]??'').trim()?
  String(entry.values[0]).trim():null;
}
export function splitWorksheetSections(entries,sheetName){
 if(!Array.isArray(entries)||entries.length===0)return [];
 const firstHeader=entries.findIndex(entry=>headerCandidate(entry.values));
 if(firstHeader<0)return [];
 const tables=[];
 let current=null,sectionTitle='',omitted=[];
 const flush=()=>{
  if(!current)return;
  if(current.rows.length){
   const label=current.sectionTitle;
   const display=label?sheetName+' — '+label:
    (tables.length?sheetName+' — Section '+(tables.length+1):sheetName);
   const checked=validateImportSheet(current.headers,current.rows);
   tables.push({...checked,name:display,worksheet:sheetName,
    headerRow:current.headerRow,rowNumbers:current.rowNumbers,
    omittedRows:current.omittedRows});
  }
 };
 for(let i=firstHeader;i<entries.length;i++){
  const entry=entries[i],values=entry.values;
  if(!current){
   const header=headerCandidate(values);
   if(!header)continue;
   const prev=entries[i-1],label=prev&&rowLabel(prev);
   current={headers:header,rows:[],headerRow:entry.number,
    sectionTitle:label||'',rowNumbers:[],omittedRows:[]};
   continue;
  }
  if(sameHeader(values,current.headers)){
   flush();
   current={headers:[...current.headers],rows:[],headerRow:entry.number,
    sectionTitle:sectionTitle||'',rowNumbers:[],omittedRows:[]};
   sectionTitle='';
   continue;
  }
  // A single-cell section title preceding a repeated header is metadata,
  // not a record with empty status/date fields.
  if(rowLabel(entry)&&entries[i+1]&&sameHeader(entries[i+1].values,current.headers)){
   sectionTitle=rowLabel(entry);
   continue;
  }
  if(!values.some(x=>String(x??'').trim()))continue;
  // Totals/report footers have an empty Item/Name field. Do not
  // silently turn them into empty-title board records.
  if(!String(values[0]??'').trim()){
   current.omittedRows.push(entry.number);
   continue;
  }
  if(values.slice(current.headers.length).some(x=>String(x??'').trim()))
   throw contextualError(sheetName,entry.number,'A'+entry.number,
    current.headers[0],values[0],'Row contains values beyond the header columns.');
  current.rows.push(Array.from({length:current.headers.length},
   (_,n)=>String(values[n]??'')));
  current.rowNumbers.push(entry.number);
 }
 flush();
 // If a sheet contains multiple sections, each is selectable in the UI.
 return tables;
}
function sheetRows(xml,shared,dates,date1904,sheetName){
 const sheetData=first(xml,'sheetData');
 if(!sheetData)return [];
 const rows=[];
 let fallbackRow=0,knownHeader=null;
 for(const r of nodes(sheetData,'row')){
  const excelRow=Number(r.getAttribute('r'))||++fallbackRow;
  if(!Number.isSafeInteger(excelRow)||excelRow<1)
   throw new Error('Worksheet "'+sheetName+'" contains an invalid row number.');
  fallbackRow=excelRow;
  const values=[],seen=new Set();
  for(const cell of nodes(r,'c')){
   const address=cell.getAttribute('r')||'';
   const col=cellColumn(address);
   if(col<1||col>MAX_COLUMNS||seen.has(col))
    throw contextualError(sheetName,excelRow,address,'','',
     'Missing, repeated or unsupported cell address.');
   seen.add(col);
   const type=cell.getAttribute('t'),styleIndex=Number(cell.getAttribute('s')||0);
   const format=dates[styleIndex]||null;
   const cached=first(cell,'v');
   const f=first(cell,'f');
   let raw=cached?.textContent||'';
   if(type==='inlineStr')raw=nodes(first(cell,'is')||cell,'t').map(x=>x.textContent||'').join('');
   else if(type==='s'){
    const idx=Number(raw);
    if(!Number.isSafeInteger(idx)||idx<0||idx>=shared.length)
     throw contextualError(sheetName,excelRow,address,knownHeader?.[col-1],raw,
      'Invalid shared string index.');
    raw=shared[idx];
   }
   const label=knownHeader?.[col-1]||'';
   if(f&&(!cached||type==='e'))
    throw contextualError(sheetName,excelRow,address,label,raw,
     'Formula has no supported cached result. Recalculate in Excel and save a values-only copy.');
   if(f&&String(f.textContent||'').includes('['))
    throw contextualError(sheetName,excelRow,address,label,raw,
     'External workbook formulas are not supported.');
   if(type==='e')throw contextualError(sheetName,excelRow,address,label,raw,
    'Spreadsheet error cells cannot be imported.');
   try{
    let value=raw;
    if(type==='b'){
     if(raw!=='1'&&raw!=='0')throw Error('Invalid cached boolean.');
     value=raw==='1'?'true':'false';
    }else if(type==='d'){
     value=normalizeTextDate(raw,{dateTime:raw.includes('T')||raw.includes(' ')});
    }else if(format&&raw!==''){
     value=normalizeExcelCellDate(raw,{
      date1904,format,cellType:type||'n'
     });
    }
    if(String(value).length>5000)throw Error('An imported cell exceeds 5,000 characters.');
    values[col-1]=String(value??'');
   }catch(error){
    throw contextualError(sheetName,excelRow,address,label,raw,error.message);
   }
  }
  if(values.some(x=>String(x??'').trim())){
   rows.push({number:excelRow,values});
   const candidate=headerCandidate(values);
   if(!knownHeader&&candidate)knownHeader=candidate;
  }
  if(rows.length>MAX_ROWS+70)
   throw new Error('Worksheet "'+sheetName+'" exceeds the supported row limit.');
 }
 return splitWorksheetSections(rows,sheetName);
}
async function parseWorkbook(buffer){
 const zip=zipDirectory(buffer);
 if(!zip.entries.has('xl/workbook.xml'))invalid('Not an XLSX workbook.');
 const wb=xmlDocument(await unzipEntry(zip,'xl/workbook.xml'));
 const rel=xmlDocument(await unzipEntry(zip,'xl/_rels/workbook.xml.rels'));
 const styles=zip.entries.has('xl/styles.xml')?
  styleDates(xmlDocument(await unzipEntry(zip,'xl/styles.xml'))):[];
 const shared=zip.entries.has('xl/sharedStrings.xml')?
  nodes(xmlDocument(await unzipEntry(zip,'xl/sharedStrings.xml')),'si').map(n=>
   nodes(n,'t').map(x=>x.textContent||'').join('')):[];
 if(shared.length>100000)invalid('Workbook shared strings exceed limits.');
 const relationships=new Map(nodes(rel,'Relationship').map(r=>[
  r.getAttribute('Id'),{target:r.getAttribute('Target'),
   type:r.getAttribute('Type'),external:r.getAttribute('TargetMode')==='External'}]));
 const sheetNodes=nodes(wb,'sheet');
 if(!sheetNodes.length||sheetNodes.length>20)invalid('Workbook must contain 1–20 worksheets.');
 const dateMode=first(wb,'workbookPr')?.getAttribute('date1904');
 const offset=dateMode==='1'||dateMode==='true'?1462:0;
 const sheets=[];
 for(const sheet of sheetNodes){
  const id=sheet.getAttribute('r:id')||sheet.getAttributeNS(
   'http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const relation=relationships.get(id);
  if(!relation||relation.external)invalid('Workbook contains an unsafe worksheet reference.');
  // Ignore chart sheets, which have no rows. They are not data-import targets.
  if(!relation.type?.endsWith('/worksheet'))continue;
  let path=relation.target;
  if(!path||path.includes('..')||path.includes('\\')||path.includes(':'))
   invalid('Workbook contains an unsafe worksheet reference.');
  path=path.startsWith('/xl/')?path.slice(1):'xl/'+path.replace(/^\//,'');
  if(!/^xl\/worksheets\/[^/]+\.xml$/i.test(path))
   invalid('Workbook contains an unexpected worksheet path.');
  const worksheetName=sheet.getAttribute('name')||'Sheet '+(sheets.length+1);
  const parsed=sheetRows(xmlDocument(await unzipEntry(zip,path)),
   shared,styles,offset===1462,worksheetName);
  // Blank sheets are ignored. Each populated report section is selectable.
  sheets.push(...parsed);
 }
 if(!sheets.length)invalid('Workbook contains no populated worksheets to import.');
 return sheets;
}
export async function parseImportFile(file){
 if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||
    file.size<=0||file.size>MAX_BYTES)invalid('Choose a nonempty file no larger than 8 MB.');
 const extension=file.name.toLowerCase().split('.').pop();
 if(!['csv','xlsx'].includes(extension))invalid('Only CSV and XLSX files are supported.');
 const buffer=await file.arrayBuffer();
 const sheets=extension==='csv'?
  [{name:'CSV',...parseDelimited(decodedText(buffer))}]:
  await parseWorkbook(buffer);
 return {name:file.name,type:extension,sheets};
}
