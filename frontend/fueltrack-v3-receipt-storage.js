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
/** Stable, Board-scoped object identity makes a retry address the same object
 * even after a page refresh or a new client instance. It is not an auth token.
 */
async function stableReceiptObjectId(boardId,boardItemId,requestId,actorId){
 const crypto=globalThis.crypto;
 if(!UUID.test(actorId||''))throw new TypeError('Signed receipt owner identity required.');
 if(!crypto?.subtle||typeof crypto.subtle.digest!=='function'||typeof TextEncoder!=='function')
  throw new Error('Deterministic receipt retry identifiers are unavailable.');
 const input=new TextEncoder().encode(
  'fueltrack-v3-receipt-v1|'+boardId+'|'+boardItemId+'|'+requestId+'|'+actorId
 );
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',input));
 const bytes=digest.slice(0,16);
 // UUIDv8 custom identifier derived from SHA-256; version and variant bits
 // keep the value within the existing UUID contract.
 bytes[6]=(bytes[6]&0x0f)|0x80;
 bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+
  hex.slice(16,20)+'-'+hex.slice(20);
}
const isAlreadyExists=error=>{
 const code=String(error?.code||'').toLowerCase();
 return Number(error?.status)===409||
  (Number(error?.status)===400&&(
   ['resourcealreadyexists','keyalreadyexists','already_exists'].includes(code)||
   /asset already exists|resource already exists/i.test(String(error?.message||''))
  ));
};
export function validFuelTrackReceiptFile(file){
 if(!file||typeof file!=='object'||typeof file.size!=='number'||
    !Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES||
    !Object.hasOwn(BY_TYPE,file.type)||
    typeof file.arrayBuffer!=='function')
   throw new TypeError('Receipt must be a JPEG, PNG or WebP image of at most 5 MB.');
 return {mimeType:file.type,extension:BY_TYPE[file.type],sizeBytes:file.size};
}
/** Verify actual bytes before uploading; browser MIME metadata is untrusted.
 * The backend remains authoritative for storage authorization and ownership.
 */
export async function verifyFuelTrackReceiptSignature(file){
 const {mimeType,sizeBytes}=validFuelTrackReceiptFile(file);
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.byteLength!==sizeBytes)
  throw new TypeError('Receipt bytes do not match the declared file size.');
 const starts=prefix=>prefix.every((value,index)=>bytes[index]===value);
 const valid=mimeType==='image/jpeg'?
  bytes.length>=4&&starts([0xff,0xd8,0xff]):
  mimeType==='image/png'?
  bytes.length>=8&&starts([137,80,78,71,13,10,26,10]):
  bytes.length>=12&&starts([82,73,70,70])&&
    [87,69,66,80].every((value,index)=>bytes[8+index]===value);
 if(!valid)throw new TypeError('Receipt image content does not match its declared file type.');
 return {mimeType,sizeBytes};
}
export class FuelTrackV3ReceiptStorageClient {
 constructor({auth,api,boardId,workspaceId,fetchImpl=globalThis.fetch?.bind(globalThis),
  decodeImage=globalThis.createImageBitmap?.bind(globalThis),
  baseUrl=SUPABASE_URL,apiKey=SUPABASE_PUBLISHABLE_KEY}={}){
  if(!auth||typeof auth.token!=='function'||typeof auth.refresh!=='function'||
    !auth.isSignedIn||typeof fetchImpl!=='function')throw new TypeError('Signed Storage session required');
  this.domain=new FuelTrackV3DomainClient({api,auth,boardId,workspaceId});
  this.auth=auth;this.fetchImpl=fetchImpl;this.boardId=boardId;this.workspaceId=workspaceId;
  this.apiKey=apiKey;this.baseUrl=baseUrl.replace(/\/$/,'');this.decodeImage=decodeImage;
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
 async verifyExistingUpload(path,file,mimeType,token){
  const actor=this.auth.userId;
  const expected=new Uint8Array(await file.arrayBuffer());
  if(expected.byteLength!==file.size||expected.byteLength<1||expected.byteLength>MAX_BYTES)
   throw new Error('Existing private receipt size does not match the selected file.');
  const read=async accessToken=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),25000);
   let reader;
   try{
    const response=await this.fetchImpl(
     this.baseUrl+'/storage/v1/object/authenticated/'+bucket+'/'+encode(path),{
      method:'GET',mode:'cors',redirect:'error',cache:'no-store',credentials:'omit',
      headers:{apikey:this.apiKey,Authorization:'Bearer '+accessToken},
      signal:controller.signal
     });
    if(!response.ok){
     const error=new Error('Existing private receipt could not be verified ('+response.status+').');
     error.status=response.status;throw error;
    }
    const declared=response.headers?.get?.('content-type')?.split(';')[0]?.trim()?.toLowerCase();
    if(declared&&declared!=='application/octet-stream'&&declared!==mimeType)
     throw new Error('Existing private receipt content type does not match the selected file.');
    const length=response.headers?.get?.('content-length');
    if(length!==null&&length!==undefined&&
       (!/^[0-9]+$/.test(length)||Number(length)!==expected.byteLength))
     throw new Error('Existing private receipt size does not match the selected file.');
    reader=response.body?.getReader?.();
    if(!reader)throw new Error('Existing private receipt stream is unavailable.');
    let offset=0;
    while(true){
     const part=await reader.read();
     if(controller.signal.aborted)
      throw new Error('Existing private receipt verification timed out; refresh before retrying.');
     if(!this.auth.isSignedIn||this.auth.userId!==actor)
      throw new Error('Signed identity changed while verifying the existing receipt upload.');
     if(part.done)break;
     if(!(part.value instanceof Uint8Array)||part.value.byteLength===0)
      throw new Error('Existing private receipt stream contains invalid data.');
     if(offset+part.value.byteLength>expected.byteLength)
      throw new Error('An existing receipt object differs from the selected file.');
     for(let i=0;i<part.value.byteLength;i++){
      if(part.value[i]!==expected[offset+i])
       throw new Error('An existing receipt object differs from the selected file.');
     }
     offset+=part.value.byteLength;
    }
    if(offset!==expected.byteLength)
     throw new Error('Existing private receipt size does not match the selected file.');
    if(!this.auth.isSignedIn||this.auth.userId!==actor)
     throw new Error('Signed identity changed while verifying the existing receipt upload.');
    return true;
   }catch(error){
    if(controller.signal.aborted)
     throw new Error('Existing private receipt verification timed out; refresh before retrying.');
    throw error;
   }finally{
    clearTimeout(timeout);
    if(reader)try{await reader.cancel();}catch{}
   }
  };
  try{return await read(token);}
  catch(error){
   if(error?.status!==401)throw error;
   return read(await this.auth.refresh());
  }
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
    err.status=response.status;
    err.code=typeof detail?.code==='string'?detail.code:null;
    throw err;
   }
   return response;
  };
  let token=await this.auth.token();
  try{await request(token);}
  catch(error){
   if(error?.status===401){
    token=await this.auth.refresh();
    try{await request(token);}
    catch(retryError){
     if(!isAlreadyExists(retryError))throw retryError;
     await this.verifyExistingUpload(path,file,mimeType,token);
    }
   }else if(isAlreadyExists(error)){
    await this.verifyExistingUpload(path,file,mimeType,token);
   }else throw error;
  }
  if(!this.auth.isSignedIn||this.auth.userId!==actor)
   throw new Error('Signed identity changed during receipt upload.');
 }
 async uploadAndRegister(requestId,file){
  const checked=validFuelTrackReceiptFile(file);
  if(!UUID.test(requestId)||!this.auth.isSignedIn)throw new TypeError('Signed request is required.');
  await verifyFuelTrackReceiptSignature(file);
  const actor=this.auth.userId;
  const intent=await this.domain.receiptPrepare({requestId});
  if(!this.auth.isSignedIn||this.auth.userId!==actor)
   throw new Error('Signed identity changed before receipt upload.');
  const objectId=await stableReceiptObjectId(this.boardId,intent.boardItemId,requestId,actor);
  if(!UUID.test(objectId))throw new Error('Secure receipt object identifiers unavailable.');
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


 /** Verify an existing private receipt's bytes with an explicit, signed,
  * nonmutating GET. No secret, signed URL or image content leaves this method.
  */
 async verifyPrivateReceiptBinary(requestId){
  if(!UUID.test(requestId)||!this.auth.isSignedIn)
   throw new TypeError('Signed request is required.');
  const actor=this.auth.userId;
  const ensureSigned=()=>{
   if(!this.auth.isSignedIn||this.auth.userId!==actor)
    throw new Error('Signed identity changed during private receipt verification.');
  };
  const url=await this.signedUrl(requestId);
  ensureSigned();
  if(!url)throw new Error('Registered private receipt does not exist.');
  // signedUrl has validated provider origin and the exact Board/object path.
  const pathname=new URL(url).pathname;
  const ext=pathname.match(/\.(jpg|jpeg|png|webp)$/i)?.[1]?.toLowerCase();
  const mimeType=ext==='jpg'||ext==='jpeg'?'image/jpeg':
   ext==='png'?'image/png':ext==='webp'?'image/webp':null;
  if(!mimeType)throw new Error('Registered receipt path has no supported image extension.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  let reader;
  try{
   const response=await this.fetchImpl(url,{
    method:'GET',mode:'cors',redirect:'error',cache:'no-store',
    credentials:'omit',signal:controller.signal
   });
   ensureSigned();
   if(!response.ok)throw new Error('Private receipt download denied ('+response.status+').');
   const declaredType=response.headers?.get?.('content-type')?.split(';')[0]?.trim()?.toLowerCase();
   if(declaredType&&declaredType!=='application/octet-stream'&&declaredType!==mimeType)
    throw new Error('Private receipt response content type mismatch.');
   const headerLength=response.headers?.get?.('content-length');
   if(headerLength!==null&&headerLength!==undefined&&
      (!/^\d+$/.test(headerLength)||Number(headerLength)>MAX_BYTES||Number(headerLength)<1))
    throw new Error('Private receipt response size is invalid.');
   if(typeof response.body?.getReader!=='function')
    throw new Error('Private receipt streaming response unavailable.');
   reader=response.body.getReader();
   let size=0;
   const chunks=[];
   while(true){
    const part=await reader.read();
    ensureSigned();
    if(part.done)break;
    if(!(part.value instanceof Uint8Array)||part.value.byteLength===0)
     throw new Error('Private receipt stream contains invalid data.');
    size+=part.value.byteLength;
    if(size>MAX_BYTES)throw new Error('Private receipt response size exceeds 5 MB.');
    chunks.push(part.value);
   }
   if(size<1)throw new Error('Private receipt response is empty.');
   if(headerLength!==null&&headerLength!==undefined&&Number(headerLength)!==size)
    throw new Error('Private receipt response size mismatch.');
   const bytes=new Uint8Array(size);
   let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   await verifyFuelTrackReceiptSignature({
    size,type:mimeType,arrayBuffer:async()=>bytes.buffer
   });
   // A magic-byte match alone does not establish a usable image. Require a
   // real platform decoder before reporting a verified binary receipt.
   if(typeof this.decodeImage!=='function')
    throw new Error('Private receipt image decoding is unavailable.');
   let image;
   try{
    image=await this.decodeImage(new Blob([bytes],{type:mimeType}));
    ensureSigned();
    if(!image||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||
       image.width<1||image.height<1||image.width*image.height>50000000)
     throw new Error('Private receipt image dimensions are invalid.');
   }finally{image?.close?.();}
   ensureSigned();
   return Object.freeze({status:'VERIFIED_PRIVATE_RECEIPT_BINARY',mimeType,bytes:size});
  }catch(error){
   if(controller.signal.aborted)
    throw new Error('Private receipt verification timed out; refresh before retrying.');
   throw error;
  }finally{
   clearTimeout(timeout);
   if(reader)try{await reader.cancel();}catch{/* No server-side cleanup is needed. */}
  }
 }

}
