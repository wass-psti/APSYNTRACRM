const maxBytes=5*1024*1024;
export const DOCUMENT_CATEGORIES=Object.freeze({generated_confirmation:'Generated confirmation',client_po:'Client PO',uploaded_confirmation:'Uploaded confirmation',supporting:'Supporting document'});
export const DOCUMENT_TYPES=Object.freeze(['application/pdf','image/png','image/jpeg']);
const shaPattern=/^[a-f0-9]{64}$/;
export async function documentDigest(bytes){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function detectType(bytes){
 const prefix=[...bytes.slice(0,8)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(prefix.startsWith('255044462d'))return 'application/pdf';
 if(prefix.startsWith('89504e470d0a1a0a'))return 'image/png';
 if(prefix.startsWith('ffd8ff'))return 'image/jpeg';
 return null;
}
function encodeBytes(bytes){
 let binary='';
 for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
 return btoa(binary);
}
function validName(name){return typeof name==='string'&&name.trim()===name&&name.length>0&&name.length<=240&&!/[\/\\\x00-\x1f\x7f]/.test(name);}
export async function prepareOrderDocument(blob,filename){
 if(!validName(filename))throw Error('Choose a valid filename (1–240 characters).');
 if(!blob||blob.size<5||blob.size>maxBytes)throw Error('Choose a PDF, PNG or JPEG file up to 5 MiB.');
 const bytes=new Uint8Array(await blob.arrayBuffer()),mime=detectType(bytes);
 if(!mime||blob.type&&blob.type!==mime&&blob.type!=='application/octet-stream')throw Error('File content does not match a supported document type.');
 return {filename,mime,sha256:await documentDigest(bytes),byteCount:bytes.length,base64:encodeBytes(bytes)};
}
export function confirmationMetadata(doc){
 return {entityId:doc.entity.id,poNumber:doc.poNumber,currency:doc.currency,total:doc.total,vatRate:doc.vatRate,
 vatExclusiveAmount:doc.vatExclusiveAmount,vatAmount:doc.vatAmount,quotation:doc.quotation,signatory:doc.signatory,itemCount:doc.items.length};
}
export class OrderIntakeDocuments {
 constructor(client){this.client=client;}
 async save(row,category,prepared,id,metadata=null){
  if(!Object.hasOwn(DOCUMENT_CATEGORIES,category)||!row?.id||row.workspace_id!==this.client.workspaceId||!Number.isSafeInteger(row.revision)||row.revision<1||!id)throw Error('Document context required.');
  const result=await this.client.request(()=>this.client.api.rpc('order_intake_save_document',{
   p_id:id,p_order_id:row.id,p_kind:row.record_kind,p_revision:row.revision,p_category:category,p_filename:prepared.filename,
   p_mime:prepared.mime,p_base64:prepared.base64,p_sha256:prepared.sha256,p_metadata:metadata}));
  if(result?.id!==id||result.sha256!==prepared.sha256||result.byteCount!==prepared.byteCount||!result.createdAt)throw Error('Document storage receipt not confirmed.');
  return result;
 }
 async list({row=null,offset=0}={}){
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid document page.');
  const params=new URLSearchParams({workspace_id:'eq.'+this.client.workspaceId,order:'created_at.desc,id.desc',limit:'26',offset:String(offset)});
  if(row){params.set('order_id','eq.'+row.id);params.set('record_kind','eq.'+row.record_kind);}
  const rows=await this.client.request(()=>this.client.auth.authorized('/rest/v1/order_intake_document_registry?'+params,{retryableRead:true}));
  if(!Array.isArray(rows)||rows.length>26||rows.some(d=>d.workspace_id!==this.client.workspaceId||!d.id||!shaPattern.test(d.sha256)||row&&(d.order_id!==row.id||d.record_kind!==row.record_kind)))throw Error('Invalid document registry response.');
  return {rows:rows.slice(0,25),hasMore:rows.length>25};
 }
 async coverage(){
  const result=await this.client.request(()=>this.client.api.rpc('order_intake_document_coverage',{}));
  const keys=['orders','withFiles','withClientPO','withConfirmation','storedFiles','storedBytes','historicalPOReferences','historicalConfirmationReferences','auditOnly'];
  if(keys.some(k=>!Number.isSafeInteger(result?.[k])||result[k]<0))throw Error('Invalid storage coverage response.');
  return result;
 }
 async read(entry){
  if(!entry?.stored||entry.workspace_id!==this.client.workspaceId)throw Error('Document bytes are not available.');
  const r=await this.client.request(()=>this.client.api.rpc('order_intake_read_document',{p_id:entry.id}));
  if(r?.id!==entry.id||r.sha256!==entry.sha256||r.byteCount!==entry.byte_count||r.mimeType!==entry.mime_type||r.filename!==entry.filename||
   !validName(r.filename)||!DOCUMENT_TYPES.includes(r.mimeType)||!Number.isInteger(r.byteCount)||r.byteCount<5||r.byteCount>maxBytes||typeof r.base64!=='string'||r.base64.length>7100000)throw Error('Document readback metadata mismatch.');
  const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));
  if(bytes.length!==r.byteCount||detectType(bytes)!==r.mimeType||await documentDigest(bytes)!==r.sha256)throw Error('Stored document integrity check failed.');
  return new Blob([bytes],{type:r.mimeType});
 }
}
