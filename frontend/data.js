import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BOARD_ITEM_PAGE_SIZE=200;
export function validUuid(v){return typeof v==='string'&&uuid.test(v);}
export function requireUuid(v){if(!validUuid(v))throw new ApiError('Invalid board or workspace identifier.');return v;}

function compareBoardCursor(left,right){
 if(left.position!==right.position)return left.position-right.position;
 return left.id.localeCompare(right.id);
}
function validateBoardItemPage(page,{boardId,columnIds,afterCursor=null,
 existingItemIds=new Set(),existingValueKeys=new Set(),pageSize=BOARD_ITEM_PAGE_SIZE}={}){
 if(!page||!Array.isArray(page.items)||!Array.isArray(page.values)||
    typeof page.has_more!=='boolean')
  throw new ApiError('Board item page response is invalid.',409,'INVALID_BOARD_PAGE');
 if(page.items.length>pageSize)
  throw new ApiError('Board item page exceeded its requested size.',409,'INVALID_BOARD_PAGE');
 const pageItemIds=new Set();
 let previous=null;
 for(const item of page.items){
  if(!item||!validUuid(item.id)||item.board_id!==boardId||
     !Number.isInteger(item.position)||item.position<0||
     pageItemIds.has(item.id)||existingItemIds.has(item.id))
   throw new ApiError('Board item page contains an invalid or duplicate item.',409,'INVALID_BOARD_ITEM');
  const current={position:item.position,id:item.id};
  if(previous&&compareBoardCursor(current,previous)<=0)
   throw new ApiError('Board item page ordering is invalid.',409,'INVALID_BOARD_ORDER');
  if(afterCursor&&compareBoardCursor(current,afterCursor)<=0)
   throw new ApiError('Board item page did not advance its cursor.',409,'INVALID_BOARD_CURSOR');
  pageItemIds.add(item.id);previous=current;
 }
 for(const value of page.values){
  if(!value||!validUuid(value.item_id)||!validUuid(value.column_id)||
     !pageItemIds.has(value.item_id)||!columnIds.has(value.column_id)||
     !Object.prototype.hasOwnProperty.call(value,'value'))
   throw new ApiError('Board item page contains an invalid cell value.',409,'INVALID_BOARD_VALUE');
  const key=value.item_id+':'+value.column_id;
  if(existingValueKeys.has(key))
   throw new ApiError('Board item pages contain a duplicate cell value.',409,'DUPLICATE_BOARD_VALUE');
  existingValueKeys.add(key);
 }
 let nextCursor=null;
 if(page.has_more){
  if(page.items.length!==pageSize||page.items.length===0)
   throw new ApiError('Board item page cannot advance safely.',409,'INVALID_BOARD_CURSOR');
  const tail=page.items.at(-1),next=page.next_cursor;
  if(!next||!Number.isInteger(next.position)||next.position<0||
     !validUuid(next.id)||next.position!==tail.position||next.id!==tail.id)
   throw new ApiError('Board item page returned an invalid continuation cursor.',409,'INVALID_BOARD_CURSOR');
  if(afterCursor&&compareBoardCursor(next,afterCursor)<=0)
   throw new ApiError('Board item pagination cursor did not advance.',409,'INVALID_BOARD_CURSOR');
  nextCursor={position:next.position,id:next.id};
 }else if(page.next_cursor!=null){
  throw new ApiError('Final board item page returned an unexpected cursor.',409,'INVALID_BOARD_CURSOR');
 }
 for(const id of pageItemIds)existingItemIds.add(id);
 return {items:page.items,values:page.values,hasMore:page.has_more,nextCursor};
}
function encodeQuery(input){return new URLSearchParams(input).toString();}
// Board-affecting writes only. Read RPCs must never broadcast invalidations:
// doing so could trigger infinite cross-tab read / broadcast cycles.
// Only verified read-only RPCs may preserve cached board snapshots.
// Unknown RPCs remain conservative: invalidate locally before execution.
const BOARD_READ_RPC=new Set([
 'wm_get_board_shell','wm_get_board_items_page',
 'wm_auth_access_context','work_board_access','wm_list_boards',
 'wm_board_ui_read','wm_list_board_events','wm_list_board_events_page',
 'wm_import_extended_refs_read',
 'apsyntra_crm_my_effective_access',
 'apsyntra_role_is_admin','apsyntra_role_is_bootstrap',
 'tl03_documents_page',
 'fueltrack_v3_read','fueltrack_v3_analytics','fueltrack_v3_audit_read',
 'fueltrack_v3_receipt_prepare','fueltrack_v3_receipt_read'
]);
// Exact, reviewed write contracts only. Partial-prefix regular expressions
// can silently miss full RPC names, preventing successful writes from
// publishing cross-window invalidation hints.
const BOARD_MUTATION_RPC=new Set([
 // Core board structure, item and import writes.
 'wm_add_board_group','wm_add_board_item','wm_create_board','wm_create_board_configured',
 'wm_delete_board_item','wm_import_board_wizard_atomic','wm_managed_board_delete_empty_group',
 'wm_set_board_cell_if_current','wm_set_board_status_labels',
 'wm_update_board_group','wm_update_board_item','wm_board_bulk_mutate',
 'wm_board_card_mutate','wm_board_group_cas','wm_board_schema_mutate','wm_board_ui_save',
 // Workspace lifecycle mutations.
 'wm_ws01_config_update','wm_ws01_create','wm_ws01_select',
 // Collaboration and module writes rendered inside CRM board workspaces.
 'huly_sb06_transact',
 'mrh_board_item_tasks_write','mrh_create_material_atomic','mrh_sourcing_sensitive_write',
 'fueltrack_v3_submit','fueltrack_v3_decide',
 'fueltrack_v3_mark_refueled','fueltrack_v3_complete','fueltrack_v3_attach_receipt',
 'timetracker_attendance_commit_v2',
 'timetracker_ot_submit','timetracker_ot_decide',
 'tl03_document_commit','tl03_document_decide','tl03_document_operate',
 'tl03_document_review','tl03_document_submit','tl03_document_save',
 'tl03_document_status_update','tl03_record_review_stage',
 'tl03_attachment_finish','tl03_attachment_prepare','tl03_attachment_remove',
 'tl03_record_pdf_approval_stage',
 // Fund Release Tracker, role and profile writes.
 'frt_assign_request_person','frt_create_request','frt_ic_create_obligation',
 'frt_ic_record_settlement','frt_record_bank_execution','frt_request_action',
 'frt_request_assignment','frt_save_recipient','frt_set_recipient_qr',
 'frt_set_request_filing_status','frt_submit_liquidation_v2','frt_update_request_date_cas',
 'apsyntra_crm_platform_role_set','apsyntra_crm_role_manage_user_access',
 'apsyntra_role_configuration_propose','update_own_profile'
]);

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
 async boardCached(boardId,{userId,workspaceId,maxAgeMs=8000,retryInvalidated=true,includeItems=true}={}){
  requireUuid(boardId);requireUuid(userId);requireUuid(workspaceId);
  const token=this.auth?.accessToken;
  if(!token||this.auth?.userId!==userId)
   throw new ApiError('Signed board cache scope is unavailable.',403);
  const finish=async (promise,entry)=>{
   let detail;
   try{detail=await promise;}
   catch(error){
    if(retryInvalidated&&error?.code==='BOARD_READ_INVALIDATED')
     return this.boardCached(boardId,{userId,workspaceId,maxAgeMs,retryInvalidated:false,includeItems});
    throw error;
   }
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token)
    throw new ApiError('Signed board session changed during loading.',403);
   if(this.boardReadCache.get(boardId)!==entry){
    if(retryInvalidated)return this.boardCached(boardId,{
     userId,workspaceId,maxAgeMs,retryInvalidated:false,includeItems});
    throw new ApiError('Board changed during loading. Reload to reconcile.',409);
   }
   return structuredClone(detail);
  };
  const previous=this.boardReadCache.get(boardId);
  const now=Date.now();
  if(previous&&(previous.userId!==userId||previous.workspaceId!==workspaceId||
    previous.token!==token||previous.expiresAt<=now))this.boardReadCache.delete(boardId);
  else if(previous&&(previous.includeItems===true||includeItems!==true)){
   if(previous.pending)return finish(previous.pending,previous);
   return structuredClone(previous.value);
  }else if(previous)this.boardReadCache.delete(boardId);
  const entry={userId,workspaceId,token,includeItems:includeItems===true,expiresAt:now+maxAgeMs,pending:null,value:null};
  const pending=this.board(boardId,{complete:false,includeItems:includeItems===true}).then(detail=>{
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
 async boardCachedThrough(boardId,{userId,workspaceId,maxAgeMs=8000}={},{
  itemCount=BOARD_ITEM_PAGE_SIZE
 }={}){
  const target=itemCount===Infinity?Infinity:Math.max(0,Math.floor(Number(itemCount)||0));
  let detail=await this.boardCached(boardId,{userId,workspaceId,maxAgeMs});
  while(detail.pagination?.has_more===true&&detail.items.length<target)
   detail=await this.boardNextPage(boardId,{userId,workspaceId,maxAgeMs});
  return detail;
 }
 async boardNextPage(boardId,{userId,workspaceId,maxAgeMs=8000}={}){
  requireUuid(boardId);requireUuid(userId);requireUuid(workspaceId);
  const token=this.auth?.accessToken;
  if(!token||this.auth?.userId!==userId)
   throw new ApiError('Signed board page scope is unavailable.',403);
  const entry=this.boardReadCache.get(boardId);
  if(!entry||entry.userId!==userId||entry.workspaceId!==workspaceId||
     entry.token!==token||!entry.value)
   throw new ApiError('Board page snapshot expired. Refresh the board before loading more.',409,'BOARD_PAGE_CACHE_EXPIRED');
  if(entry.includeItems!==true)throw new ApiError('Board items were not requested for this view.',409,'BOARD_ITEMS_NOT_LOADED');
  if(entry.nextPending)return structuredClone(await entry.nextPending);
  if(entry.expiresAt<=Date.now())
   throw new ApiError('Board page snapshot expired. Refresh the board before loading more.',409,'BOARD_PAGE_CACHE_EXPIRED');
  if(entry.value.pagination?.has_more!==true)return structuredClone(entry.value);
  const cursor=entry.value.pagination.next_cursor;
  if(!cursor||!Number.isInteger(cursor.position)||!validUuid(cursor.id))
   throw new ApiError('Board page continuation cursor is unavailable.',409,'INVALID_BOARD_CURSOR');
  const generation=this.boardReadGeneration;
  const pending=(async()=>{
   const page=await this.rpc('wm_get_board_items_page',{
    p_board_id:boardId,p_after_position:cursor.position,
    p_after_id:cursor.id,p_limit:BOARD_ITEM_PAGE_SIZE
   });
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token||
      this.boardReadGeneration!==generation||
      this.boardReadCache.get(boardId)!==entry)
    throw new ApiError('Board changed while the next page was loading.',409,'BOARD_PAGE_INVALIDATED');
   const existingItemIds=new Set(entry.value.items.map(item=>item.id));
   const existingValueKeys=new Set(entry.value.values.map(value=>
    value.item_id+':'+value.column_id));
   const columnIds=new Set(entry.value.columns.map(column=>column?.id).filter(validUuid));
   const parsed=validateBoardItemPage(page,{
    boardId,columnIds,afterCursor:cursor,existingItemIds,existingValueKeys
   });
   const value={
    ...entry.value,
    items:[...entry.value.items,...parsed.items],
    values:[...entry.value.values,...parsed.values],
    pagination:{
     page_size:BOARD_ITEM_PAGE_SIZE,has_more:parsed.hasMore,
     next_cursor:parsed.nextCursor,
     loaded_count:entry.value.items.length+parsed.items.length,loaded:true
    }
   };
   if(this.auth?.userId!==userId||this.auth?.accessToken!==token||
      this.boardReadGeneration!==generation||
      this.boardReadCache.get(boardId)!==entry)
    throw new ApiError('Board changed before its next page could be committed.',409,'BOARD_PAGE_INVALIDATED');
   entry.value=value;
   entry.expiresAt=Date.now()+maxAgeMs;
   return value;
  })();
  entry.nextPending=pending;
  try{return structuredClone(await pending);}
  finally{if(entry.nextPending===pending)entry.nextPending=null;}
 }
 rpc(name,args={},options={}){
   if(!/^[a-z][a-z0-9_]+$/.test(name))throw new ApiError('Invalid operation.');
   const mutates=BOARD_MUTATION_RPC.has(name);
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
 async board(boardId,{includeExtendedRefs=false,importVerification=false,complete=true,includeItems=true}={}){
   requireUuid(boardId);
   const includeRefs=includeExtendedRefs===true||importVerification===true;
   if(!includeItems&&complete)
    throw new ApiError('Shell-only board reads must remain explicitly incomplete.',409,'INVALID_BOARD_READ_MODE');
   if(includeRefs&&(!complete||!includeItems))
    throw new ApiError('Import extended references require a complete board snapshot.',409,'INCOMPLETE_IMPORT_SNAPSHOT');
   const actor=this.auth?.userId;
   const readOptions=importVerification?{readTimeoutMs:30000}:{};
   const readSnapshot=async()=>{
    const generation=this.boardReadGeneration;
    const [shell,firstPage]=await Promise.all([
     this.rpc('wm_get_board_shell',{p_board_id:boardId},readOptions),
     includeItems?this.rpc('wm_get_board_items_page',{
      p_board_id:boardId,p_after_position:null,p_after_id:null,
      p_limit:BOARD_ITEM_PAGE_SIZE
     },readOptions):Promise.resolve(null)
    ]);
    if(!shell?.board||shell.board.id!==boardId)
     throw new ApiError('Board was not found or is unavailable.',404);
    if(!Array.isArray(shell.groups)||!Array.isArray(shell.members)||
       !Array.isArray(shell.columns))
     throw new ApiError('Board shell response is incomplete.',409,'INVALID_BOARD_SHELL');
    const columnIds=new Set(shell.columns.map(column=>column?.id).filter(validUuid));
    const items=[],values=[],itemIds=new Set(),valueKeys=new Set();
    let page=firstPage,cursor=null,parsed={hasMore:false,nextCursor:null};
    if(includeItems){
     while(true){
      parsed=validateBoardItemPage(page,{
       boardId,columnIds,afterCursor:cursor,
       existingItemIds:itemIds,existingValueKeys:valueKeys
      });
      items.push(...parsed.items);
      values.push(...parsed.values);
      if(!parsed.hasMore||!complete)break;
      cursor=parsed.nextCursor;
      page=await this.rpc('wm_get_board_items_page',{
       p_board_id:boardId,p_after_position:cursor.position,
       p_after_id:cursor.id,p_limit:BOARD_ITEM_PAGE_SIZE
      },readOptions);
     }
    }
    if(this.auth?.userId!==actor)
     throw new ApiError('Signed board identity changed during loading.',403);
    if(this.boardReadGeneration!==generation)return null;
    const detail={
     ...shell,items,values,
     pagination:{
      page_size:BOARD_ITEM_PAGE_SIZE,has_more:parsed.hasMore,
      next_cursor:parsed.nextCursor,loaded_count:items.length,loaded:includeItems===true
     }
    };
    if(includeRefs&&this.extendedRefsSupported!==false){
     try{
      const refs=await this.rpc('wm_import_extended_refs_read',{p_board_id:boardId},readOptions);
      if(!Array.isArray(refs))
       throw new ApiError('Extended reference read response is invalid.',409);
      for(const ref of refs){
       if(!validUuid(ref?.item_id)||!validUuid(ref?.column_id)||
          typeof ref.value!=='string'||!itemIds.has(ref.item_id)||
          !columnIds.has(ref.column_id))
        throw new ApiError('Extended reference does not match a board item and column.',409);
       const key=ref.item_id+':'+ref.column_id;
       if(valueKeys.has(key))
        throw new ApiError('Extended reference conflicts with a board cell.',409);
       valueKeys.add(key);
       detail.values.push({item_id:ref.item_id,column_id:ref.column_id,value:ref.value});
      }
      this.extendedRefsSupported=true;
     }catch(error){
      if(error?.status===404||error?.code==='PGRST202')this.extendedRefsSupported=false;
      else throw error;
     }
    }
    if(this.auth?.userId!==actor)
     throw new ApiError('Signed board identity changed during loading.',403);
    return this.boardReadGeneration===generation?detail:null;
   };
   const detail=await readSnapshot();
   if(detail)return detail;
   throw new ApiError('Board changed while its pages were loading. Refresh and retry.',409,'BOARD_READ_INVALIDATED');
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
