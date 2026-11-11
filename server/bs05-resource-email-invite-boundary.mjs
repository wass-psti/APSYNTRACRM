/** BS05 — unmounted, default-DENY email invitation issuance boundary.
 * NOT an Edge deployment: no DB connection, no SMTP and no user account writes.
 * A trusted server MUST supply verified session + authoritative role/policy
 * adapters and transactional idempotent delivery. Never use an actor ID sent
 * in JSON or infer authorization from frontend role indicators.
 */
const ORIGIN='https://wass-psti.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
const MODULE=/^[a-z][a-z0-9_-]{1,63}$/;
const MAX_BODY=1024;
export const RESOURCE_EMAIL_INVITE_HTTP_ENABLED=false;

const answer=(status,payload,originOk)=>{
 const headers={'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'};
 if(originOk){
  headers['access-control-allow-origin']=ORIGIN;
  headers['access-control-allow-methods']='POST, OPTIONS';
  headers['access-control-allow-headers']='authorization, content-type';
 }
 return new Response(JSON.stringify(payload),{status,headers});
};
const validEmail=email=>typeof email==='string'&&email.length<=254&&
 EMAIL.test(email)&&email===email.trim().toLowerCase()&&
 !/[\u0000-\u001f\u007f]/.test(email);
async function readBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))
  return null;
 const sizeHeader=request.headers.get('content-length');
 if(sizeHeader&&(!/^\d+$/.test(sizeHeader)||Number(sizeHeader)>MAX_BODY))return null;
 const text=await request.text();
 if(new TextEncoder().encode(text).byteLength>MAX_BODY)return null;
 try{
  const value=JSON.parse(text);
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
 }catch{return null;}
}
function parseRequest(value){
 if(!value||!UUID.test(value.workspaceId||'')||
    !UUID.test(value.requestId||'')||!validEmail(value.email)||
    value.role!=='viewer'||!['board','application'].includes(value.resourceKind))
  return null;
 if(value.resourceKind==='board'&&
    (!UUID.test(value.boardId||'')||value.moduleKey!==undefined))return null;
 if(value.resourceKind==='application'&&
    (!MODULE.test(value.moduleKey||'')||value.boardId!==undefined))return null;
 const allowedKeys=value.resourceKind==='board'?
  ['workspaceId','requestId','email','role','resourceKind','boardId']:
  ['workspaceId','requestId','email','role','resourceKind','moduleKey'];
 if(Object.keys(value).some(k=>!allowedKeys.includes(k)))return null;
 return Object.freeze({
  workspaceId:value.workspaceId,requestId:value.requestId,
  email:value.email,role:'viewer',resourceKind:value.resourceKind,
  ...(value.resourceKind==='board'?{boardId:value.boardId}:{moduleKey:value.moduleKey})
 });
}
function parseReceipt(result,request){
 if(!UUID.test(result?.invitationId||'')||
  !['delivery-submitted','already-issued'].includes(result?.state)||
  result?.resourceKind!==request.resourceKind||result?.email!==request.email)
  return null;
 return {invitationId:result.invitationId,state:result.state,
  email:result.email,resourceKind:result.resourceKind};
}

/** Signed adapter requirements:
 * verifySession(token): trusted, verified GoTrue identity/session status.
 * authorizeInvitation(actor,request): rechecks resource, exact workspace,
 * board MANAGE / independently approved module role, guest policy default OFF.
 * issueAndDeliver(actor,request): transactionally reserves idempotent request,
 * securely binds recipient, sends approved mail and returns minimal receipt.
 */
export function createResourceEmailInviteBoundary({
 enabled=false,verifySession,authorizeInvitation,issueAndDeliver
}={}){
 return async function handle(request){
  const sameOrigin=request instanceof Request&&request.headers.get('origin')===ORIGIN;
  if(!enabled)return answer(503,{state:'unavailable'},sameOrigin);
  if(!sameOrigin)return answer(403,{state:'denied'},false);
  if(request.method==='OPTIONS')return answer(200,{state:'preflight'},true);
  if(request.method!=='POST')return answer(405,{state:'denied'},true);
  if(typeof verifySession!=='function'||typeof authorizeInvitation!=='function'||
     typeof issueAndDeliver!=='function')
   return answer(503,{state:'unavailable'},true);
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer ')||auth.length>10000||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth.slice(7)))
   return answer(401,{state:'unauthorized'},true);
  let actor;
  try{actor=await verifySession(auth.slice(7));}
  catch{return answer(401,{state:'unauthorized'},true);}
  if(!UUID.test(actor?.id||'')||actor.emailVerified!==true||
     actor.sessionActive!==true)
   return answer(401,{state:'unauthorized'},true);
  let body;
  try{body=parseRequest(await readBody(request));}
  catch{return answer(400,{state:'invalid'},true);}
  if(!body)return answer(400,{state:'invalid'},true);
  try{
   // Server-derived authorization. No authorization from request role or
   // a frontend receipt. Prohibit workspace member insertion for guest.
   const permitted=await authorizeInvitation(Object.freeze({id:actor.id}),body);
   if(permitted!==true)return answer(403,{state:'denied'},true);
   const receipt=parseReceipt(await issueAndDeliver(
    Object.freeze({id:actor.id}),body),body);
   if(!receipt)return answer(409,{state:'unconfirmed'},true);
   return answer(200,receipt,true);
  }catch{
   // A delivery timeout may happen after committing request; do not say
   // failed/sent or automatically reissue. Check idempotency on the server.
   return answer(409,{state:'unconfirmed'},true);
  }
 };
}
