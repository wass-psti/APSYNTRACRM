/** Read-only projection of existing signed Work Management events. */
import {validUuid} from './data.js';
import {verifiedBoardAvatarPath} from './board-people.js';
import {avatarImageMarkup} from './profile-avatar.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_EVENTS=200;
export const BOARD_ACTIVITY_PAGE_SIZE=25;
export function normalizeBoardActivity(events){
 if(!Array.isArray(events))return [];
 const seen=new Set();
 return events.slice(0,MAX_EVENTS).filter(row=>{
  if(!row||typeof row!=='object'||!Number.isSafeInteger(Number(row.id)))return false;
  const key=String(row.id);
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).map(row=>({
  id:Number(row.id),
  eventType:String(row.event_type||'Board activity').slice(0,120),
  message:String(row.message||'').slice(0,2000),
  actorName:String(row.actor_name||row.actor_email||'Recorded user').slice(0,160),
  actorId:String(row.actor_id||'').slice(0,64),
  entityType:String(row.entity_type||'').slice(0,120),
  entityId:String(row.entity_id||'').slice(0,120),
  createdAt:typeof row.created_at==='string'&&Number.isFinite(Date.parse(row.created_at))?
    row.created_at:'',
 })).sort((a,b)=>b.id-a.id);
}
export function filterBoardActivity(events,{search='',type='all',actor='all'}={}){
 const query=String(search).trim().toLocaleLowerCase().slice(0,160);
 return events.filter(row=>{
  if(type!=='all'&&row.eventType!==type)return false;
  if(actor!=='all'&&row.actorId!==actor)return false;
  return !query||[row.eventType,row.message,row.actorName,row.entityId].some(
   x=>x.toLocaleLowerCase().includes(query));
 });
}
export function pageBoardActivity(rows,page=0,pageSize=BOARD_ACTIVITY_PAGE_SIZE){
 const size=Math.min(50,Math.max(1,Math.floor(pageSize)||BOARD_ACTIVITY_PAGE_SIZE));
 const pages=Math.max(1,Math.ceil(rows.length/size));
 const current=Math.min(pages-1,Math.max(0,Math.floor(page)||0));
 return {rows:rows.slice(current*size,(current+1)*size),page:current,pages,total:rows.length};
}
/** No broad profile directory reads. Reuse exact-user avatar paths already
 * available from the signed board or the authenticated user's own profile.
 */
export function renderBoardActivityActorAvatar(actorId,actorName,avatarPaths=null){
 const id=typeof actorId==='string'&&validUuid(actorId)?actorId:null;
 const source=id&&avatarPaths instanceof Map?avatarPaths.get(id):null;
 const path=id?verifiedBoardAvatarPath(source,id):null;
 const name=String(actorName||'Recorded user').trim();
 const letters=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase().slice(0,4)||'?';
 return '<span class="board-activity-actor-avatar" aria-hidden="true">'+
  avatarImageMarkup(letters,{path,userId:path?id:null})+'</span>';
}

const selectOptions=(values,selected)=>values.map(([v,label])=>
 '<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(label)+'</option>').join('');
export function renderBoardActivityResults(events,{search='',type='all',actor='all',page=0,
 limit=100,busy=false,error='',avatarPaths=null}={}){
 const rows=filterBoardActivity(events,{search,type,actor});
 const pageInfo=pageBoardActivity(rows,page);
 const types=[['all','All activities'],...[...new Set(events.map(x=>x.eventType))].sort().map(x=>[x,x])];
 const actors=[['all','All people'],...[...new Map(events.filter(x=>x.actorId).map(x=>
  [x.actorId,[x.actorId,x.actorName]])).values()].sort((a,b)=>a[1].localeCompare(b[1]))];
 const html='<div class="board-activity-controls">'+
  '<label for="board-activity-search">Search</label><input type="search" id="board-activity-search" '+
   'placeholder="Search activity" maxlength="160" value="'+esc(search)+'"/>'+
  '<label for="board-activity-type">Action</label><select id="board-activity-type">'+selectOptions(types,type)+'</select>'+
  '<label for="board-activity-actor">Person</label><select id="board-activity-actor">'+selectOptions(actors,actor)+'</select>'+
  '<button type="button" class="secondary" data-board-history-action="refresh"'+
   (busy?' disabled':'')+'>Refresh</button></div>'+
  (error?'<p class="board-activity-error" role="alert">'+esc(error)+'</p>':'')+
  '<p class="board-activity-count" role="status">'+pageInfo.total+
  ' matching events from the latest '+events.length+' authorized records</p>'+
  '<div class="board-history-list">'+(pageInfo.rows.map(row=>
   '<article class="board-history-entry board-activity-event">'+
   renderBoardActivityActorAvatar(row.actorId,row.actorName,avatarPaths)+
   '<div class="board-activity-event-body"><div class="board-history-entry-head"><strong>'+esc(row.eventType)+
   '</strong><time datetime="'+esc(row.createdAt)+'">'+esc(row.createdAt?new Date(row.createdAt).toLocaleString('en-PH'):'Time unavailable')+'</time></div>'+
   (row.message?'<p>'+esc(row.message)+'</p>':'')+
   '<small>'+esc(row.actorName)+(row.entityType?' · '+esc(row.entityType):'')+
   (row.entityId?' · '+esc(row.entityId):'')+'</small></div></article>').join('')||
   '<p class="board-activity-empty">No events match these filters.</p>')+'</div>'+
  '<nav class="board-activity-pagination" aria-label="Board activity pages">'+
   '<button type="button" data-board-history-action="previous"'+(pageInfo.page===0?' disabled':'')+'>Previous</button>'+
   '<span>Page '+(pageInfo.page+1)+' of '+pageInfo.pages+'</span>'+
   '<button type="button" data-board-history-action="next"'+(pageInfo.page>=pageInfo.pages-1?' disabled':'')+'>Next</button></nav>'+
  (limit<MAX_EVENTS&&events.length>=limit?
   '<button type="button" class="secondary" data-board-history-action="more"'+(busy?' disabled':'')+
   '>Retrieve up to '+MAX_EVENTS+' recent events</button>':
   events.length>=MAX_EVENTS?'<p class="muted">Only the latest 200 events are available through the existing server API. Older-event pagination needs a server cursor.</p>':'');
 return {html,page:pageInfo.page,total:pageInfo.total,pages:pageInfo.pages};
}
export function boardItemSummary(item,{groupTitle='Ungrouped',restricted=false}={}){
 if(!item||typeof item!=='object')return '';
 const cells=[
  ['Status',item.status||'Not set'],
  ['Group',groupTitle],
  ...(restricted?[]:[['Assigned user',item.assignee_id||'Unassigned'],
   ['Due date',item.due_date||'Not set']])
 ];
 return '<dl class="board-item-summary">'+cells.map(([label,value])=>
  '<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'+
  (!restricted&&item.notes?'<section class="board-item-notes"><h3>Notes</h3><p>'+esc(item.notes)+'</p></section>':'');
}
