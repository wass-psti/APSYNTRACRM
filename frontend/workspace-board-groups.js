/** BS09 — workspace-member groups and exact-board access contract.
 * A workspace invitation is identity admission, NOT authorization to any board.
 * This module has no database writes; activating it requires a reviewed,
 * signed, server-side RLS/ACL implementation and successful negative tests.
 */
import {validUuid} from './data.js';
import {ApiError} from './session.js';

export const BOARD_GROUP_ACCESS_ENABLED=false;
export const BOARD_GROUP_ROLE='viewer';
const MAX_MEMBERS=100,MAX_GROUPS=40,MAX_NAME=80;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const deny=(message,status=403)=>{throw new ApiError(message,status);};
const unavailable=Object.freeze({status:'UNAVAILABLE',members:[],groups:[],
 canManage:false,source:'NO_SIGNED_ACCESS_DIRECTORY'});
const safeName=value=>typeof value==='string'&&value.trim().length>0&&
 value.trim().length<=MAX_NAME&&!/[\u0000-\u001f\u007f<>]/.test(value) ?
 value.trim():null;

/** A list of workspace members is supplied ONLY by a manager-authorized
 * exact-board RPC; the browser cannot assert membership from an email draft.
 */
export function normalizeSignedBoardCandidates(raw,{boardId,workspaceId}={}){
 if(!validUuid(boardId)||!validUuid(workspaceId)||
    raw?.status!=='VERIFIED_READ'||raw.boardId!==boardId||
    raw.workspaceId!==workspaceId||raw.manage!==true||
    !Array.isArray(raw.users)||raw.users.length>MAX_MEMBERS)return unavailable;
 const seen=new Set(),members=[];
 for(const row of raw.users){
  if(!validUuid(row?.id)||seen.has(row.id)||!safeName(row.name)||
     typeof row.email!=='string'||row.email.length>254||
     !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u.test(row.email)||
     ![null,'owner','editor','viewer'].includes(row.boardRole??null))
   return unavailable;
  seen.add(row.id);
  members.push(Object.freeze({id:row.id,name:safeName(row.name),email:row.email,
   boardRole:row.boardRole??null}));
 }
 return Object.freeze({status:'VERIFIED_SIGNED_CANDIDATES',workspaceId,boardId,
  members:Object.freeze(members),groups:Object.freeze([]),
  canManage:true,source:'SIGNED_MANAGER_BOARD_DIRECTORY'});
}

/** Groups must come from a *separate* authenticated workspace RPC.
 * Never trust localStorage, arbitrary user lists or the board data itself.
 */
export function normalizeSignedWorkspaceGroups(raw,{workspaceId,boardId}={}){
 if(!validUuid(workspaceId)||!validUuid(boardId)||raw?.schemaVersion!==1||
    raw.workspaceId!==workspaceId||raw.boardId!==boardId||
    raw.authorized!==true||!Array.isArray(raw.groups)||
    raw.groups.length>MAX_GROUPS)return Object.freeze({status:'UNAVAILABLE',groups:[]});
 const seen=new Set(),groups=[];
 for(const row of raw.groups){
  if(!validUuid(row?.id)||seen.has(row.id)||!safeName(row.name)||
     !Number.isInteger(row.memberCount)||row.memberCount<0||
     row.memberCount>MAX_MEMBERS||typeof row.assignedToBoard!=='boolean')
   return Object.freeze({status:'UNAVAILABLE',groups:[]});
  seen.add(row.id);
  groups.push(Object.freeze({id:row.id,name:safeName(row.name),
   memberCount:row.memberCount,assignedToBoard:row.assignedToBoard}));
 }
 return Object.freeze({status:'VERIFIED_GROUPS',workspaceId,boardId,
  groups:Object.freeze(groups)});
}

export function validateBoardAccessAction({
 workspaceId,boardId,requestId,subjectType,subjectId,action='grant',role='viewer'
}={}){
 if(!validUuid(workspaceId)||!validUuid(boardId)||!validUuid(requestId)||
    !validUuid(subjectId)||!['member','group'].includes(subjectType)||
    !['grant','revoke'].includes(action)||role!=='viewer')
  return null;
 return Object.freeze({workspaceId,boardId,requestId,subjectType,subjectId,
  action,role:BOARD_GROUP_ROLE});
}
export function validateWorkspaceGroupDraft({
 workspaceId,requestId,name,memberIds=[]
}={}){
 const title=safeName(name);
 if(!validUuid(workspaceId)||!validUuid(requestId)||!title||
    !Array.isArray(memberIds)||!memberIds.length||
    memberIds.length>MAX_MEMBERS||memberIds.some(id=>!validUuid(id))||
    new Set(memberIds).size!==memberIds.length)return null;
 return Object.freeze({workspaceId,requestId,name:title,
  memberIds:Object.freeze([...memberIds])});
}

/** Transport requires approved server transaction, never browser table writes.
 * A successful receipt does not make an unverified person a workspace member.
 */
export class BoardGroupAccessClient{
 constructor({auth,api,enabled=BOARD_GROUP_ACCESS_ENABLED}={}){
  this.auth=auth;this.api=api;this.enabled=enabled===true;
 }
 async #signed(workspaceId){
  if(!this.enabled)deny('Board and group access changes are not activated.',503);
  if(typeof this.auth?.getVerifiedUser!=='function'||
     typeof this.auth?.authorized!=='function'||
     typeof this.api?.context!=='function')deny('Signed board group transport unavailable.',503);
  const user=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(user?.id)||user.id!==this.auth.userId||
     context?.user_id!==user.id||context?.workspace_id!==workspaceId||
     context?.profile?.status!=='active')deny('Signed workspace identity changed.',403);
  return user.id;
 }
 async #submit(workspaceId,operation,request){
  const actor=await this.#signed(workspaceId);
  let receipt;
  try{
   receipt=await this.auth.authorized('/functions/v1/bs09-board-access',{
    method:'POST',retryUnauthorized:false,
    body:{operation,request}
   });
  }catch(err){
   if(err?.status===401)deny('Sign in again before managing board access.',401);
   if([403,404].includes(err?.status))deny('Board access change denied.',403);
   if([400,422].includes(err?.status))deny('Invalid board access change.',400);
   deny('Board access result unconfirmed. Refresh before retrying.',409);
  }
  if(receipt?.state!=='committed'||receipt?.requestId!==request.requestId||
     receipt.workspaceId!==workspaceId||
     (request.boardId&&receipt.boardId!==request.boardId))
   deny('Board access receipt could not be verified.',409);
  try{if(await this.#signed(workspaceId)!==actor)throw Error('Identity changed');}
  catch{deny('Board access receipt unconfirmed after session change.',409);}
  return Object.freeze({state:'committed',requestId:request.requestId,
   workspaceId,boardId:request.boardId||null});
 }
 async changeBoardAccess(raw){
  const request=validateBoardAccessAction(raw);
  if(!request)deny('Invalid exact-board access request.',400);
  return this.#submit(request.workspaceId,'change-board-access',request);
 }
 async createGroup(raw){
  const request=validateWorkspaceGroupDraft(raw);
  if(!request)deny('Invalid workspace group request.',400);
  return this.#submit(request.workspaceId,'create-workspace-group',request);
 }
}

export function renderBoardAccessChoices({
 people=unavailable,groups=null,tab='people',query='',
 enabled=BOARD_GROUP_ACCESS_ENABLED
}={}){
 const which=tab==='groups'?'groups':'people';
 const q=typeof query==='string'?query.trim().toLocaleLowerCase().slice(0,120):'';
 const validPeople=people?.status==='VERIFIED_SIGNED_CANDIDATES';
 const validGroups=groups?.status==='VERIFIED_GROUPS';
 const entries=which==='people'&&validPeople?people.members:
  which==='groups'&&validGroups?groups.groups:[];
 const filtered=entries.filter(row=>row.name.toLocaleLowerCase().includes(q)||
  (which==='people'&&row.email.toLowerCase().includes(q)));
 const message=which==='people'?
  'Workspace member directory requires approved server access.':
  'Workspace groups are not activated yet.';
 return '<section class="bs09-board-access" aria-label="Manage board access">'+
  '<div class="bs09-picker-head"><strong>Add people or groups</strong>'+
  '<small>Only selected members or groups can access this board.</small></div>'+
  '<div class="bs09-picker-tabs" role="group" aria-label="Choose access source">'+
   '<button type="button" data-bs09-tab="people" aria-pressed="'+(which==='people')+'">People</button>'+
   '<button type="button" data-bs09-tab="groups" aria-pressed="'+(which==='groups')+'">Groups</button>'+
  '</div>'+
  '<label for="bs09-access-search">Search existing workspace '+(which==='people'?'members':'groups')+'</label>'+
  '<input type="search" id="bs09-access-search" maxlength="120" autocomplete="off" '+
   'placeholder="Search '+(which==='people'?'members':'groups')+'" value="'+escape(q)+'" '+
   (!(which==='people'?validPeople:validGroups)?'disabled':'')+'>'+
  '<div class="bs09-access-results" data-bs09-access-results role="status">'+
   ((which==='people'?validPeople:validGroups)?
    (filtered.length?filtered.map(row=>
     '<div class="bs09-access-result"><span>'+escape(row.name)+'</span>'+
     '<small>'+(which==='people'?escape(row.email)+' · '+
       escape(row.boardRole||'Not on this board'):
       row.memberCount+' workspace member'+(row.memberCount===1?'':'s'))+'</small>'+
     '<button type="button" '+
      ((enabled&&((which==='people'&&!row.boardRole)||
       (which==='groups'&&!row.assignedToBoard)))?'':'disabled ')+
      'data-bs09-assign="'+row.id+'">'+
      (which==='groups'&&row.assignedToBoard||which==='people'&&row.boardRole?
       'Assigned':'Add viewer')+'</button></div>').join(''):
     '<p>No matching workspace '+(which==='people'?'members':'groups')+'.</p>'):
    '<p>'+message+'</p>')+
  '</div>'+
  (which==='groups'?'<button type="button" class="bs09-group-create" disabled '+
   'aria-label="Create a workspace group (not activated)">+ Create group</button>':'')+
  '<p class="bs09-access-note">Workspace membership alone does not grant board access.'+
   (enabled?' Changes require a signed board-manager transaction and verification.':
   ' Access changes remain disabled until server-side permissions are verified.')+'</p>'+
 '</section>';
}
