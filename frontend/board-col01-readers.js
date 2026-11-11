/** CP-BOARD-COL01 prepared signed readers. Disabled until security acceptance. */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {renderBoardActivityActorAvatar} from './board-activity-ui.js';
export const BOARD_COL01_DIRECTORY_ENABLED=false;
export const BOARD_COL01_AUDIT_CURSOR_ENABLED=false;
export const BOARD_COL01_AUDIT_MAX_PAGES=20;
const MAX_DIRECTORY=40;
const AUDIT_LIMIT=25;
const MAX_AUDIT_LIMIT=50;
const BIGINT_MAX=9223372036854775807n;
const esc=v=>String(v??'').replace(/[&<>"']/g,
 c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function boardId(value){
 if(!validUuid(value))throw new ApiError('Invalid board identifier.');
 return value;
}
function signedApi(api){
 if(!api||typeof api.rpc!=='function')throw new ApiError('Signed board API unavailable.',403);
 return api;
}
function eventId(value){
 const str=typeof value==='number'&&Number.isSafeInteger(value)?String(value):
  typeof value==='string'?value:'';
 if(!/^[1-9][0-9]{0,18}$/.test(str))throw new ApiError('Invalid audit cursor.');
 if(BigInt(str)>BIGINT_MAX)throw new ApiError('Audit cursor exceeds database limits.');
 return str;
}
function boundedText(value,max,{nullable=false}={}){
 if(nullable&&(value===null||value===undefined))return '';
 if(typeof value!=='string'||value.length>max)
  throw new ApiError('Unexpected signed response field.');
 return value;
}
function date(value){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))
  throw new ApiError('Invalid audit event timestamp.');
 return value;
}
const shownDate=v=>v?new Date(v).toLocaleString('en-PH'):'Time unavailable';

export async function loadBoardInvitableDirectory(api,id,
 {enabled=BOARD_COL01_DIRECTORY_ENABLED,query=''}={}){
 boardId(id);
 if(enabled!==true)return {status:'LOCKED',users:[],query:''};
 if(typeof query!=='string'||query.trim().length>120)
  throw new ApiError('Invalid directory search.');
 signedApi(api);
 if(typeof api.allowed!=='function'||await api.allowed(id,'manage')!==true)
  return {status:'DENIED',users:[],query:''};
 const search=query.trim();
 const result=await api.rpc('wm_board_invitable_users',{
  p_board_id:id,p_query:search
 });
 if(!Array.isArray(result)||result.length>MAX_DIRECTORY)
  throw new ApiError('Unexpected signed directory response.');
 const seen=new Set();
 const users=result.map(user=>{
  if(!user||!validUuid(user.user_id)||seen.has(user.user_id))
   throw new ApiError('Invalid signed directory entry.');
  seen.add(user.user_id);
  const role=user.board_role;
  if(role!==null&&role!==undefined&&!['owner','editor','viewer'].includes(role))
   throw new ApiError('Invalid board role in directory.');
  return {id:user.user_id,
   name:boundedText(user.display_name,180,{nullable:true}),
   email:boundedText(user.email,320),
   boardRole:role??null};
 });
 return {status:'VERIFIED_READ',users,query:search};
}
export function renderBoardInvitableDirectory(result){
 if(result?.status!=='VERIFIED_READ'){
  const message=result?.status==='DENIED'
   ?'Only authorized board managers can view the invitation directory.'
   :result?.status==='ERROR'
   ?'The authorized member directory could not be loaded.'
   :'The manager-only invitation directory awaits signed security acceptance.';
  return '<section class="board-collaboration" aria-label="Invitation directory">'+
   '<h3>Workspace directory</h3><p class="muted" role="status">'+message+
   '</p></section>';
 }
 const list=result.users;
 return '<section class="board-collaboration" aria-label="Invitation directory">'+
  '<h3>Workspace directory</h3>'+
  '<p class="muted">Read-only, manager-authorized workspace members. Invitations are disabled.</p>'+
  '<form data-col01-directory-search>'+
  '<label for="col01-directory-search">Search members</label>'+
  '<input type="search" id="col01-directory-search" name="query" maxlength="120" '+
   'value="'+esc(result.query)+'" autocomplete="off" />'+
  '<button type="submit" class="secondary">Search</button></form>'+
  '<div class="board-member-list">'+
  (list.length?list.map(user=>
   '<div class="board-member"><strong>'+esc(user.name||user.email)+
   '</strong><span>'+esc(user.email)+'</span>'+
   '<small>'+esc(user.boardRole||'Not on this board')+'</small></div>'
  ).join(''):'<p>No authorized workspace members matched this search.</p>')+
  '</div></section>';
}
export async function loadBoardAuditCursorPage(api,id,
 {enabled=BOARD_COL01_AUDIT_CURSOR_ENABLED,beforeId=null,limit=AUDIT_LIMIT}={}){
 boardId(id);
 if(enabled!==true)return {status:'LOCKED',rows:[],nextCursor:null,hasMore:false};
 signedApi(api);
 if(!Number.isInteger(limit)||limit<1||limit>MAX_AUDIT_LIMIT)
  throw new ApiError('Invalid audit page limit.');
 const before=beforeId===null?null:eventId(beforeId);
 const response=await api.rpc('wm_list_board_events_page',{
  p_board_id:id,p_before_id:before,p_limit:limit+1
 });
 if(!Array.isArray(response)||response.length>limit+1)
  throw new ApiError('Unexpected signed audit page response.');
 let previous=before===null?null:BigInt(before);
 const normalized=response.map(row=>{
  if(!row||typeof row!=='object')throw new ApiError('Invalid audit event.');
  const str=eventId(row.id),numeric=BigInt(str);
  if(previous!==null&&numeric>=previous)
   throw new ApiError('Audit event cursor order violated.');
  previous=numeric;
  if(!validUuid(row.actor_id))throw new ApiError('Invalid audit event actor.');
  return {id:str,
   eventType:boundedText(row.event_type,160),
   message:boundedText(row.message,4000,{nullable:true}),
   entityType:boundedText(row.entity_type,160,{nullable:true}),
   entityId:boundedText(row.entity_id,180,{nullable:true}),
   actorName:boundedText(row.actor_name,200,{nullable:true}),
   createdAt:date(row.created_at)};
 });
 const rows=normalized.slice(0,limit);
 const hasMore=normalized.length>limit;
 return {status:'VERIFIED_READ',rows,hasMore,
  nextCursor:hasMore?rows[rows.length-1].id:null};
}
export function renderBoardAuditCursorPage(result,
 {pageIndex=0,busy=false,error='',cachedNext=false,avatarPaths=null}={}){
 if(result?.status!=='VERIFIED_READ')
  return '<p class="muted" role="status">Cursor audit history awaits security acceptance.</p>';
 const events=result.rows;
 const available=Boolean(cachedNext||result.hasMore);
 const nextDisabled=busy||!available||pageIndex>=BOARD_COL01_AUDIT_MAX_PAGES-1;
 return (error?'<p role="alert" class="board-activity-error">'+esc(error)+'</p>':'')+
  '<p class="board-activity-count" role="status">'+events.length+
   ' authorized events on this server page</p>'+
  '<div class="board-history-list">'+
   (events.length?events.map(row=>
    '<article class="board-history-entry board-activity-event">'+
    renderBoardActivityActorAvatar(row.actorId,row.actorName,avatarPaths)+
    '<div class="board-activity-event-body"><div class="board-history-entry-head"><strong>'+
     esc(row.eventType)+'</strong><time datetime="'+esc(row.createdAt)+'">'+
     esc(shownDate(row.createdAt))+'</time></div>'+
    (row.message?'<p>'+esc(row.message)+'</p>':'')+
    '<small>'+esc(row.actorName||'Recorded user')+
    (row.entityType?' · '+esc(row.entityType):'')+
    (row.entityId?' · '+esc(row.entityId):'')+'</small></div></article>'
   ).join(''):'<p class="board-activity-empty">No authorized events on this page.</p>')+
  '</div><nav class="board-activity-pagination" aria-label="Server audit pages">'+
   '<button type="button" data-board-history-action="cursor-previous"'+
    (busy||pageIndex===0?' disabled':'')+'>Newer</button>'+
   '<span>Server page '+(pageIndex+1)+'</span>'+
   '<button type="button" data-board-history-action="cursor-next"'+
    (nextDisabled?' disabled':'')+'>Older</button>'+
   '<button type="button" data-board-history-action="cursor-refresh"'+
    (busy?' disabled':'')+'>Refresh</button></nav>'+
   (pageIndex>=BOARD_COL01_AUDIT_MAX_PAGES-1&&available
    ?'<p class="muted">Reopen audit history to restart the bounded session.</p>':'');
}
