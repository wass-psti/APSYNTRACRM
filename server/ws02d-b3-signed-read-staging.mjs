/**
 * CP-WS-02D/B3 — non-deployed, default-OFF signed-read staging boundary.
 * NO invitation issuance, secrets, database mutations or mail delivery.
 *
 * verifySignedActor must check the *real* GoTrue getUser(jwt) and a fresh
 * auth.sessions row, not just decode the JWT. readSignedContext and
 * readSignedModuleAccess must use the CALLER's JWT with a user-scoped
 * Supabase/PostgREST client (RLS); never substitute a service-role client.
 * Calling this with arbitrary injected mocks is not genuine acceptance.
 */
const ALLOWED_ORIGIN='https://wass-psti.github.io';
const JWT=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODULES=Object.freeze([
 'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake','tool-traceability',
 'material-request-hub','aps-aims','employee-eval','charter-navigator'
]);
export const WS02D_B3_SIGNED_READ_STAGING_ENABLED=false;
const CHECKS=Object.freeze([
 'signed-identity','authoritative-workspace',
 'module-access-read','stable-signed-context'
]);

function json(status,body,allowed){
 const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'pragma':'no-cache',
  'vary':'Origin',
  'x-content-type-options':'nosniff'
 };
 if(allowed){
  headers['access-control-allow-origin']=ALLOWED_ORIGIN;
  headers['access-control-allow-methods']='GET, OPTIONS';
  headers['access-control-allow-headers']='authorization';
 }
 return new Response(JSON.stringify(body),{status,headers});
}
function isVerified(actor){
 return Boolean(actor && UUID.test(actor.id) &&
   UUID.test(actor.sessionId) && actor.active===true &&
   actor.verified===true);
}
function scopeMatches(ctx,actor){
 return Boolean(ctx && ctx.user_id===actor.id &&
   UUID.test(ctx.workspace_id) && ctx.profile?.status==='active');
}

/**
 * This is an injectable handler, NOT an HTTP server or mounted Edge Function.
 * It re-verifies the SAME real JWT after module reads to catch invalidated
 * or changed session context during the read, and never returns identifiers.
 */
export function createB3SignedReadStaging({
 enabled=false,verifySignedActor,readSignedContext,
 readSignedModuleAccess
}={}){
 return async function readB3(request){
  const allowed=request instanceof Request &&
    request.headers.get('origin')===ALLOWED_ORIGIN;
  if(!enabled)return json(503,{status:'BLOCKED'},allowed);
  if(!allowed)return json(403,{status:'BLOCKED'},false);
  if(request.method==='OPTIONS')return json(200,{},true);
  if(request.method!=='GET')return json(405,{status:'BLOCKED'},true);
  if(typeof verifySignedActor!=='function' ||
     typeof readSignedContext!=='function' ||
     typeof readSignedModuleAccess!=='function')
   return json(503,{status:'BLOCKED'},true);
  const header=request.headers.get('authorization')||'';
  if(header.length>10007 || !header.startsWith('Bearer ') ||
    !JWT.test(header.slice(7)) || header.length<65)
   return json(401,{status:'BLOCKED'},true);
  const token=header.slice(7);
  let actor;
  try{actor=await verifySignedActor(token);}catch{
   return json(401,{status:'BLOCKED'},true);
  }
  if(!isVerified(actor))return json(401,{status:'BLOCKED'},true);
  let context;
  try{
   context=await readSignedContext(Object.freeze({jwt:token}));
  }catch{return json(503,{status:'BLOCKED'},true);}
  if(!scopeMatches(context,actor))return json(403,{status:'BLOCKED'},true);
  let results;
  try{
   results=await Promise.all(MODULES.map(p_module_id=>
    readSignedModuleAccess(Object.freeze({jwt:token,p_module_id}))));
  }catch{return json(503,{status:'BLOCKED'},true);}
  if(results.length!==MODULES.length||
    !results.every(x=>typeof x==='boolean'))
   return json(503,{status:'BLOCKED'},true);
  let again,updated;
  try{
   again=await verifySignedActor(token);
   updated=await readSignedContext(Object.freeze({jwt:token}));
  }catch{return json(401,{status:'BLOCKED'},true);}
  if(!isVerified(again)||again.id!==actor.id||
    again.sessionId!==actor.sessionId||
    !scopeMatches(updated,actor) ||
    updated.workspace_id!==context.workspace_id)
   return json(401,{status:'BLOCKED'},true);
  return json(200,{
   checkpoint:'CP-WS-02D-B3-SIGNED-READ-PREFLIGHT',
   status:'PASS',
   checks:CHECKS.map(name=>({name,status:'PASS'})),
   moduleProbeCount:MODULES.length,
   authorizedModuleCount:results.filter(Boolean).length,
   domainWritesVerified:0,
   providerDeliveriesVerified:0,
   writesAttempted:0,
   identifiersDisclosed:0,
   acceptanceBoundary:'READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE',
   trustBoundary:'SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ'
  },true);
 };
}
