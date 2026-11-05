/** BIMP-01: bounded, dependency-free CSV/XLSX data reader. No workbook formula evaluation. */
const MAX_BYTES=8*1024*1024,MAX_ROWS=5000,MAX_COLUMNS=30;
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
 return validateImportSheet(headers,matrix.filter(r=>r.some(x=>String(x??'').trim())));
}
function decodedText(buffer){
 const data=new Uint8Array(buffer);
 if(data[0]===0xff&&data[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(data.subarray(2));
 if(data[0]===0xfe&&data[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(data.subarray(2));
 return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
function xmlDocument(text){
 if(text.includes('<!DOCTYPE')||text.includes('<!ENTITY'))invalid('Workbook XML declarations are not supported.');
 if(typeof DOMParser==='undefined')invalid('XLSX XML parsing is unavailable.');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)invalid('Workbook contains invalid XML.');
 return doc;
}
const nodes=(parent,name)=>Array.from(parent.getElementsByTagNameNS('*',name));
const first=(parent,name)=>nodes(parent,name)[0]||null;
const textNode=(parent,name)=>first(parent,name)?.textContent||'';
const le=(view,pos,n)=>n===2?view.getUint16(pos,true):view.getUint32(pos,true);
function zipDirectory(buffer){
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);
 let eocd=-1;
 for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--){
  if(le(view,p,4)===0x06054b50){eocd=p;break;}
 }
 if(eocd<0||le(view,eocd+4,2)||le(view,eocd+6,2))invalid('Not a supported XLSX ZIP workbook.');
 const count=le(view,eocd+10,2),offset=le(view,eocd+16,4);
 if(count>300||offset>=buffer.byteLength)invalid('Workbook ZIP directory exceeds limits.');
 const entries=new Map();let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>buffer.byteLength||le(view,p,4)!==0x02014b50)invalid('Damaged XLSX directory.');
  const flags=le(view,p+8,2),method=le(view,p+10,2),packed=le(view,p+20,4),raw=le(view,p+24,4);
  const nameLen=le(view,p+28,2),extra=le(view,p+30,2),comment=le(view,p+32,2),local=le(view,p+42,4);
  if(flags&1||![0,8].includes(method)||raw>4*1024*1024||packed>MAX_BYTES||
   (packed>0&&raw>packed*200))invalid('Encrypted, unusually compressed or oversized workbook entry.');
  total+=raw;if(total>24*1024*1024)invalid('Workbook expands beyond the safe XML limit.');
  const end=p+46+nameLen+extra+comment;
  if(end>buffer.byteLength)invalid('Damaged XLSX entry name.');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nameLen));
  if(name.includes('..')||name.startsWith('/')||name.includes('\\')||entries.has(name))
   invalid('Unsafe or duplicate XLSX path.');
  entries.set(name,{method,packed,raw,local});
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
  if(typeof DecompressionStream==='undefined')invalid('This browser does not support XLSX decompression.');
  let stream;
  try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
  catch{invalid('This browser does not support XLSX ZIP compression.');}
  const expanded=await new Response(stream).arrayBuffer();
  if(expanded.byteLength!==info.raw)invalid('XLSX entry length does not match.');
  data=new Uint8Array(expanded);
 }
 if(data.byteLength!==info.raw)invalid('Damaged XLSX entry size.');
 return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
function excelDate(serial,offset=0){
 const n=Number(serial);
 if(!Number.isFinite(n)||n<0||n>2958465)invalid('Invalid Excel date.');
 return new Date(Date.UTC(1899,11,30)+Math.floor(n+offset)*86400000).toISOString().slice(0,10);
}
function styleDates(doc){
 const formats=new Map(nodes(doc,'numFmt').map(x=>[Number(x.getAttribute('numFmtId')),x.getAttribute('formatCode')||'']));
 const xfs=nodes(first(doc,'cellXfs')||doc,'xf');
 return xfs.map(x=>{
  const id=Number(x.getAttribute('numFmtId'));
  return (id>=14&&id<=22)||(id>=45&&id<=47)||
   (formats.has(id)&&/[dmyhHsS]/.test(formats.get(id).replace(/"[^"]*"/g,'')));
 });
}
function sheetRows(xml,shared,dates,offset){
 const rows=[];
 for(const r of nodes(first(xml,'sheetData')||xml,'row')){
  const cells=[];
  for(const cell of nodes(r,'c')){
   if(nodes(cell,'f').length)invalid('Formula cells must be replaced with verified values before import.');
   const address=cell.getAttribute('r')||'';
   const letters=address.match(/^[A-Z]+/i)?.[0]||'';
   let col=0;for(const ch of letters.toUpperCase())col=col*26+ch.charCodeAt(0)-64;
   if(col<1||col>MAX_COLUMNS)invalid('XLSX exceeds 30 columns.');
   const t=cell.getAttribute('t'),raw=textNode(cell,'v');let value='';
   if(t==='inlineStr')value=nodes(first(cell,'is')||cell,'t').map(x=>x.textContent||'').join('');
   else if(t==='s'){const idx=Number(raw);if(!Number.isSafeInteger(idx)||idx<0||idx>=shared.length)invalid('Invalid shared string index.');value=shared[idx];}
   else if(t==='e')invalid('Spreadsheet error cells cannot be imported.');
   else if(t==='b')value=raw==='1'?'true':'false';
   else if(t==='d')value=raw.slice(0,10);
   else if(raw&&dates[Number(cell.getAttribute('s')||0)])value=excelDate(raw,offset);
   else value=raw;
   cells[col-1]=value;
  }
  if(cells.some(x=>String(x??'').trim()))rows.push(cells);
  if(rows.length>MAX_ROWS+1)invalid('XLSX exceeds 5,000 data rows.');
 }
 if(!rows.length)invalid('Worksheet is empty.');
 return validateImportSheet(rows.shift().map(x=>String(x??'').trim()),
  rows.map(r=>Array.from({length:Math.max(0,Math.min(MAX_COLUMNS,r.length))},(_,i)=>String(r[i]??''))));
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
  r.getAttribute('Id'),r.getAttribute('Target')]));
 const sheetNodes=nodes(wb,'sheet');
 if(!sheetNodes.length||sheetNodes.length>20)invalid('Workbook must contain 1–20 worksheets.');
 const offset=first(wb,'workbookPr')?.getAttribute('date1904')==='1'?1462:0;
 const sheets=[];
 for(const sheet of sheetNodes){
  const id=sheet.getAttribute('r:id')||sheet.getAttributeNS(
   'http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  let path=relationships.get(id);
  if(!path||path.includes('..')||path.includes('\\')||path.includes(':'))
   invalid('Workbook contains an unsafe worksheet reference.');
  path=path.startsWith('/xl/')?path.slice(1):'xl/'+path.replace(/^\//,'');
  const parsed=sheetRows(xmlDocument(await unzipEntry(zip,path)),shared,styles,offset);
  sheets.push({name:sheet.getAttribute('name')||'Sheet '+(sheets.length+1),...parsed});
 }
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
