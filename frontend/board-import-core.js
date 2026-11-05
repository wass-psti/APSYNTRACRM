/** BIMP-02: client-side import preview and the existing atomic RPC contract.
 * Never emulates an import with multiple individual mutations.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {canManuallyEditBoard} from './board-inline-items.js';
import {isProtectedBoard} from './board-card-lifecycle.js';
import {moduleByBoardName} from './board-manifest.js';
export const IMPORT_CONTRACT='m143-v1';
export const CREATABLE_IMPORT_TYPES=Object.freeze([
 'text','long_text','number','date','people','checkbox','timeline','email','url'
]);
const creatable=new Set(CREATABLE_IMPORT_TYPES);
const allowedTypes=new Set([...creatable,'status','dropdown']);
const deny=(msg,status=400)=>{throw new ApiError(msg,status);};
const clean=s=>String(s??'').trim();
const key=s=>clean(s).toLocaleLowerCase();
const matchText=s=>key(s);
const forbidFormula=s=>{
 if(/^[=+@]/.test(s)||/^-(?!\d+(?:\.\d+)?$)/.test(s))
  deny('Spreadsheet formula-like text is not accepted. Replace it with literal data.');
};
export function inferImportType(header,values=[]){
 const label=key(header),sample=values.map(clean).filter(Boolean).slice(0,100);
 if(label==='status'||label==='priority')return 'status';
 if(label.includes('checkbox')||label.startsWith('is '))return 'checkbox';
 if(label.includes('date')||label.endsWith(' at'))return 'date';
 if(label.includes('email'))return 'email';
 if(label.includes('url')||label.includes('website'))return 'url';
 if(!sample.length)return 'text';
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
  .map(c=>({id:c.id,name:c.name,type:c.data_type,config:c.config||{}}));
}
function autoTitle(headers){
 const exact=['item','name','title','item name','record'];
 return headers.find(h=>exact.includes(key(h)))||headers[0];
}
export function initialImportMappings(sheet,detail){
 const columns=availableImportColumns(detail),primary=autoTitle(sheet.headers),used=new Set();
 return sheet.headers.map((source,i)=>{
  const type=inferImportType(source,sheet.rows.map(r=>r[i]));
  if(source===primary)return {source,action:'item',type:'text'};
  const matches=columns.filter(c=>key(c.name)===key(source)&&c.type===type&&!used.has(c.id));
  if(matches.length===1){
   used.add(matches[0].id);
   return {source,action:'existing',columnId:matches[0].id,type};
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
  }else normalized.push({source,action});
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
 for(let i=0;i<sheet.rows.length;i++){
  const sourceRow=sheet.rows[i],title=clean(sourceRow[byHeader.get(primary)]);
  if(!title||title.length>240)deny('Row '+(i+2)+' must have an Item title of 1–240 characters.');
  forbidFormula(title);
  const values={};
  for(const [source,col] of refMap){
   const raw=sourceRow[byHeader.get(source)];
   const value=valueAsType(raw,col.type,col.config);
   if(value!==null)values[source]=value;
  }
  const row={title,values};
  if(behavior!=='add-new'){
   const candidate=matchSource===primary?title:values[matchSource];
   const k=matchText(candidate);
   if(!k)deny('Row '+(i+2)+' has an empty duplicate-match key.');
   if(duplicateKeys.has(k))deny('Row '+(i+2)+' duplicates another file matching key.');
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
  !api?.context||!auth?.getVerifiedUser)deny('Signed import service is unavailable.',403);
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
 const receipt=await api.rpc('wm_import_board_wizard_atomic',{
  p_board_id:plan.boardId,p_expected_updated_at:plan.boardRevision,p_payload:plan.payload
 });
 if(!receipt||!['created','updated','skipped','columnsCreated','groupsCreated'].every(k=>
    Number.isSafeInteger(receipt[k])&&receipt[k]>=0)||
   receipt.created+receipt.updated+receipt.skipped!==plan.preview.rowCount)
  deny('Import receipt is uncertain. Refresh the board and review audit events before retrying.',409);
 const after=await api.context();
 if(after.user_id!==ctx.user_id||after.workspace_id!==ctx.workspace_id)
  deny('Signed session changed; verify the board and audit before proceeding.',409);
 return receipt;
}
