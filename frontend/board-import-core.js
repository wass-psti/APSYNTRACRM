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
export const IMPORT_CONTRACT='m143-v1';
export const CREATABLE_IMPORT_TYPES=Object.freeze([
 'text','long_text','number','date','people','checkbox','timeline','email','url'
]);
const creatable=new Set(CREATABLE_IMPORT_TYPES);
const allowedTypes=new Set([...creatable,'status','dropdown','phone','rating','percentage']);
const deny=(msg,status=400)=>{throw new ApiError(msg,status);};
const uncertainImport=()=>{
 const error=new ApiError(
  'Import outcome is uncertain. Do not retry this request. Close the wizard, refresh the board, and check its activity log before starting a new import.',409);
 error.importOutcomeUncertain=true;
 throw error;
};
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
  text=parts[0].replaceAll(group,'').replace(decimal,'.')+parts[1].replace(/^$/,'');
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
 const label=key(header),sample=values.map(clean).filter(Boolean).slice(0,100);
 if(label==='status'||label==='priority')return 'status';
 if(label.includes('checkbox')||label.startsWith('is '))return 'checkbox';
 if(label.includes('date')||label.endsWith(' at'))return 'date';
 if(label==='phone'||label.includes('mobile')||label.includes('telephone'))return 'phone';
 if(label==='rating'||label.endsWith(' rating'))return 'rating';
 if(label.includes('percentage')||label.endsWith(' percent')||label.endsWith(' %'))return 'percentage';
 if(label.includes('email'))return 'email';
 if(label.includes('url')||label.includes('website'))return 'url';
 if(!sample.length)return 'text';
 if(sample.every(x=>/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)%$/.test(x)))return 'percentage';
 if(sample.every(x=>/^(true|false|yes|no|0|1)$/i.test(x)))return 'checkbox';
 if(sample.every(x=>/^-?\d+(?:\.\d+)?$/.test(x)))return 'number';
 if(sample.every(x=>/^\d{4}-\d\d-\d\d$/.test(x)))return 'date';
 if(sample.every(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))return 'email';
 if(sample.every(x=>/^https?:\/\/\S+$/i.test(x)))return 'url';
 return 'text';
}
export function availableImportColumns(detail){
 return (detail?.columns||[]).filter(c=>validUuid(c.id)&&c.visible!==false&&
  allowedTypes.has(c.data_type)&&(c.system_key==null||c.system_key==='status')&&
  (c.system_key==='status'||String(c.column_key||'').startsWith('custom')))
  .map(c=>({id:c.id,name:c.name,type:c.data_type,system_key:c.system_key||null,config:c.config||{}}));
}
function autoTitle(headers){
 const exact=['item','name','title','item name','record'];
 return headers.find(h=>exact.includes(key(h)))||headers[0];
}
export function initialImportMappings(sheet,detail,{canCreate=false}={}){
 const columns=availableImportColumns(detail),primary=autoTitle(sheet.headers),used=new Set();
 return sheet.headers.map((source,i)=>{
  const type=inferImportType(source,sheet.rows.map(r=>r[i]));
  if(source===primary)return {source,action:'item',type:'text'};
  const matches=columns.filter(c=>key(c.name)===key(source)&&c.type===type&&!used.has(c.id));
  if(matches.length===1){
   used.add(matches[0].id);
   return {source,action:'existing',columnId:matches[0].id,type};
  }
  if(canCreate&&(type==='status'||type==='dropdown')&&
     !columns.some(c=>key(c.name)===key(source)))
   return {source,action:'configure',type,choiceType:type,name:source,requiresDecision:true};
  if(canCreate&&creatable.has(type)&&!columns.some(c=>key(c.name)===key(source))){
   return {source,action:'create',type,columnType:type,name:source,requiresDecision:true};
  }
  return {source,action:'skip',type,proposed:type,requiresDecision:true};
 });
}
function validDate(raw){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
 const d=new Date(raw+'T00:00:00Z');
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===raw;
}
function valueAsType(raw,type,config={}){
 const text=clean(raw);
 if(!text)return null;
 if(['phone','rating','percentage'].includes(type)){
  try{return cmp02Validate(type,text,config,{allowPercentSymbol:type==='percentage'});}
  catch(error){deny(error.message);}
 }
 if(type==='number'){
  if(!/^-?\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text)))
   deny('A number cell contains an invalid value: '+text.slice(0,60));
  return Number(text);
 }
 if(type==='checkbox'){
  if(/^(true|yes|1)$/i.test(text))return true;
  if(/^(false|no|0)$/i.test(text))return false;
  deny('A checkbox accepts only yes/no, true/false or 1/0.');
 }
 forbidFormula(text);
 if(type==='date'){
  if(!validDate(text))deny('Date cells must contain valid YYYY-MM-DD dates.');
  return text;
 }
 if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
  deny('Invalid email in imported data.');
 if(type==='url'&&!/^https?:\/\/[^\s]+$/i.test(text))
  deny('URL cells must use HTTP(S).');
 if(type==='people'&&!validUuid(text))deny('People cells require an existing member UUID.');
 if(type==='timeline'){
  const parts=text.split(/\s*\.\.\s*/);
  if(parts.length!==2||!validDate(parts[0])||!validDate(parts[1])||parts[0]>parts[1])
   deny('Timeline cells must use YYYY-MM-DD..YYYY-MM-DD.');
  return {start:parts[0],end:parts[1]};
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
 if(text.length>limit)deny('A '+type+' cell exceeds '+limit+' characters.');
 return text;
}
export function buildImportPlan({sheet,detail,mappings,group,matches,allowColumns=false}={}){
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
 const rows=[];let previewExisting=0,previewNew=0,previewSkipped=0;
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
    mondayCheckboxCell(raw):valueAsType(raw,col.type,col.config);}
   catch(error){
    const original=String(raw??'').slice(0,96);
    deny(origin+' · column "'+source+'" · value "'+original+'": '+error.message,
     error.status||400);
   }
   if(value!==null)values[source]=value;
  }
  const row={title,values};
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
    previewExisting++;
   }else if(existing&&behavior==='skip'||!existing&&behavior==='update')previewSkipped++;
   else previewNew++;
  }else previewNew++;
  rows.push(row);
 }
 if(rows.length<1||rows.length>5000)deny('Import requires 1–5,000 data rows.');
 return {boardId:board.id,workspaceId:board.workspace_id,boardRevision:board.updated_at,
  payload:{contract:IMPORT_CONTRACT,group:destination,mappings:normalized,
   newColumns:proposed,rows,matches:{behavior,matchColumnId:matchId}},
  preview:{newItems:previewNew,updatedItems:previewExisting,skippedItems:previewSkipped,
   newColumns:proposed.length,rowCount:rows.length}};
}
export async function executeBoardImport({api,auth,plan}={}){
 if(!plan?.boardId||!plan?.payload||!api?.board||!api?.allowed||
  !api?.context||!api?.rpc||!auth?.getVerifiedUser)deny('Signed import service is unavailable.',403);
 const actor=await auth.getVerifiedUser(),ctx=await api.context();
 if(!validUuid(actor?.id)||actor.id!==ctx.user_id||actor.id!==auth.userId||
  ctx.workspace_id!==plan.workspaceId||ctx.profile?.status!=='active')
  deny('Signed identity or workspace has changed.',403);
 const detail=await api.board(plan.boardId);
 if(detail.board.workspace_id!==ctx.workspace_id||
  !canManuallyEditBoard(detail.board,true)||
  detail.board.updated_at!==plan.boardRevision)
  deny('Board changed after preview. Reload before importing.',409);
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
  receipt=await api.rpc('wm_import_board_wizard_atomic',{
   p_board_id:plan.boardId,p_expected_updated_at:plan.boardRevision,p_payload:plan.payload
  });
 }catch(error){
  // An authorization/validation/CAS rejection is atomic and safe to correct.
  // A connection failure or HTTP 5xx may happen AFTER the server committed.
  const status=Number(error?.status);
  if(!Number.isInteger(status)||status<400||status>=500)uncertainImport();
  throw error;
 }
 if(!receipt||!['created','updated','skipped','columnsCreated','groupsCreated'].every(k=>
    Number.isSafeInteger(receipt[k])&&receipt[k]>=0)||
   receipt.created+receipt.updated+receipt.skipped!==plan.preview.rowCount)
  uncertainImport();
 try{
  const after=await api.context();
  if(after.user_id!==ctx.user_id||after.workspace_id!==ctx.workspace_id)
   uncertainImport();
 }catch{
  // A verified writer receipt must never be converted into a retryable error
  // merely because the post-commit identity refresh failed.
  uncertainImport();
 }
 return receipt;
}
