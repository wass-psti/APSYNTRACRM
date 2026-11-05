/**
 * CP-WS-02D/B3 — STAGED, UNDEPLOYED signed invitation HTTP boundary.
 * This file is NOT a server/route on its own. No provider credentials here.
 *
 * verifySignedActor MUST verify the actual GoTrue JWT + session revocation
 * against trusted Supabase Auth, never request JSON or user_metadata.
 * issueForAuthorizedActor MUST invoke the protected private database issuer
 * with the verified actor's signed context and enforce owner/delegation.
 * Never substitute a service-role lookup for caller-scoped authorization.
 */
import {
 validateTrustedDeliveryDraft,submitTrustedWorkspaceInvitation
} from './ws02d-trusted-delivery.mjs';

const TRUSTED_ORIGIN='https://wass-psti.github.io';
const MAX_BODY_BYTES=4096;
const JWT_PATTERN=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const WS02D_INVITE_HTTP_ENABLED=false;

function response(status,result,originAllowed){
 const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'pragma':'no-cache','vary':'Origin',
  'x-content-type-options':'nosniff'
 };
 if(originAllowed){
  headers['access-control-allow-origin']=TRUSTED_ORIGIN;
  headers['access-control-allow-methods']='POST, OPTIONS';
  headers['access-control-allow-headers']='authorization, content-type';
 }
 return new Response(JSON.stringify(result),{status,headers});
}

async function readBoundedJson(request){
 const reader=request.body?.getReader();
 if(!reader)return null;
 const chunks=[];
 let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value?.byteLength||0;
   if(size>MAX_BODY_BYTES)throw new Error('Oversize request');
   if(value)chunks.push(value);
  }
 }finally{
  reader.releaseLock();
 }
 if(size===0)return null;
 const buffer=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
}

export function createTrustedInvitationHttpBoundary({
 enabled=false,verifySignedActor,issueForAuthorizedActor,sendEmail,
 recordDeliveryOutcome
}={}){
 return async function handleInvitation(request){
  const originAllowed=request instanceof Request
   &&request.headers.get('origin')===TRUSTED_ORIGIN;
  if(!enabled)return response(503,{state:'unavailable'},originAllowed);
  if(!originAllowed)return response(403,{state:'denied'},false);
  if(request.method==='OPTIONS')return response(200,{state:'preflight'},true);
  if(request.method!=='POST')return response(405,{state:'denied'},true);
  if(typeof verifySignedActor!=='function'
   ||typeof issueForAuthorizedActor!=='function'
   ||typeof sendEmail!=='function'
   ||typeof recordDeliveryOutcome!=='function')
   return response(503,{state:'unavailable'},true);
  if(request.headers.get('content-type')!=='application/json')
   return response(415,{state:'denied'},true);
  const contentLength=request.headers.get('content-length');
  if(contentLength&&(!/^\d+$/.test(contentLength)
    ||Number(contentLength)>MAX_BODY_BYTES))
   return response(413,{state:'denied'},true);
  const auth=request.headers.get('authorization')||'';
  if(auth.length>10000||!auth.startsWith('Bearer ')
   ||!JWT_PATTERN.test(auth.slice(7)))
   return response(401,{state:'unauthorized'},true);

  let actor;
  try{
   actor=await verifySignedActor(auth.slice(7));
  }catch{
   return response(401,{state:'unauthorized'},true);
  }
  if(!actor||!UUID.test(actor.id)||!UUID.test(actor.sessionId)
    ||actor.active!==true||actor.verified!==true)
   return response(401,{state:'unauthorized'},true);

  let raw;
  try{
   raw=await readBoundedJson(request);
  }catch{
   return response(400,{state:'invalid'},true);
  }
  const draft=validateTrustedDeliveryDraft(raw);
  if(!draft)return response(400,{state:'invalid'},true);

  try{
   const result=await submitTrustedWorkspaceInvitation(draft,{
    deliveryEnabled:true,sendEmail,recordDeliveryOutcome,
    issueForSignedActor:args=>issueForAuthorizedActor(Object.freeze({
     id:actor.id,sessionId:actor.sessionId
    }),args)
   });
   // Nonsecret identifiers only. No provider response, email, JWT or token.
   return response(202,{state:result.state,invitationId:result.invitationId},true);
  }catch{
   // Public error must not enumerate recipients, workspace, database or SMTP.
   return response(403,{state:'denied'},true);
  }
 };
}
