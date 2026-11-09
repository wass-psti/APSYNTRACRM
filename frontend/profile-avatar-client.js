import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const BUCKET='account-avatars';
const MAX_AVATAR_BYTES=400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_PATH=/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/i;

function checkedPath(path,userId){
 if(typeof path!=='string'||!AVATAR_PATH.test(path)||!UUID.test(userId)||path.split('/')[0].toLowerCase()!==userId.toLowerCase())
  throw new Error('Invalid profile picture reference.');
 return path;
}
function responseMessage(data,status){
 const message=data?.message||data?.error||data?.msg;
 return typeof message==='string'?message:'Profile picture request failed ('+status+').';
}
function assertActor(auth,userId){
 if(!UUID.test(userId)||auth.userId!==userId)
  throw new Error('Profile picture changes are limited to your signed-in account.');
}

export class ProfileAvatarClient{
 constructor({auth,fetchImpl=globalThis.fetch?.bind(globalThis),baseUrl=SUPABASE_URL,apiKey=SUPABASE_PUBLISHABLE_KEY,clock=()=>Date.now()}={}){
  if(!auth||typeof auth.token!=='function'||typeof auth.refresh!=='function'||typeof auth.authorized!=='function')
   throw new TypeError('A verified WatchdogWorkspace AuthClient is required.');
  if(typeof fetchImpl!=='function')throw new TypeError('Fetch is unavailable.');
  this.auth=auth;this.fetchImpl=fetchImpl;this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;this.clock=clock;
  this.signedUrlCache=new Map();
 }
 async request(path,{method='GET',body,contentType='application/json',retry=true}={}){
  const execute=async token=>{
   const headers={apikey:this.apiKey,Authorization:'Bearer '+token};
   if(contentType)headers['Content-Type']=contentType;
   if(method==='POST'&&path.startsWith('/storage/v1/object/account-avatars/')){
    headers['cache-control']='3600';headers['x-upsert']='false';
   }
   const response=await this.fetchImpl(this.baseUrl+path,{
    method,mode:'cors',redirect:'error',cache:'no-store',headers,
    ...(body===undefined?{}:{body})
   });
   let data=null;
   try{data=await response.json();}catch{}
   return {response,data};
  };
  let token=await this.auth.token();
  let result=await execute(token);
  if(result.response.status===401&&retry){
   token=await this.auth.refresh();
   result=await execute(token);
  }
  if(!result.response.ok)throw new Error(responseMessage(result.data,result.response.status));
  return result.data;
 }
 async upload(blob,userId){
  assertActor(this.auth,userId);
  if(!(blob instanceof Blob)||blob.type!=='image/webp'||blob.size<1||blob.size>MAX_AVATAR_BYTES)
   throw new Error('Prepared profile picture is invalid or exceeds 400 KB.');
  const path=userId.toLowerCase()+'/'+crypto.randomUUID()+'.webp';
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  await this.request('/storage/v1/object/'+BUCKET+'/'+encoded,{
   method:'POST',body:blob,contentType:'image/webp'
  });
  return path;
 }
 async updateReference(path,expectedPath){
  const result=await this.auth.authorized('/rest/v1/rpc/set_own_profile_avatar',{
   method:'POST',
   body:{p_avatar_path:path,p_expected_avatar_path:expectedPath??null}
  });
  this.signedUrlCache.clear();
  return result;
 }
 async removeObject(path,userId){
  assertActor(this.auth,userId);
  const safe=checkedPath(path,userId);
  await this.request('/storage/v1/object/'+BUCKET,{
   method:'DELETE',body:JSON.stringify({prefixes:[safe]})
  });
  this.signedUrlCache.delete(safe);
 }
 async save(blob,userId,expectedPath){
  const oldPath=expectedPath?checkedPath(expectedPath,userId):null;
  const nextPath=await this.upload(blob,userId);
  try{
   const result=await this.updateReference(nextPath,oldPath);
   if(result?.avatar_path!==nextPath||typeof result?.updated_at!=='string'){
    // A successful HTTP response with an unexpected body is ambiguous. Keep
    // the uploaded object rather than risk deleting an object now referenced
    // by the authoritative profile row.
    throw new Error('The profile picture upload completed, but its saved reference could not be confirmed. Refresh your account before retrying.');
   }
   let cleanupPending=false;
   if(oldPath&&oldPath!==nextPath){
    try{await this.removeObject(oldPath,userId);}
    catch{cleanupPending=true;}
   }
   return {path:nextPath,updatedAt:result.updated_at,cleanupPending};
  }catch(error){
   const status=Number(error?.status);
   const definitiveRejection=Number.isInteger(status)&&status>=400&&status<500&&status!==408&&status!==429;
   if(definitiveRejection){
    try{await this.removeObject(nextPath,userId);}catch{}
   }
   // Network errors and server failures can happen after Postgres commits.
   // Preserve the object on ambiguous outcomes so the profile never points
   // to an object that this client has just deleted.
   throw error;
  }
 }
 async remove(userId,expectedPath){
  assertActor(this.auth,userId);
  const oldPath=checkedPath(expectedPath,userId);
  const result=await this.updateReference(null,oldPath);
  if(result?.avatar_path!==null||typeof result?.updated_at!=='string')
   throw new Error('The profile picture removal could not be confirmed. Refresh your account before retrying.');
  try{
   await this.removeObject(oldPath,userId);
   return {path:null,updatedAt:result.updated_at,cleanupPending:false};
  }catch{
   return {path:null,updatedAt:result.updated_at,cleanupPending:true};
  }
 }
 async signedUrl(path,userId){
  const safe=checkedPath(path,userId);
  const cached=this.signedUrlCache.get(safe);
  if(cached&&cached.expiresAt>this.clock()+60000)return cached.url;
  const encoded=safe.split('/').map(encodeURIComponent).join('/');
  const data=await this.request('/storage/v1/object/sign/'+BUCKET+'/'+encoded,{
   method:'POST',body:JSON.stringify({expiresIn:3600})
  });
  const signed=data?.signedURL||data?.signedUrl;
  if(typeof signed!=='string'||!signed)throw new Error('Profile picture URL was not returned.');
  const base=new URL(this.baseUrl);
  let url=new URL(signed,this.baseUrl);
  if(url.origin!==base.origin)
   throw new Error('Profile picture URL failed origin validation.');
  if(url.pathname.startsWith('/object/sign/')){
   url=new URL('/storage/v1'+url.pathname+url.search,base);
  }
  if(!url.pathname.startsWith('/storage/v1/object/sign/'))
   throw new Error('Profile picture URL failed path validation.');
  this.signedUrlCache.set(safe,{url:url.href,expiresAt:this.clock()+3500000});
  return url.href;
 }
}
