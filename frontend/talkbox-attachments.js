/** Native APSYNTRA TalkBox file persistence using existing signed Supabase Storage. */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {ApiError} from './session.js';
import {validUuid} from './data.js';

const BUCKET='toolbox-issues-attachments';
export const TALKBOX_MAX_ATTACHMENT_BYTES=50*1024*1024;
const issueId=x=>/^[1-9][0-9]{0,18}$/.test(String(x||''));
const safeName=value=>{
 const name=String(value??'').normalize('NFKC').split(/[\\/]/).pop().trim();
 if(!name||name.length>250||/[\x00-\x1f\x7f]/.test(name)||name==='.'||name==='..')
  throw new TypeError('Invalid attachment filename');
 return name;
};
export function validateTalkBoxAttachment(file){
 if(!file||typeof file.arrayBuffer!=='function'||typeof file.name!=='string'||
   !Number.isSafeInteger(file.size)||file.size<1||file.size>TALKBOX_MAX_ATTACHMENT_BYTES)
  throw new TypeError('TalkBox attachment must be a nonempty file of at most 50 MiB');
 const name=safeName(file.name);
 const contentType=typeof file.type==='string'&&file.type.trim().length<=200&&
  !/[\x00-\x1f\x7f]/.test(file.type)?file.type:'application/octet-stream';
 return {name,size:file.size,contentType};
}
const urlFor=(path,method)=>SUPABASE_URL+'/storage/v1/object/'+
 (method==='GET'?'authenticated/':'')+BUCKET+'/'+
 path.split('/').map(encodeURIComponent).join('/');
async function sha(buffer){
 if(!globalThis.crypto?.subtle)throw new ApiError('Secure attachment hashing is unavailable',503);
 const hash=await globalThis.crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export class TalkBoxAttachmentClient{
 constructor({api,auth,workspaceId,fetchImpl=globalThis.fetch?.bind(globalThis),
  randomId=()=>globalThis.crypto.randomUUID()}={}){
  if(!validUuid(workspaceId)||typeof api?.rpc!=='function'||typeof auth?.token!=='function'||
     typeof fetchImpl!=='function')throw new TypeError('Signed native TalkBox transport required');
  this.api=api;this.auth=auth;this.workspaceId=workspaceId;
  this.fetch=fetchImpl;this.randomId=randomId;
 }
 async context(){
  const actor=this.auth.userId;
  if(!validUuid(actor)||!this.auth.isSignedIn)throw new ApiError('Signed CRM session is required',401);
  return {actor,token:await this.auth.token()};
 }
 async signedFetch(path,method,body,contentType,{verifyAbsent=false}={}){
  if(verifyAbsent&&method!=='GET')
   throw new TypeError('Private object absence verification requires GET');
  const {actor,token}=await this.context();
  // Supabase Storage CDN can briefly serve a previously cached object after DELETE.
  // Read a unique URL when checking absence; never treat a cached 200 as proof of purge.
  const url=urlFor(path,method)+(verifyAbsent?'?cacheNonce='+encodeURIComponent(this.randomId()):'');
  const response=await this.fetch(url,{
   method,mode:'cors',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,
    ...(contentType?{'Content-Type':contentType,'x-upsert':'false'}:{})},
   ...(body?{body}:{})
  });
  if(!response?.ok)throw new ApiError('Native TalkBox Storage request failed',response?.status||0);
  if(this.auth.userId!==actor||!this.auth.isSignedIn)
   throw new ApiError('Signed CRM user changed during file transfer',409);
  return response;
 }
 async uploadVerified(issueIdValue,file){
  const issue=String(issueIdValue||'');
  if(!issueId(issue))throw new TypeError('Invalid issue ID');
  const input=validateTalkBoxAttachment(file);
  const {actor}=await this.context();
  const operation=this.randomId();
  if(!validUuid(operation))throw new TypeError('Invalid attachment operation ID');
  const path=[this.workspaceId,issue,operation,safeName(input.name)].join('/');
  const originalHash=await sha(await file.arrayBuffer());
  await this.signedFetch(path,'POST',file,input.contentType);
  if(this.auth.userId!==actor)
   throw new ApiError('Session changed after upload; verify the pending object before retry',409);
  let saved;
  try{
   saved=await this.api.rpc('toolbox_issues_register_attachment',{
    p_workspace_id:this.workspaceId,p_issue_id:issue,p_name:input.name,
    p_mime_type:input.contentType,p_size_bytes:input.size,p_storage_path:path
   });
  }catch{
   throw new ApiError('Storage upload completed but issue registration was not confirmed. Do not retry blindly.',409);
  }
  if(String(saved?.storagePath)!==path||String(saved?.name)!==input.name||
     Number(saved?.size)!==input.size)
   throw new ApiError('Native attachment registration receipt mismatch',409);
  const detail=await this.api.rpc('toolbox_issues_get_issue',{
   p_workspace_id:this.workspaceId,p_issue_id:issue
  });
  const attachment=detail?.assets?.find(x=>String(x.id)===String(saved.id));
  if(!attachment||attachment.storagePath!==path||Number(attachment.size)!==input.size)
   throw new ApiError('Attachment was registered but native issue readback is incomplete',409);
  const downloaded=await this.signedFetch(path,'GET');
  const bytes=await downloaded.arrayBuffer();
  if(bytes.byteLength!==input.size||await sha(bytes)!==originalHash)
   throw new ApiError('Uploaded attachment byte verification failed',409);
  return {attachment,detail};
 }
 async removeVerified(issueIdValue,asset){
  const issue=String(issueIdValue||'');
  if(!issueId(issue)||!asset||typeof asset!=='object')
   throw new TypeError('Invalid native attachment removal request');
  const detail=await this.api.rpc('toolbox_issues_get_issue',{
   p_workspace_id:this.workspaceId,p_issue_id:issue});
  const current=detail?.assets?.find(x=>String(x.id)===String(asset.id))||
    detail?.pendingAttachmentCleanup?.find(x=>String(x.id)===String(asset.id));
  if(!current)throw new ApiError('Selected attachment is no longer active or pending cleanup',404);
  const path=current.storagePath;
  if(typeof path!=='string'||!path.startsWith(this.workspaceId+'/'+issue+'/')||
     path.split('/').length!==4||path.split('/').some(x=>!x||x==='..'||x==='.'))
   throw new ApiError('Native attachment path is inconsistent',409);
  const acknowledged=await this.api.rpc('toolbox_issues_unregister_attachment',{
   p_workspace_id:this.workspaceId,p_issue_id:issue,p_attachment_id:String(current.id)});
  if(acknowledged?.success!==true||String(acknowledged?.id)!==String(current.id)||
     acknowledged?.storagePath!==path||String(acknowledged?.issueId)!==issue)
   throw new ApiError('Attachment removal registration was not confirmed',409);
  const refreshed=await this.api.rpc('toolbox_issues_get_issue',{
   p_workspace_id:this.workspaceId,p_issue_id:issue});
  if(refreshed?.assets?.some(x=>String(x.id)===String(current.id)))
   throw new ApiError('Attachment still appears in signed native issue readback',409);
  try{
   await this.signedFetch(path,'DELETE');
  }catch(error){
   if(error?.status!==404)
    throw new ApiError('Attachment hidden but private binary deletion unconfirmed; use Retry cleanup',409);
  }
  let missing=false;
  try{
   await this.signedFetch(path,'GET',undefined,undefined,{verifyAbsent:true});
  }catch(error){
   if(error?.status===404)missing=true;
   else throw new ApiError('Private attachment absence could not be verified; use Retry cleanup',409);
  }
  if(!missing)throw new ApiError('Attachment remains downloadable; use Retry cleanup',409);
  let confirmation;
  try{
   confirmation=await this.api.rpc('toolbox_issues_confirm_attachment_purged',{
    p_workspace_id:this.workspaceId,p_issue_id:issue,p_attachment_id:String(current.id)
   });
  }catch{
   throw new ApiError('Storage was removed, but backend purge confirmation is pending; use Retry cleanup',409);
  }
  if(confirmation?.success!==true||String(confirmation.id)!==String(current.id)||
     confirmation.storagePath!==path||String(confirmation.issueId)!==issue)
   throw new ApiError('Private attachment purge receipt mismatch; use Retry cleanup',409);
  const final=await this.api.rpc('toolbox_issues_get_issue',{
   p_workspace_id:this.workspaceId,p_issue_id:issue
  });
  if(final?.assets?.some(x=>String(x.id)===String(current.id))||
     final?.pendingAttachmentCleanup?.some(x=>String(x.id)===String(current.id)))
   throw new ApiError('Attachment cleanup remains pending on signed readback',409);
  return final;
 }
 async download(issueIdValue,asset){
  const issue=String(issueIdValue||'');
  if(!issueId(issue)||!asset||typeof asset!=='object')
   throw new TypeError('Invalid native attachment');
  const detail=await this.api.rpc('toolbox_issues_get_issue',{
   p_workspace_id:this.workspaceId,p_issue_id:issue
  });
  const current=detail?.assets?.find(row=>String(row.id)===String(asset.id));
  const path=current?.storagePath;
  if(!current||typeof path!=='string'||!path.startsWith(this.workspaceId+'/'+issue+'/')||
     path.split('/').length!==4||path.split('/').some(part=>!part||part==='..'||part==='.'))
   throw new ApiError('Attachment does not belong to this signed native issue',404);
  const response=await this.signedFetch(path,'GET');
  const data=await response.arrayBuffer();
  if(data.byteLength!==Number(current.size)||data.byteLength>TALKBOX_MAX_ATTACHMENT_BYTES)
   throw new ApiError('Native attachment download did not match recorded size',409);
  return {blob:new Blob([data],{type:current.contentType||'application/octet-stream'}),
   fileName:safeName(current.name)};
 }
}
