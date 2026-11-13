/** BIMP-02: client-side import preview and the existing atomic RPC contract.
 * Never emulates an import with multiple individual mutations.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';
import {isProtectedBoard} from './board-card-lifecycle.js';
import {moduleByBoardName} from './board-manifest.js';
import {detectMondayCheckboxMarkers,mondayCheckboxCell} from './monday-import-compat.js';
import {cmp02Validate} from './board-typed-cmp02.js';
import {normalizeTextDate} from './excel-date-normalization.js?v=cp-bimp-06-utc-20261111';
export const IMPORT_CONTRACT='m143-v1';
export const IMPORT_EXTENDED_CONTRACT='m143-v2';
export const EXTENDED_REF_KEY='__aps_extended_ref_v1';
export const CREATABLE_IMPORT_TYPES=Object.freeze([
 'text','long_text','number','date','people','checkbox','timeline','email','url'
]);
const creatable=new Set(CREATABLE_IMPORT_TYPES);
const allowedTypes=new Set([...creatable,'status','dropdown','phone','rating','percentage']);
const deny=(msg,status=400)=>{throw new ApiError(msg,status);};
const uncertainImport=(cause=null)=>{
 const decoding=cause?.code==='INVALID_JSON_RESPONSE';
 const mismatch=cause?.code==='IMPORT_READBACK_MISMATCH';
 const detail=decoding?' The server returned an invalid JSON response.':
  mismatch?' The authoritative board readback did not match the import receipt.':
  cause?' The committed import could not be verified from the authoritative board readback.':'';
 const error=new ApiError(
  'Import outcome is uncertain.'+detail+
  ' Do not retry this request. Close the wizard, refresh the board, and check its activity log before starting a new import.',409);
 error.importOutcomeUncertain=true;
 if(cause){
  error.cause=cause;
  if(decoding||mismatch)error.code=cause.code;
 }
 throw error;
};
const sameIds=(actual,expected)=>{
 if(!Array.isArray(actual)||!Array.isArray(expected)||actual.length!==expected.length)return false;
 const expectedSet=new Set(expected),actualSet=new Set(actual);
 return expectedSet.size===expected.length&&actualSet.size===actual.length&&
  actual.every(id=>expectedSet.has(id));
};
const equalValue=(a,b)=>{
 if(Object.is(a,b))return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equalValue(v,b[i]));
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
 return ak.length===bk.length&&ak.every((key,i)=>key===bk[i]&&equalValue(a[key],b[key]));
};
const cellIndex=detail=>{
 const values=new Map(),duplicates=new Set();
 for(const cell of detail.values||[]){
  const key=cell.item_id+':'+cell.column_id;
  if(values.has(key))duplicates.add(key);
  else values.set(key,cell.value);
 }
 return {values,duplicates};
};
const readCell=(item,column,index)=>{
 if(column.system_key==='status')return item.status??null;
 const key=item.id+':'+column.id;
 if(index.duplicates.has(key))
  throw new ApiError('Duplicate cell rows in authoritative import readback.',409,'IMPORT_READBACK_MISMATCH');
 return index.values.get(key)??null;
};
const mappedColumns=(plan,before,after)=>{
 const result=new Map();
 for(const mapping of plan.payload.mappings){
  if(mapping.action==='skip'||mapping.action==='item')continue;
  let column;
  if(mapping.action==='existing'){
   column=(after.columns||[]).find(candidate=>candidate.id===mapping.columnId);
   const original=(before.columns||[]).find(candidate=>candidate.id===mapping.columnId);
   if(!column||!original||column.name!==original.name||
      column.data_type!==original.data_type||column.system_key!==original.system_key||
      !equalValue(column.config||{},original.config||{}))
    throw new ApiError('An existing mapped column changed during import.',409,'IMPORT_READBACK_MISMATCH');
  }else if(mapping.action==='create'){
   const candidates=(after.columns||[]).filter(candidate=>candidate.id&&
    !plan.readback.baselineColumnIds.includes(candidate.id)&&
    candidate.name===mapping.name&&candidate.data_type===mapping.columnType);
   if(candidates.length!==1||!equalValue(candidates[0].config||{},{}))
    throw new ApiError('A newly created mapped column was not uniquely persisted.',409,'IMPORT_READBACK_MISMATCH');
   column=candidates[0];
  }
  if(!column)throw new ApiError('A mapped import column is missing after commit.',409,'IMPORT_READBACK_MISMATCH');
  result.set(mapping.source,column);
 }
 return result;
};
function verifyImportReadback(plan,before,after){
 const snapshot=plan?.readback;
 if(!snapshot||after?.board?.id!==plan.boardId||
    after.board.workspace_id!==plan.workspaceId||after.board.status!=='active'||
    !Array.isArray(after.groups)||!Array.isArray(after.columns)||
    !Array.isArray(after.items)||!Array.isArray(after.values))
  throw new ApiError('The authoritative board response is incomplete or out of scope.',409,'IMPORT_READBACK_MISMATCH');
 let groupId;
 if(snapshot.group.action==='existing'){
  groupId=snapshot.group.groupId;
  if(!(after.groups||[]).some(group=>group.id===groupId))
   throw new ApiError('The destination group is missing after import.',409,'IMPORT_READBACK_MISMATCH');
 }else{
  const groups=after.groups.filter(group=>!snapshot.baselineGroupIds.includes(group.id)&&
   group.title===snapshot.group.name);
  if(groups.length!==1)
   throw new ApiError('The imported destination group was not uniquely persisted.',409,'IMPORT_READBACK_MISMATCH');
  groupId=groups[0].id;
 }
 const columns=mappedColumns(plan,before,after),cells=cellIndex(after);
 const baselineItems=new Set(snapshot.baselineItemIds);
 const newItems=after.items.filter(item=>!item.archived_at&&item.group_id===groupId&&!baselineItems.has(item.id));
 const createdRows=snapshot.rows.filter(row=>row.outcome==='create');
 if(newItems.length!==createdRows.length)
  throw new ApiError('The number of newly persisted items does not match the import plan.',409,'IMPORT_READBACK_MISMATCH');
 const candidatesByTitle=new Map();
 for(const item of newItems){
  const list=candidatesByTitle.get(item.title)||[];list.push(item);candidatesByTitle.set(item.title,list);
 }
 const valuesMatch=(item,row)=>Object.entries(row.values).every(([source,expected])=>{
  const column=columns.get(source);
  return !!column&&equalValue(readCell(item,column,cells),expected);
 });
 for(const row of createdRows){
  const candidates=candidatesByTitle.get(row.title)||[];
  const index=candidates.findIndex(item=>valuesMatch(item,row));
  if(index<0)
   throw new ApiError('An imported item or one of its mapped values is missing after commit.',409,'IMPORT_READBACK_MISMATCH');
  candidates.splice(index,1);
 }
 for(const row of snapshot.rows){
  if(row.outcome==='update'){
   const item=after.items.find(candidate=>candidate.id===row.itemId&&
    !candidate.archived_at&&candidate.group_id===groupId&&candidate.title===row.title);
   if(!item||!valuesMatch(item,row))
    throw new ApiError('An updated item or one of its mapped values is missing after commit.',409,'IMPORT_READBACK_MISMATCH');
   for(const [source,expected] of Object.entries(row.baselineValues||{})){
    if(Object.hasOwn(row.values,source))continue;
    const column=columns.get(source);
    if(column&&!equalValue(readCell(item,column,cells),expected))
     throw new ApiError('An empty imported cell unexpectedly overwrote an existing value.',409,'IMPORT_READBACK_MISMATCH');
   }
  }else if(row.outcome==='skip'&&row.itemId){
   const item=after.items.find(candidate=>candidate.id===row.itemId&&
    !candidate.archived_at&&candidate.group_id===groupId);
   if(!item||item.title!==row.title)
    throw new ApiError('A skipped existing item changed during import.',409,'IMPORT_READBACK_MISMATCH');
   for(const [source,expected] of Object.entries(row.baselineValues||{})){
    const column=columns.get(source);
    if(column&&!equalValue(readCell(item,column,cells),expected))
     throw new ApiError('A skipped existing cell changed during import.',409,'IMPORT_READBACK_MISMATCH');
   }
  }
 }
 return true;
}
const clean=s=>String(s??'').trim();
const key=s=>clean(s).toLocaleLowerCase();
const matchText=s=>key(s);
const forbidFormula=s=>{
 if(/^[=+@]/.test(s)||/^-(?!\d+(?:\.\d+)?$)/.test(s))
  deny('Spreadsheet formula-like text is not accepted. Replace it with literal data.');
};
function parseImportNumber(value){
 let text=clean(value);
 if(!text)return null;
 let negative=false;
 if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1).trim();}
 text=text.replace(/^(?:USD|PHP|EUR|GBP|JPY)\s*/i,'')
  .replace(/[₱$€£¥₹]/g,'').replace(/\s/g,'');
 if(!/^[+-]?[\d.,]+$/.test(text))return null;
 const comma=text.lastIndexOf(','),dot=text.lastIndexOf('.');
 if(comma>=0&&dot>=0){
  const decimal=comma>dot?',':'.',group=decimal===','?'.':',';
  const parts=text.split(decimal);
  if(parts.length!==2||!/^\d{1,3}(?:[.,]\d{3})+$/.test(parts[0].replace(/^[+-]/,''))||
     !/^\d+$/.test(parts[1]))return null;
  text=parts[0].replaceAll(group,'')+'.'+parts[1];
 }else if(comma>=0){
  const parts=text.split(',');
  if(parts.length>2){
   if(!/^\d{1,3}$/.test(parts[0].replace(/^[+-]/,''))||parts.slice(1).some(p=>!/^\d{3}$/.test(p)))return null;
   text=parts.join('');
  }else if(parts[1].length===3){
   text=parts.join('');
  }else if(parts[1].length>=1&&parts[1].length<=2){
   text=parts[0]+'.'+parts[1];
  }else return null;
 }else if((text.match(/\./g)||[]).length>1){
  const parts=text.split('.');
  if(!/^\d{1,3}$/.test(parts[0].replace(/^[+-]/,''))||parts.slice(1).some(p=>!/^\d{3}$/.test(p)))return null;
  text=parts.join('');
 }
 const number=Number(text);
 if(!Number.isFinite(number))return null;
 return negative?-Math.abs(number):number;
}
function normalizeImportDate(value){
 const text=clean(value);
 if(validDate(text))return text;
 // Monday.com "Date encoded" exports use "YYYY-MM-DD HH:mm:ss UTC".
 // Date columns preserve the source calendar date; they do not invent a
 // time component or shift the day through the viewer's local timezone.
 try{
  const timestamp=normalizeTextDate(text,{dateTime:true});
  if(timestamp)return timestamp.slice(0,10);
 }catch{/* Continue with the explicit slash-date formats below. */}
 let match=text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
 if(match){
  const iso=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
  return validDate(iso)?iso:null;
 }
 match=text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
 if(match){
  const a=Number(match[1]),b=Number(match[2]),year=match[3];
  let month,day;
  if(a>12&&b>=1&&b<=12){day=a;month=b;}
  else if(b>12&&a>=1&&a<=12){month=a;day=b;}
  else return null;
  const iso=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  return validDate(iso)?iso:null;
 }
 return null;
}
export function inferImportType(header,values=[]){
 const label=key(header),all=values.map(clean).filter(Boolean),sample=all.slice(0,100);
 // An entirely empty source column has no evidence for a choice schema.
 // Treat it as text so it can map to an existing same-name column (including
 // Status) or be created as an ordinary empty text column without requiring
 // impossible option setup.
 if(!all.length)return 'text';
 if(label==='status'||label==='priority')return 'status';
 if(label.includes('checkbox')||label.startsWith('is '))return 'checkbox';
 if(label.includes('date')||label.endsWith(' at'))return 'date';
 if(label==='phone'||label.includes('mobile')||label.includes('telephone'))return 'phone';
 if(label==='rating'||label.endsWith(' rating'))return 'rating';
 if(label.includes('percentage')||label.endsWith(' percent')||label.endsWith(' %'))return 'percentage';
 if(label.includes('email'))return 'email';
 if(label.includes('url')||label.includes('website'))return 'url';
 // Scan the entire source column: long descriptions can appear after the first 100 rows.
 if(all.some(value=>value.length>1000))return 'long_text';
 if(!sample.length)return 'text';
 if(sample.every(x=>/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)%$/.test(x)))return 'percentage';
 if(sample.every(x=>/^(true|false|yes|no|0|1)$/i.test(x)))return 'checkbox';
 if(sample.every(x=>parseImportNumber(x)!==null))return 'number';
 if(sample.every(x=>normalizeImportDate(x)!==null))return 'date';
 if(sample.every(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))return 'email';
 if(sample.every(x=>/^https?:\/\/\S+$/i.test(x)))return 'url';
 return 'text';
}
export function availableImportColumns(detail){
 // Import targets are physical board data columns, not just the newer
 // custom:* columns. Dedicated/legacy board creation also uses col_* keys.
 // Visibility is presentation metadata: hidden columns remain valid storage
 // targets and must not disappear from the import mapping catalogue.
 return (detail?.columns||[]).filter(c=>validUuid(c.id)&&
  allowedTypes.has(c.data_type)&&(c.system_key==null||c.system_key==='status')&&
  typeof c.column_key==='string'&&c.column_key.trim().length>0)
  .map(c=>({id:c.id,name:c.name,type:c.data_type,system_key:c.system_key||null,
   config:c.config||{},visible:c.visible!==false,columnKey:c.column_key}));
}
function autoTitle(headers){
 const exact=['item','name','title','item name','record'];
 return headers.find(h=>exact.includes(key(h)))||headers[0];
}
export function initialImportMappings(sheet,detail,{canCreate=false,extendedReferences=false}={}){
 const columns=availableImportColumns(detail),primary=autoTitle(sheet.headers),used=new Set();
 return sheet.headers.map((source,i)=>{
  const sourceValues=sheet.rows.map(r=>r[i]);
  const type=inferImportType(source,sourceValues);
  if(source===primary)return {source,action:'item',type:'text'};
  const named=columns.filter(c=>key(c.name)===key(source)&&!used.has(c.id));
  const mondayMarkers=named.some(column=>column.type==='checkbox')&&
   detectMondayCheckboxMarkers(sheet,source);
  // Preserve the first incompatible worksheet row for the mapping wizard.
  // Never embed the raw rejected cell: imported worksheets can contain private
  // documents, passwords and other sensitive content.
  const targetChecks=named.map(column=>{
   let invalidIndex=-1;
   for(let n=0;n<sourceValues.length;n++){
    if(!clean(sourceValues[n]))continue;
    try{
     if(column.type==='checkbox'&&mondayMarkers)mondayCheckboxCell(sourceValues[n]);
     else valueAsType(sourceValues[n],column.type,column.config,extendedReferences);
    }catch{invalidIndex=n;break;}
   }
   return {column,invalidIndex};
  });
  const compatible=targetChecks.filter(x=>x.invalidIndex<0).map(x=>x.column);
  const exact=compatible.filter(c=>c.type===type);
  const target=exact.length===1?exact[0]:
   exact.length===0&&compatible.length===1?compatible[0]:null;
  if(target){
   used.add(target.id);
   return {source,action:'existing',columnId:target.id,type,
    detectedType:type,targetType:target.type,hidden:!target.visible};
  }
  // A dedicated board can have a same-name Status column whose palette is
  // missing source labels. Offer to extend that *existing* column rather
  // than falsely claiming the source cannot be imported or duplicating it.
  // The current server supports in-place Status label changes, not Dropdown.
  const missingStatus=named.length===1&&named[0].type==='status'&&
   sourceValues.some(value=>clean(value))?named[0]:null;
  if(canCreate&&missingStatus){
   return {source,action:'configure',type,choiceType:'status',
    name:missingStatus.name,existingColumnId:missingStatus.id,requiresDecision:true};
  }
  if(canCreate&&(type==='status'||type==='dropdown')&&
     !columns.some(c=>key(c.name)===key(source)))
   return {source,action:'configure',type,choiceType:type,name:source,requiresDecision:true};
  if(canCreate&&creatable.has(type)&&!columns.some(c=>key(c.name)===key(source))){
   return {source,action:'create',type,columnType:type,name:source,requiresDecision:true};
  }
  const conflict=targetChecks.length?{
   destinationTypes:[...new Set(targetChecks.map(x=>x.column.type))],
   reason:compatible.length>1?'ambiguous':
    targetChecks.some(x=>x.invalidIndex>=0)?'incompatible':'unresolved',
   row:targetChecks.filter(x=>x.invalidIndex>=0).map(x=>
    sheet.rowNumbers?.[x.invalidIndex]??x.invalidIndex+2).sort((a,b)=>a-b)[0]??null
  }:null;
  return {source,action:'skip',type,proposed:type,requiresDecision:true,
   ...(conflict?{conflict}:{})};
 });
}
function validDate(raw){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
 const d=new Date(raw+'T00:00:00Z');
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===raw;
}
function valueAsType(raw,type,config={},extendedReferences=false){
 const text=clean(raw);
 if(!text)return null;
 if(['phone','rating','percentage'].includes(type)){
  try{return cmp02Validate(type,text,config,{allowPercentSymbol:type==='percentage'});}
  catch(error){deny(error.message);}
 }
 if(type==='number'){
  const number=parseImportNumber(text);
  if(number===null)deny('A number cell contains an invalid value: '+text.slice(0,60));
  return number;
 }
 if(type==='checkbox'){
  if(/^(true|yes|1)$/i.test(text))return true;
  if(/^(false|no|0)$/i.test(text))return false;
  deny('A checkbox accepts only yes/no, true/false or 1/0.');
 }
 // Literal worksheet/CSV cell text is inert board data. Excel formula cells
 // are handled separately by the XLSX parser (cached values or warnings).
 // Do not reject passwords, mentions, negative durations or other text merely
 // because their first character resembles spreadsheet formula syntax.
 if(type==='date'){
  const date=normalizeImportDate(text);
  if(!date)deny('Date cells must contain a valid ISO, YYYY/MM/DD, or unambiguous day/month or month/day date.');
  return date;
 }
 if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
  deny('Invalid email in imported data.');
 if(type==='url'&&!/^https?:\/\/[^\s]+$/i.test(text))
  deny('URL cells must use HTTP(S).');
 if(type==='people'&&!validUuid(text))deny('People cells require an existing member UUID.');
 if(type==='timeline'){
  const parts=text.split(/\s*\.\.\s*/);
  const start=parts.length===2?normalizeImportDate(parts[0]):null;
  const end=parts.length===2?normalizeImportDate(parts[1]):null;
  if(!start||!end||start>end)
   deny('Timeline cells must contain two valid dates in YYYY-MM-DD..YYYY-MM-DD or an unambiguous supported date format.');
  return {start,end};
 }
 if(type==='status'){
  const options=Array.isArray(config.labels)?config.labels:[];
  const found=options.find(o=>key(o.id)===key(text)||
   key(o.label||o.name||o.title)===key(text));
  if(!found||found.active===false)deny('Status must match a configured option.');
  return String(found.id);
 }
 if(type==='dropdown'){
  const options=Array.isArray(config.options)?config.options:[];
  const found=options.find(o=>key(o)===key(text));
  if(found==null)deny('Dropdown value must match an existing option.');
  return found;
 }
 const limit=type==='long_text'?5000:type==='email'?320:type==='url'?2000:1000;
 if(text.length>limit){
  if(extendedReferences&&['text','long_text','url'].includes(type)&&
     text.length<=65536&&(!['url'].includes(type)||/^https?:\/\/[^\s]+$/i.test(text)))
   return {[EXTENDED_REF_KEY]:text};
  deny('A '+type+' cell exceeds '+limit+' characters.');
 }
 return text;
}
/**
 * Inspect every source row before import. Invalid mapped values are never
 * coerced or silently discarded; callers must explicitly acknowledge the
 * complete source-row exclusion set before committing the accepted subset.
 * No database mutations or permission decisions occur here.
 */
export function reviewImportSourceRows({sheet,detail,mappings,matches,
 extendedReferences=false}={}){
 if(!Array.isArray(sheet?.headers)||!Array.isArray(sheet?.rows)||
    !Array.isArray(mappings)||mappings.length!==sheet.headers.length)
  deny('Import source and column mapping are required.');
 const headers=new Map(sheet.headers.map((h,i)=>[h,i]));
 const primary=mappings.find(m=>m.action==='item')?.source;
 const cols=new Map(availableImportColumns(detail).map(c=>[c.id,c]));
 const mapped=mappings.filter(m=>['existing','create'].includes(m.action)).map(m=>({
  source:m.source,index:headers.get(m.source),
  column:m.action==='existing'?cols.get(m.columnId):
   {type:m.columnType||m.type,config:{}}
 }));
 const checkbox=new Set(mapped.filter(m=>m.column?.type==='checkbox'&&
  detectMondayCheckboxMarkers(sheet,m.source)).map(m=>m.source));
 const matchSource=matches?.behavior==='add-new'||!matches?.behavior?null:
  matches.matchColumnId==='item'?primary:
  mappings.find(m=>m.action==='existing'&&m.columnId===matches.matchColumnId)?.source;
 const accepted=[],rowNumbers=[],rejected=[],seen=new Set();
 for(let index=0;index<sheet.rows.length;index++){
  const cells=sheet.rows[index],line=sheet.rowNumbers?.[index]??index+2;
  let field=primary||'Item';
  try{
   if(!primary||!headers.has(primary))deny('Map exactly one Item title column.');
   const title=clean(cells[headers.get(primary)]);
   if(!title||title.length>240)deny('Item title must have 1–240 characters.');
   forbidFormula(title);
   const converted=new Map([[primary,title]]);
   for(const mapping of mapped){
    field=mapping.source;
    if(!mapping.column)deny('The mapped destination column is unavailable.');
    const raw=cells[mapping.index];
    converted.set(field,checkbox.has(field)?
     mondayCheckboxCell(raw):
     valueAsType(raw,mapping.column.type,mapping.column.config||{},extendedReferences));
   }
   if(matchSource){
    field=matchSource;
    const value=converted.has(field)?converted.get(field):
     cells[headers.get(field)];
    const k=matchText(value);
    if(!k)deny('Duplicate-match key is empty.');
    if(seen.has(k))deny('Duplicate-match key appears twice in the source.');
    seen.add(k);
   }
   accepted.push(cells);rowNumbers.push(line);
  }catch(error){
   // No source cell values in error reports, which may contain private data.
   rejected.push({row:line,column:field,
    reason:String(error?.message||'Invalid mapped value')
     .replace(/A number cell contains an invalid value:.*/, 'A number cell contains an invalid value.')
     .slice(0,220)});
  }
 }
 return {sheet:{...sheet,rows:accepted,
   ...(sheet.rowNumbers?{rowNumbers}:{} )},
  sourceRows:sheet.rows.length,acceptedRows:accepted.length,rejected};
}
export function buildImportPlan({sheet,detail,mappings,group,matches,
 allowColumns=false,extendedReferences=false}={}){
 if(!detail?.board||!Array.isArray(sheet?.headers)||!Array.isArray(sheet?.rows)||
  !Array.isArray(mappings)||mappings.length!==sheet.headers.length)
  deny('Import preview is incomplete.');
 if(sheet.omittedRows?.length&&sheet.omittedRowsConfirmed!==true)
  deny('Confirm whether to exclude the worksheet summary rows before importing.');
 if(sheet.formulaWarnings?.length&&sheet.formulaWarningsConfirmed!==true)
  deny('Confirm that uncached formula cells will be imported as blank before continuing.');
 const board=detail.board;
 if(!canManuallyEditBoard(board,true)||isProtectedBoard(board)||moduleByBoardName(board.name))
  deny('Application-owned or protected boards require their domain-specific import workflow.',403);
 if(!validUuid(board.id)||!validUuid(board.workspace_id)||!Number.isFinite(Date.parse(board.updated_at)))
  deny('Board revision and workspace are required.',409);
 const columns=availableImportColumns(detail),byId=new Map(columns.map(c=>[c.id,c]));
 const headers=new Set(sheet.headers),mapped=new Set(),targets=new Set();
 let primary=null;const normalized=[],proposed=[],refMap=new Map();
 for(const mapping of mappings){
  const source=mapping.source,action=mapping.action;
  if(!headers.has(source)||mapped.has(source)||!['item','existing','create','skip'].includes(action))
   deny('Invalid or repeated column mapping.');
  mapped.add(source);
  if(action==='item'){
   if(primary)deny('Map exactly one primary Item column.');
   primary=source;normalized.push({source,action});
  }else if(action==='existing'){
   const c=byId.get(mapping.columnId);
   if(!c||targets.has(c.id))deny('Two sources cannot map to one existing column.');
   targets.add(c.id);refMap.set(source,c);
   normalized.push({source,action,columnId:c.id});
  }else if(action==='create'){
   if(!allowColumns)deny('Missing columns require explicit Allow before creation.',403);
   const type=mapping.columnType||mapping.type;
   const name=clean(mapping.name||source);
   if(!creatable.has(type)||!name||name.length>80)
    deny('This column type requires separate configuration or an unambiguous type selection.');
   if(columns.some(c=>key(c.name)===key(name))||
      proposed.some(c=>key(c.name)===key(name)))deny('Column already exists; map to it instead.');
   proposed.push({source,name,type,config:{}});
   refMap.set(source,{name,type,config:{}});
   normalized.push({source,action,name,columnType:type});
  }else{
   if(mapping.requiresDecision===true)
    deny('Choose a destination or explicitly confirm exclusion for source column "'+source+'".');
   normalized.push({source,action});
  }
 }
 if(!primary)deny('Map exactly one title column.');
 if(normalized.filter(mapping=>mapping.action!=='skip').length>30)
  deny('The atomic import contract supports at most 30 mapped source columns. Map compatible sources into the available destinations or explicitly exclude the others.');
 if((detail.columns||[]).length+proposed.length>30)deny('Board maximum is 30 physical columns.');
 const destination=group?.action==='existing'&&validUuid(group.groupId)&&
  (detail.groups||[]).some(g=>g.id===group.groupId)?
  {action:'existing',groupId:group.groupId}:
  group?.action==='create'&&clean(group.name).length>=1&&clean(group.name).length<=120&&
  !(detail.groups||[]).some(g=>key(g.title)===key(group.name))?
  {action:'create',name:clean(group.name)}:null;
 if(!destination)deny('Select an existing Group or a unique new Group name.');
 const behavior=matches?.behavior||'add-new';
 if(!['add-new','skip','update'].includes(behavior))deny('Invalid duplicate handling.');
 if(behavior==='update'&&destination.action==='create')
  deny('Updates require an existing Group.');
 const matchId=behavior==='add-new'?null:matches?.matchColumnId;
 if(behavior!=='add-new'&&matchId!=='item'&&!byId.has(matchId))
  deny('Choose a valid mapped column to identify duplicates.');
 const matchColumn=byId.get(matchId);
 if(matchColumn&&!['text','email','url','dropdown','status'].includes(matchColumn.type))
  deny('This column type is not supported for duplicate matching.');
 const matchSource=matchId==='item'?primary:
  normalized.find(m=>m.action==='existing'&&m.columnId===matchId)?.source;
 if(behavior!=='add-new'&&!matchSource)deny('The duplicate-match column must be included in the import.');
 const items=(detail.items||[]).filter(i=>!i.archived_at&&i.group_id===destination.groupId);
 const stored=new Map((detail.values||[]).map(v=>[v.item_id+':'+v.column_id,v.value]));
 const itemMatches=new Map(),duplicateKeys=new Set();
 const valueFor=item=>matchId==='item'?item.title:
  matchColumn?.config&&matchColumn.id&&matchColumn.type==='status'&&
  matchColumn.system_key==='status'?item.status:stored.get(item.id+':'+matchId);
 if(behavior!=='add-new'&&destination.action==='existing'){
  for(const item of items){
   const k=matchText(valueFor(item));
   if(!k)continue;
   if(itemMatches.has(k))itemMatches.set(k,null);
   else itemMatches.set(k,item);
  }
 }
 const rows=[],readbackRows=[];let previewExisting=0,previewNew=0,previewSkipped=0;
 const byHeader=new Map(sheet.headers.map((h,i)=>[h,i]));
 // A marker-only source is a verified monday.com checkbox text convention:
 // "v" is checked and a blank is unchecked, unlike generic missing cells.
 const mondayCheckboxes=new Set([...refMap].filter(([source,col])=>
  col.type==='checkbox'&&detectMondayCheckboxMarkers(sheet,source)).map(([source])=>source));
 for(let i=0;i<sheet.rows.length;i++){
  const sourceRow=sheet.rows[i],sourceLine=sheet.rowNumbers?.[i]??i+2;
  const origin='Worksheet "'+(sheet.worksheet||sheet.name||'CSV')+'" · row '+sourceLine;
  const title=clean(sourceRow[byHeader.get(primary)]);
  if(!title||title.length>240)
   deny(origin+' · column "'+primary+'": Item title must have 1–240 characters.');
  forbidFormula(title);
  const values={};
  for(const [source,col] of refMap){
   const raw=sourceRow[byHeader.get(source)];
   let value;
   try{value=mondayCheckboxes.has(source)?
    mondayCheckboxCell(raw):valueAsType(raw,col.type,col.config,extendedReferences);}
   catch(error){
    const original=String(raw??'').slice(0,96);
    deny(origin+' · column "'+source+'" · value "'+original+'": '+error.message,
     error.status||400);
   }
   if(value!==null)values[source]=value;
  }
  const row={title,values};
  let outcome='create',itemId=null,baselineValues={};
  if(behavior!=='add-new'){
   const candidate=matchSource===primary?title:values[matchSource];
   const k=matchText(candidate);
   if(!k)deny(origin+' · column "'+matchSource+'": Duplicate-match key is empty.');
   if(duplicateKeys.has(k))deny(origin+' · column "'+matchSource+'": Duplicate-match key appears twice in the file.');
   duplicateKeys.add(k);
   const existing=itemMatches.get(k);
   if(existing===null)deny('The destination Group has ambiguous duplicate keys.');
   if(existing&&behavior==='update'){
    if(!existing.updated_at)deny('Existing item revision unavailable.',409);
    row.expected_item_updated_at=existing.updated_at;
    previewExisting++;outcome='update';itemId=existing.id;
    for(const [source,column] of refMap){
     if(column.id&&!Object.hasOwn(values,source))baselineValues[source]=
      column.system_key==='status'?existing.status??null:stored.get(existing.id+':'+column.id)??null;
    }
   }else if(existing&&behavior==='skip'){
    previewSkipped++;outcome='skip';itemId=existing.id;
    for(const [source,column] of refMap){
     if(column.id)baselineValues[source]=column.system_key==='status'?
      existing.status??null:stored.get(existing.id+':'+column.id)??null;
    }
   }else if(!existing&&behavior==='update'){
    previewSkipped++;outcome='skip';
   }else previewNew++;
  }else previewNew++;
  rows.push(row);
  const readbackValues=Object.fromEntries(Object.entries(values).map(([source,value])=>
   [source,value&&typeof value==='object'&&Object.hasOwn(value,EXTENDED_REF_KEY)?
    value[EXTENDED_REF_KEY]:value]));
  readbackRows.push({title,values:readbackValues,outcome,itemId,baselineValues});
 }
 if(rows.length<1||rows.length>20000)deny('Import requires 1–20,000 data rows.');
 return {boardId:board.id,workspaceId:board.workspace_id,boardRevision:board.updated_at,
  payload:{contract:extendedReferences?IMPORT_EXTENDED_CONTRACT:IMPORT_CONTRACT,group:destination,
   // The atomic writer accepts 30 *active* source mappings. Excluded source
   // columns never need to be transmitted; they remain visible in the wizard
   // and cannot be excluded without an explicit user decision.
   mappings:normalized.filter(mapping=>mapping.action!=='skip'),
   newColumns:proposed,rows,matches:{behavior,matchColumnId:matchId}},
  readback:{group:destination,baselineGroupIds:(detail.groups||[]).map(group=>group.id),
   baselineColumnIds:(detail.columns||[]).map(column=>column.id),
   baselineItemIds:(detail.items||[]).filter(item=>!item.archived_at&&
    (destination.action==='existing'?item.group_id===destination.groupId:false)).map(item=>item.id),
   rows:readbackRows},
  preview:{newItems:previewNew,updatedItems:previewExisting,skippedItems:previewSkipped,
   newColumns:proposed.length,rowCount:rows.length}};
}
export async function executeBoardImport({api,auth,plan,onVerifiedDetail}={}){
 if(!plan?.boardId||!plan?.payload||!api?.board||!api?.allowed||
  !api?.context||!api?.rpc||!auth?.getVerifiedUser)deny('Signed import service is unavailable.',403);
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==ctx.user_id||actor.id!==auth.userId||
  ctx.workspace_id!==plan.workspaceId||ctx.profile?.status!=='active')
  deny('Signed identity or workspace has changed.',403);
 const detail=await api.board(plan.boardId,{importVerification:true});
 if(detail.board.workspace_id!==ctx.workspace_id||
  !canManuallyEditBoard(detail.board,true)||
  detail.board.updated_at!==plan.boardRevision)
  deny('Board changed after preview. Reload before importing.',409);
 if(!plan.readback||
  !sameIds((detail.groups||[]).map(group=>group.id),plan.readback.baselineGroupIds)||
  !sameIds((detail.columns||[]).map(column=>column.id),plan.readback.baselineColumnIds)||
  !sameIds((detail.items||[]).filter(item=>!item.archived_at&&
   (plan.payload.group.action==='existing'?item.group_id===plan.payload.group.groupId:false)).map(item=>item.id),
   plan.readback.baselineItemIds))
  deny('Board data changed after import preview. Reload before importing.',409);
 if(!await api.allowed(plan.boardId,'edit'))deny('Board edit access required.',403);
 if(plan.payload.newColumns.length&&!await api.allowed(plan.boardId,'manage'))
  deny('Board manage access required to create columns.',403);
 // BIMP-02 defense in depth: the existing signed board UI read checks the
 // server's auth.sessions registry. Do not attempt an import if it fails.
 // This client preflight cannot replace a guard inside the import RPC itself.
 const liveSession=await api.rpc('wm_board_ui_read',{p_board_id:plan.boardId});
 if(liveSession?.board_id!==plan.boardId)
  deny('Active signed board session could not be verified.',403);
 let receipt;
 try{
  receipt=await api.rpc(plan.payload.contract===IMPORT_EXTENDED_CONTRACT?
   'wm_import_board_wizard_extended_atomic':'wm_import_board_wizard_atomic',{
   p_board_id:plan.boardId,p_expected_updated_at:plan.boardRevision,p_payload:plan.payload
  });
 }catch(error){
  // An authorization/validation/CAS rejection is atomic and safe to correct.
  // A connection failure or HTTP 5xx may happen AFTER the server committed.
  const status=Number(error?.status);
  if(!Number.isInteger(status)||status<400||status>=500)uncertainImport(error);
  throw error;
 }
 if(!receipt||!['created','updated','skipped','columnsCreated','groupsCreated'].every(k=>
    Number.isSafeInteger(receipt[k])&&receipt[k]>=0)||
   receipt.created!==plan.preview.newItems||
   receipt.updated!==plan.preview.updatedItems||
   receipt.skipped!==plan.preview.skippedItems||
   receipt.columnsCreated!==plan.preview.newColumns||
   receipt.groupsCreated!==(plan.payload.group.action==='create'?1:0))
  uncertainImport();
 try{
  const afterContext=await api.context();
  if(afterContext.user_id!==ctx.user_id||afterContext.workspace_id!==ctx.workspace_id||
     afterContext.profile?.status!=='active')uncertainImport();
  // A fresh authoritative shell plus bounded item pages (not the in-memory board cache).
  // Verify persisted items, mapped cells, created columns/groups and skipped values
  // before the UI reports success or asks the user to refresh.
  // A transient failure to fetch authoritative readback does NOT mean the
  // committed writer failed. Retry only this signed, read-only request once;
  // never invoke the atomic import RPC again after an uncertain result.
  let persisted;
  try{persisted=await api.board(plan.boardId,{importVerification:true});}
  catch(readError){
   const status=Number(readError?.status);
   const transient=(!Number.isInteger(status)||status===0||status===408||
     status===429||status>=500||readError?.code==='INVALID_JSON_RESPONSE');
   if(!transient)throw readError;
   persisted=await api.board(plan.boardId,{importVerification:true});
  }
  verifyImportReadback(plan,detail,persisted);
  const finalContext=await api.context();
  if(finalContext.user_id!==ctx.user_id||finalContext.workspace_id!==ctx.workspace_id||
     finalContext.profile?.status!=='active')uncertainImport();
  // Only publish the signed, full-board read after receipt, row/cell and
  // final-context verification. No speculative board state is reused.
  if(typeof onVerifiedDetail==='function')onVerifiedDetail(persisted);
 }catch(error){
  if(error?.importOutcomeUncertain===true)throw error;
  uncertainImport(error);
 }
 return receipt;
}
