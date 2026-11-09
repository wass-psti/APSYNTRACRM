/** Private receipt image integration with the existing work-board-files bucket.
 * Storage path always derives from a signed, server-validated Board item.
 * No public bucket, service-role key, local persistence or speculative deletes.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {FuelTrackV3DomainClient} from './fueltrack-v3-domain-client.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BY_TYPE=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'});
const MAX_BYTES=5*1024*1024;
const bucket='work-board-files';
const encode=path=>path.split('/').map(encodeURIComponent).join('/');
export function validFuelTrackReceiptFile(file){
 if(!file||typeof file!=='object'||typeof file.size!=='number'||
    !Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES||
    !Object.hasOwn(BY_TYPE,file.type)||
    typeof file.arrayBuffer!=='function')
   throw new TypeError('Receipt must be a JPEG, PNG or WebP image of at most 5 MB.');
 return {mimeType:file.type,extension:BY_TYPE[file.type],sizeBytes:file.size};
}
export class FuelTrackV3ReceiptStorageClient {
 constructor({auth,api,boardId,workspaceId,fetchImpl=globalThis.fetch?.bind(globalThis),
  baseUrl=SUPABASE_URL,apiKey=SUPABASE_PUBLISHABLE_KEY}={}){
  if(!auth||typeof auth.token!=='function'||typeof auth.refresh!=='function'||
    !auth.isSignedIn||typeof fetchImpl!=='function')throw new TypeError('Signed Storage session required');
  this.domain=new FuelTrackV3DomainClient({api,auth,boardId,workspaceId});
  this.auth=auth;this.fetchImpl=fetchImpl;this.boardId=boardId;this.workspaceId=workspaceId;
  this.apiKey=apiKey;this.baseUrl=baseUrl.replace(/\/$/,'');
 }
 async boundedFetch(url,options){
  const controller=new AbortController();
  let timeout;
  const deadline=new Promise((_,reject)=>{
   timeout=setTimeout(()=>{
    controller.abort();
    reject(new Error('Private receipt Storage request timed out; verify before retrying.'));
   },25000);
  });
  try{
   const response=await Promise.race([
    this.fetchImpl(url,{...options,signal:controller.signal}),deadline
   ]);
   return response;
  }finally{clearTimeout(timeout);}
 }
 async uploadRequest(path,file,mimeType){
  const actor=this.auth.userId;
  const request=async(token)=>{
   const response=await this.boundedFetch(this.baseUrl+'/storage/v1/object/'+bucket+'/'+encode(path),{
    method:'POST',mode:'cors',redirect:'error',cache:'no-store',
    headers:{apikey:this.apiKey,Authorization:'Bearer '+token,
     'Content-Type':mimeType,'x-upsert':'false'},body:file
   });
   if(!response.ok){
    let detail=null;try{detail=await response.json();}catch{}
    const err=new Error(typeof detail?.message==='string'?detail.message:
     'Private receipt upload rejected ('+response.status+').');
    err.status=response.status;throw err;
   }
   return response;
  };
  let token=await this.auth.token();
  try{await request(token);}
  catch(error){
   if(error?.status!==401)throw error;
   token=await this.auth.refresh();
   await request(token);
  }
  if(!this.auth.isSignedIn||this.auth.userId!==actor)
   throw new Error('Signed identity changed during receipt upload.');
 }
 async uploadAndRegister(requestId,file){
  const checked=validFuelTrackReceiptFile(file);
  if(!UUID.test(requestId)||!this.auth.isSignedIn)throw new TypeError('Signed request is required.');
  const actor=this.auth.userId;
  const intent=await this.domain.receiptPrepare({requestId});
  if(!this.auth.isSignedIn||this.auth.userId!==actor)
   throw new Error('Signed identity changed before receipt upload.');
  const objectId=globalThis.crypto?.randomUUID?.();
  if(!UUID.test(objectId||''))throw new Error('Secure receipt object identifiers unavailable.');
  const path=this.boardId+'/'+intent.boardItemId+'/'+objectId+'.'+checked.extension;
  // The stored name is a fixed canonical leaf, independent of caller file names.
  const fileName='receipt.'+checked.extension;
  await this.uploadRequest(path,file,checked.mimeType);
  // The backend checks Storage ownership/MIME/size and registers the Board file
  // and FuelTrack receipt in one transaction. Do not delete ambiguous uploads.
  return this.domain.receiptRegister({requestId,path,fileName,
   mimeType:checked.mimeType,sizeBytes:checked.sizeBytes});
 }
 async read(requestId){return this.domain.receiptRead({requestId});}
 async signedUrl(requestId){
  const record=await this.read(requestId);
  if(record.status==='NO_RECEIPT')return null;
  const actor=this.auth.userId;
  const path=record.storagePath;
  const expected=this.boardId+'/'+record.boardItemId+'/';
  if(!path.startsWith(expected)||!UUID.test(record.boardItemId))
   throw new Error('Receipt Storage path is not Board-scoped.');
  const endpoint='/storage/v1/object/sign/'+bucket+'/'+encode(path);
  const fetchSigned=async token=>{
   const res=await this.boundedFetch(this.baseUrl+endpoint,{
    method:'POST',mode:'cors',redirect:'error',cache:'no-store',
    headers:{apikey:this.apiKey,Authorization:'Bearer '+token,
     'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})
   });
   if(!res.ok){
    const err=new Error('Private receipt link unavailable ('+res.status+').');
    err.status=res.status;throw err;
   }
   return res.json();
  };
  let data;
  try{data=await fetchSigned(await this.auth.token());}
  catch(error){
   if(error?.status!==401)throw error;
   data=await fetchSigned(await this.auth.refresh());
  }
  if(!this.auth.isSignedIn||this.auth.userId!==actor)
   throw new Error('Signed identity changed during private receipt retrieval.');
  const raw=data?.signedURL??data?.signedUrl;
  if(typeof raw!=='string'||!raw)throw new Error('Private receipt URL not returned.');
  const base=new URL(this.baseUrl);
  let url=new URL(raw,this.baseUrl);
  if(url.origin!==base.origin)throw new Error('Untrusted receipt URL origin.');
  if(url.pathname.startsWith('/object/sign/'))
   url=new URL('/storage/v1'+url.pathname+url.search,base);
  if(url.pathname!=='/storage/v1/object/sign/'+bucket+'/'+encode(path))
   throw new Error('Untrusted receipt URL path.');
  return url.href;
 }

}
