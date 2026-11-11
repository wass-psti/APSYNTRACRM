/** BS02 — board people / mention preparation.
 * Uses only the exact board's already-authorized signed wm_get_board detail.
 * Explicit membership is NOT an exhaustive effective-access list: global
 * admins, policy overrides or independently approved guests may be absent.
 * Mentions are local text drafts ONLY: no update write or notification.
 */
import {validUuid} from './data.js';
import {avatarImageMarkup} from './profile-avatar.js';

const MAX_PEOPLE=300,MAX_NAME=180;
const ROLES=new Set(['owner','editor','viewer']);
export const BOARD_MENTION_WRITES_ENABLED=false;
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fail=()=>({status:'UNVERIFIED',people:[],isCompleteAccessList:false});
const safeName=v=>typeof v==='string'&&v.trim().length>0&&v.length<=MAX_NAME?v.trim():null;
// Only a verified member's own avatar object path, never an external image URL.
const AVATAR_PATH=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
export const verifiedBoardAvatarPath=(value,userId)=>typeof value==='string'&&AVATAR_PATH.test(value)&&
 value.split('/')[0].toLowerCase()===userId.toLowerCase()?value:null;
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase();

/** Fail closed on missing or mismatched board membership data.
 * Member records are not collected from a workspace-wide directory.
 */
export function normalizeBoardPeople(detail,{boardId,workspaceId}={}){
 if(!validUuid(boardId)||!validUuid(workspaceId)||
   detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId||
   !Array.isArray(detail.members)||detail.members.length>MAX_PEOPLE)return fail();
 const seen=new Set(),people=[];
 for(const row of detail.members){
  const id=row?.user_id||row?.id;
  if(!validUuid(id)||seen.has(id)||!ROLES.has(row.role)||
    (row.board_id!==undefined&&row.board_id!==boardId)||
    (row.active!==undefined&&row.active!==true))return fail();
  const name=safeName(row.display_name)||safeName(row.name);
  if(!name)return fail();
  seen.add(id);
  people.push(Object.freeze({id,name,role:row.role,avatarPath:verifiedBoardAvatarPath(row.avatar_path,id)}));
 }
 people.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return Object.freeze({status:'SIGNED_MEMBERSHIP',people,
  isCompleteAccessList:false,boardId,workspaceId});
}
export function filterBoardPeople(result,query=''){
 if(result?.status!=='SIGNED_MEMBERSHIP')return [];
 const q=String(query).trim().toLocaleLowerCase().slice(0,120);
 return result.people.filter(p=>!q||p.name.toLocaleLowerCase().includes(q)||
  p.role.includes(q)).slice(0,MAX_PEOPLE);
}
export function renderBoardPeople(result,{query=''}={}){
 if(result?.status!=='SIGNED_MEMBERSHIP')
  return '<p role="status" class="muted">Board membership could not be verified from the signed response. No names are displayed.</p>';
 const people=filterBoardPeople(result,query);
 const count=result.people.length;
 return '<section class="bs02-people" aria-label="People assigned to this board">'+
  '<header class="bs02-people-heading">'+
   '<div><h3>Assigned members</h3><p class="bs02-people-subtitle">People directly assigned to this board.</p></div>'+
   '<span class="bs02-people-count" aria-label="'+count+' assigned members">'+count+'</span>'+
  '</header>'+
  (count>8?
   '<label for="bs02-people-search" class="bs02-search-label">Find a member</label>'+
   '<input id="bs02-people-search" type="search" maxlength="120" autocomplete="off" '+
    'placeholder="Search by name or role" value="'+escapeHtml(query)+'">':'')+
  '<div data-bs02-people-results class="bs02-avatar-grid" aria-label="Assigned board members">'+
  (people.length?people.map(p=>
   '<div class="bs02-avatar-slot">'+
    '<button type="button" class="bs02-avatar-chip" data-bs02-copy-name="'+p.id+'" '+
      'aria-label="'+escapeHtml(p.name)+', '+escapeHtml(p.role)+'. Copy @name" '+
      '>'+
     '<span class="bs02-person-avatar" aria-hidden="true">'+
      avatarImageMarkup(initials(p.name),{path:p.avatarPath,userId:p.avatarPath?p.id:null})+
     '</span>'+
     '<span class="bs02-avatar-tooltip" aria-hidden="true"><strong>'+
      escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.role)+
      ' · Click to copy @name</small></span>'+
    '</button>'+
   '</div>'
  ).join(''):'<p class="bs02-people-empty">No assigned members match this search.</p>')+
  '</div>'+
  '<p class="bs02-people-footnote">Other users may have access through separate administrator or workspace policies. This is not an exhaustive access audit.</p>'+
  '</section>';
}

export function mentionQuery(text,cursor){
 if(typeof text!=='string'||text.length>8000||
    !Number.isInteger(cursor)||cursor<0||cursor>text.length)return null;
 const prefix=text.slice(0,cursor);
 const match=/(?:^|[\s(])@([^@\r\n]{0,65})$/u.exec(prefix);
 return match?{query:match[1].trim(),start:cursor-match[1].length-1,end:cursor}:null;
}
export function mentionCandidates(result,text,cursor){
 const context=mentionQuery(text,cursor);
 if(result?.status!=='SIGNED_MEMBERSHIP'||!context)return [];
 const query=context.query.toLocaleLowerCase();
 return result.people.filter(p=>p.name.toLocaleLowerCase().includes(query)).slice(0,8);
}
export function insertMention(text,cursor,person){
 const context=mentionQuery(text,cursor);
 if(!context||typeof person?.name!=='string'||!safeName(person.name)||
  !validUuid(person.id))return null;
 const token='@'+person.name+' ';
 return {text:text.slice(0,context.start)+token+text.slice(cursor),
  cursor:context.start+token.length,userId:person.id};
}
export function renderMentionDraft(result){
 if(result?.status!=='SIGNED_MEMBERSHIP')
  return '<p class="muted">Mention suggestions are unavailable because board membership was not verified.</p>';
 return '<section class="bs02-mention-draft" aria-label="Draft a board update">'+
  '<h3>Draft an update</h3>'+
  '<p class="muted">Type @ to reference an assigned board member. This is a local draft: '+
   'it does not post, tag a user in the database, or send notifications.</p>'+
  '<label for="bs02-mention-editor">Update draft</label>'+
  '<textarea id="bs02-mention-editor" rows="3" maxlength="3000" '+
   'placeholder="Write an update and type @ to find a board member"></textarea>'+
  '<div data-bs02-mention-options role="listbox" aria-label="Available mentions"></div>'+
  '<button type="button" class="secondary" data-bs02-copy-draft>Copy draft text</button>'+
  '</section>';
}
export function renderMentionOptions(people){
 if(!Array.isArray(people)||!people.length)return '';
 return people.map(p=>'<button type="button" class="secondary" role="option" '+
   'data-bs02-mention-id="'+p.id+'">@'+escapeHtml(p.name)+
   ' <small>('+escapeHtml(p.role)+')</small></button>').join('');
}
