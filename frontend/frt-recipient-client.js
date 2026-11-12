/** Signed, workspace-scoped FRT recipients; PRIVATE storage only. */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {ApiError} from './session.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageTypes=Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'});
const MAX_QR_BYTES=3*1024*1024,BUCKET='frt-attachments';
const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
const fail=(message,status=400)=>{throw new ApiError(message,status)};
async function verifyImage(file){
 if(!file||!Object.hasOwn(imageTypes,file.type)||
  !Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_QR_BYTES||
  typeof file.arrayBuffer!=='function')fail('Choose a PNG, JPEG or WebP QR image under 3 MB.');
 const data=new Uint8Array(await file.arrayBuffer());
 if(data.length!==file.size)fail('QR image size changed while reading.');
 const starts=(bytes,offset=0)=>bytes.every((v,i)=>data[offset+i]===v);
 const valid=file.type==='image/png'?starts([137,80,78,71,13,10,26,10]):
  file.type==='image/jpeg'?starts([255,216,255]):
   starts([82,73,70,70])&&starts([87,69,66,80],8);
 if(!valid)fail('QR image bytes do not match its file format.');
 return imageTypes[file.type];
}
export class FRTRecipientClient{
 constructor({auth,api,fetchImpl=globalThis.fetch?.bind(globalThis),
  baseUrl=SUPABASE_URL,apiKey=SUPABASE_PUBLISHABLE_KEY}={}){
  if(!auth||!api||typeof fetchImpl!=='function')throw new TypeError('Signed recipient dependencies required.');
  this.auth=auth;this.api=api;this.fetchImpl=fetchImpl;
  this.baseUrl=baseUrl.replace(/\/$/,'');this.apiKey=apiKey;
 }
 async scope(workspaceId,companyCode,role){
  if(!uuid.test(workspaceId||'')||!/^[A-Za-z0-9_-]{1,32}$/.test(companyCode||''))fail('Invalid FRT workspace or company.');
  const user=await this.auth.getVerifiedUser(),ctx=await this.api.context();
  if(!uuid.test(user?.id||'')||user.id!==this.auth.userId||
   ctx?.user_id!==user.id||ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
   fail('Signed workspace changed.',403);
  const boot=await this.api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
  if(boot?.membership?.enabled!==true||boot?.membership?.status!=='active'||
   boot?.membership?.user_id!==user.id||boot?.membership?.workspace_id!==workspaceId||
   boot?.membership?.role!==role||!boot?.companies?.some(c=>c.code===companyCode))
   fail('Recipient scope no longer authorized.',403);
  return user.id;
 }
 async list({workspaceId,companyCode,role}){
  await this.scope(workspaceId,companyCode,role);
  const result=await this.api.rpc('frt_list_saved_recipients',{
   p_workspace_id:workspaceId,p_company:companyCode});
  if(!Array.isArray(result)||result.length>200||result.some(r=>
   !uuid.test(r?.id||'')||typeof r?.recipientName!=='string'||
   typeof r?.accountName!=='string'||typeof r?.bankName!=='string'||
   typeof r?.accountNumber!=='string'))fail('Recipient list response is invalid.',409);
  return result;
 }
 async save({workspaceId,companyCode,role,recipientName,accountName,bankName,accountNumber}){
  await this.scope(workspaceId,companyCode,role);
  const values=[recipientName,accountName,bankName,accountNumber];
  if(values.some(v=>typeof v!=='string'||v.trim().length<1||v.trim().length>180))
   fail('Enter recipient, account holder, bank, and account number before saving.');
  let row;
  try{row=await this.api.rpc('frt_save_recipient',{
   p_workspace_id:workspaceId,p_company:companyCode,
   p_recipient_name:recipientName.trim(),p_account_name:accountName.trim(),
   p_bank_name:bankName.trim(),p_account_number:accountNumber.trim()});}
  catch(error){
   if(![400,401,403,404,409,422].includes(Number(error?.status)))
    error.recipientOutcomeUncertain=true;
   throw error;
  }
  if(!uuid.test(row?.id||'')||row?.saved!==true){
   const error=new ApiError('Recipient save may have completed. Refresh saved recipients before retrying.',409);
   error.recipientOutcomeUncertain=true;throw error;
  }
  return row;
 }
 async storageRequest(path,{method='POST',body,contentType='application/json'}={}){
  const actor=this.auth.userId;
  const token=await this.auth.token();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
   const res=await this.fetchImpl(this.baseUrl+path,{method,mode:'cors',redirect:'error',cache:'no-store',
    credentials:'omit',headers:{apikey:this.apiKey,Authorization:'Bearer '+token,
     ...(contentType?{'Content-Type':contentType}:{}),...(method==='POST'&&contentType!=='application/json'?{'x-upsert':'false'}:{})},
    ...(body===undefined?{}:{body}),signal:controller.signal});
   if(actor!==this.auth.userId||!this.auth.isSignedIn)fail('Signed identity changed during private storage access.',403);
   const value=await res.json().catch(()=>null);
   if(!res.ok)throw new ApiError('Private recipient QR request rejected ('+res.status+').',res.status);
   return value;
  }finally{clearTimeout(timer);}
 }
 async uploadQR({workspaceId,companyCode,role,recipientId,file,expectedPath=null}){
  const actor=await this.scope(workspaceId,companyCode,role);
  if(!uuid.test(recipientId||''))fail('Save a recipient before uploading a QR code.');
  const extension=await verifyImage(file);
  if(!globalThis.crypto?.randomUUID)fail('Secure QR upload identifier unavailable.');
  const path=workspaceId+'/recipients/'+recipientId+'/'+globalThis.crypto.randomUUID()+'.'+extension;
  await this.storageRequest('/storage/v1/object/'+BUCKET+'/'+encodePath(path),{
   body:file,contentType:file.type});
  if(this.auth.userId!==actor)fail('Signed identity changed after upload.',403);
  let receipt;
  try{receipt=await this.api.rpc('frt_set_recipient_qr',{
   p_workspace_id:workspaceId,p_company:companyCode,p_recipient_id:recipientId,
   p_expected_path:expectedPath,p_next_path:path});}
  catch(error){
   // Never delete an uploaded object after an ambiguous DB commit.
   error.qrReferenceOutcomeUncertain=true;throw error;
  }
  if(receipt?.saved!==true||receipt?.id!==recipientId||receipt?.qrPath!==path)
   fail('QR reference outcome uncertain. Refresh before uploading again.',409);
  const saved=await this.list({workspaceId,companyCode,role});
  if(!saved.some(r=>r.id===recipientId&&r.qrPath===path))
   fail('QR reference not yet confirmed in saved recipients.',409);
  return {path,recipientId};
 }
 async signedQRUrl({workspaceId,companyCode,role,recipientId,qrPath}){
  await this.scope(workspaceId,companyCode,role);
  const rows=await this.list({workspaceId,companyCode,role});
  if(!uuid.test(recipientId||'')||!rows.some(r=>r.id===recipientId&&r.qrPath===qrPath)||
   typeof qrPath!=='string'||!qrPath.startsWith(workspaceId+'/recipients/'+recipientId+'/'))
   fail('QR image is not linked to this workspace recipient.',403);
  const data=await this.storageRequest('/storage/v1/object/sign/'+BUCKET+'/'+encodePath(qrPath),{
   body:JSON.stringify({expiresIn:120})});
  const signed=data?.signedURL||data?.signedUrl;
  if(typeof signed!=='string'||!signed)fail('Private QR link unavailable.',409);
  const base=new URL(this.baseUrl);
  let url=new URL(signed,this.baseUrl);
  if(url.origin!==base.origin)fail('Private QR link has an unexpected destination.',409);
  if(url.pathname.startsWith('/object/sign/'+BUCKET+'/'))
   url=new URL('/storage/v1'+url.pathname+url.search,base);
  if(!url.pathname.startsWith('/storage/v1/object/sign/'+BUCKET+'/'))
   fail('Private QR link has an unexpected destination.',409);
  return url.href;
 }
}
