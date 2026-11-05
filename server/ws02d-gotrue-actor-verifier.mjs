/**
 * CP-WS-02D/B3 — backend-only verified GoTrue actor adapter, STAGED / OFF.
 *
 * getUserForToken(token) MUST call the real Supabase Auth getUser(token)
 * endpoint, NOT decode an unverified JWT or use getSession() as proof.
 * assertActiveSession({actorId,sessionId}) MUST independently consult the
 * trusted server-side auth.sessions and active profile/role state.
 *
 * This adapter is not connected to a production Edge Function and cannot
 * issue invitations or use provider credentials. Issuance must still
 * independently recheck caller scope in the database at transaction time.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL=/^[A-Za-z0-9_-]+$/;
export const WS02D_GOTRUE_ACTOR_VERIFIER_ENABLED=false;
const denied=()=>new Error('Signed invitation authentication denied');

/** Decode untrusted metadata only after strict framing; never authenticate it. */
function readClaimEnvelope(jwt){
 if(typeof jwt!=='string'||jwt.length<60||jwt.length>10000)return null;
 const parts=jwt.split('.');
 if(parts.length!==3||parts.some(p=>!p||!BASE64URL.test(p)))return null;
 if(parts[1].length>7000)return null;
 try{
  const body=Buffer.from(parts[1],'base64url');
  if(body.length>5000)return null;
  const claims=JSON.parse(body.toString('utf8'));
  if(!claims||Array.isArray(claims)||typeof claims!=='object'||
     !UUID.test(claims.sub)||!UUID.test(claims.session_id)||
     claims.role!=='authenticated'||
     !Number.isSafeInteger(claims.exp)||claims.exp<=0||
     claims.is_anonymous===true)return null;
  return {id:claims.sub,sessionId:claims.session_id,expiry:claims.exp};
 }catch{return null;}
}

/**
 * Strict default-off adapter to be injected into the existing trusted HTTP
 * boundary as verifySignedActor. The caller is never trusted on declaration.
 * A signed Auth user must match verified JWT claims and a live server session.
 */
export function createGoTrueActorVerifier({
 enabled=false,getUserForToken,assertActiveSession,clock=()=>Date.now()
}={}){
 return async function verifySignedActor(jwt){
  if(enabled!==true||typeof getUserForToken!=='function'||
     typeof assertActiveSession!=='function'||typeof clock!=='function')
   throw denied();
  const claimed=readClaimEnvelope(jwt);
  if(!claimed||claimed.expiry*1000<=clock())throw denied();
  let verified;
  try{
   verified=await getUserForToken(jwt);
  }catch{throw denied();}
  const user=verified?.data?.user;
  if(verified?.error||!user||user.id!==claimed.id||
     user.is_anonymous===true)throw denied();
  let active=false;
  try{
   active=await assertActiveSession(Object.freeze({
    actorId:user.id,sessionId:claimed.sessionId
   }));
  }catch{throw denied();}
  if(active!==true)throw denied();
  return Object.freeze({
   id:user.id,sessionId:claimed.sessionId,active:true,verified:true
  });
 };
}
