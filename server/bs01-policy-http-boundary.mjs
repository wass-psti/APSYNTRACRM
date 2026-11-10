/** BS01/P2: unmounted, default-OFF board policy HTTP boundary.
 * This is not a live Edge Function. A trusted host must supply independently
 * verified GoTrue actor/session and signed SQL adapters. A service-key-only
 * actor lookup must never replace genuine end-user database authorization.
 */
const ORIGIN='https://wass-psti.github.io';
const LIMIT=2048;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const MODES=new Set(['private','workspace_restricted','guest_shareable']);
export const BS01_POLICY_HTTP_ENABLED=false;

function reply(status,body,originOk){
 const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'x-content-type-options':'nosniff',
  'vary':'Origin'
 };
 if(originOk){
  headers['access-control-allow-origin']=ORIGIN;
  headers['access-control-allow-methods']='POST, OPTIONS';
  headers['access-control-allow-headers']='authorization, content-type';
 }
 return new Response(JSON.stringify(body),{status,headers});
}
async function readJson(request){
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>LIMIT))
  return null;
 if(request.headers.get('content-type')!=='application/json')return null;
 const reader=request.body?.getReader();
 if(!reader)return null;
 let size=0;
 const chunks=[];
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value?.byteLength||0;
   if(size>LIMIT)return null;
   if(value)chunks.push(value);
  }
 }finally{reader.releaseLock();}
 if(size===0)return null;
 const bytes=new Uint8Array(size);
 let at=0;
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 }catch{return null;}
}
function validatePolicyReceipt(value,boardId,action){
 if(!value||value.schemaVersion!==1||value.boardId!==boardId||
   !MODES.has(value.externalSharing))return null;
 if(action==='read'){
  if(!UUID.test(value.workspaceId||'')||
    typeof value.guestLinksEnabled!=='boolean'||
    typeof value.mayIssue!=='boolean')return null;
  return {
   schemaVersion:1,boardId:value.boardId,workspaceId:value.workspaceId,
   externalSharing:value.externalSharing,
   guestLinksEnabled:value.guestLinksEnabled,mayIssue:value.mayIssue
  };
 }
 if(!Number.isSafeInteger(value.revision)||value.revision<1||
    typeof value.changed!=='boolean')return null;
 return {
  schemaVersion:1,boardId:value.boardId,externalSharing:value.externalSharing,
  revision:value.revision,changed:value.changed
 };
}

/** All sensitive policy reads/writes go through trusted per-actor adapters.
 * The adapter must re-check authoritative current workspace, manager status,
 * protected application eligibility, signed session and optimistic revision.
 */
export function createBoardPolicyHttpBoundary({
 enabled=false,verifySignedActor,readAuthorizedPolicy,setAuthorizedPolicy
}={}){
 return async function handle(request){
  const originOk=request instanceof Request&&
   request.headers.get('origin')===ORIGIN;
  if(!enabled)return reply(503,{state:'unavailable'},originOk);
  if(!originOk)return reply(403,{state:'denied'},false);
  if(request.method==='OPTIONS')return reply(200,{state:'preflight'},true);
  if(request.method!=='POST')return reply(405,{state:'denied'},true);
  if(typeof verifySignedActor!=='function'||
     typeof readAuthorizedPolicy!=='function'||
     typeof setAuthorizedPolicy!=='function')
   return reply(503,{state:'unavailable'},true);
  const bearer=request.headers.get('authorization')||'';
  if(bearer.length>10000||!bearer.startsWith('Bearer ')||
    !JWT.test(bearer.slice(7)))return reply(401,{state:'unauthorized'},true);
  let actor;
  try{actor=await verifySignedActor(bearer.slice(7));}
  catch{return reply(401,{state:'unauthorized'},true);}
  if(!UUID.test(actor?.id||'')||!UUID.test(actor?.sessionId||'')||
    actor.active!==true||actor.verified!==true)
   return reply(401,{state:'unauthorized'},true);
  const body=await readJson(request);
  if(!body||!['read','set'].includes(body.action)||
    !UUID.test(body.boardId||''))
   return reply(400,{state:'invalid'},true);
  if(body.action==='set'&&(!MODES.has(body.mode)||
     !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1))
   return reply(400,{state:'invalid'},true);
  const caller=Object.freeze({id:actor.id,sessionId:actor.sessionId});
  try{
   const raw=body.action==='read'?
    await readAuthorizedPolicy(caller,Object.freeze({boardId:body.boardId})):
    await setAuthorizedPolicy(caller,Object.freeze({
     boardId:body.boardId,mode:body.mode,expectedRevision:body.expectedRevision
    }));
   const safe=validatePolicyReceipt(raw,body.boardId,body.action);
   if(!safe)return reply(409,{state:'unconfirmed'},true);
   return reply(200,safe,true);
  }catch{
   // Do not expose actor, board existence, database errors or internal grants.
   return reply(403,{state:'denied'},true);
  }
 };
}
