/** BIMP-03: real ZIP byte fixtures, conservative OOXML parser contract, CSV edge cases.
 * The fixture-only XML DOM below tests integration; it is NOT a substitute
 * for signed browser tests with native DOMParser, which remain a separate gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {parseDelimited,parseImportFile} from '../board-import-parse.js';

const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){
  crc^=byte;
  for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function zip64Extra(raw,packed){
 return Buffer.concat([u16(1),u16(16),u64(raw),u64(packed)]);
}
function makeZip(entries){
 const local=[],central=[];
 let at=0;
 for(const entry of entries){
  const name=Buffer.from(entry.name,'utf8');
  const raw=Buffer.from(entry.xml,'utf8');
  const method=entry.method??8;
  const packed=method===8?deflateRawSync(raw):raw;
  const crc=entry.invalidCrc?crc32(raw)^0x0000ffff:crc32(raw);
  const rawSize=entry.declaredSize??raw.length;
  const flags=entry.encrypted?1:0;
  const zip64=entry.zip64===true,version=zip64?45:20;
  const localExtra=zip64&&entry.zip64LocalExtra!==false?
   zip64Extra(entry.zip64LocalRawSize??rawSize,entry.zip64LocalPackedSize??packed.length):
   Buffer.alloc(0);
  const centralExtra=zip64&&entry.zip64CentralExtra!==false?
   zip64Extra(entry.zip64CentralRawSize??rawSize,entry.zip64CentralPackedSize??packed.length):
   Buffer.alloc(0);
  const localRaw=zip64?0xffffffff:rawSize;
  const localPacked=zip64?0xffffffff:packed.length;
  const centralRaw=zip64?0xffffffff:rawSize;
  const centralPacked=zip64?0xffffffff:packed.length;
  const l=Buffer.concat([
   u32(0x04034b50),u16(version),u16(flags),u16(method),u16(0),u16(0),
   u32(crc),u32(localPacked),u32(localRaw),u16(name.length),u16(localExtra.length),
   name,localExtra,packed
  ]);
  const c=Buffer.concat([
   u32(0x02014b50),u16(version),u16(version),u16(flags),u16(method),u16(0),u16(0),
   u32(crc),u32(centralPacked),u32(centralRaw),u16(name.length),u16(centralExtra.length),
   u16(0),u16(0),u16(0),u32(0),u32(at),name,centralExtra
  ]);
  local.push(l);central.push(c);at+=l.length;
 }
 const directory=Buffer.concat(central);
 const end=Buffer.concat([
  u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),
  u32(directory.length),u32(at),u16(0)
 ]);
 return Buffer.concat([...local,directory,end]);
}
const workbookXml=String.raw`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Empty" r:id="rId1"/><sheet name="Contacts" r:id="rId2"/></sheets></workbook>`;
const relsXml=String.raw`<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const emptySheet='<worksheet><sheetData/></worksheet>';
const contactsSheet=String.raw`<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c><c r="B2" t="n"><v>12.5</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Bob</t></is></c><c r="B3" t="n"><v>8</v></c></row>
</sheetData></worksheet>`;
function workbookEntries(){
 return [
  {name:'xl/workbook.xml',xml:workbookXml},
  {name:'xl/_rels/workbook.xml.rels',xml:relsXml},
  {name:'xl/worksheets/sheet1.xml',xml:emptySheet},
  {name:'xl/worksheets/sheet2.xml',xml:contactsSheet}
 ];
}
// Browser DOMParser stand-in for this controlled, no-entity OOXML fixture only.
function minimalXmlDom(source){
 function childrenOf(node){
  return node.children.flatMap(x=>x.tag==='text'?[]:[x,...childrenOf(x)]);
 }
 const create=(tag,attrs={})=>({
  tag,attrs,children:[],
  getAttribute(key){return this.attrs[key]??null;},
  getAttributeNS(_ns,key){return this.attrs['r:'+key]??this.attrs[key]??null;},
  getElementsByTagNameNS(_ns,local){return childrenOf(this).filter(x=>x.tag.split(':').at(-1)===local);},
  getElementsByTagName(name){return childrenOf(this).filter(x=>x.tag===name);},
  get textContent(){return this.children.map(x=>x.tag==='text'?x.text:x.textContent).join('');}
 });
 const root=create('root'),stack=[root],tokens=source.match(/<[^>]+>|[^<]+/g)||[];
 for(const token of tokens){
  if(token.startsWith('<?')||token.startsWith('<!--'))continue;
  if(token.startsWith('</')){assert.ok(stack.length>1);stack.pop();continue;}
  if(token.startsWith('<')){
   const m=token.match(/^<([A-Za-z_][A-Za-z0-9_:.-]*)/);
   assert.ok(m,'Fixture has invalid markup: '+token);
   const attrs={};
   for(const a of token.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g))attrs[a[1]]=a[2];
   const child=create(m[1],attrs);
   stack.at(-1).children.push(child);
   if(!token.endsWith('/>'))stack.push(child);
  }else stack.at(-1).children.push({tag:'text',text:token});
 }
 assert.equal(stack.length,1);
 return root;
}
async function parseWithFixtureDom(bytes){
 const original=globalThis.DOMParser;
 globalThis.DOMParser=class DOMParserFixture{
  parseFromString(text){return minimalXmlDom(text);}
 };
 try{return await parseImportFile(new File([bytes],'fixture.xlsx'));}
 finally{
  if(original===undefined)delete globalThis.DOMParser;
  else globalThis.DOMParser=original;
 }
}
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
test('CSV: semicolon, quoted multiline fields, UTF-16LE BOM, and short rows',async()=>{
 const csv=parseDelimited(['Name;Note;Value','"A, B";"first'+CRLF+'second";8','C;yes',''].join(CRLF));
 assert.deepEqual(csv.headers,['Name','Note','Value']);
 assert.deepEqual(csv.rows,[['A, B','first'+CRLF+'second','8'],['C','yes','']]);
 const buffer=Buffer.from([String.fromCharCode(0xfeff)+'Name,Score','A,10',''].join(CRLF),'utf16le');
 const result=await parseImportFile(new File([buffer],'utf16.csv'));
 assert.deepEqual(result.sheets[0].rows,[['A','10']]);
});
test('CSV: extra meaningful fields, duplicate normalized headers and bad quoting reject',()=>{
 assert.throws(()=>parseDelimited(['Name,Score','A,1,EXTRA'].join(LF)),/beyond its header columns/);
 assert.throws(()=>parseDelimited(['Name,name','A,B'].join(LF)),/unique/);
 assert.throws(()=>parseDelimited(['Name,Score','A,"abc"extra'].join(LF)),/Unexpected content/);
 assert.throws(()=>parseDelimited(['Name,Score','A,"unfinished'].join(LF)),/unterminated/);
 assert.deepEqual(parseDelimited(['Name,Score','A,1,',''].join(LF)).rows,[['A','1']]);
});
test('XLSX: actual deflate ZIP with empty sheet and absolute relationship target',async()=>{
 const parsed=await parseWithFixtureDom(makeZip(workbookEntries()));
 assert.equal(parsed.sheets.length,1);
 assert.equal(parsed.sheets[0].name,'Contacts');
 assert.deepEqual(parsed.sheets[0].headers,['Name','Score']);
 assert.deepEqual(parsed.sheets[0].rows,[['Alice','12.5'],['Bob','8']]);
});
test('XLSX: stored ZIP entries and header-only companion worksheets are supported',async()=>{
 const entries=workbookEntries().map(entry=>({...entry,method:0}));
 entries[2].xml='<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Unused Header</t></is></c></row></sheetData></worksheet>';
 const parsed=await parseWithFixtureDom(makeZip(entries));
 assert.equal(parsed.sheets.length,1);
 assert.equal(parsed.sheets[0].name,'Contacts');
});
test('XLSX: cached formulas are read as values, while unsupported formulas, duplicate cells and DTD reject',async()=>{
 const formula=workbookEntries();
 formula[3].xml=contactsSheet.replace('<v>12.5</v>','<f>2+2</f><v>4</v>');
 const parsed=await parseWithFixtureDom(makeZip(formula));
 assert.equal(parsed.sheets[0].rows[0][1],'4');
 const missing=workbookEntries();
 missing[3].xml=contactsSheet.replace('<v>12.5</v>','<f>2+2</f>');
 await assert.rejects(()=>parseWithFixtureDom(makeZip(missing)),
  /Worksheet "Contacts".*row 2.*B2.*no supported cached result/);
 const external=workbookEntries();
 external[3].xml=contactsSheet.replace('<v>12.5</v>','<f>[1]Other!A1</f><v>4</v>');
 await assert.rejects(()=>parseWithFixtureDom(makeZip(external)),
  /External workbook formulas are not supported/);
 const duplicate=workbookEntries();
 duplicate[3].xml=contactsSheet.replace('<c r="B2" t="n"><v>12.5</v></c>',
  '<c r="B2" t="n"><v>12.5</v></c><c r="B2" t="n"><v>99</v></c>');
 await assert.rejects(()=>parseWithFixtureDom(makeZip(duplicate)),/repeated or unsupported cell address/);
 const dtd=workbookEntries();dtd[0].xml='<!DOCTYPE workbook>'+workbookXml;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(dtd)),/entity and document declarations/);
});
test('XLSX: ZIP central checksum tampering is rejected before XML import',async()=>{
 const parts=workbookEntries();parts[0].invalidCrc=true;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/checksum mismatch/);
});
test('XLSX: malicious understated inflated size is rejected while streaming',async()=>{
 const parts=workbookEntries();parts[0].declaredSize=2;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/expands beyond its declared/);
});
test('XLSX: valid stored OOXML entry above 4 MB is accepted below file and aggregate limits',async()=>{
 const entries=workbookEntries();
 entries[0].method=0;
 entries[0].xml='\n'.repeat(4*1024*1024+1024)+entries[0].xml;
 const zip=makeZip(entries);
 assert.ok(zip.byteLength<8*1024*1024);
 const parsed=await parseWithFixtureDom(zip);
 assert.equal(parsed.sheets.length,1);
 assert.deepEqual(parsed.sheets[0].headers,['Name','Score']);
 assert.deepEqual(parsed.sheets[0].rows,[['Alice','12.5'],['Bob','8']]);
});

test('XLSX: highly compressible valid OOXML remains accepted within absolute size limits',async()=>{
 const entries=workbookEntries();
 // Normal OOXML often contains repetitive XML/whitespace. This single
 // workbook.xml entry deliberately exceeds the old arbitrary 200:1 ratio.
 entries[0].xml='\n'.repeat(50000)+entries[0].xml;
 const zip=makeZip(entries);
 assert.ok(zip.byteLength<8*1024*1024);
 const parsed=await parseWithFixtureDom(zip);
 assert.equal(parsed.sheets.length,1);
 assert.deepEqual(parsed.sheets[0].headers,['Name','Score']);
 assert.deepEqual(parsed.sheets[0].rows,[['Alice','12.5'],['Bob','8']]);
});

test('XLSX: Monday-style ZIP64 per-entry size metadata is accepted',async()=>{
 const entries=workbookEntries().map(entry=>({...entry,zip64:true}));
 const parsed=await parseWithFixtureDom(makeZip(entries));
 assert.equal(parsed.sheets.length,1);
 assert.equal(parsed.sheets[0].name,'Contacts');
 assert.deepEqual(parsed.sheets[0].headers,['Name','Score']);
 assert.deepEqual(parsed.sheets[0].rows,[['Alice','12.5'],['Bob','8']]);
});

test('XLSX: ZIP64 per-entry sizes require valid central and local extra metadata',async()=>{
 const missing=workbookEntries().map(entry=>({...entry,zip64:true}));
 missing[0].zip64CentralExtra=false;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(missing)),
  /ZIP64 XLSX entry is missing required size metadata/);
 const mismatch=workbookEntries().map(entry=>({...entry,zip64:true}));
 mismatch[0].zip64LocalRawSize=Buffer.byteLength(mismatch[0].xml)+1;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(mismatch)),
  /local entry sizes or checksum do not match/);
});

test('XLSX: unsupported compression, ZIP64 directory and oversized entries remain rejected',async()=>{
 const unsupported=workbookEntries();
 unsupported[0].method=12;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(unsupported)),
  /Unsupported XLSX compression method/);
 const zip64Directory=makeZip(workbookEntries());
 const eocd=zip64Directory.length-22;
 zip64Directory.writeUInt16LE(0xffff,eocd+8);
 zip64Directory.writeUInt16LE(0xffff,eocd+10);
 await assert.rejects(()=>parseWithFixtureDom(zip64Directory),
  /ZIP64 end-of-central-directory archives/);
 const oversized=workbookEntries().map(entry=>({...entry,zip64:true}));
 oversized[0].declaredSize=24*1024*1024+1;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(oversized)),
  /24 MB uncompressed limit/);
});

test('XLSX: encrypted ZIP and worksheet path traversal are rejected',async()=>{
 const parts=workbookEntries();parts[0].encrypted=true;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/Encrypted XLSX workbook entries/);
 const unsafe=workbookEntries();
 unsafe[1].xml=relsXml.replace('worksheets/sheet1.xml','../secret.xml');
 await assert.rejects(()=>parseWithFixtureDom(makeZip(unsafe)),/unsafe worksheet reference/);
});


/** Sanitized structural reproduction of Live_Identification_Status_1793847689.xlsx:
 * The source contains title row 1, first header row 3, styled string C20
 * ("2026-07-09 to 2026-08-18"), and a repeated header at row 23.
 * Values and names below are intentionally synthetic except the failing
 * cell, whose type, format and exact text constitute the regression.
 */
function styledReportEntries({invalidSerial=false,date1904=false}={}){
 const text=(r,cell,value,style=0)=>
  '<c r="'+cell+r+'" t="str"'+(style?' s="'+style+'"':'')+
  '><v>'+value+'</v></c>';
 const numeric=(r,cell,value,style=0)=>
  '<c r="'+cell+r+'" t="n"'+(style?' s="'+style+'"':'')+
  '><v>'+value+'</v></c>';
 const row=(r,...cells)=>'<row r="'+r+'">'+cells.join('')+'</row>';
 const headers=r=>row(r,text(r,'A','Name'),text(r,'B','Status'),
  text(r,'C','Date Updated'),text(r,'D','Location'),text(r,'E','Checkbox'));
 const document='<worksheet><sheetData>'+
  row(1,text(1,'A','Live Identification Status'))+
  row(2,text(2,'A','Running Monday Apps'))+
  headers(3)+
  row(4,text(4,'A','Sample App'),text(4,'B','Active'),
   numeric(4,'C',invalidSerial?'not-a-serial':46233,1),text(4,'E','v'))+
  row(7,text(7,'A','Time Tracker'),text(7,'B','Active'),
   numeric(7,'C',46252,1),text(7,'E','v'))+
  row(20,text(20,'C','2026-07-09 to 2026-08-18',1),
   text(20,'E','15/16'))+
  row(22,text(22,'A','Running Starlink'))+
  headers(23)+
  row(24,text(24,'A','Unit 1'),text(24,'B','Active'),
   text(24,'D','Location 1'))+
  row(25,text(25,'A','Unit 2'),text(25,'B','Active'),
   text(25,'D','Location 2'))+
  row(26,text(26,'E','0/2'))+
  '</sheetData></worksheet>';
 const workbook='<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  (date1904?'<workbookPr date1904="true"/>':'')+
  '<sheets><sheet name="live identification status" r:id="rId1"/></sheets></workbook>';
 const relationships='<Relationships><Relationship Id="rId1" '+
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '+
  'Target="worksheets/sheet1.xml"/></Relationships>';
 const styles='<styleSheet><numFmts count="1"><numFmt numFmtId="164" '+
  'formatCode="yyyy-mm-dd"/></numFmts><cellXfs count="2">'+
  '<xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';
 return [
  {name:'xl/workbook.xml',xml:workbook},
  {name:'xl/_rels/workbook.xml.rels',xml:relationships},
  {name:'xl/styles.xml',xml:styles},
  {name:'xl/worksheets/sheet1.xml',xml:document}
 ];
}
test('uploaded report structure: styled text C20 does not trigger invalid Excel date',async()=>{
 const workbook=await parseWithFixtureDom(makeZip(styledReportEntries()));
 assert.equal(workbook.sheets.length,2,'two independent report sections');
 const [apps,starlink]=workbook.sheets;
 assert.equal(apps.name,'live identification status — Running Monday Apps');
 assert.equal(apps.worksheet,'live identification status');
 assert.deepEqual(apps.headers,['Name','Status','Date Updated','Location','Checkbox']);
 assert.deepEqual(apps.rowNumbers,[4,7]);
 assert.deepEqual(apps.omittedRows,[20]);
 assert.deepEqual(apps.rows[0],['Sample App','Active','2026-07-30','','v']);
 assert.deepEqual(apps.rows[1],['Time Tracker','Active','2026-08-18','','v']);
 assert.equal(starlink.name,'live identification status — Running Starlink');
 assert.deepEqual(starlink.rowNumbers,[24,25]);
 assert.deepEqual(starlink.omittedRows,[26]);
 assert.equal(starlink.rows[1][0],'Unit 2');
});
test('invalid numeric date reports exact sheet, Excel cell and source value',async()=>{
 await assert.rejects(
  ()=>parseWithFixtureDom(makeZip(styledReportEntries({invalidSerial:true}))),
  error=>/Worksheet "live identification status"/.test(error.message)&&
   /row 4/.test(error.message)&&/cell C4/.test(error.message)&&
   /column "Date Updated"/.test(error.message)&&
   /value "not-a-serial"/.test(error.message)
 );
});
test('1904-date workbook flag adjusts true numeric serials only',async()=>{
 const entries=styledReportEntries({date1904:true});
 entries[3].xml=entries[3].xml.replace('<v>46233</v>','<v>0</v>');
 const parsed=await parseWithFixtureDom(makeZip(entries));
 assert.equal(parsed.sheets[0].rows[0][2],'1904-01-01');
});
