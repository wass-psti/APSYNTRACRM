import {createB3SignedReadStaging} from './ws02d-b3-signed-read-staging.mjs';
import {createB3UserScopedRpc} from './ws02d-b3-user-scoped-rpc.mjs';
import {createGoTrueUserReader} from './ws02d-gotrue-live-read-adapters.mjs';

/**
 * CP-WS-02D/B3 — SOURCE-ONLY candidate for an approved read-only Edge host.
 * It is NOT deployed or mounted. No privileged PostgreSQL connection, secrets,
 * service_role, new grants, invitation writes or account administration.
 *
 * Existing wm_ws01_list() checks the SIGNED CALLER'S current auth.sessions
 * via private.wm_board_config_session_active(), with authenticated EXECUTE
 * and no direct client access to auth.sessions. This replaces the proposed
 * privileged new database session-reader credential, not JWT verification.
 */
const PROJECT='https://jtlusodorfnyzgyuewkz.supabase.co';
const PUBLISHABLE=/^sb_publishable_[A-Za-z0-9_-]{8,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN=/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const denied=()=>new Error('Signed staging context unavailable');
export const WS02D_B3_EDGE_SIGNED_READ_ENABLED=false;

function verifiedEnvelope(jwt,clock){
 if(typeof jwt!=='string'||jwt.length<65||jwt.length>10000||!TOKEN.test(jwt))
  throw denied();
 try{
  const payload=jwt.split('.')[1];
  if(payload.length>7000)throw denied();
  const base64=payload.replaceAll('-','+').replaceAll('_','/');
  const json=atob(base64+'='.repeat((4-base64.length%4)%4));
  if(json.length>5000)throw denied();
  const c=JSON.parse(json);
  if(!c||Array.isArray(c))throw denied();
  if(c.role!=='authenticated')throw denied();
  if(!UUID.test(c.sub))throw denied();
  if(!UUID.test(c.session_id))throw denied();
  if(c.iss!==PROJECT+'/auth/v1')throw denied();
  if(c.is_anonymous===true)throw denied();
  if(!Number.isSafeInteger(c.exp))throw denied();
  if(c.exp*1000<=clock())throw denied();
  return Object.freeze({id:c.sub,sessionId:c.session_id});
 }catch{throw denied();}
}
function exactlyApprovedProject(projectUrl){
 try{
  const u=new URL(projectUrl);
  return u.origin===PROJECT && u.pathname==='/' && u.search==='' &&
   u.hash==='' && u.username==='' && u.password==='';
 }catch{return false;}
}

/** User JWT in Authorization; publishable key in apikey. No other RPCs. */
export function createB3EdgeSignedReadStaging({
 enabled=false,projectUrl,publishableKey,fetchImpl=globalThis.fetch,
 clock=()=>Date.now()
}={}){
 const ready=enabled===true && exactlyApprovedProject(projectUrl) &&
  typeof publishableKey==='string' && PUBLISHABLE.test(publishableKey) &&
  publishableKey.length<1500 && typeof fetchImpl==='function' &&
  typeof clock==='function';
 const getUser=createGoTrueUserReader({
  enabled:ready,projectUrl,publishableKey,fetchImpl
 });
 const scoped=createB3UserScopedRpc({
  enabled:ready,projectUrl,publishableKey,fetchImpl
 });
 const readActiveMemberCatalog=async(jwt)=>{
  let response;
  try{
   response=await fetchImpl(PROJECT+'/rest/v1/rpc/wm_ws01_list',{
    method:'POST',
    headers:{
     authorization:'Bearer '+jwt,apikey:publishableKey,
     accept:'application/json','content-type':'application/json'
    },
    body:'{}',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(5000)
   });
  }catch{throw denied();}
  if(response?.ok!==true)throw denied();
  const len=response.headers?.get?.('content-length');
  if(len && (!/^\d+$/.test(len)||Number(len)>16384))throw denied();
  let x;
  try{
   const txt=await response.text();
   if(typeof txt!=='string'||txt.length>16384)throw denied();
   x=JSON.parse(txt);
  }catch{throw denied();}
  if(!x||Array.isArray(x)||x.schemaVersion!==1||
     !UUID.test(x.userId)||!UUID.test(x.activeWorkspaceId)||
     !Array.isArray(x.rows)||x.rows.length>128||
     x.rows.filter(row=>row?.active===true).length!==1||
     !x.rows.some(row=>row?.id===x.activeWorkspaceId&&row?.active===true))
   throw denied();
  return Object.freeze({actorId:x.userId,workspaceId:x.activeWorkspaceId});
 };
 const verifySignedActor=async(jwt)=>{
  if(!ready)throw denied();
  const claims=verifiedEnvelope(jwt,clock);
  const response=await getUser(jwt); // GoTrue independently verifies the JWT.
  if(response?.error||response?.data?.user?.id!==claims.id)
   throw denied();
  const member=await readActiveMemberCatalog(jwt);
  if(member.actorId!==claims.id)throw denied();
  // wm_ws01_list() verifies auth.sessions, profile and signed membership
  // for the very same caller JWT. It is re-run after the 12 module probes.
  return Object.freeze({
   id:claims.id,sessionId:claims.sessionId,
   workspaceId:member.workspaceId,active:true,verified:true
  });
 };
 return createB3SignedReadStaging({
  enabled:ready,verifySignedActor,
  readSignedContext:scoped.readSignedContext,
  readSignedModuleAccess:scoped.readSignedModuleAccess
 });
}
