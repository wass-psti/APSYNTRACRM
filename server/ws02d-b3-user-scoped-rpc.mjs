/**
 * CP-WS-02D/B3 — staged, READ-ONLY user-scoped PostgREST bridge.
 * Reuses the exact two RPCs on the existing APSYNTRA signed frontend:
 * wm_auth_access_context and has_module_access(p_module_id).
 *
 * The caller's *verified* GoTrue JWT is forwarded only to its project's
 * PostgREST API. Never replace it with service_role, secret, administrator
 * RPC or user-metadata authorization. This module is not deployed/mounted.
 */
const HOST=/^https:\/\/jtlusodorfnyzgyuewkz\.supabase\.co$/;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{8,}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODULES=Object.freeze(new Set([
 'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake','tool-traceability',
 'material-request-hub','aps-aims','employee-eval','charter-navigator'
]));
export const WS02D_B3_SCOPED_RPC_ENABLED=false;

export function createB3UserScopedRpc({
 enabled=false,projectUrl,publishableKey,fetchImpl=globalThis.fetch
}={}){
 let origin=null;
 try{
  const u=new URL(projectUrl);
  if(HOST.test(u.origin)&&u.pathname==='/'&&!u.search&&!u.hash&&
     !u.username&&!u.password)origin=u.origin;
 }catch{ /* reject invalid configuration */ }

 async function rpc(jwt,name,body){
  if(enabled!==true||!origin||typeof fetchImpl!=='function'||
   typeof publishableKey!=='string'||!PUB.test(publishableKey)||
   publishableKey.length>1500||typeof jwt!=='string'||
   jwt.length>10000||!JWT.test(jwt))
   throw Error('Signed scoped read unavailable');
  let response;
  try{
   response=await fetchImpl(origin+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{
     authorization:'Bearer '+jwt,apikey:publishableKey,
     accept:'application/json','content-type':'application/json'
    },
    body:JSON.stringify(body),redirect:'error',
    cache:'no-store',signal:AbortSignal.timeout(5000)
   });
  }catch{throw Error('Signed scoped read unavailable');}
  if(response?.ok!==true)throw Error('Signed scoped read unavailable');
  // Do not parse unbounded JSON, even on a trusted project endpoint.
  const len=response.headers?.get?.('content-length');
  if(len&&(!/^\d+$/.test(len)||Number(len)>8192))
   throw Error('Signed scoped read unavailable');
  let value;
  try{
   const text=await response.text();
   if(typeof text!=='string'||text.length>8192)throw Error();
   value=JSON.parse(text);
  }catch{throw Error('Signed scoped read unavailable');}
  return value;
 }
 return Object.freeze({
  readSignedContext:async({jwt}={})=>{
   const x=await rpc(jwt,'wm_auth_access_context',{});
   if(!x||Array.isArray(x)||!UUID.test(x.user_id)||
      !UUID.test(x.workspace_id)||x.profile?.status!=='active')
    throw Error('Signed scoped read unavailable');
   return Object.freeze({
    user_id:x.user_id,workspace_id:x.workspace_id,
    profile:Object.freeze({status:'active'})
   });
  },
  readSignedModuleAccess:async({jwt,p_module_id}={})=>{
   if(!MODULES.has(p_module_id))
    throw Error('Signed scoped read unavailable');
   const x=await rpc(jwt,'has_module_access',{p_module_id});
   if(typeof x!=='boolean')throw Error('Signed scoped read unavailable');
   return x;
  }
 });
}
