/** CP-TL-03A — staged central TradeLink DocumentRecord API.
 * Existing Supabase project/board only. No browser cache, standalone auth,
 * local draft fallback, unsanctioned domain writes or implicit activation.
 */
import {ApiError,} from './session.js';
import {validUuid} from './data.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
export const TL03_DOMAIN_READS_ENABLED=false;
export const TL03_DOMAIN_WRITES_ENABLED=false;
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
export function normalizeTradeLinkDomainReceipt(value,expectedId,operation,expectedRevision=null){
 if(!validUuid(expectedId)||!OPS.has(operation)||!value||typeof value!=='object'||
  value.documentId!==expectedId||!validUuid(value.boardItemId)||
  !Number.isSafeInteger(value.revision)||value.revision<1||
  value.state!=='draft'||value.operation!==operation||
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
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)deny('TradeLink domain reads await production activation.',503);
  if(!validUuid(documentId))deny('Invalid document identifier.',400);
  const {workspaceId}=await this.session();
  const row=await this.api.rpc('tl03_document_read',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId});
  return row===null?null:normalizeTradeLinkDomainRow(row,workspaceId,documentId);
 }
 async commit({documentId,expectedRevision,operation,draft=null}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)
   deny('TradeLink domain mutations await approved central activation.',503);
  if(!validUuid(documentId)||!OPS.has(operation)||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    (operation==='create'&&expectedRevision!==0)||
    (operation!=='create'&&expectedRevision<1)||
    (['archive','restore'].includes(operation)&&draft!==null))
   deny('Invalid TradeLink revision, operation or payload.',400);
  if(operation==='create'||operation==='update')validateTradeLinkDraftEnvelope(draft);
  await this.session();
  const receipt=await this.api.rpc('tl03_document_commit',{
   p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
   p_expected_revision:expectedRevision,p_operation:operation,p_data:draft});
  return normalizeTradeLinkDomainReceipt(receipt,documentId,operation,expectedRevision);
 }
}
