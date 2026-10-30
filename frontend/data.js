import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validUuid(v){return typeof v==='string'&&uuid.test(v);}
export function requireUuid(v){if(!validUuid(v))throw new ApiError('Invalid board or workspace identifier.');return v;}
function encodeQuery(input){return new URLSearchParams(input).toString();}
export class DomainApi {
 constructor(auth){this.auth=auth;}
 rpc(name,args={}){
   if(!/^[a-z][a-z0-9_]+$/.test(name))throw new ApiError('Invalid operation.');
   return this.auth.authorized('/rest/v1/rpc/'+name,{method:'POST',body:args});
 }
 async context(){
   const ctx=await this.rpc('wm_auth_access_context');
   if(!ctx||ctx.profile?.status!=='active'||!validUuid(ctx.workspace_id)
      ||ctx.user_id!==this.auth.userId)throw new ApiError('Your account has no active workspace access.',403);
   return ctx;
 }
 async boards(status='active'){
   const data=await this.rpc('wm_list_boards',{p_status:status});
   if(!Array.isArray(data))throw new ApiError('Unexpected board list response.');
   return data;
 }
 async board(boardId){
   const data=await this.rpc('wm_get_board',{p_board_id:requireUuid(boardId)});
   if(!data?.board)throw new ApiError('Board was not found or is unavailable.',404);
   return data;
 }
 async allowed(boardId,required='view'){
   return (await this.rpc('work_board_access',{p_board_id:requireUuid(boardId),p_required:required}))===true;
 }
 async createBoard(name,description=''){
   return this.rpc('wm_create_board',{p_name:name.trim(),p_description:description.trim()});
 }
 async addGroup(boardId,title){return this.rpc('wm_add_board_group',{p_board_id:requireUuid(boardId),p_title:title.trim()});}
 async addItem(boardId,groupId,title){return this.rpc('wm_add_board_item',{
   p_board_id:requireUuid(boardId),p_group_id:requireUuid(groupId),p_title:title.trim()
 });}
 async updateItem(item){
   return this.rpc('wm_update_board_item',{p_item_id:requireUuid(item.id),
     p_title:item.title,p_status:item.status||'working',p_assignee_id:item.assignee_id||null,
     p_due_date:item.due_date||null,p_notes:item.notes||''});
 }
 async issues(boardId,workspaceId){
   const params=encodeQuery({select:'document_id,payload,revision,board_id,workspace_id,updated_at',
     board_id:'eq.'+requireUuid(boardId),workspace_id:'eq.'+requireUuid(workspaceId),
     document_id:'like.huly.issue.*',order:'updated_at.desc',limit:'100'});
   const rows=await this.auth.authorized('/rest/v1/huly_sb02_documents?'+params);
   if(!Array.isArray(rows))throw new ApiError('Unexpected Huly issue response.');
   return rows.filter(row=>row.payload?.kind==='huly.tracker.Issue'&&row.payload?.format===1);
 }
 async issueEvents(boardId,workspaceId,documentId){
   if(typeof documentId!=='string'||!/^huly\.issue\.[A-Za-z0-9_.:-]{1,191}$/.test(documentId))
     throw new ApiError('Invalid Issue document identifier.');
   const params=encodeQuery({select:'document_id,event_type,revision,actor_id,event_id',
     board_id:'eq.'+requireUuid(boardId),workspace_id:'eq.'+requireUuid(workspaceId),
     document_id:'eq.'+documentId,order:'event_id.asc',limit:'25'});
   const rows=await this.auth.authorized('/rest/v1/huly_sb06_events?'+params);
   if(!Array.isArray(rows))throw new ApiError('Unexpected event ledger response.');
   return rows;
 }
 async commit(boardId,workspaceId,operations){
   if(!Array.isArray(operations)||operations.length<1||operations.length>25)throw new ApiError('Invalid transaction batch.');
   return this.rpc('huly_sb06_transact',{p_board_id:requireUuid(boardId),
     p_workspace_id:requireUuid(workspaceId),p_operations:operations});
 }
 issueSnapshot({id,title,status,priority,userId}){
   const timestamp=Date.now();
   return {_id:id,_class:'tracker:class:Issue',space:'tracker:space:Project',
     title:title.trim(),status,priority,createdBy:userId,modifiedBy:userId,
     createdOn:timestamp,modifiedOn:timestamp};
 }
 async createIssue(boardId,workspaceId,properties,userId){
   const id=crypto.randomUUID(),snapshot=this.issueSnapshot({...properties,id,userId});
   const payload={kind:'huly.tracker.Issue',format:1,snapshot};
   await this.commit(boardId,workspaceId,[{action:'create',documentId:'huly.issue.'+id,payload}]);
   return id;
 }
 async updateIssue(boardId,workspaceId,row,changes,userId){
   const snapshot={...row.payload.snapshot,...changes,modifiedBy:userId,modifiedOn:Date.now()};
   const payload={...row.payload,snapshot};
   return this.commit(boardId,workspaceId,[{action:'update',
     documentId:row.document_id,expectedRevision:row.revision,payload}]);
 }
 async removeIssue(boardId,workspaceId,row){
   return this.commit(boardId,workspaceId,[{action:'remove',
     documentId:row.document_id,expectedRevision:row.revision}]);
 }
}
