/** Guard CP-FRT-SEC10 real mutations to an explicitly designated isolated project.
 * Never run this workflow against the existing APSYNTRA CRM production backend.
 */
export const PRODUCTION_REF='jtlusodorfnyzgyuewkz';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUuid(value,label){
 if(typeof value!=='string'||!uuid.test(value))throw Error('INVALID_'+label);
 return value;
}
export function liveConfig(env){
 if(env.SEC10_CONFIRM_ISOLATED_MUTATIONS!=='ISOLATED_NONPRODUCTION_ONLY')
  throw Error('ISOLATED_MUTATIONS_CONFIRMATION_REQUIRED');
 const ref=String(env.SEC10_PROJECT_REF||'').trim();
 if(!/^[a-z0-9]{20}$/.test(ref)||ref===PRODUCTION_REF)
  throw Error('NONPRODUCTION_PROJECT_REQUIRED');
 let parsed;
 try{parsed=new URL(String(env.SEC10_SUPABASE_URL||''));}
 catch{throw Error('INVALID_SUPABASE_URL');}
 if(parsed.protocol!=='https:'||parsed.hostname!==ref+'.supabase.co'||
  parsed.port||parsed.username||parsed.password||parsed.search||parsed.hash||
  !['','/'].includes(parsed.pathname))
  throw Error('PROJECT_URL_MISMATCH');
 const ws=requireUuid(env.SEC10_WORKSPACE_ID,'WORKSPACE');
 const board=requireUuid(env.SEC10_BOARD_ID,'BOARD');
 const k=String(env.SEC10_PUBLISHABLE_KEY||'').trim();
 if(!k.startsWith('sb_publishable_')||k.length<25)throw Error('PUBLISHABLE_KEY_REQUIRED');
 const ae=String(env.SEC10_BOOTSTRAP_EMAIL||'').trim();
 const me=String(env.SEC10_MEMBER_EMAIL||'').trim();
 const ap=String(env.SEC10_BOOTSTRAP_PASSWORD||'');
 const mp=String(env.SEC10_MEMBER_PASSWORD||'');
 if(!ae.includes('@')||!me.includes('@')||ae.toLowerCase()===me.toLowerCase()||!ap||!mp)
  throw Error('TWO_EXISTING_ACCOUNT_CREDENTIALS_REQUIRED');
 return Object.freeze({url:parsed.origin,ref,workspaceId:ws,boardId:board,
  publishableKey:k,bootstrapEmail:ae,bootstrapPassword:ap,
  memberEmail:me,memberPassword:mp});
}
export function jwtSessionId(token){
 if(typeof token!=='string'||token.split('.').length!==3)throw Error('SIGNED_JWT_REQUIRED');
 let c;
 try{c=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
 catch{throw Error('INVALID_JWT_CLAIMS');}
 if(!uuid.test(c?.session_id||'')||!uuid.test(c?.sub||'')||
    !Number.isSafeInteger(c?.iat)||!Number.isSafeInteger(c?.exp)||c.exp<=c.iat)
  throw Error('JWT_SESSION_PROOF_UNAVAILABLE');
 // Claims are used only for issuance lineage after the GoTrue user verification;
 // never authorize roles using client-decoded JWT data.
 return {sessionId:c.session_id,userId:c.sub,issuedAt:c.iat,expiresAt:c.exp};
}
export function sanitizedResult(r){
 return JSON.stringify({checkpoint:'CP-FRT-SEC10',status:r.status,
  reason:r.reason||null,steps:r.steps||[],transitionCount:r.transitionCount||0,
  verifiedSessionCount:r.verifiedSessionCount||0,
  writesAttempted:r.mutationAttempts||0,
  roleChangesAttempted:r.mutationAttempts||0,
  independentAuditVerified:false,
  productionEnvironment:false,tokenExposed:false},null,2);
}
