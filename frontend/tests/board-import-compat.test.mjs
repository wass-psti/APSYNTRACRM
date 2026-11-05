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
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){
  crc^=byte;
  for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
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
  const l=Buffer.concat([
   u32(0x04034b50),u16(20),u16(flags),u16(method),u16(0),u16(0),
   u32(crc),u32(packed.length),u32(rawSize),u16(name.length),u16(0),
   name,packed
  ]);
  const c=Buffer.concat([
   u32(0x02014b50),u16(20),u16(20),u16(flags),u16(method),u16(0),u16(0),
   u32(crc),u32(packed.length),u32(rawSize),u16(name.length),u16(0),
   u16(0),u16(0),u16(0),u32(0),u32(at),name
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
 function element(tag,attrs={}){
  return {
   tag,attrs,children:[],
   getAttribute:key=>attrs[key]??null,
   getAttributeNS:(_ns,key)=>attrs['r:'+key]??attrs[key]??null,
   getElementsByTagNameNS:(_ns,local)=>childrenOf(this).filter(x=>x.tag.split(':').at(-1)===local),
   getElementsByTagName:name=>childrenOf(this).filter(x=>x.tag===name),
   get textContent(){return this.children.map(x=>x.tag==='text'?x.text:x.textContent).join('');}
  };
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
   const m=token.match(/^<([A-Za-z_][w:.-]*)/);
   assert.ok(m,'Fixture has invalid markup: '+token);
   const attrs={};
   for(const a of token.matchAll(/([A-Za-z_:][w:.-]*)="([^"]*)"/g))attrs[a[1]]=a[2];
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
test('CSV: semicolon, quoted multiline fields, UTF-16LE BOM, and short rows',async()=>{
 const csv=parseDelimited('Name;Note;Value
"A, B";"first
second";8
C;yes
');
 assert.deepEqual(csv.headers,['Name','Note','Value']);
 assert.deepEqual(csv.rows,[['A, B','first
second','8'],['C','yes','']]);
 const buffer=Buffer.from('﻿Name,Score
A,10
','utf16le');
 const result=await parseImportFile(new File([buffer],'utf16.csv'));
 assert.deepEqual(result.sheets[0].rows,[['A','10']]);
});
test('CSV: extra meaningful fields, duplicate normalized headers and bad quoting reject',()=>{
 assert.throws(()=>parseDelimited('Name,Score
A,1,EXTRA'),/beyond its header columns/);
 assert.throws(()=>parseDelimited('Name,name
A,B'),/unique/);
 assert.throws(()=>parseDelimited('Name,Score
A,"abc"extra'),/Unexpected content/);
 assert.throws(()=>parseDelimited('Name,Score
A,"unterminated'),/unterminated/);
 assert.deepEqual(parseDelimited('Name,Score
A,1,
').rows,[['A','1']]);
});
test('XLSX: actual deflate ZIP with empty sheet and absolute relationship target',async()=>{
 const parsed=await parseWithFixtureDom(makeZip(workbookEntries()));
 assert.equal(parsed.sheets.length,1);
 assert.equal(parsed.sheets[0].name,'Contacts');
 assert.deepEqual(parsed.sheets[0].headers,['Name','Score']);
 assert.deepEqual(parsed.sheets[0].rows,[['Alice','12.5'],['Bob','8']]);
});
test('XLSX: ZIP central checksum tampering is rejected before XML import',async()=>{
 const parts=workbookEntries();parts[0].invalidCrc=true;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/checksum mismatch/);
});
test('XLSX: malicious understated inflated size is rejected while streaming',async()=>{
 const parts=workbookEntries();parts[0].declaredSize=2;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/expands beyond its declared/);
});
test('XLSX: encrypted ZIP and worksheet path traversal are rejected',async()=>{
 const parts=workbookEntries();parts[0].encrypted=true;
 await assert.rejects(()=>parseWithFixtureDom(makeZip(parts)),/Encrypted, unusually compressed/);
 const unsafe=workbookEntries();
 unsafe[1].xml=relsXml.replace('worksheets/sheet1.xml','../secret.xml');
 await assert.rejects(()=>parseWithFixtureDom(makeZip(unsafe)),/unsafe worksheet reference/);
});
