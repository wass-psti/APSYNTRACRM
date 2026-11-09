/**
 * TradeLink electronic PDF issuance boundary.
 * No PDF can be issued from a Draft, browser-selected assignee, or workflow state.
 * An independently authorized backend must atomically verify the current saved
 * revision, stage actors, and immutable template before returning this receipt.
 * This is a response validation contract, NOT cryptographic signature verification.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';

export const TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED=false;
export const TRADELINK_PDF_TEMPLATE_ACTIVATED=false;

const requiredStages=Object.freeze({
 esi:['verifiedBy','approvedBy'],
 quotation:['primary','secondary'],
 po:['verifiedBy','approvedBy'],
 delivery:['checkedBy','deliveredBy'],
 payment:['receivedBy','verifiedBy'],
 packing:[]
});
const QUOTATION_PRIMARY='aacsenagan@watchdogautomation.com.ph';
const assignedEmail=(record,name)=>{
 const content=record.content;
 if(!content||typeof content!=='object'||Array.isArray(content))return null;
 if(record.document_type==='quotation'){
  if(name==='primary')return content.verifiedByEmail===QUOTATION_PRIMARY?QUOTATION_PRIMARY:null;
  if(name==='secondary')return content.approvedByEmail;
 }
 return content[name];
};
const fail=()=>{throw new ApiError('Electronic PDF approval evidence is missing, stale, or invalid.',409);};
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Validate data returned by the future signed issuance endpoint; never use
 * client-supplied receipt objects as proof that a PDF has been signed.
 * The backend must verify actors' identities, roles, stage order, audit rows,
 * template provenance and digest against the current locked revision.
 */
export function validateTradeLinkPdfIssuanceReceipt(receipt,record,workspaceId){
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    !record||!validUuid(workspaceId)||record.workspace_id!==workspaceId||
    !validUuid(record.id)||!Number.isSafeInteger(record.revision)||record.revision<1||
    record.archived_at||receipt.documentId!==record.id||
    receipt.workspaceId!==workspaceId||receipt.revision!==record.revision||
    receipt.documentType!==record.document_type||
    receipt.documentNumber!==record.document_number||
    receipt.state!=='issued-approved'||!validUuid(receipt.issuanceId)||
    !validUuid(receipt.templateId)||!digest(receipt.templateSha256)||
    !digest(receipt.pdfSha256)||!iso(receipt.issuedAt)||
    typeof receipt.pdfStoragePath!=='string'||!receipt.pdfStoragePath.startsWith(workspaceId+'/')||
    receipt.pdfStoragePath.length>1024||
    !Object.hasOwn(requiredStages,record.document_type))fail();
 const names=requiredStages[record.document_type];
 if(names.length===0||!Array.isArray(receipt.stages)||receipt.stages.length!==names.length)fail();
 let previous=0;
 for(let i=0;i<names.length;i++){
  const stage=receipt.stages[i],timestamp=Date.parse(stage?.recordedAt);
  if(!stage||stage.name!==names[i]||!validUuid(stage.actorId)||
     typeof stage.actorEmail!=='string'||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stage.actorEmail)||
     stage.actorEmail!==stage.actorEmail.toLowerCase()||
     stage.actorEmail!==assignedEmail(record,names[i])||
     !validUuid(stage.eventId)||!iso(stage.recordedAt)||
     timestamp<previous||timestamp>Date.parse(receipt.issuedAt)||
     stage.revision!==record.revision)fail();
  previous=timestamp;
 }
 return receipt;
}
/** Fail closed until an approved migration, PDF template and real signed tests
 * establish an issuance endpoint. This must never call an unverified RPC. */
export async function requestTradeLinkApprovedPdf(){
 if(!TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED||!TRADELINK_PDF_TEMPLATE_ACTIVATED)
  throw new ApiError('Electronic PDF issuance awaits verified backend and template activation.',503);
 throw new ApiError('No approved electronic PDF issuance endpoint configured.',503);
}
