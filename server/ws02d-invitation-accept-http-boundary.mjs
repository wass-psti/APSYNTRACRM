/** CP-WS-02D/D: staged recipient acceptance HTTP boundary.
 * A verified recipient must possess the single-use email token. The trusted
 * database adapter MUST execute private.ws02d_accept under this very user's
 * verified signed DB context, not a privileged service-role substitute.
 * Not mounted or enabled on production; contains no project credentials.
 */
const ORIGIN='https://wass-psti.github.io';
const TOKEN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const JWT=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const denied=()=>({state:'denied'});
function respond(status,body,cors){
 return new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0','pragma':'no-cache',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff','vary':'Origin',
  ...(cors?{'access-control-allow-origin':ORIGIN,
   'access-control-allow-methods':'POST, OPTIONS',
   'access-control-allow-headers':'authorization, content-type'}:{})
 }});
}
export function createInvitationAcceptanceBoundary({
 enabled=false,verifySignedActor,acceptForSignedRecipient
}={}){
 return async function handle(request){
  if(!(request instanceof Request))return respond(400,denied(),false);
  const cors=request.headers.get('origin')===ORIGIN;
  if(!enabled)return respond(503,{state:'unavailable'},cors);
  if(!cors)return respond(403,denied(),false);
  if(request.method==='OPTIONS')return respond(200,{state:'preflight'},true);
  if(request.method!=='POST')return respond(405,denied(),true);
  if(typeof verifySignedActor!=='function'||typeof acceptForSignedRecipient!=='function')
   return respond(503,{state:'unavailable'},true);
  if(request.headers.get('content-type')!=='application/json')
   return respond(415,denied(),true);
  const len=request.headers.get('content-length');
  if(len&&(!/^\d+$/.test(len)||Number(len)>512))return respond(413,denied(),true);
  const authorization=request.headers.get('authorization')||'';
  if(authorization.length>10000||!authorization.startsWith('Bearer ')||
     !JWT.test(authorization.slice(7)))return respond(401,denied(),true);
  let actor;
  try{actor=await verifySignedActor(authorization.slice(7));}
  catch{return respond(401,denied(),true);}
  if(!actor||!UUID.test(actor.id)||!UUID.test(actor.sessionId)||
     actor.verified!==true||actor.active!==true)
   return respond(401,denied(),true);
  let body;
  try{
   // Require a trusted content-length limit even for streaming/chunked bodies.
   // Request.text() is bounded by the expected short token wire shape plus a
   // maximal 512-byte input guard, independent of potentially forged headers.
   const reader=request.body?.getReader();
   if(!reader)return respond(400,denied(),true);
   const chunks=[];let total=0;
   try{
    while(true){
     const {done,value}=await reader.read();if(done)break;
     total+=value?.byteLength||0;
     if(total>512)return respond(413,denied(),true);
     if(value)chunks.push(value);
    }
   }finally{reader.releaseLock();}
   const raw=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
   body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }catch{return respond(400,denied(),true);}
  if(!body||Array.isArray(body)||typeof body!=='object'||
     Object.keys(body).length!==1||!TOKEN.test(body.token))
   return respond(400,denied(),true);
  try{
   const receipt=await acceptForSignedRecipient(Object.freeze({
    actorId:actor.id,sessionId:actor.sessionId
   }),body.token);
   if(receipt?.schemaVersion!==1||receipt?.state!=='accepted'||
      !UUID.test(receipt.workspaceId)||receipt.role!=='member'||
      receipt.switched!==false)
    return respond(409,denied(),true);
   // No invitation token, target email, user metadata or membership list.
   return respond(200,{state:'accepted',workspaceId:receipt.workspaceId,
    role:'member',switched:false},true);
  }catch{
   // Uniform denial intentionally prevents token-state/email enumeration.
   return respond(403,denied(),true);
  }
 };
}
