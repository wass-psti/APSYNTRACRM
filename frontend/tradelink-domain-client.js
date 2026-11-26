/** CP-TL-03A — staged central TradeLink DocumentRecord API.
 * Existing Supabase project/board only. No browser cache, standalone auth,
 * local draft fallback, unsanctioned domain writes or implicit activation.
 */
import {ApiError,} from './session.js';
import {TRADELINK_MAX_ITEMS,TRADELINK_MAX_PAYLOAD_BYTES,tradeLinkJsonbTextByteLength} from './tradelink/limits.js';
import {validUuid} from './data.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {normalizeTradeLinkAnalyticsSummary} from './tradelink-analytics.js';
import {STANDARD_APPROVAL_POLICY,GM_SALES_EXEMPT_POLICY,tradeLinkReviewEvidenceComplete} from './tradelink/approval-policy.js';
// Stage A read RPCs enforce signed-session, board and General Manager checks.
export const TL03_DOMAIN_READS_ENABLED=true;
// Stage B authenticated EXECUTE grants are live; server enforces session and workspace permissions.
export const TL03_DOMAIN_WRITES_ENABLED=true;
// CP-TL-LEGACY-WORKFLOW-04: the existing production aggregate RPC is installed
// and verified. Activate only its signed, read-only analytics UI path.
export const TL03_ANALYTICS_ENABLED=true;
// CP-TL-FINAL-09 SOURCE-ONLY CANDIDATE: not authorized for production merge.
// Activates the already installed atomic signed create/numbering RPC upon merge.
export const TL03_AUTOMATIC_NUMBERING_ENABLED=true;
// CP-TL-FINAL-04: production migration 20261117060100 is installed and
// verified. Enable only the signed Submit Draft RPC; retain the separate
// For Approval / dual-review path and other legacy workflow gates unchanged.
export const TL03_WORKFLOW_SUBMIT_ENABLED=true;
// Requires the separately approved review/revision RPC, signed event history,
// and guarded revision-required Draft update. Never enable from frontend alone.
export const TL03_WORKFLOW_REVIEW_ENABLED=false;
// Exact-scope signed final approval/rejection requires a distinct approved
// production database candidate and authenticated actor verification.
export const TL03_WORKFLOW_DECISION_ENABLED=false;
// Operational recording, completion and reopening are a separate signed
// migration dependency. Never activate merely from deployed UI source.
export const TL03_WORKFLOW_OPERATIONAL_ENABLED=false;
// Independent signed electronic-PDF stage events require the separately
// authorized backend candidate and real two-account negative acceptance.
export const TL03_PDF_STAGE_ENABLED=false;
// CP-TL-08 installs independent, assigned-user review timestamps and automatic approval.
export const TL03_DUAL_REVIEW_ENABLED=true;
const TYPES=new Set(['esi','packing','delivery','payment','quotation','po']);
const STATES=new Set(['draft','for-approval','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled','under-negotiation','expired',
 'on-hold','won','lost','delivered','closed']);
const OPS=new Set(['create','update','revise-approved','archive','restore']);
const deny=(message,status=403)=>{throw new ApiError(message,status);};
const knownApprovalPolicy=policy=>policy===undefined||
 policy===STANDARD_APPROVAL_POLICY||policy===GM_SALES_EXEMPT_POLICY;
const approvalEvidenceComplete=(policy,primaryAt,secondaryAt)=>
 knownApprovalPolicy(policy)&&tradeLinkReviewEvidenceComplete(policy,primaryAt,secondaryAt);

export function validateTradeLinkDraftEnvelope(value,{allowUnassignedNumber=false}={}){
 const unassigned=allowUnassignedNumber===true&&value?.documentNumber==='';
 if(!value||typeof value!=='object'||Array.isArray(value)||
   !TYPES.has(value.documentType)||typeof value.documentNumber!=='string'||
   (!unassigned&&(!/^[A-Za-z0-9][A-Za-z0-9._ /-]{0,119}$/.test(value.documentNumber)||
   value.documentNumber!==value.documentNumber.trim())))
  deny('Invalid TradeLink draft type or document number.',400);
 for(const blocked of ['id','workflow','status','revision','revisionNo','history',
  'createdBy','updatedBy','approvedAt','verifiedAt','attachments','createdById',
  'updatedById','board_id','workspace_id','role','accessControl']){
  if(Object.hasOwn(value,blocked))deny('Server-controlled TradeLink draft property.',400);
 }
 if(value.items!=null&&(!Array.isArray(value.items)||value.items.length>TRADELINK_MAX_ITEMS))
  deny('TradeLink draft exceeds the 250-item capacity.',400);
 if(Array.isArray(value.items)){
  const lineIds=new Set();
  for(const item of value.items){
   const id=item?.id;
   if(typeof id==='string'&&id){
    if(lineIds.has(id))deny('Duplicate TradeLink line-item identifier.',400);
    lineIds.add(id);
   }
  }
 }
 let normalized;
 try{
  const serialized=JSON.stringify(value);
  if(!serialized)deny('Invalid TradeLink draft payload.',400);
  normalized=JSON.parse(serialized);
 }catch(error){
  if(error instanceof ApiError)throw error;
  deny('Invalid TradeLink draft payload.',400);
 }
 if(tradeLinkJsonbTextByteLength(normalized)>TRADELINK_MAX_PAYLOAD_BYTES)
  deny('TradeLink draft exceeds the 2 MiB capacity.',400);
 return value;
}
export function normalizeTradeLinkDomainReceipt(
 value,expectedId,operation,expectedRevision=null,expectedState='draft'
){
 if(!validUuid(expectedId)||!OPS.has(operation)||!value||typeof value!=='object'||
  value.documentId!==expectedId||!validUuid(value.boardItemId)||
  !Number.isSafeInteger(value.revision)||value.revision<1||
  (!['draft','for-approval','revision-required'].includes(expectedState))||
  value.state!==expectedState||value.operation!==operation||
  typeof value.idempotent!=='boolean'||
  (operation==='create'&&(typeof value.documentNumber!=='string'||
   !/^(ESI-|PL-|DR-|AR-|Q-|PO-)[0-9]{6,}$/.test(value.documentNumber)))||
  (expectedRevision!==null&&(
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
   (value.idempotent?!(
     operation==='create'&&expectedRevision===0&&value.revision===1||
     operation==='update'&&expectedRevision>=1&&
      Number.isSafeInteger(expectedRevision+1)&&
      (value.revision===expectedRevision||value.revision===expectedRevision+1)
    ):value.revision!==expectedRevision+1))))
  deny('TradeLink authoritative commit receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkDomainRow(row,workspaceId,documentId){
 if(!row||!validUuid(documentId)||row.id!==documentId||
  row.board_id!==TRADELINK_BOARD_ID||row.workspace_id!==workspaceId||
  !validUuid(row.board_item_id)||!TYPES.has(row.document_type)||
  !STATES.has(row.workflow_state)||!Number.isSafeInteger(row.revision)||
  row.revision<1||!row.content||typeof row.content!=='object'||
  Array.isArray(row.content)||
  (row.created_by!==undefined&&!validUuid(row.created_by))||
  (row.created_by_name!==undefined&&row.created_by_name!==null&&
   typeof row.created_by_name!=='string'))
  deny('Invalid authorized TradeLink document response.',409);
 return row;
}

export function normalizeTradeLinkRevisionBundle(value,workspaceId,documentId,requestedRevision=null){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  value.documentId!==documentId||!validUuid(value.boardItemId)||
  !Number.isSafeInteger(value.currentRevision)||value.currentRevision<1||
  !Array.isArray(value.revisions)||value.revisions.length<1||value.revisions.length>500)
  deny('Invalid signed TradeLink revision history response.',409);
 const revisions=value.revisions.map((row,index)=>{
  if(!Number.isSafeInteger(row?.revision)||row.revision<1||
   (index>0&&row.revision>=value.revisions[index-1].revision)||
   !STATES.has(row.workflowState)||typeof row.approved!=='boolean'||
   !['baseline','captured'].includes(row.snapshotSource)||
   typeof row.current!=='boolean'||
   typeof row.revisionAt!=='string'||!Number.isFinite(Date.parse(row.revisionAt))||
   typeof row.capturedAt!=='string'||!Number.isFinite(Date.parse(row.capturedAt))||
   (row.primaryAt!=null&&(typeof row.primaryAt!=='string'||!Number.isFinite(Date.parse(row.primaryAt))))||
   (row.secondaryAt!=null&&(typeof row.secondaryAt!=='string'||!Number.isFinite(Date.parse(row.secondaryAt))))||
   !knownApprovalPolicy(row.approvalPolicy)||
   (row.approved&&!approvalEvidenceComplete(row.approvalPolicy,row.primaryAt,row.secondaryAt)))
   deny('Invalid TradeLink revision metadata.',409);
  return Object.freeze({...row});
 });
 if(!revisions.some(row=>row.revision===value.currentRevision&&row.current)||
  revisions.filter(row=>row.current).length!==1||
  revisions.some(row=>row.current!==(row.revision===value.currentRevision)))
  deny('TradeLink revision history does not match the current document.',409);
 let selected=null;
 if(value.selected!==null){
  selected=normalizeTradeLinkDomainRow(value.selected,workspaceId,documentId);
  const expectedRevision=requestedRevision??value.currentRevision;
  if(selected.revision!==expectedRevision||selected.board_item_id!==value.boardItemId||
   !['baseline','captured'].includes(selected.snapshot_source)||
   typeof selected.approved!=='boolean'||
   typeof selected.revision_at!=='string'||!Number.isFinite(Date.parse(selected.revision_at))||
   (selected.primary_reviewed_at!=null&&
    (typeof selected.primary_reviewed_at!=='string'||!Number.isFinite(Date.parse(selected.primary_reviewed_at))))||
   (selected.secondary_reviewed_at!=null&&
    (typeof selected.secondary_reviewed_at!=='string'||!Number.isFinite(Date.parse(selected.secondary_reviewed_at))))||
   !knownApprovalPolicy(selected.approval_policy)||
   (selected.approval_policy===GM_SALES_EXEMPT_POLICY&&!['quotation','po'].includes(selected.document_type))||
   (selected.approved&&!approvalEvidenceComplete(selected.approval_policy,selected.primary_reviewed_at,selected.secondary_reviewed_at))||
   !revisions.some(row=>row.revision===selected.revision&&
    row.approved===selected.approved&&row.snapshotSource===selected.snapshot_source&&
    (row.approvalPolicy??STANDARD_APPROVAL_POLICY)===(selected.approval_policy??STANDARD_APPROVAL_POLICY)))
   deny('Selected TradeLink revision does not match its immutable history.',409);
 }
 return Object.freeze({documentId,boardItemId:value.boardItemId,
  currentRevision:value.currentRevision,revisions:Object.freeze(revisions),selected});
}
/** A TradeLink Board projection is current when its matching item exists and
 * is not older than the authoritative document. Initial creation timestamps
 * are generated by separate database writes, so exact equality is not valid.
 */
export function tradeLinkBoardProjectionMatches(boardItem,{
 boardItemId,documentNumber,updatedAt
}={}){
 const documentTimestamp=Date.parse(updatedAt);
 const projectionTimestamp=Date.parse(boardItem?.updated_at);
 return !!boardItem&&validUuid(boardItemId)&&
  boardItem.id===boardItemId&&typeof documentNumber==='string'&&
  boardItem.title===documentNumber&&boardItem.archived_at==null&&
  Number.isFinite(documentTimestamp)&&Number.isFinite(projectionTimestamp)&&
  projectionTimestamp>=documentTimestamp;
}
/** Check the *entire* submitted payload after an authoritative signed read.
 * PostgreSQL jsonb can reorder object keys, so raw JSON.stringify equality
 * would incorrectly reject valid saves. Array order and every field/value
 * are still checked exactly. Never log financial/customer contents.
 */
function sameTradeLinkJsonValue(left,right){
 // The server returns JSON values. An iterative comparison supports nested
 // document fields without rejecting valid payloads at an arbitrary depth.
 const pending=[[left,right]];
 let compared=0;
 while(pending.length){
  // Refuse unexpectedly complex or cyclic non-JSON objects, rather than hang.
  if(++compared>131072)return false;
  const [a,b]=pending.pop();
  if(a===b)continue;
  if(Array.isArray(a)||Array.isArray(b)){
   if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
   for(let index=0;index<a.length;index++)pending.push([a[index],b[index]]);
   continue;
  }
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const aKeys=Object.keys(a),bKeys=Object.keys(b);
  if(aKeys.length!==bKeys.length)return false;
  for(const key of aKeys){
   if(!Object.hasOwn(b,key))return false;
   pending.push([a[key],b[key]]);
  }
 }
 return true;
}
export function tradeLinkSavedDraftMatches(record,submitted){
 return !!record&&!!record.content&&
  record.document_type===submitted?.documentType&&
  record.document_number===submitted?.documentNumber&&
  sameTradeLinkJsonValue(record.content,submitted);
}
export function normalizeTradeLinkSubmitReceipt(value,documentId,documentType,expectedRevision,fromState='draft'){
 const target=documentType==='packing'?'completed':'submitted';
 if(!validUuid(documentId)||!TYPES.has(documentType)||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
  !value||typeof value!=='object'||Array.isArray(value)||
  value.documentId!==documentId||!validUuid(value.boardItemId)||
  value.revision!==expectedRevision+1||value.state!==target||
  value.operation!=='submit'||
  !['draft','revision-required'].includes(fromState)||value.from!==fromState)
  deny('TradeLink signed submission receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkReviewReceipt(
 value,documentId,expectedRevision,action,fromState
){
 const target=action==='review'?'under-review':'revision-required';
 if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['review','request-revision'].includes(action)||
    !['submitted','under-review'].includes(fromState)||
    (action==='review'&&fromState!=='submitted')||
    !value||typeof value!=='object'||Array.isArray(value)||
    value.documentId!==documentId||!validUuid(value.boardItemId)||
    value.revision!==expectedRevision+1||value.operation!==action||
    value.state!==target||value.from!==fromState)
  deny('TradeLink signed review receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkDecisionReceipt(
 value,documentId,expectedRevision,action,fromState
){
 const target=action==='approve'?'approved':'rejected';
 if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['approve','reject'].includes(action)||
    !['submitted','under-review'].includes(fromState)||
    !value||typeof value!=='object'||Array.isArray(value)||
    value.documentId!==documentId||!validUuid(value.boardItemId)||
    value.revision!==expectedRevision+1||value.operation!==action||
    value.state!==target||value.from!==fromState)
  deny('TradeLink signed approval/rejection receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkOperationalReceipt(
 value,documentId,expectedRevision,documentType,action,fromState
){
 const operations=['record-checked','record-delivered','record-received','complete','reopen'];
 const field=action==='record-checked'?'checkedAt':
  action==='record-delivered'?'deliveredAt':
  action==='record-received'?'receivedAt':null;
 const toState=field?fromState:action==='complete'?'completed':'draft';
 const validState=['submitted','under-review'].includes(fromState);
 const valid=(action==='record-checked'||action==='record-delivered')?
  documentType==='delivery'&&validState:
  action==='record-received'?documentType==='payment'&&validState:
  action==='complete'?(documentType==='packing'?false:
   ['esi','quotation','po'].includes(documentType)?fromState==='approved':validState):
  action==='reopen'?['approved','rejected','completed','cancelled'].includes(fromState):false;
 if(!validUuid(documentId)||!TYPES.has(documentType)||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
  !operations.includes(action)||!valid||
  !value||typeof value!=='object'||Array.isArray(value)||
  value.documentId!==documentId||!validUuid(value.boardItemId)||
  value.revision!==expectedRevision+1||value.state!==toState||
  value.operation!==action||value.from!==fromState||
  value.field!==field||typeof value.recordedAt!=='string'||
  !Number.isFinite(Date.parse(value.recordedAt)))
  deny('TradeLink signed operational receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkSignedHistory(rows,limit=25){
 const operations=new Set(['created','updated','archived','restored',
  'submitted','completed','reviewed','revision-requested',
  'approved','rejected','operational-record','reopened',
  'attachment-added','attachment-removed']);
 if(!Array.isArray(rows)||rows.length>limit||
  rows.some((r,i)=>!Number.isSafeInteger(r?.revision)||r.revision<1||
   (i>0&&r.revision>=rows[i-1].revision)||
   !operations.has(r.operation)||!validUuid(r.actorId)||
   typeof r.at!=='string'||!Number.isFinite(Date.parse(r.at))||
   !r.metadata||typeof r.metadata!=='object'||Array.isArray(r.metadata)||
   (r.metadata.reason!=null&&
    (typeof r.metadata.reason!=='string'||r.metadata.reason.length>1500))||
   (r.metadata.from!=null&&!STATES.has(r.metadata.from))||
   (r.metadata.to!=null&&!STATES.has(r.metadata.to))))
  deny('Invalid signed TradeLink workflow history.',409);
 return rows;
}
export class TradeLinkDomainClient{
 constructor({api,auth,automaticNumberingEnabled=TL03_AUTOMATIC_NUMBERING_ENABLED}={}){
  this.api=api;this.auth=auth;
  this.automaticNumberingEnabled=automaticNumberingEnabled===true;
 }
 async session({verifyBoard=true,allowCreateUser=false}={}){
  if(!this.api?.context||
    (verifyBoard&&!this.api?.board&&!this.api?.boardCached&&!this.api?.nativeApplicationBoardContext)||
    !this.api?.allowed||!this.api?.rpc||!this.auth?.getVerifiedUser)
   deny('Signed TradeLink domain API unavailable.');
  // Resolve the signed actor, workspace and manager decision concurrently.
  // Document operations need only the board shell, not its item pages; reuse
  // the existing signed board cache's bounded invalidation retry when present.
  // Analytics delegates board/workspace validation to its authoritative RPC.
  // No document operation runs until every identity, workspace and permission
  // check below succeeds; the mutation RPC remains authoritative as before.
  const [actor,context,canManage]=await Promise.all([
   this.auth.getVerifiedUser(),this.api.context(),
   this.api.allowed(TRADELINK_BOARD_ID,'manage')
  ]);
  if(!validUuid(actor?.id)||actor.id!==this.auth.userId||
    context?.user_id!==actor.id||context?.profile?.status!=='active'||
    !validUuid(context.workspace_id))
   deny('TradeLink signed identity or workspace changed.');
  let canCreateUser=false,native=null;
  if(canManage!==true&&allowCreateUser){
   if(typeof this.api.nativeApplicationBoardContext!=='function')
    deny('TradeLink Board manager scope required; signed User Create New context is unavailable.');
   native=await this.api.nativeApplicationBoardContext('tradelink');
   canCreateUser=native?.moduleId==='tradelink'&&native?.role==='User'&&
    native?.userId===actor.id&&native?.workspaceId===context.workspace_id&&
    isTradeLinkBoard(native?.board)&&native.board.workspace_id===context.workspace_id;
  }
  if(verifyBoard){
   const detail=canManage===true?
    (typeof this.api.boardCached==='function'?
     await this.api.boardCached(TRADELINK_BOARD_ID,{
      userId:actor.id,workspaceId:context.workspace_id,includeItems:false
     }):await this.api.board(TRADELINK_BOARD_ID)):
    canCreateUser?{board:native.board}:null;
   if(!isTradeLinkBoard(detail?.board)||
      detail.board.workspace_id!==context.workspace_id||
      (canManage!==true&&!canCreateUser))
    deny('TradeLink Board manager scope required; signed User Create New capability is unavailable.');
  }else if(canManage!==true){
   // The read-only analytics RPC independently verifies its board and
   // workspace context. Retain the signed manager preflight without loading
   // an unrelated full board snapshot before that authoritative read.
   deny('TradeLink board manager scope required.');
  }
  // The server still decides every read/write. This client capability only
  // routes an existing TradeLink User through the signed native context; it
  // never turns the account into a generic Board editor or manager.
  return {actorId:actor.id,workspaceId:context.workspace_id,
   canManage:canManage===true,canCreate:canManage===true||canCreateUser};
 }
 async reviewerSession(){
  if(!this.api?.context||!this.api?.nativeApplicationBoardContext||!this.api?.rpc||
    !this.auth?.getVerifiedUser)deny('Signed TradeLink reviewer API unavailable.');
  const [actor,context,native]=await Promise.all([
   this.auth.getVerifiedUser(),this.api.context(),
   this.api.nativeApplicationBoardContext('tradelink')
  ]);
  if(!validUuid(actor?.id)||actor.id!==this.auth.userId||
    context?.user_id!==actor.id||context?.profile?.status!=='active'||
    !validUuid(context.workspace_id))
   deny('TradeLink reviewer identity or workspace changed.');
  if(native?.userId!==actor.id||native?.workspaceId!==context.workspace_id||
    !isTradeLinkBoard(native?.board))
   deny('TradeLink native application assignment or workspace is unavailable.');
  return {actorId:actor.id,workspaceId:context.workspace_id};
 }
 async documentReadSession(){
  try{return await this.session({allowCreateUser:true});}
  catch(error){
   if(error?.status!==403)throw error;
   return this.reviewerSession();
  }
 }
 async boardProjection(documentId){
  if(!validUuid(documentId))deny('Invalid TradeLink document ID.',400);
  const {workspaceId}=await this.reviewerSession();
  const result=await this.api.rpc('tl03_board_projection',{
   p_document_id:documentId
  });
  const board=result?.board,item=result?.item;
  if(result?.contract!=='tradelink-board-projection-v1'||
    !isTradeLinkBoard(board)||board.workspace_id!==workspaceId||
    !validUuid(item?.id)||typeof item?.title!=='string'||
    item.archived_at!==null||typeof item.updated_at!=='string'||
    !Number.isFinite(Date.parse(item.updated_at)))
   deny('Invalid or unavailable signed TradeLink document projection.',409);
  return {board,items:[item]};
 }
 async analyticsSummary({from=null,to=null}={}){
  if(!TL03_ANALYTICS_ENABLED)
   deny('TradeLink analytics aggregate is awaiting database activation.',503);
  const validBound=value=>value===null||typeof value==='string'&&
   /^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
  if(!validBound(from)||!validBound(to)||(from&&to&&Date.parse(to)<=Date.parse(from)))
   deny('Invalid TradeLink analytics reporting period.',400);
  const signedActorId=this.auth?.userId;
  try{
   await this.session({verifyBoard:false});
  }catch(error){
   // A concurrent authoritative workspace refresh can invalidate an
   // overlapping context read. Retry that exact transient 409 once for the
   // same signed user; identity changes and unrelated failures remain unchanged.
   if(error?.status!==409||
      error?.message!=='Signed workspace context changed during loading.'||
      this.auth?.userId!==signedActorId)throw error;
   await this.session({verifyBoard:false});
  }
  const result=await this.api.rpc('tl03_analytics_summary',{
   p_board_id:TRADELINK_BOARD_ID,p_from:from,p_to:to});
  try{return normalizeTradeLinkAnalyticsSummary(result);}
  catch{deny('Invalid signed TradeLink analytics response.',409);}
 }
 async list(limit=50){
  if(!TL03_DOMAIN_READS_ENABLED)deny('TradeLink domain reads await production activation.',503);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)
   deny('TradeLink list limit must be 1–100.',400);
  await this.documentReadSession();
  const rows=await this.api.rpc('tl03_documents_list',{
   p_board_id:TRADELINK_BOARD_ID,p_limit:limit});
  if(!Array.isArray(rows)||rows.length>limit||rows.some(r=>!validUuid(r?.documentId)||
      !validUuid(r?.boardItemId)||!TYPES.has(r?.documentType)||
      !STATES.has(r?.workflowState)||!Number.isSafeInteger(r?.revision)||r.revision<1||
      typeof r?.createdByActor!=='boolean'||
      typeof r?.documentNumber!=='string'||
      (r?.hidden!==undefined&&typeof r.hidden!=='boolean')||
      (r?.clientName!==null&&r?.clientName!==undefined&&typeof r.clientName!=='string')||
      typeof r?.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||
      typeof r?.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt))))
   deny('Invalid TradeLink document list response.',409);
  return rows.map(row=>({...row,hidden:row.hidden===true}));
 }
 async searchPage({query='',documentType='all',workflowState='all',
  archiveMode='active',visibilityMode='visible',cursor=null,limit=50}={}){
  if(!TL03_DOMAIN_READS_ENABLED)
   deny('TradeLink domain reads await production activation.',503);
  if(typeof query!=='string'||query.length>120||
    !TYPES.has(documentType)&&documentType!=='all'||
    !STATES.has(workflowState)&&workflowState!=='all'||
    !['all','active','archived'].includes(archiveMode)||
    !['all','visible','hidden'].includes(visibilityMode)||
    !Number.isSafeInteger(limit)||limit<1||limit>50||
    (cursor!==null&&(!cursor||typeof cursor.createdAt!=='string'||
      !Number.isFinite(Date.parse(cursor.createdAt))||
      !validUuid(cursor.documentId))))
   deny('Invalid TradeLink server search request.',400);
  await this.documentReadSession();
  const response=await this.api.rpc('tl03_documents_page',{
   p_board_id:TRADELINK_BOARD_ID,p_search:query,
   p_document_type:documentType,p_workflow_state:workflowState,
   p_archive_mode:archiveMode,p_visibility_mode:visibilityMode,
   p_before_at:cursor?.createdAt??null,
   p_before_id:cursor?.documentId??null,p_limit:limit
  });
  if(!response||typeof response!=='object'||Array.isArray(response)||
    !Array.isArray(response.rows)||response.rows.length>limit||
    typeof response.hasMore!=='boolean'||
    (response.hasMore!==Boolean(response.nextCursor))||
    (response.nextCursor!==null&&
      (!validUuid(response.nextCursor?.documentId)||
       typeof response.nextCursor?.createdAt!=='string'||
       !Number.isFinite(Date.parse(response.nextCursor.createdAt))))||
    response.rows.some(r=>!validUuid(r?.documentId)||!validUuid(r?.boardItemId)||
      !TYPES.has(r?.documentType)||!STATES.has(r?.workflowState)||
      typeof r?.documentNumber!=='string'||typeof r?.archived!=='boolean'||
      (r?.hidden!==undefined&&typeof r.hidden!=='boolean')||
      typeof r?.createdByActor!=='boolean'||
      (r?.createdBy!==undefined&&!validUuid(r.createdBy))||
      (r?.createdByName!==undefined&&r.createdByName!==null&&typeof r.createdByName!=='string')||
      (r?.clientName!==null&&r?.clientName!==undefined&&typeof r.clientName!=='string')||
      !['primary','secondary',null,undefined].includes(r?.assignedStage)||
      !knownApprovalPolicy(r?.approvalPolicy)||
      (r?.primaryAt!=null&&(typeof r.primaryAt!=='string'||!Number.isFinite(Date.parse(r.primaryAt))))||
      (r?.secondaryAt!=null&&(typeof r.secondaryAt!=='string'||!Number.isFinite(Date.parse(r.secondaryAt))))||
      !Number.isSafeInteger(r?.revision)||r.revision<1||
      typeof r?.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||
      typeof r?.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))||
    (response.hasMore&&(!response.rows.length||
      response.nextCursor.documentId!==response.rows.at(-1).documentId||
      Date.parse(response.nextCursor.createdAt)!==
        Date.parse(response.rows.at(-1).createdAt))))
    deny('Invalid authorized TradeLink server page response.',409);
  return {...response,rows:response.rows.map(row=>({...row,hidden:row.hidden===true}))};
 }
 async bulkAction({action,documents}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)
   deny('TradeLink document bulk actions are not activated.',503);
  if(!['hide','unhide','delete'].includes(action)||!Array.isArray(documents)||
    documents.length<1||documents.length>50)
   deny('Select between 1 and 50 TradeLink documents.',400);
  const ids=new Set();
  for(const row of documents){
   if(!row||typeof row!=='object'||!validUuid(row.documentId)||
    !Number.isSafeInteger(row.revision)||row.revision<1||ids.has(row.documentId))
    deny('Invalid or duplicate selected TradeLink document.',400);
   ids.add(row.documentId);
  }
  const session=await this.session();
  if(!session.canManage)deny('TradeLink manager capability is required for bulk actions.',403);
  const result=await this.api.rpc('tl03_documents_bulk_action',{
   p_board_id:TRADELINK_BOARD_ID,p_action:action,
   p_rows:documents.map(row=>({id:row.documentId,revision:row.revision}))
  });
  const expectedHidden=action==='hide';
  const expectedDeleted=action==='delete';
  if(!result||typeof result!=='object'||Array.isArray(result)||
   result.boardId!==TRADELINK_BOARD_ID||result.action!==action||
   result.applied!==documents.length||!Array.isArray(result.documents)||
   result.documents.length!==documents.length)
   deny('TradeLink bulk-action receipt mismatch.',409);
  const receipts=new Map(result.documents.map(row=>[row?.documentId,row]));
  if(receipts.size!==documents.length||documents.some(row=>{
   const receipt=receipts.get(row.documentId);
   return !receipt||receipt.revision!==row.revision||
    receipt.hidden!==expectedHidden||receipt.deleted!==expectedDeleted;
  }))deny('TradeLink bulk-action receipt does not match the selected documents.',409);
  return {...result,actorId:session.actorId,workspaceId:session.workspaceId};
 }
 async assignedDocuments(limit=50){
  if(!TL03_DUAL_REVIEW_ENABLED)deny('Assigned TradeLink review is not activated.',503);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)
   deny('Assigned TradeLink document limit must be 1–100.',400);
  const session=await this.reviewerSession();
  const rows=await this.api.rpc('tl03_assigned_documents',{
   p_board_id:TRADELINK_BOARD_ID,p_limit:limit});
  if(!Array.isArray(rows)||rows.length>limit||rows.some(row=>
    !validUuid(row?.documentId)||!validUuid(row?.boardItemId)||
    !TYPES.has(row?.documentType)||!STATES.has(row?.workflowState)||
    typeof row?.documentNumber!=='string'||!Number.isSafeInteger(row?.revision)||
    row.revision<1||typeof row?.primaryEmail!=='string'||
    typeof row?.secondaryEmail!=='string'||
    !['primary','secondary'].includes(row?.assignedStage)||
    !knownApprovalPolicy(row?.approvalPolicy)||
    (row.clientName!==null&&row.clientName!==undefined&&typeof row.clientName!=='string')||
    typeof row?.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
    typeof row?.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt))||
    (row.primaryAt!==null&&row.primaryAt!==undefined&&
     (typeof row.primaryAt!=='string'||!Number.isFinite(Date.parse(row.primaryAt))))||
    (row.secondaryAt!==null&&row.secondaryAt!==undefined&&
     (typeof row.secondaryAt!=='string'||!Number.isFinite(Date.parse(row.secondaryAt))))))
   deny('Invalid signed TradeLink assigned-document response.',409);
  return rows.map(row=>({...row,archived:row.archived===true,
   actorId:session.actorId,workspaceId:session.workspaceId}));
 }
 async readAssigned(documentId){
  if(!TL03_DUAL_REVIEW_ENABLED)deny('Assigned TradeLink document reads are not activated.',503);
  if(!validUuid(documentId))deny('Invalid assigned TradeLink document ID.',400);
  const {workspaceId}=await this.reviewerSession();
  const row=await this.api.rpc('tl03_document_read_assigned',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  return row===null?null:normalizeTradeLinkDomainRow(row,workspaceId,documentId);
 }
 async reviewStages({documentId}={}){
  if(!TL03_DUAL_REVIEW_ENABLED)deny('TradeLink review timestamps are not activated.',503);
  if(!validUuid(documentId))deny('Invalid TradeLink review document ID.',400);
  await this.reviewerSession();
  const result=await this.api.rpc('tl03_document_review_stages',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  const validStage=value=>value===null||value&&validUuid(value.actorId)&&
   typeof value.assignedEmail==='string'&&typeof value.recordedAt==='string'&&
   Number.isFinite(Date.parse(value.recordedAt));
  if(!result||result.documentId!==documentId||
   !Number.isSafeInteger(result.revision)||result.revision<1||
   !STATES.has(result.state)||!validStage(result.primary)||
   !validStage(result.secondary)||!knownApprovalPolicy(result.approvalPolicy)||
   (result.approvalPolicy===GM_SALES_EXEMPT_POLICY&&result.primary!==null))
   deny('Invalid signed TradeLink review-stage response.',409);
  return result;
 }
 async chequeClearance({documentId,expectedRevision,record=false}={}){
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   deny('Invalid TradeLink cheque clearance request.',400);
  await this.session({verifyBoard:false});
  const result=await this.api.rpc(record?'tl03_record_cheque_clearance':'tl03_cheque_clearance_status',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,p_expected_revision:expectedRevision});
  if(!result||result.documentId!==documentId||result.revision!==expectedRevision||
   !(result.clearedAt===null||typeof result.clearedAt==='string'&&Number.isFinite(Date.parse(result.clearedAt)))||
   (record&&(result.clearedAt===null||typeof result.idempotent!=='boolean')))
   deny('Invalid signed cheque clearance response.',409);
  return result;
 }
 async updateStatus({documentId,expectedRevision,targetState}={}){
  const allowed=new Set(['submitted','under-negotiation','expired','on-hold',
   'won','lost','cancelled','delivered','closed']);
  if(!TL03_DOMAIN_WRITES_ENABLED||!validUuid(documentId)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
    !allowed.has(targetState))
   deny('Invalid TradeLink status update.',400);
  const session=await this.session();
  const result=await this.api.rpc('tl03_document_status_update',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_target_state:targetState});
  if(!result||result.documentId!==documentId||!validUuid(result.boardItemId)||
    result.revision!==expectedRevision||result.state!==targetState||
    typeof result.updatedAt!=='string'||!Number.isFinite(Date.parse(result.updatedAt))||
    typeof result.idempotent!=='boolean')
   deny('Signed TradeLink status receipt mismatch.',409);
  return {...result,actorId:session.actorId,workspaceId:session.workspaceId};
 }
 async recordReviewStage({documentId,expectedRevision,stage}={}){
  if(!TL03_DUAL_REVIEW_ENABLED)deny('Assigned TradeLink review is not activated.',503);
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['primary','secondary'].includes(stage))
   deny('Invalid TradeLink review-stage request.',400);
  const session=await this.reviewerSession();
  const result=await this.api.rpc('tl03_record_review_stage',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_stage:stage});
  if(!result||result.documentId!==documentId||
   !validUuid(result.boardItemId)||result.revision!==expectedRevision||
   result.stage!==stage||!['for-approval','approved'].includes(result.state)||
   typeof result.recordedAt!=='string'||!Number.isFinite(Date.parse(result.recordedAt))||
   (result.primaryAt!==null&&result.primaryAt!==undefined&&
    (typeof result.primaryAt!=='string'||!Number.isFinite(Date.parse(result.primaryAt))))||
   (result.secondaryAt!==null&&result.secondaryAt!==undefined&&
    (typeof result.secondaryAt!=='string'||!Number.isFinite(Date.parse(result.secondaryAt))))||
   (stage==='primary'&&result.primaryAt!==result.recordedAt)||
   (stage==='secondary'&&result.secondaryAt!==result.recordedAt)||
   !knownApprovalPolicy(result.approvalPolicy)||
   (result.approvalPolicy===GM_SALES_EXEMPT_POLICY&&(stage!=='secondary'||result.primaryAt!=null))||
   (result.state==='approved'&&!approvalEvidenceComplete(result.approvalPolicy,result.primaryAt,result.secondaryAt))||
   typeof result.idempotent!=='boolean')
   deny('Signed TradeLink review receipt mismatch.',409);
  return {...result,actorId:session.actorId,workspaceId:session.workspaceId};
 }
 async recordPdfStage({documentId,expectedRevision,stage}={}){
  if(!TL03_PDF_STAGE_ENABLED)
   deny('Electronic PDF stage recording awaits signed backend activation.',503);
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['primary','secondary'].includes(stage))
   deny('Invalid TradeLink electronic PDF stage request.',400);
  const session=await this.session();
  const result=await this.api.rpc('tl03_record_pdf_approval_stage',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_stage:stage});
  if(!result||result.documentId!==documentId||
    result.workspaceId!==session.workspaceId||
    result.revision!==expectedRevision||result.stage!==stage||
    result.actorId!==session.actorId||!validUuid(result.eventId)||
    !validUuid(result.boardItemId)||typeof result.recordedAt!=='string'||
    !Number.isFinite(Date.parse(result.recordedAt)))
   deny('Signed PDF stage receipt mismatch.',409);
  return result;
 }
 async pdfStages({documentId}={}){
  if(!TL03_PDF_STAGE_ENABLED)
   deny('Electronic PDF stage records await signed backend activation.',503);
  if(!validUuid(documentId))deny('Invalid TradeLink document ID.',400);
  const session=await this.session();
  const result=await this.api.rpc('tl03_pdf_approval_stages',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  if(!result||result.documentId!==documentId||
    result.workspaceId!==session.workspaceId||
    !Number.isSafeInteger(result.revision)||result.revision<1||
    !Array.isArray(result.stages)||result.stages.length>2||
    result.stages.some((stage,index)=>!validUuid(stage?.eventId)||
      !validUuid(stage?.actorId)||!['primary','secondary'].includes(stage.stage)||
      stage.stage!==(index===0?'primary':'secondary')||
      stage.revision!==result.revision||
      typeof stage.recordedAt!=='string'||!Number.isFinite(Date.parse(stage.recordedAt))))
   deny('Signed PDF stage list mismatch.',409);
  return result;
 }
 async submit({documentId,expectedRevision,documentType,fromState='draft'}={}){
  if(!TL03_WORKFLOW_SUBMIT_ENABLED)
   deny('TradeLink submission has not been activated by the administrator.',503);
  if(!validUuid(documentId)||!TYPES.has(documentType)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
    !['draft','revision-required'].includes(fromState))
   deny('Invalid TradeLink submission request.',400);
  await this.session();
  const receipt=await this.api.rpc('tl03_document_submit',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision});
  return normalizeTradeLinkSubmitReceipt(
   receipt,documentId,documentType,expectedRevision,fromState);
 }
 async review({documentId,expectedRevision,action,fromState,reason=''}={}){
  if(!TL03_WORKFLOW_REVIEW_ENABLED)
   deny('TradeLink signed review and revision actions are not activated.',503);
  const trimmed=typeof reason==='string'?reason.trim():null;
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['review','request-revision'].includes(action)||
    !['submitted','under-review'].includes(fromState)||
    (action==='review'&&fromState!=='submitted')||
    trimmed===null||reason.length>1500||/[\x00-\x1f\x7f]/.test(reason)||
    (action==='request-revision'&&
      (trimmed.length<3||trimmed.length>1500)))
   deny('Invalid TradeLink review or reason.',400);
  await this.session();
  const receipt=await this.api.rpc('tl03_document_review',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_action:action,p_reason:trimmed||null});
  return normalizeTradeLinkReviewReceipt(
   receipt,documentId,expectedRevision,action,fromState);
 }
 async decide({documentId,expectedRevision,action,fromState,reason=''}={}){
  if(!TL03_WORKFLOW_DECISION_ENABLED)
   deny('TradeLink approval/rejection is not activated.',503);
  const trimmed=typeof reason==='string'?reason.trim():null;
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1||!['approve','reject'].includes(action)||
    !['submitted','under-review'].includes(fromState)||
    trimmed===null||reason.length>1500||
    /[\x00-\x1f\x7f]/.test(reason)||
    (action==='reject'&&(trimmed.length<3||trimmed.length>1500)))
   deny('Invalid TradeLink decision or mandatory rejection reason.',400);
  await this.session();
  const receipt=await this.api.rpc('tl03_document_decide',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_action:action,
   p_reason:trimmed||null
  });
  return normalizeTradeLinkDecisionReceipt(
   receipt,documentId,expectedRevision,action,fromState);
 }
 async operate({documentId,expectedRevision,documentType,action,fromState,reason=''}={}){
  if(!TL03_WORKFLOW_OPERATIONAL_ENABLED)
   deny('TradeLink operational workflow has not been activated.',503);
  const trimmed=typeof reason==='string'?reason.trim():null;
  if(!validUuid(documentId)||!TYPES.has(documentType)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
    !['record-checked','record-delivered','record-received','complete','reopen'].includes(action)||
    !STATES.has(fromState)||trimmed===null||reason.length>1500||
    /[\x00-\x1f\x7f]/.test(reason)||
    (action==='reopen'&&(trimmed.length<3||trimmed.length>1500)))
   deny('Invalid TradeLink operational command or reopening reason.',400);
  await this.session();
  const value=await this.api.rpc('tl03_document_operate',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_action:action,
   p_reason:trimmed||null
  });
  return normalizeTradeLinkOperationalReceipt(
   value,documentId,expectedRevision,documentType,action,fromState);
 }
 async history(documentId,limit=25){
  if(!TL03_WORKFLOW_REVIEW_ENABLED)
   deny('Signed TradeLink workflow history is not activated.',503);
  if(!validUuid(documentId)||!Number.isSafeInteger(limit)||limit<1||limit>100)
   deny('Invalid TradeLink history request.',400);
  await this.session();
  const records=await this.api.rpc('tl03_document_history',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,p_limit:limit});
  return normalizeTradeLinkSignedHistory(records,limit);
 }
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)deny('TradeLink domain reads await production activation.',503);
  if(!validUuid(documentId))deny('Invalid document identifier.',400);
  const {workspaceId}=await this.documentReadSession();
  const row=await this.api.rpc('tl03_document_read',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  return row===null?null:normalizeTradeLinkDomainRow(row,workspaceId,documentId);
 }
 async revisionBundle(documentId,revision=null){
  if(!TL03_DOMAIN_READS_ENABLED)deny('TradeLink domain reads await production activation.',503);
  if(!validUuid(documentId)||(revision!==null&&
   (!Number.isSafeInteger(revision)||revision<1)))
   deny('Invalid TradeLink revision history request.',400);
  const {workspaceId}=await this.documentReadSession();
  let result;
  try{
   result=await this.api.rpc('tl03_document_revision_bundle',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,p_revision:revision});
  }catch(error){
   // The new revision ledger may deploy after the frontend. Only the exact
   // missing-function code permits falling back to the already signed current
   // document read. Never infer historical snapshots or bypass access denial.
   if(error?.code!=='PGRST202')throw error;
   const record=await this.read(documentId);
   if(record!==null&&revision!==null&&revision!==record.revision)throw error;
   return record===null?null:Object.freeze({
    documentId,boardItemId:record.board_item_id,currentRevision:record.revision,
    selected:record,revisions:Object.freeze([]),historyAvailable:false
   });
  }
  return result===null?null:
   Object.freeze({...normalizeTradeLinkRevisionBundle(result,workspaceId,documentId,revision),
    historyAvailable:true});
 }
 async commit({documentId,expectedRevision,operation,draft=null,
  expectedState='draft',initialState='for-approval'}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)
   deny('TradeLink domain mutations await approved central activation.',503);
  if(!validUuid(documentId)||!OPS.has(operation)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    (operation==='create'&&expectedRevision!==0)||
    (operation!=='create'&&expectedRevision<1)||
    (['archive','restore'].includes(operation)&&draft!==null)||
    (['create','update','revise-approved'].includes(operation)&&
     !['draft','for-approval'].includes(initialState))||
    (['archive','restore'].includes(operation)&&
     !['draft','revision-required'].includes(expectedState))||
    (operation==='revise-approved'&&initialState!=='for-approval'))
   deny('Invalid TradeLink revision, operation or payload.',400);
  if(['create','update','revise-approved'].includes(operation))validateTradeLinkDraftEnvelope(draft,
   {allowUnassignedNumber:operation==='create'&&this.automaticNumberingEnabled});
  const session=await this.session({allowCreateUser:true});
  if(!session.canManage&&!['create','update'].includes(operation))
   deny('TradeLink User capability supports document creation and own Draft updates only.',403);
  const receipt=operation==='create'&&this.automaticNumberingEnabled?
   await this.api.rpc('tl03_document_create',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
    p_data:draft,p_initial_state:initialState
   }):['create','update','revise-approved'].includes(operation)?
   await this.api.rpc('tl03_document_save',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
    p_expected_revision:expectedRevision,p_operation:operation,
    p_data:draft,p_initial_state:initialState
   }):await this.api.rpc('tl03_document_commit',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
    p_expected_revision:expectedRevision,p_operation:operation,p_data:draft});
  const normalized=normalizeTradeLinkDomainReceipt(
   operation==='create'&&!this.automaticNumberingEnabled&&receipt&&typeof receipt==='object'?
    {...receipt,documentNumber:draft.documentNumber}:receipt,
   documentId,operation==='revise-approved'?'update':operation,expectedRevision,
   ['create','update','revise-approved'].includes(operation)?initialState:expectedState);
  const numberPrefix={esi:'ESI-',packing:'PL-',delivery:'DR-',
   payment:'AR-',quotation:'Q-',po:'PO-'}[draft?.documentType];
  if(operation==='create'&&this.automaticNumberingEnabled&&
    (typeof normalized.documentNumber!=='string'||!numberPrefix||
     !normalized.documentNumber.startsWith(numberPrefix)||
     !/^[0-9]{6,}$/.test(normalized.documentNumber.slice(numberPrefix.length))))
   deny('TradeLink server-assigned document number receipt mismatch.',409);
  return normalized;
 }
}
