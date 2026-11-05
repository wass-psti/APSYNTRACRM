/**
 * CP-WS-02D/B3: concrete trusted READ-ONLY adapters for signed GoTrue context.
 * STAGED: not mounted, not deployed, no email, no invitation issuance.
 *
 * Server-only. DB client MUST be trusted backend PostgreSQL, with minimum
 * SELECT capability on auth.sessions/auth.users, profiles and membership.
 * Never expose its credentials or this interface to browsers/public RPCs.
 *
 * Issuance must independently recheck role, session and workspace authority
 * INSIDE its own eventual database transaction; this is only a preflight.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const WS02D_LIVE_READ_ADAPTERS_ENABLED=false;

/** Identity only; never return email, user_metadata or credentials. */
export function createGoTrueUserReader({
 enabled=false,projectUrl,publishableKey,fetchImpl=globalThis.fetch
}={}){
 let origin=null;
 try{
  const url=new URL(projectUrl);
  if(url.protocol==='https:'&&url.username===''&&url.password===''&&
     url.pathname==='/'&&url.search===''&&url.hash===''&&
     /^https:\/\/[a-z0-9-]+\.supabase\.co\/$/.test(url.href)){
   origin=url.origin;
  }
 }catch{ /* fail closed */ }
 return async function getUserForToken(jwt){
  if(enabled!==true||!origin||typeof fetchImpl!=='function'||
     typeof publishableKey!=='string'||publishableKey.length<10||
     publishableKey.length>1500||
     typeof jwt!=='string'||jwt.length>10000||!TOKEN.test(jwt))
   throw new Error('Trusted GoTrue user lookup unavailable');
  let response;
  try{
   response=await fetchImpl(origin+'/auth/v1/user',{
    method:'GET',
    headers:{authorization:'Bearer '+jwt,apikey:publishableKey,accept:'application/json'},
    redirect:'error',
    cache:'no-store',
    signal:AbortSignal.timeout(5000)
   });
  }catch{
   throw new Error('Trusted GoTrue user lookup unavailable');
  }
  if(!response||response.ok!==true)
   throw new Error('Trusted GoTrue user lookup unavailable');
  let identity;
  try{identity=await response.json();}catch{
   throw new Error('Trusted GoTrue user lookup unavailable');
  }
  if(!UUID.test(identity?.id)||identity.is_anonymous===true)
   throw new Error('Trusted GoTrue user lookup unavailable');
  return Object.freeze({
   data:Object.freeze({user:Object.freeze({
    id:identity.id,is_anonymous:identity.is_anonymous===true
   })}),
   error:null
  });
 };
}

/**
 * Constant, parameterized, strictly boolean read-only query. Missing,
 * expired, mismatched, deleted, inactive or membership-less sessions deny.
 */
export const WS02D_ACTIVE_SESSION_SQL=[
 'SELECT EXISTS(',
 ' SELECT 1',
 ' FROM auth.sessions s',
 ' JOIN auth.users u ON u.id=s.user_id',
 ' JOIN public.profiles p ON p.id=u.id',
 ' JOIN public.workspace_members m ON m.user_id=u.id',
 ' WHERE s.id=$2::uuid AND s.user_id=$1::uuid',
 ' AND (s.not_after IS NULL OR s.not_after>now())',
 ' AND u.deleted_at IS NULL',
 " AND p.status='active'",
 ' AND m.active IS TRUE',
 ') AS active'
].join('\n');

export function createLiveSessionAuthority({enabled=false,db}={}){
 return async function assertActiveSession({actorId,sessionId}={}){
  if(enabled!==true||!db||typeof db.query!=='function'||
     !UUID.test(actorId)||!UUID.test(sessionId))
   return false;
  try{
   const result=await db.query(WS02D_ACTIVE_SESSION_SQL,[actorId,sessionId]);
   if(!Array.isArray(result?.rows)||result.rows.length!==1)
    return false;
   return result.rows[0]?.active===true;
  }catch{
   return false;
  }
 };
}
