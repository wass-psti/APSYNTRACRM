import {ApiError} from './session.js';
import {normalizeNativeApplicationBoardContext} from './native-application-access.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BOARD_ITEM_PAGE_SIZE=200;
export function validUuid(v){return typeof v==='string'&&uuid.test(v);}
export function requireUuid(v){if(!validUuid(v))throw new ApiError('Invalid board or workspace identifier.');return v;}

function compareBoardCursor(left,right){
 if(left.position!==right.position)return left.position-right.position;
 return left.id.localeCompare(right.id);
}
function validateBoardPageCounts(counts,{groupIds,pageItemCount,hasMore}={}){
 if(counts==null)return null;
 const integer=value=>Number.isSafeInteger(value)&&value>=0;
 if(!counts||!integer(counts.total_count)||!integer(counts.active_count)||
    !integer(counts.archived_count)||!Array.isArray(counts.groups)||
    counts.active_count+counts.archived_count!==counts.total_count)
  throw new ApiError('Board count response is invalid.',409,'INVALID_BOARD_COUNTS');
 const seen=new Set();let total=0,active=0,archived=0;
 for(const group of counts.groups){
  if(!group||!validUuid(group.group_id)||
     (groupIds&& !groupIds.has(group.group_id))||seen.has(group.group_id)||
     !integer(group.total_count)||!integer(group.active_count)||
     !integer(group.archived_count)||
     group.active_count+group.archived_count!==group.total_count)
   throw new ApiError('Board group count response is invalid.',409,'INVALID_BOARD_COUNTS');
  seen.add(group.group_id);total+=group.total_count;
  active+=group.active_count;archived+=group.archived_count;
 }
 if(total!==counts.total_count||active!==counts.active_count||
    archived!==counts.archived_count||counts.total_count<pageItemCount||
    (hasMore?counts.total_count<=pageItemCount:counts.total_count!==pageItemCount))
  throw new ApiError('Board and group counts do not reconcile with the first page.',409,'BOARD_COUNT_MISMATCH');
 return {total_count:counts.total_count,active_count:counts.active_count,
  archived_count:counts.archived_count,groups:counts.groups.map(group=>({...group}))};
}
function validateLoadedBoardCounts(items,counts,{complete=false}={}){
 if(!counts)return;
 const actual={total_count:items.length,active_count:0,archived_count:0,groups:new Map()};
 for(const item of items){
  const archived=!!item.archived_at;
  if(archived)actual.archived_count++;else actual.active_count++;
  const group=actual.groups.get(item.group_id)||{total_count:0,active_count:0,archived_count:0};
  group.total_count++;if(archived)group.archived_count++;else group.active_count++;
  actual.groups.set(item.group_id,group);
 }
 const exceeds=(observed,expected)=>observed>expected;
 if(exceeds(actual.total_count,counts.total_count)||
    exceeds(actual.active_count,counts.active_count)||
    exceeds(actual.archived_count,counts.archived_count)||
    (complete&&(actual.total_count!==counts.total_count||
      actual.active_count!==counts.active_count||
      actual.archived_count!==counts.archived_count)))
  throw new ApiError('Loaded board rows do not reconcile with authoritative active and archived totals.',409,'BOARD_COUNT_MISMATCH');
 const expectedGroups=new Map(counts.groups.map(group=>[group.group_id,group]));
 for(const [groupId,observed] of actual.groups){
  const expected=expectedGroups.get(groupId);
  if(!expected||exceeds(observed.total_count,expected.total_count)||
     exceeds(observed.active_count,expected.active_count)||
     exceeds(observed.archived_count,expected.archived_count)||
     (complete&&(observed.total_count!==expected.total_count||
       observed.active_count!==expected.active_count||
       observed.archived_count!==expected.archived_count)))
   throw new ApiError('Loaded group rows do not reconcile with authoritative group totals.',409,'BOARD_COUNT_MISMATCH');
 }
 if(complete)for(const [groupId,expected] of expectedGroups){
  const observed=actual.groups.get(groupId)||{total_count:0,active_count:0,archived_count:0};
  if(observed.total_count!==expected.total_count||
     observed.active_count!==expected.active_count||
     observed.archived_count!==expected.archived_count)
   throw new ApiError('A completed group page does not match its authoritative totals.',409,'BOARD_COUNT_MISMATCH');
 }
}
function validateBoardItemPage(page,{boardId,columnIds,groupIds,afterCursor=null,
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
 const counts=validateBoardPageCounts(page.counts,{
  groupIds,pageItemCount:page.items.length,hasMore:page.has_more
 });
 for(const id of pageItemIds)existingItemIds.add(id);
 return {items:page.items,values:page.values,hasMore:page.has_more,nextCursor,counts};
}
function encodeQuery(input){return new URLSearchParams(input).toString();}
function stableRequestValue(value){
 if(Array.isArray(value))return value.map(stableRequestValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableRequestValue(value[key])]));
 return value;
}
// Exact allowlist of verified read-only RPCs (board and domain). These may
// share overlapping requests and receive one bounded transport retry. They
// never broadcast invalidations or cache completed permission decisions.
// Unknown RPCs remain conservative: invalidate locally before execution.
const BOARD_READ_RPC=new Set([
 'wm_get_board_shell','wm_get_board_items_page',
 'wm_auth_access_context','work_board_access','wm_list_boards',
 'native_application_board_context','tl03_board_projection','tl03_native_activity',
 // Signed workspace discovery is a read-only lifecycle contract.
 'wm_ws01_list',
 'wm_search_workspace_content',
 'wm_board_ui_read','wm_list_board_events','wm_list_board_events_page',
 'wm_import_extended_refs_read',
 'apsyntra_crm_my_effective_access',
 'apsyntra_role_is_admin','apsyntra_role_is_bootstrap',
 // Signed STABLE role snapshots are verified reads, not unknown operations.
 'apsyntra_role_user_management_snapshot','apsyntra_role_configuration_snapshot',
 'apsyntra_crm_platform_role_snapshot','apsyntra_role_fueltrans_workspace_snapshot',
 'apsyntra_role_tooltrace_workspace_snapshot','apsyntra_role_frt_workspace_snapshot',
 'apsyntra_role_scoped_six_snapshot','apsyntra_role_charter_workspace_snapshot',
 'tl03_documents_page','tl03_document_read','tl03_document_history','tl03_document_revision_bundle',
 // Assigned reviewer projection is read-only despite its VOLATILE PL/pgSQL wrapper.
 'tl03_assigned_documents',
 'fueltrack_v3_read','fueltrack_v3_analytics','fueltrack_v3_audit_read',
 'fueltrack_v3_receipt_prepare','fueltrack_v3_receipt_read',
 // Existing application read contracts used by concurrent native search.
 'frt_bootstrap','frt_board_list_safe','frt_board_dashboard_safe',
 'frt_liquidation_aging_company','frt_restricted_request_detail','frt_ic_snapshot','frt_bank_execution_snapshot',
 'frt_archive_list',
 'charter_dispatch',
 'has_module_access','list_module_directory','list_module_state',
 'timetracker_clock_snapshot',
 'timetracker_ot_snapshot','timetracker_attendance_capabilities',
 'timetracker_board_private_snapshot','timetracker_team_directory_snapshot',
 'timetracker_gps_snapshot','timetracker_monitor_snapshot',
 // Existing read-only native application search and detail contracts.
 'tool_traceability_list_tools','tool_traceability_list_requests','tool_traceability_list_items',
 'tool_traceability_get_item','toolbox_issues_list_issues','toolbox_issues_get_issue','toolbox_issues_users',
 'toolbox_issues_native_v2_capabilities',
 'material_request_hub_list_requests','material_request_hub_get_request',
 'employee_evaluation_management_snapshot','employee_evaluation_my_snapshot',
 'fm1_service_status_v1','fm1_list_tickets_v1','fm1_ticket_detail_v1',
 'fm1_notification_inbox_v1','fm1_deadline_warning_policy_v1','fm1_operational_report_v1'
]);
// Exact, reviewed write contracts only. Partial-prefix regular expressions
// can silently miss full RPC names, preventing successful writes from
// publishing cross-window invalidation hints.
const BOARD_MUTATION_RPC=new Set([
 // Core board structure, item and import writes.
 'wm_add_board_group','wm_add_board_item','wm_create_board','wm_create_board_configured',
 'wm_delete_board_item','wm_delete_board_permanently','wm_import_board_wizard_atomic','wm_managed_board_delete_empty_group',
 'wm_set_board_cell_if_current','wm_set_board_status_labels',
 'wm_update_board_group','wm_update_board_item','wm_board_bulk_mutate',
 'wm_board_card_mutate','wm_board_group_cas','wm_board_schema_mutate','wm_board_ui_save',
 // Workspace lifecycle mutations.
 'wm_ws01_config_update','wm_ws01_create','wm_ws01_select',
 // Collaboration and module writes rendered inside CRM board workspaces.
 'huly_sb06_transact',
 'toolbox_issues_create_issue','toolbox_issues_update_issue','toolbox_issues_add_update',
 'toolbox_issues_create_subitem','toolbox_issues_update_subitem',
 'toolbox_issues_delete_subitem','toolbox_issues_archive_issue',
 'toolbox_issues_register_attachment',
 'toolbox_issues_reply_update','toolbox_issues_unregister_attachment',
 'toolbox_issues_confirm_attachment_purged',
 'toolbox_issues_timer_start','toolbox_issues_timer_stop',
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
 'frt_add_comment','frt_assign_request_person','frt_create_request','frt_ic_create_obligation',
 'frt_ic_record_settlement','frt_record_bank_execution','frt_request_action',
 'frt_request_assignment','frt_restore_request','frt_save_recipient','frt_set_recipient_qr',
 'frt_set_request_filing_status','frt_submit_liquidation_v2','frt_update_request_date_cas',
 'frt_correct_request_payee_cas',
 'apsyntra_crm_platform_role_set','apsyntra_role_manage_user_access',
 // Scoped role writes must invalidate caches only after successful commits.
 'apsyntra_role_fueltrans_workspace_set','apsyntra_role_tooltrace_workspace_set',
 'apsyntra_role_frt_workspace_set','apsyntra_role_scoped_six_set',
 'apsyntra_role_charter_workspace_set',
 'apsyntra_role_configuration_propose','update_own_profile'
]);

// Domain writes outside the board data model must not flush unrelated board
// snapshots or publish board mutation broadcasts.
const NON_BOARD_DOMAIN_RPC=new Set([
 'fm1_service_status_v1','fm1_list_tickets_v1','fm1_ticket_detail_v1',
 'fm1_create_ticket_v1','fm1_transition_ticket_v1','fm1_record_milestone_v1',
 'fm1_record_priority_v1','fm1_request_hold_v1','fm1_validate_hold_v1',
 'fm1_end_hold_v1','fm1_assign_ticket_v1','fm1_add_conversation_v1',
 'fm1_notification_inbox_v1','fm1_notification_mark_read_v1',
 'order_intake_legacy_change','order_intake_recipient_options',
 'order_intake_bind_recipient','order_intake_notification_read','order_intake_record_confirmation','order_intake_save_document','order_intake_read_document','order_intake_document_coverage'
]);

export class DomainApi {
 constructor(auth){
  this.auth=auth;
  this.boardReadCache=new Map();
  this.boardReadGeneration=0;
  this.contextReadGeneration=0;
  this.boardListRequests=new Map();
  this.readRequests=new Map();
  this.effectiveAccessPending=new Map();
  this.contextPending=new Map();
  this.onBoardMutation=null;
  this.extendedRefsSupported=null;
 }
 invalidateBoardCache(boardId=null,{revision=null,invalidateContext=true}={}){
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
  this.readRequests.clear();
  this.effectiveAccessPending.clear();
  if(boardId===null){
   if(invalidateContext===true){
    this.contextReadGeneration++;
    this.contextPending.clear();
   }
   this.boardReadCache.clear();
  }
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
   const groupIds=new Set(entry.value.groups.map(group=>group?.id).filter(validUuid));
   const parsed=validateBoardItemPage(page,{
    boardId,columnIds,groupIds,afterCursor:cursor,existingItemIds,existingValueKeys
   });
   const items=[...entry.value.items,...parsed.items];
   const loadedCount=items.length;
   const totalCount=entry.value.pagination.total_count;
   const remainingCount=Number.isSafeInteger(totalCount)?totalCount-loadedCount:null;
   if(remainingCount!==null&&(remainingCount<0||
      (parsed.hasMore?remainingCount===0:remainingCount!==0)))
    throw new ApiError('Board pagination did not reconcile with its authoritative total. Refresh the board.',409,'BOARD_COUNT_MISMATCH');
   if(Number.isSafeInteger(totalCount))validateLoadedBoardCounts(items,{
    total_count:totalCount,active_count:entry.value.pagination.active_count,
    archived_count:entry.value.pagination.archived_count,
    groups:entry.value.pagination.group_counts
   },{complete:!parsed.hasMore});
   const pagination={...entry.value.pagination,
    page_size:BOARD_ITEM_PAGE_SIZE,has_more:parsed.hasMore,
    next_cursor:parsed.nextCursor,loaded_count:loadedCount,loaded:true};
   if(Number.isSafeInteger(totalCount))Object.assign(pagination,{
    loaded_active_count:items.filter(item=>!item.archived_at).length,
    loaded_archived_count:items.filter(item=>!!item.archived_at).length,
    remaining_count:remainingCount
   });
   const value={
    ...entry.value,items,values:[...entry.value.values,...parsed.values],pagination
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
   if(!mutates&&!knownRead&&!NON_BOARD_DOMAIN_RPC.has(name))this.invalidateBoardCache();
   const requestPath='/rest/v1/rpc/'+name;
   const requestOptions={method:'POST',body:args,...options,
    requestKind:mutates?'mutation':knownRead?'read':(options.requestKind||'unknown'),
    preflightCacheEligible:knownRead,retryableRead:knownRead};
   const token=this.auth?.accessToken,userId=this.auth?.userId;
   const shareRead=knownRead&&typeof token==='string'&&token.length>0&&!options.signal;
   const readKey=shareRead?JSON.stringify([userId,token,this.boardReadGeneration,name,
    stableRequestValue(args),options.readTimeoutMs??null,options.retryUnauthorized??true]):null;
   let request=readKey?this.readRequests.get(readKey):null;
   if(!request){
    request=this.auth.authorized(requestPath,requestOptions);
    if(readKey){
     const pending=Promise.resolve(request);
     this.readRequests.set(readKey,pending);
     const cleanup=()=>{if(this.readRequests.get(readKey)===pending)this.readRequests.delete(readKey);};
     pending.then(cleanup,cleanup);
     request=pending;
    }
   }
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
   const userId=this.auth?.userId;
   const token=this.auth?.accessToken;
   const generation=this.contextReadGeneration;
   // Production sessions carry both values. Legacy/test adapters without an
   // access token retain their existing single-call behavior and are not
   // eligible for request sharing.
   const key=validUuid(userId)&&typeof token==='string'&&token.length>0?
    JSON.stringify([userId,token,generation]):null;
   let pending=key?this.contextPending.get(key):null;
   if(!pending){
    pending=this.rpc('wm_auth_access_context');
    if(key){
     this.contextPending.set(key,pending);
     const cleanup=()=>{
      if(this.contextPending.get(key)===pending)
       this.contextPending.delete(key);
     };
     Promise.resolve(pending).then(cleanup,cleanup);
    }
   }
   const ctx=await pending;
   if(this.auth?.userId!==userId||this.contextReadGeneration!==generation)
    throw new ApiError('Signed workspace context changed during loading.',409);
   if(!ctx||ctx.profile?.status!=='active'||!validUuid(ctx.workspace_id)||
      ctx.user_id!==userId)
    throw new ApiError('Your account has no active workspace access.',403);
   // Coalesce only overlapping reads. Every later call obtains a fresh
   // server-authoritative context; each caller receives an isolated object.
   return structuredClone(ctx);
 }
 async searchWorkspaceContent(query,limit=40){
   const clean=String(query??'').trim().slice(0,160);
   if(clean.length<2)return [];
   const boundedLimit=Number.isInteger(limit)?Math.max(1,Math.min(50,limit)):40;
   const rows=await this.rpc('wm_search_workspace_content',{
    p_query:clean,p_limit:boundedLimit
   });
   if(!Array.isArray(rows)||rows.some(row=>!row||
      !validUuid(row.board_id)||!validUuid(row.item_id)||
      typeof row.board_name!=='string'||typeof row.item_title!=='string'||
      !['active','archived'].includes(row.board_status)||
      typeof row.is_archived!=='boolean'||
      typeof row.match_field!=='string'||typeof row.match_excerpt!=='string'))
    throw new ApiError('Workspace search returned an invalid result set.',409,'INVALID_WORKSPACE_SEARCH');
   return rows;
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
 async nativeApplicationBoardContext(moduleId,{retryInvalidated=true}={}){
   const userId=this.auth?.userId;
   const token=this.auth?.accessToken;
   const generation=this.contextReadGeneration;
   if(!validUuid(userId)||typeof token!=='string'||!token)
    throw new ApiError('Signed native application context is unavailable.',403);
   const sameSession=()=>this.auth?.userId===userId&&this.auth?.accessToken===token;
   // A cross-tab refresh may invalidate only the context generation while
   // these read-only requests are in flight. Re-read once in that case; never
   // reuse a response from a changed signed user or access token.
   const retryFresh=()=>this.nativeApplicationBoardContext(moduleId,{retryInvalidated:false});
   let context,payload;
   try{
    [context,payload]=await Promise.all([
     this.context(),
     this.rpc('native_application_board_context',{p_module_id:moduleId})
    ]);
   }catch(error){
    if(retryInvalidated&&sameSession()&&this.contextReadGeneration!==generation)
     return retryFresh();
    throw error;
   }
   if(!sameSession())
    throw new ApiError('Signed native application context changed during resolution.',409);
   if(this.contextReadGeneration!==generation){
    if(retryInvalidated)return retryFresh();
    throw new ApiError('Signed native application context changed during resolution.',409);
   }
   if(context?.user_id!==userId||context?.profile?.status!=='active')
    throw new ApiError('Signed native application context changed during resolution.',409);
   let resolved;
   try{
    resolved=normalizeNativeApplicationBoardContext(payload,{
     moduleId,userId,workspaceId:context.workspace_id
    });
   }catch{
    throw new ApiError('The native application returned an invalid canonical workspace context.',409,
     'INVALID_NATIVE_APPLICATION_CONTEXT');
   }
   return resolved;
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
    const groupIds=new Set(shell.groups.map(group=>group?.id).filter(validUuid));
    const items=[],values=[],itemIds=new Set(),valueKeys=new Set();
    let page=firstPage,cursor=null,parsed={hasMore:false,nextCursor:null,counts:null},pageCounts=null;
    if(includeItems){
     while(true){
      parsed=validateBoardItemPage(page,{
       boardId,columnIds,groupIds,afterCursor:cursor,
       existingItemIds:itemIds,existingValueKeys:valueKeys
      });
      if(cursor===null&&parsed.counts)pageCounts=parsed.counts;
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
    if(pageCounts){
     const remaining=pageCounts.total_count-items.length;
     if(remaining<0||(complete&&remaining!==0)||
        (!complete&&(parsed.hasMore?remaining===0:remaining!==0)))
      throw new ApiError('Board hydration did not reconcile with its authoritative total. Refresh the board.',409,'BOARD_COUNT_MISMATCH');
     validateLoadedBoardCounts(items,pageCounts,{complete:!parsed.hasMore});
    }
    const groupCounts=new Map((pageCounts?.groups||[]).map(group=>[group.group_id,group]));
    const groups=pageCounts?shell.groups.map(group=>{
     const counts=groupCounts.get(group.id)||{total_count:0,active_count:0,archived_count:0};
     return {...group,item_count:counts.active_count,active_item_count:counts.active_count,
      archived_item_count:counts.archived_count,total_item_count:counts.total_count};
    }):shell.groups;
    const board=pageCounts?{...shell.board,item_count:pageCounts.active_count,
     archived_item_count:pageCounts.archived_count,total_item_count:pageCounts.total_count}:shell.board;
    const pagination={page_size:BOARD_ITEM_PAGE_SIZE,has_more:parsed.hasMore,
     next_cursor:parsed.nextCursor,loaded_count:items.length,loaded:includeItems===true};
    if(pageCounts)Object.assign(pagination,{
     loaded_active_count:items.filter(item=>!item.archived_at).length,
     loaded_archived_count:items.filter(item=>!!item.archived_at).length,
     total_count:pageCounts.total_count,active_count:pageCounts.active_count,
     archived_count:pageCounts.archived_count,group_counts:pageCounts.groups,
     remaining_count:Math.max(0,pageCounts.total_count-items.length)
    });
    const detail={...shell,board,groups,items,values,pagination};
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
   const id=requireUuid(boardId),workspace=requireUuid(workspaceId);
   const response=await this.auth.authorized('/functions/v1/apsyntra-native-issues',{
     method:'POST',body:{boardId:id,workspaceId:workspace,txes}
   });
   if(!response||response.applied!==txes.length||!Array.isArray(response.receipts)
      ||response.receipts.length!==txes.length
      ||response.receipts.some(r=>r.boardId!==id||r.workspaceId!==workspace||!Number.isSafeInteger(r.revision)||r.revision<1))
     throw new ApiError('Native transaction receipt verification failed.');
   // Publish only after every server receipt confirms the signed transaction.
   this.invalidateBoardCache(id);
   try{this.onBoardMutation?.({boardId:id,revision:null});}catch{}
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
