/** CP-TL-03A — staged central TradeLink DocumentRecord API.
 * Existing Supabase project/board only. No browser cache, standalone auth,
 * local draft fallback, unsanctioned domain writes or implicit activation.
 */
import {ApiError,} from './session.js';
import {validUuid} from './data.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
// Stage A read RPCs enforce signed-session, board and General Manager checks.
export const TL03_DOMAIN_READS_ENABLED=true;
// Stage B authenticated EXECUTE grants are live; server enforces session and workspace permissions.
export const TL03_DOMAIN_WRITES_ENABLED=true;
// The workflow backend adds an authenticated RPC and changes an audit CHECK.
// Keep the Submit button disabled until that exact production candidate is
// approved, installed, and separately verified. Existing Draft writes remain on.
export const TL03_WORKFLOW_SUBMIT_ENABLED=false;
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
const TYPES=new Set(['esi','packing','delivery','payment','quotation','po']);
const STATES=new Set(['draft','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled']);
const OPS=new Set(['create','update','archive','restore']);
const deny=(message,status=403)=>{throw new ApiError(message,status);};
export function validateTradeLinkDraftEnvelope(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
   !TYPES.has(value.documentType)||typeof value.documentNumber!=='string'||
   !/^[A-Za-z0-9][A-Za-z0-9._ /-]{0,119}$/.test(value.documentNumber)||
   value.documentNumber!==value.documentNumber.trim())
  deny('Invalid TradeLink draft type or document number.',400);
 for(const blocked of ['id','workflow','status','revision','revisionNo','history',
  'createdBy','updatedBy','approvedAt','verifiedAt','attachments','createdById',
  'updatedById','board_id','workspace_id','role','accessControl']){
  if(Object.hasOwn(value,blocked))deny('Server-controlled TradeLink draft property.',400);
 }
 if(value.items!=null&&(!Array.isArray(value.items)||value.items.length>100))
  deny('Invalid TradeLink line items.',400);
 const serialized=JSON.stringify(value);
 if(!serialized||serialized.length>131072)
  deny('TradeLink draft is too large.',400);
 return value;
}
export function normalizeTradeLinkDomainReceipt(
 value,expectedId,operation,expectedRevision=null,expectedState='draft'
){
 if(!validUuid(expectedId)||!OPS.has(operation)||!value||typeof value!=='object'||
  value.documentId!==expectedId||!validUuid(value.boardItemId)||
  !Number.isSafeInteger(value.revision)||value.revision<1||
  (expectedState!=='draft'&&expectedState!=='revision-required')||
  value.state!==expectedState||value.operation!==operation||
  typeof value.idempotent!=='boolean'||
  (expectedRevision!==null&&(
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
   (value.idempotent?(operation!=='create'||expectedRevision!==0||value.revision!==1):
    value.revision!==expectedRevision+1))))
  deny('TradeLink authoritative commit receipt mismatch.',409);
 return value;
}
export function normalizeTradeLinkDomainRow(row,workspaceId,documentId){
 if(!row||!validUuid(documentId)||row.id!==documentId||
  row.board_id!==TRADELINK_BOARD_ID||row.workspace_id!==workspaceId||
  !validUuid(row.board_item_id)||!TYPES.has(row.document_type)||
  !STATES.has(row.workflow_state)||!Number.isSafeInteger(row.revision)||
  row.revision<1||!row.content||typeof row.content!=='object'||
  Array.isArray(row.content))
  deny('Invalid authorized TradeLink document response.',409);
 return row;
}
/** Check the *entire* submitted payload after an authoritative signed read.
 * PostgreSQL jsonb can reorder object keys, so raw JSON.stringify equality
 * would incorrectly reject valid saves. Array order and every field/value
 * are still checked exactly. Never log financial/customer contents.
 */
function sameTradeLinkJsonValue(left,right,depth=0){
 if(left===right)return true;
 if(depth>5)return false;
 if(Array.isArray(left)||Array.isArray(right))
  return Array.isArray(left)&&Array.isArray(right)&&
   left.length===right.length&&
   left.every((value,index)=>sameTradeLinkJsonValue(value,right[index],depth+1));
 if(!left||!right||typeof left!=='object'||typeof right!=='object')
  return false;
 const leftKeys=Object.keys(left),rightKeys=Object.keys(right);
 return leftKeys.length===rightKeys.length&&leftKeys.every(key=>
  Object.hasOwn(right,key)&&
   sameTradeLinkJsonValue(left[key],right[key],depth+1));
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
 constructor({api,auth}={}){this.api=api;this.auth=auth;}
 async session(){
  if(!this.api?.context||!this.api?.board||!this.api?.allowed||!this.api?.rpc||
    !this.auth?.getVerifiedUser)deny('Signed TradeLink domain API unavailable.');
  const actor=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(!validUuid(actor?.id)||actor.id!==this.auth.userId||
    context?.user_id!==actor.id||context?.profile?.status!=='active'||
    !validUuid(context.workspace_id))
   deny('TradeLink signed identity or workspace changed.');
  const detail=await this.api.board(TRADELINK_BOARD_ID);
  if(!isTradeLinkBoard(detail?.board)||
     detail.board.workspace_id!==context.workspace_id||
     await this.api.allowed(TRADELINK_BOARD_ID,'manage')!==true)
   deny('TradeLink board manager scope required.');
  // Server additionally requires a live auth.sessions row and an effective
  // General Manager module role beneath the centralized platform ceiling.
  return {actorId:actor.id,workspaceId:context.workspace_id};
 }
 async list(limit=50){
  if(!TL03_DOMAIN_READS_ENABLED)deny('TradeLink domain reads await production activation.',503);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)
   deny('TradeLink list limit must be 1–100.',400);
  await this.session();
  const rows=await this.api.rpc('tl03_documents_list',{
   p_board_id:TRADELINK_BOARD_ID,p_limit:limit});
  if(!Array.isArray(rows)||rows.length>limit||rows.some(r=>!validUuid(r?.documentId)||
      !validUuid(r?.boardItemId)||!TYPES.has(r?.documentType)||
      !STATES.has(r?.workflowState)||!Number.isSafeInteger(r?.revision)||r.revision<1))
   deny('Invalid TradeLink document list response.',409);
  return rows;
 }
 async searchPage({query='',documentType='all',workflowState='all',
  archiveMode='active',cursor=null,limit=50}={}){
  if(!TL03_DOMAIN_READS_ENABLED)
   deny('TradeLink domain reads await production activation.',503);
  if(typeof query!=='string'||query.length>120||
    !TYPES.has(documentType)&&documentType!=='all'||
    !STATES.has(workflowState)&&workflowState!=='all'||
    !['all','active','archived'].includes(archiveMode)||
    !Number.isSafeInteger(limit)||limit<1||limit>50||
    (cursor!==null&&(!cursor||typeof cursor.updatedAt!=='string'||
      !Number.isFinite(Date.parse(cursor.updatedAt))||
      !validUuid(cursor.documentId))))
   deny('Invalid TradeLink server search request.',400);
  await this.session();
  const response=await this.api.rpc('tl03_documents_page',{
   p_board_id:TRADELINK_BOARD_ID,p_search:query,
   p_document_type:documentType,p_workflow_state:workflowState,
   p_archive_mode:archiveMode,p_before_at:cursor?.updatedAt??null,
   p_before_id:cursor?.documentId??null,p_limit:limit
  });
  if(!response||typeof response!=='object'||Array.isArray(response)||
    !Array.isArray(response.rows)||response.rows.length>limit||
    typeof response.hasMore!=='boolean'||
    (response.hasMore!==Boolean(response.nextCursor))||
    (response.nextCursor!==null&&
      (!validUuid(response.nextCursor?.documentId)||
       typeof response.nextCursor?.updatedAt!=='string'||
       !Number.isFinite(Date.parse(response.nextCursor.updatedAt))))||
    response.rows.some(r=>!validUuid(r?.documentId)||!validUuid(r?.boardItemId)||
      !TYPES.has(r?.documentType)||!STATES.has(r?.workflowState)||
      typeof r?.documentNumber!=='string'||typeof r?.archived!=='boolean'||
      !Number.isSafeInteger(r?.revision)||r.revision<1||
      typeof r?.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))||
    (response.hasMore&&(!response.rows.length||
      response.nextCursor.documentId!==response.rows.at(-1).documentId||
      Date.parse(response.nextCursor.updatedAt)!==
        Date.parse(response.rows.at(-1).updatedAt))))
    deny('Invalid authorized TradeLink server page response.',409);
  return response;
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
  const {workspaceId}=await this.session();
  const row=await this.api.rpc('tl03_document_read',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  return row===null?null:normalizeTradeLinkDomainRow(row,workspaceId,documentId);
 }
 async commit({documentId,expectedRevision,operation,draft=null,expectedState='draft'}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)
   deny('TradeLink domain mutations await approved central activation.',503);
  if(!validUuid(documentId)||!OPS.has(operation)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    (operation==='create'&&expectedRevision!==0)||
    (operation!=='create'&&expectedRevision<1)||
    (['archive','restore'].includes(operation)&&draft!==null)||
    !['draft','revision-required'].includes(expectedState)||
    (expectedState==='revision-required'&&operation!=='update'))
   deny('Invalid TradeLink revision, operation or payload.',400);
  if(operation==='create'||operation==='update')validateTradeLinkDraftEnvelope(draft);
  await this.session();
  const receipt=await this.api.rpc('tl03_document_commit',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_operation:operation,p_data:draft});
  return normalizeTradeLinkDomainReceipt(receipt,documentId,operation,
   expectedRevision,expectedState);
 }
}
