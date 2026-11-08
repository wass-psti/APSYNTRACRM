/** Genuine TradeLink attachment lifecycle, staged behind a backend-activation flag.
 * The existing central signed session, private source-defined Storage bucket,
 * and document-scoped RPCs are authoritative. No local or shared-Board fallback.
 * Previous bytes are deliberately retained after logical removal/replacement;
 * irreversible Storage cleanup requires a separate, auditable recovery flow.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {TradeLinkDomainClient} from './tradelink-domain-client.js';
import {TRADELINK_BOARD_ID} from './tradelink-board-items.js';

export const TL03_ATTACHMENTS_ENABLED=false;
export const TL03_ATTACHMENT_BUCKET='tradelink-attachments';
export const TL03_MAX_ATTACHMENT_BYTES=20*1024*1024;
const TYPE_BY_EXTENSION=Object.freeze({
 pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
 webp:'image/webp',txt:'text/plain',csv:'text/csv',
 doc:'application/msword',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xls:'application/vnd.ms-excel',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const SHA_RE=/^[a-f0-9]{64}$/;
const fail=(message,status=400)=>{throw new ApiError(message,status);};
const safeName=value=>{
 if(typeof value!=='string')fail('Invalid attachment file name.');
 const leaf=value.normalize('NFKC').split(/[\\/]/).pop()?.trim()??'';
 const clean=leaf.replace(/[^A-Za-z0-9._ -]+/g,'-').replace(/\s+/g,' ')
  .replace(/^[. -]+/,'').slice(0,160).trim();
 if(!clean||!clean.includes('.')||
  !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$/.test(clean))
  fail('Invalid attachment file name.');
 return clean;
};
const mimeFor=name=>TYPE_BY_EXTENSION[name.split('.').pop()?.toLowerCase()]??null;
const pathFor=(workspaceId,documentId,attachmentId,fileName)=>
 workspaceId+'/'+documentId+'/'+attachmentId+'/'+fileName;
const pathUrl=path=>SUPABASE_URL+'/storage/v1/object/'+
 encodeURIComponent(TL03_ATTACHMENT_BUCKET)+'/'+
 path.split('/').map(encodeURIComponent).join('/');

export function validateTradeLinkAttachment(file){
 if(!file||typeof file!=='object'||typeof file.arrayBuffer!=='function'||
  typeof file.name!=='string'||
  !Number.isSafeInteger(file.size)||file.size<1||
  file.size>TL03_MAX_ATTACHMENT_BYTES)
  fail('TradeLink attachment must be a nonempty file of at most 20 MB.');
 const fileName=safeName(file.name);
 const mimeType=mimeFor(fileName);
 if(!mimeType||file.type&&file.type.toLowerCase()!==mimeType)
  fail('Unsupported or mismatched attachment file type.');
 return {fileName,mimeType,sizeBytes:file.size};
}
export function normalizeTradeLinkAttachmentIntent(receipt,workspaceId,documentId,
 expectedRevision,input){
 if(!validUuid(workspaceId)||!validUuid(documentId)||!validUuid(receipt?.attachmentId)||
  !validUuid(receipt?.boardItemId)||
  receipt.documentId!==documentId||receipt.expectedRevision!==expectedRevision||
  receipt.fileName!==input.fileName||receipt.mimeType!==input.mimeType||
  receipt.sizeBytes!==input.sizeBytes||
  !Number.isSafeInteger(receipt.attachmentRevision)||receipt.attachmentRevision<1||
  receipt.storageKey!==pathFor(workspaceId,documentId,
   receipt.attachmentId,input.fileName))
  fail('Signed attachment upload intent mismatch.',409);
 return receipt;
}
export function normalizeTradeLinkAttachmentReceipt(receipt,documentId,
 attachmentId,expectedRevision,operation){
 if(!validUuid(documentId)||!validUuid(attachmentId)||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
  !['attachment-added','attachment-removed'].includes(operation)||
  receipt?.documentId!==documentId||receipt.attachmentId!==attachmentId||
  !validUuid(receipt.boardItemId)||receipt.revision!==expectedRevision+1||
  receipt.operation!==operation||
  receipt.state!==(operation==='attachment-added'?'active':'removed')||
  !Number.isSafeInteger(receipt.attachmentRevision)||
  receipt.attachmentRevision<1)
  fail('Signed attachment revision receipt mismatch.',409);
 return receipt;
}
export function normalizeTradeLinkAttachmentList(rows,workspaceId,documentId){
 if(!validUuid(workspaceId)||!validUuid(documentId)||
  !Array.isArray(rows)||rows.length>25)
  fail('Invalid signed attachment list.',409);
 const ids=new Set(),names=new Set();
 for(const row of rows){
  if(!validUuid(row?.attachmentId)||row.documentId!==documentId||
   typeof row.fileName!=='string'||typeof row.mimeType!=='string'||
   !validUuid(row.uploadedBy)||row.status!=='active'||
   !Number.isSafeInteger(row.sizeBytes)||row.sizeBytes<1||
   row.sizeBytes>TL03_MAX_ATTACHMENT_BYTES||
   !Number.isSafeInteger(row.revision)||row.revision<1||
   !SHA_RE.test(row.checksumSha256)||
   typeof row.uploadedAt!=='string'||!Number.isFinite(Date.parse(row.uploadedAt))||
   safeName(row.fileName)!==row.fileName||
   mimeFor(row.fileName)!==row.mimeType||
   row.storageKey!==pathFor(workspaceId,documentId,row.attachmentId,row.fileName)||
   ids.has(row.attachmentId)||names.has(row.fileName.toLowerCase()))
    fail('Untrusted or mismatched attachment record.',409);
  ids.add(row.attachmentId);names.add(row.fileName.toLowerCase());
 }
 return rows;
}

async function sha256(buffer){
 if(!globalThis.crypto?.subtle)fail('Secure file hashing is unavailable.',503);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** Uses only the current APSYNTRA JWT; no signed URLs or service-role key. */
export class TradeLinkAttachmentClient{
 constructor({api,auth,fetchImpl=globalThis.fetch?.bind(globalThis)}={}){
  this.api=api;this.auth=auth;this.fetchImpl=fetchImpl;
  this.domain=new TradeLinkDomainClient({api,auth});
 }
 async context(){
  if(!TL03_ATTACHMENTS_ENABLED)
   fail('Secure TradeLink attachments are pending backend activation.',503);
  return this.domain.session();
 }
 async list(documentId){
  if(!validUuid(documentId))fail('Invalid document ID.');
  const {workspaceId}=await this.context();
  const rows=await this.api.rpc('tl03_attachment_list',{
   p_document_id:documentId,p_limit:25});
  return normalizeTradeLinkAttachmentList(rows,workspaceId,documentId);
 }
 async upload({documentId,expectedRevision,file,replacesId=null}={}){
  if(!validUuid(documentId)||!Number.isSafeInteger(expectedRevision)||
   expectedRevision<1||(replacesId!==null&&!validUuid(replacesId)))
   fail('Invalid TradeLink attachment target or revision.');
  const input=validateTradeLinkAttachment(file);
  const {actorId,workspaceId}=await this.context();
  // Do not create a prepare intent if we cannot calculate the original bytes.
  const digest=await sha256(await file.arrayBuffer());
  const current=await this.context();
  if(current.actorId!==actorId||current.workspaceId!==workspaceId)
   fail('Signed workspace changed before attachment intent.',403);
  const intent=normalizeTradeLinkAttachmentIntent(
   await this.api.rpc('tl03_attachment_prepare',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,
    p_expected_revision:expectedRevision,p_file_name:input.fileName,
    p_mime_type:input.mimeType,p_size_bytes:input.sizeBytes,
    p_replaces_id:replacesId
   }),workspaceId,documentId,expectedRevision,input);
  if(typeof this.fetchImpl!=='function'||typeof this.auth?.token!=='function')
   fail('Signed TradeLink Storage transport unavailable.',503);
  const token=await this.auth.token();
  if(this.auth.userId!==actorId)
   fail('Signed identity changed during attachment upload.',403);
  let result;
  try{
   result=await this.fetchImpl(pathUrl(intent.storageKey),{
    method:'POST',redirect:'error',cache:'no-store',mode:'cors',
    credentials:'omit',headers:{
     apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,
     'Content-Type':input.mimeType,'x-upsert':'false'
    },body:file
   });
  }catch{
   fail('Attachment upload interrupted. A pending intent may remain; do not assume success.',0);
  }
  if(!result?.ok)
   fail('Private Storage rejected this attachment. No saved attachment was confirmed.',
    result?.status??0);
  const after=await this.context();
  if(after.actorId!==actorId||after.workspaceId!==workspaceId)
   fail('Signed identity changed after upload. Pending object may require reconciliation.',403);
  const receipt=await this.api.rpc('tl03_attachment_finish',{
   p_document_id:documentId,p_attachment_id:intent.attachmentId,
   p_expected_revision:expectedRevision,p_sha256:digest
  });
  return normalizeTradeLinkAttachmentReceipt(receipt,documentId,
   intent.attachmentId,expectedRevision,'attachment-added');
 }
 async remove({documentId,attachmentId,expectedRevision,reason}={}){
  if(!validUuid(documentId)||!validUuid(attachmentId)||
   !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
   typeof reason!=='string'||reason.trim().length<3||reason.length>1000||
   /[\x00-\x1f\x7f]/.test(reason))
   fail('Removal requires a signed file, current revision and reason.',400);
  await this.context();
  return normalizeTradeLinkAttachmentReceipt(
   await this.api.rpc('tl03_attachment_remove',{
    p_document_id:documentId,p_attachment_id:attachmentId,
    p_expected_revision:expectedRevision,p_reason:reason.trim()
   }),documentId,attachmentId,expectedRevision,'attachment-removed');
 }
 async download({documentId,attachmentId}={}){
  if(!validUuid(documentId)||!validUuid(attachmentId))
   fail('Invalid attachment download target.');
  const {actorId,workspaceId}=await this.context();
  const attachment=(await this.list(documentId)).find(r=>r.attachmentId===attachmentId);
  if(!attachment)fail('Attachment is not active for this signed document.',404);
  if(typeof this.fetchImpl!=='function'||typeof this.auth?.token!=='function')
   fail('Signed TradeLink Storage transport unavailable.',503);
  const token=await this.auth.token();
  if(this.auth.userId!==actorId)fail('Signed identity changed.',403);
  let response;
  try{
   response=await this.fetchImpl(pathUrl(attachment.storageKey),{
    method:'GET',redirect:'error',cache:'no-store',mode:'cors',
    credentials:'omit',headers:{
     apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token
    }
   });
  }catch{
   fail('Attachment download failed. Nothing was exported.',0);
  }
  if(!response?.ok)fail('Attachment unavailable or access denied.',response?.status??403);
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength!==attachment.sizeBytes||
    await sha256(buffer)!==attachment.checksumSha256)
   fail('Downloaded file failed its recorded size or SHA-256 integrity check.',409);
  const after=await this.context();
  if(after.actorId!==actorId||after.workspaceId!==workspaceId)
   fail('Signed session or workspace changed during file download.',403);
  return {blob:new Blob([buffer],{type:attachment.mimeType}),
   fileName:attachment.fileName,attachmentId};
 }
}
