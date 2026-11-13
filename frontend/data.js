import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validUuid(v){return typeof v==='string'&&uuid.test(v);}
export function requireUuid(v){if(!validUuid(v))throw new ApiError('Invalid board or workspace identifier.');return v;}
function encodeQuery(input){return new URLSearchParams(input).toString();}
// Board-affecting writes only. Read RPCs must never broadcast invalidations:
// doing so could trigger infinite cross-tab read / broadcast cycles.
// Only verified read-only RPCs may preserve cached board snapshots.
// Unknown RPCs remain conservative: invalidate locally before execution.
const BOARD_READ_RPC=new Set([
 'wm_get_board','wm_auth_access_context','work_board_access','wm_list_boards',
 'wm_board_ui_read','wm_list_board_events','wm_list_board_events_page',
 'wm_import_extended_refs_read',
 'apsyntra_crm_my_effective_access',
 'apsyntra_role_is_admin',
 'tl03_documents_page',
 'fueltrack_v3_read','fueltrack_v3_analytics','fueltrack_v3_audit_read',
 'fueltrack_v3_receipt_prepare','fueltrack_v3_receipt_read'
]);
const BOARD_MUTATION_RPC=/^(?:wm_(?:add_|create_|delete_|set_|update_|import_|managed_board_delete|ws01_(?:config_update|create|select)|board_(?:bulk_mutate|card_mutate|group_cas|schema_mutate|ui_save))|huly_sb06_transact|tl03_(?:document_(?:commit|decide|operate|review|submit)|attachment_(?:finish|prepare|remove)|record_pdf_approval_stage)|timetracker_(?:attendance_commit|ot_(?:submit|decide))|apsyntra_(?:crm_platform_role_set|role_manage_user_access|role_configuration_propose)|fueltrack_v3_(?:submit|decide|mark_refueled|complete|attach_receipt))$/;

export class DomainApi {
 constructor(auth){
  this.auth=auth;
  this.boardReadCache=new Map();
  this.boardReadGeneration=0;
  this.boardListRequests=new Map();
  this.effectiveAccessPending=new Map();
  this.onBoardMutation=null;
  this.extendedRefsSupported=null;
 }
 invalidateBoardCache(boardId=null,{revision=null}={}){
  if(boardId!==null){
   if(!validUuid(boardId))return false;
   const prior=this.boardReadCache.get(boardId);
   const cachedRevision=prior?.value?.board?.updated_at;
   // Strictly older board revisions cannot invalidate a newer snapshot.
   // Equality still invalidates: item edits may not advance board.updated_at.
   if(typeof revision==='string'&&typeof cachedRevision==='string'&&
      Number.isFinite(Date.parse(revision))&&Number.isFinite(Date.parse(cachedRevision))&&
      Date.parse(revision)<Date.parse(cachedRevision))return false;
  }
  this.boardReadGeneration++;
  this.boardListRequests.clear();
  this.effectiveAccessPending.clear();
  if(boardId===null)this.boardReadCache.clear();
  else this.boardReadCache.delete(boardId);
  return true;
 }
 /** Only already-authorized board payloads, bounded by a signed identity +
  * workspace + access-token generation. Never cache permissions or failures.
  * Server-side view authorization is always rechecked by the route caller.
  */
 async boardCached(boardId,{userId,workspaceId,maxAgeMs=8000,retryInvalidated=true}={}){
  requireUuid(boardId);requireUuid(userId);requireUuid(workspaceId);
  const token=this.auth?.accessToken;
  if(!token||this.auth?.userId!==userId)
   throw new ApiError('Signed board cache scope is unavailable.',403);
  const finish=async (promise,entry)=>{
   const detail=await promise;
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token)
    throw new ApiError('Signed board session changed during loading.',403);
   if(this.boardReadCache.get(boardId)!==entry){
    if(retryInvalidated)return this.boardCached(boardId,{
     userId,workspaceId,maxAgeMs,retryInvalidated:false});
    throw new ApiError('Board changed during loading. Reload to reconcile.',409);
   }
   return structuredClone(detail);
  };
  const previous=this.boardReadCache.get(boardId);
  const now=Date.now();
  if(previous&&(previous.userId!==userId||previous.workspaceId!==workspaceId||
    previous.token!==token||previous.expiresAt<=now))this.boardReadCache.delete(boardId);
  else if(previous){
   if(previous.pending)return finish(previous.pending,previous);
   return structuredClone(previous.value);
  }
  const entry={userId,workspaceId,token,expiresAt:now+maxAgeMs,pending:null,value:null};
  const pending=this.board(boardId).then(detail=>{
   if(detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId)
    throw new ApiError('Board response workspace mismatch.',403);
   if(this.boardReadCache.get(boardId)===entry&&
     this.auth?.userId===userId&&this.auth?.accessToken===token){
    entry.value=detail;
    entry.pending=null;
    entry.expiresAt=Date.now()+maxAgeMs;
   }
   return detail;
  }).catch(error=>{
   if(this.boardReadCache.get(boardId)===entry)this.boardReadCache.delete(boardId);
   throw error;
  });
  entry.pending=pending;
  // Keep the cache in memory only, with a small fixed number of boards.
  if(this.boardReadCache.size>=8)
   this.boardReadCache.delete(this.boardReadCache.keys().next().value);
  this.boardReadCache.set(boardId,entry);
  return finish(pending,entry);
 }
 rpc(name,args={},options={}){
   if(!/^[a-z][a-z0-9_]+$/.test(name))throw new ApiError('Invalid operation.');
   const mutates=BOARD_MUTATION_RPC.test(name);
   const knownRead=BOARD_READ_RPC.has(name);
   // Unknown calls may mutate: preserve the original fail-closed behavior.
   if(!mutates&&!knownRead)this.invalidateBoardCache();
   const request=this.auth.authorized('/rest/v1/rpc/'+name,{method:'POST',body:args,...options});
   if(!mutates)return request;
   return Promise.resolve(request).then(result=>{
    // Commit-time invalidation avoids evicting valid snapshots on denied writes.
    // A missing board identifier invalidates all boards rather than guessing.
    const boardId=validUuid(args?.p_board_id)?args.p_board_id:null;
    this.invalidateBoardCache(boardId);
    try{
     const revision=typeof result?.board?.updated_at==='string'?
      result.board.updated_at:null;
     this.onBoardMutation?.({boardId,revision});
    }catch{/* A cross-tab hint must never affect a signed mutation receipt. */}
    return result;
   });
 }
 /** Coalesce only overlapping effective-access reads. Completed permissions and
  * failed requests are never cached; mutations and session changes invalidate
  * reuse, while the signed backend remains the sole authorization authority.
  */
 async effectiveAccess(){
   const userId=this.auth?.userId,token=this.auth?.accessToken;
   const generation=this.boardReadGeneration;
   if(!validUuid(userId)||!token)
    throw new ApiError('Signed effective-access context is unavailable.',403);
   const key=JSON.stringify([userId,token,generation]);
   let pending=this.effectiveAccessPending.get(key);
   if(!pending){
    pending=Promise.resolve().then(()=>this.rpc('apsyntra_crm_my_effective_access',{}));
    this.effectiveAccessPending.set(key,pending);
    const cleanup=()=>{
     if(this.effectiveAccessPending.get(key)===pending)
      this.effectiveAccessPending.delete(key);
    };
    pending.then(cleanup,cleanup);
   }
   const data=await pending;
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token||
      this.boardReadGeneration!==generation)
    throw new ApiError('Signed effective-access context changed during loading.',409);
   return structuredClone(data);
 }
 async context(){
   const ctx=await this.rpc('wm_auth_access_context');
   if(!ctx||ctx.profile?.status!=='active'||!validUuid(ctx.workspace_id)
      ||ctx.user_id!==this.auth.userId)throw new ApiError('Your account has no active workspace access.',403);
   return ctx;
 }
 async boards(status='active'){
   // Share only concurrent identical reads; never cache completed board lists
   // or permission decisions across sessions, mutations or workspace changes.
   const token=this.auth?.accessToken;
   const userId=this.auth?.userId;
   const generation=this.boardReadGeneration;
   const key=JSON.stringify([status,userId,token,generation]);
   let pending=this.boardListRequests.get(key);
   if(!pending){
    pending=this.rpc('wm_list_boards',{p_status:status});
    this.boardListRequests.set(key,pending);
    const cleanup=()=>{
     if(this.boardListRequests.get(key)===pending)this.boardListRequests.delete(key);
    };
    Promise.resolve(pending).then(cleanup,cleanup);
   }
   const data=await pending;
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token||
      this.boardReadGeneration!==generation)
    throw new ApiError('Board list changed during loading. Reload to reconcile.',409);
   if(!Array.isArray(data))throw new ApiError('Unexpected board list response.');
   return structuredClone(data);
 }
 async board(boardId,{parallelExtendedRefs=false,importVerification=false}={}){
   requireUuid(boardId);
   // On a same-board signed refresh, both read RPCs independently enforce
   // database access. Start the optional reference read alongside the board
   // read, not after it, to eliminate one network round trip.
   const refsPending=parallelExtendedRefs&&this.extendedRefsSupported!==false?
    this.rpc('wm_import_extended_refs_read',{p_board_id:boardId},
      importVerification?{readTimeoutMs:30000}:{})
     .then(value=>({value}),error=>({error})):null;
   const data=await this.rpc('wm_get_board',{p_board_id:boardId},
    importVerification?{readTimeoutMs:30000}:{});
   if(!data?.board)throw new ApiError('Board was not found or is unavailable.',404);
   if(this.extendedRefsSupported!==false){
    try{
     const outcome=refsPending?await refsPending:null;
     if(outcome?.error)throw outcome.error;
     const refs=outcome?outcome.value:
      await this.rpc('wm_import_extended_refs_read',{p_board_id:boardId},
       importVerification?{readTimeoutMs:30000}:{});
     if(!Array.isArray(refs))throw new ApiError('Extended reference read response is invalid.',409);
     if(!Array.isArray(data.values))throw new ApiError('Board values are unavailable.',409);
     const keys=new Set(data.values.map(v=>v.item_id+':'+v.column_id));
     for(const ref of refs){
      if(!validUuid(ref.item_id)||!validUuid(ref.column_id)||
         typeof ref.value!=='string'||keys.has(ref.item_id+':'+ref.column_id))
       throw new ApiError('Extended reference conflicts with a board cell.',409);
      keys.add(ref.item_id+':'+ref.column_id);
      data.values.push({item_id:ref.item_id,column_id:ref.column_id,value:ref.value});
     }
     this.extendedRefsSupported=true;
    }catch(error){
     // Old production projects do not have m143-v2. Cache a missing-function
     // capability result, but NEVER silently bypass a signed access denial.
     if(error?.status===404||error?.code==='PGRST202')this.extendedRefsSupported=false;
     else throw error;
    }
   }
   return data;
 }
 async allowed(boardId,required='view'){
   return (await this.rpc('work_board_access',{p_board_id:requireUuid(boardId),p_required:required}))===true;
 }
 async createBoard(name,description=''){
   return this.rpc('wm_create_board',{p_name:name.trim(),p_description:description.trim()});
 }
 async createConfiguredBoard(name,description,columns){
   if(typeof name!=='string'||!name.trim()||!Array.isArray(columns)||columns.length>30)
     throw new ApiError('Invalid configured board request.');
   return this.rpc('wm_create_board_configured',{
     p_name:name.trim(),p_description:String(description||''),p_columns:columns
   });
 }
 async setBoardCellCas(itemId,columnId,value,expectedValue){
   return this.rpc('wm_set_board_cell_if_current',{
     p_item_id:requireUuid(itemId),
     p_column_id:columnId===null?null:requireUuid(columnId),
     p_value:value,
     p_expected_value:expectedValue
   });
 }
 async deleteBoardItem(itemId){return this.rpc('wm_delete_board_item',{p_item_id:requireUuid(itemId)});}
 async boardEvents(boardId,limit=200){
   const rows=await this.rpc('wm_list_board_events',{p_board_id:requireUuid(boardId),p_limit:Math.min(limit,200)});
   if(!Array.isArray(rows))throw new ApiError('Unexpected authoritative board-event response.');
   return rows;
 }
 async addGroup(boardId,title){return this.rpc('wm_add_board_group',{p_board_id:requireUuid(boardId),p_title:title.trim()});}
 async updateGroup(groupId,title){
  if(typeof title!=='string'||title.trim().length<1||title.trim().length>120)
   throw new ApiError('Group name must contain 1–120 characters.');
  return this.rpc('wm_update_board_group',{p_group_id:requireUuid(groupId),p_title:title.trim()});
 }
 /** Signed group rename with optimistic concurrency and a validated receipt.
  * No legacy unchecked write, privilege fallback or blind retry.
  */
 async updateGroupCas(boardId,group,title){
  const bid=requireUuid(boardId),gid=requireUuid(group?.id);
  const clean=typeof title==='string'?title.trim():'';
  if(clean.length<1||clean.length>120)throw new ApiError('Group name must contain 1–120 characters.',400);
  if(group?.board_id!==bid||typeof group.updated_at!=='string'||
    !Number.isFinite(Date.parse(group.updated_at)))
   throw new ApiError('Group identity or revision is unavailable. Reload the board.',409);
  const response=await this.rpc('wm_board_group_cas',{
   p_board_id:bid,p_group_id:gid,p_expected_updated_at:group.updated_at,
   p_action:'rename',p_title:clean
  });
  if(response?.boardId!==bid||response?.groupId!==gid||response?.action!=='rename'||
    typeof response.updatedAt!=='string'||!Number.isFinite(Date.parse(response.updatedAt)))
   throw new ApiError('Group rename receipt is uncertain. Reload before retrying.',409);
  return response;
 }
 /** Ordinary board empty-group deletion via the installed server CAS contract.
  * No bulk feature flag, unsafe legacy cascading RPC, or client authority override.
  */
 async deleteEmptyGroupCas(boardId,group){
  const bid=requireUuid(boardId),gid=requireUuid(group?.id);
  if(group?.board_id!==bid||typeof group.updated_at!=='string'||
    !Number.isFinite(Date.parse(group.updated_at)))
   throw new ApiError('Group identity or revision is unavailable. Reload the board.',409);
  const response=await this.rpc('wm_board_group_cas',{
   p_board_id:bid,p_group_id:gid,p_expected_updated_at:group.updated_at,
   p_action:'delete_empty',p_title:null
  });
  if(response?.boardId!==bid||response?.groupId!==gid||
     response?.action!=='delete_empty'||response.updatedAt!==null)
   throw new ApiError('Group delete receipt is uncertain. Reload the board before retrying.',409);
  return response;
 }
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
   if(!Array.isArray(rows))throw new ApiError('Unexpected APSYNTRA Issue response.');
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
 /**
  * Native Issue transaction service hosted by the existing Supabase project.
  * The server revalidates signed identity, board scope, document state, operators and CAS.
  */
 async nativeTransactions(boardId,workspaceId,txes){
   if(!Array.isArray(txes)||txes.length<1||txes.length>25)
     throw new ApiError('Invalid native transaction batch.');
   const response=await this.auth.authorized('/functions/v1/apsyntra-native-issues',{
     method:'POST',
     body:{boardId:requireUuid(boardId),workspaceId:requireUuid(workspaceId),txes}
   });
   if(!response||response.applied!==txes.length||!Array.isArray(response.receipts)
      ||response.receipts.length!==txes.length
      ||response.receipts.some(r=>r.boardId!==boardId||r.workspaceId!==workspaceId||!Number.isSafeInteger(r.revision)||r.revision<1))
     throw new ApiError('Native transaction receipt verification failed.');
   return response;
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
