/**
 * CP-WS-02D/B3: explicit, user-confirmed LOCAL sign-out then replay
 * of the SAME previously accepted JWT to the pinned read-only Edge host.
 *
 * This action revokes ONLY the current signed session, never all sessions,
 * and must be user-triggered with an explicit second confirmation.
 * It never logs, persists, copies or returns the token or account identifiers.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {runWs02dB3DeployedHttpsAcceptance} from './workspace-b3-deployed-https-acceptance.js';

export const WS02D_B3_REVOKED_SESSION_CHECKPOINT='CP-WS-02D-B3-LOCAL-SESSION-REVOCATION';
const ORIGIN='https://wass-psti.github.io';
const HOST='https://jtlusodorfnyzgyuewkz.supabase.co';
const ENDPOINT=HOST+'/functions/v1/apsyntra-ws02d-b3-read';
const STATES=new Set(['PASS','FAIL','BLOCKED','INCONCLUSIVE']);
const STAGES=new Set(['prerequisite','verified-prior-read-unavailable',
 'local-signout-not-acknowledged','revoked-session-denied',
 'revoked-jwt-still-accepted','post-signout-network','signed-out-no-old-jwt',
 'token-too-close-to-expiration']);
const safe=(v,set,otherwise)=>set.has(v)?v:otherwise;

function summary(status,stage,acknowledged=false){
 const pass=status==='PASS'&&stage==='revoked-session-denied'&&acknowledged===true;
 return Object.freeze({
  checkpoint:WS02D_B3_REVOKED_SESSION_CHECKPOINT,
  status:safe(status,STATES,'BLOCKED'),stage:safe(stage,STAGES,'prerequisite'),
  priorGenuineSignedReadVerified:pass,
  localSignoutAcknowledged:acknowledged===true,
  revokedSessionDenialVerified:pass,
  foreignWorkspaceDenialVerified:false,
  independentTableRlsVerified:false,
  currentSessionTerminated:acknowledged===true,
  logoutScope:'local',
  authSessionLogoutAttempts:1,
  domainWritesAttempted:0,identifiersDisclosed:0,
  acceptanceBoundary:'ONE_PREVIOUSLY_VALID_JWT_REJECTED_AFTER_LOCAL_LOGOUT_ONLY'
 });
}

function validJwtWithRoom(token,clock){
 if(typeof token!=='string'||token.length<65||token.length>10000)return false;
 try{
  const parts=token.split('.');
  if(parts.length!==3)return false;
  const payload=parts[1].replaceAll('-','+').replaceAll('_','/');
  const obj=JSON.parse(atob(payload+'='.repeat((4-payload.length%4)%4)));
  return Number.isSafeInteger(obj.exp)&&obj.exp*1000>clock()+30000;
 }catch{return false;}
}

/** Invoked ONLY by an operator's explicitly armed local-logout action. */
export async function runWs02dB3LocalSessionRevocation({
 auth,fetchImpl=globalThis.fetch,origin=globalThis.location?.origin,
 clock=()=>Date.now(),
 readRunner=runWs02dB3DeployedHttpsAcceptance
}={}){
 if(origin!==ORIGIN||SUPABASE_URL!==HOST||
    typeof SUPABASE_PUBLISHABLE_KEY!=='string'||
    !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(SUPABASE_PUBLISHABLE_KEY)||
    typeof fetchImpl!=='function'||typeof readRunner!=='function'||
    typeof clock!=='function'||typeof auth?.token!=='function'||
    typeof auth?.signOut!=='function')
  return summary('BLOCKED','prerequisite');

 let jwt=null,validBefore=false,hasRoom=false;
 try{
  jwt=await auth.token();
  hasRoom=validJwtWithRoom(jwt,clock);
  if(hasRoom){
   const before=await readRunner({auth,origin,fetchImpl});
   validBefore=before?.status==='PASS'&&
    before?.genuineDeployedReadVerified===true&&
    auth.accessToken===jwt;
  }
 }catch{/* User's local logout still proceeds if read verification is unavailable. */}
 let acknowledged=false;
 try{acknowledged=await auth.signOut({scope:'local'})===true;}
 catch{/* Signing out is intentionally best-effort; no false revocation PASS. */}
 if(!acknowledged){
  jwt=null;
  return summary('INCONCLUSIVE','local-signout-not-acknowledged',false);
 }
 if(!hasRoom){
  jwt=null;
  return summary('INCONCLUSIVE','token-too-close-to-expiration',true);
 }
 if(!validBefore){
  jwt=null;
  return summary('INCONCLUSIVE','verified-prior-read-unavailable',true);
 }
 let status=null;
 try{
  const response=await fetchImpl(ENDPOINT,{
   method:'GET',mode:'cors',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+jwt,apikey:SUPABASE_PUBLISHABLE_KEY,
    Accept:'application/json'},
   signal:AbortSignal.timeout(10000)
  });
  status=response?.status;
 }catch{
  jwt=null;
  return summary('INCONCLUSIVE','post-signout-network',true);
 }
 jwt=null;
 if(status===401)return summary('PASS','revoked-session-denied',true);
 if(status===200)return summary('FAIL','revoked-jwt-still-accepted',true);
 return summary('INCONCLUSIVE','post-signout-network',true);
}

export function sanitizeWs02dB3LocalRevocationReport(input){
 const status=safe(input?.status,STATES,'BLOCKED');
 const verified=status==='PASS'&&input?.revokedSessionDenialVerified===true&&
  input?.localSignoutAcknowledged===true&&
  input?.priorGenuineSignedReadVerified===true;
 return JSON.stringify({
  checkpoint:WS02D_B3_REVOKED_SESSION_CHECKPOINT,
  status:status==='PASS'&&!verified?'BLOCKED':status,
  stage:safe(input?.stage,STAGES,'prerequisite'),
  priorGenuineSignedReadVerified:verified,
  localSignoutAcknowledged:input?.localSignoutAcknowledged===true,
  revokedSessionDenialVerified:verified,
  foreignWorkspaceDenialVerified:false,
  independentTableRlsVerified:false,
  logoutScope:'local',authSessionLogoutAttempts:1,
  domainWritesAttempted:0,identifiersDisclosed:0,
  acceptanceBoundary:'ONE_PREVIOUSLY_VALID_JWT_REJECTED_AFTER_LOCAL_LOGOUT_ONLY'
 },null,2);
}

export function renderWs02dB3LocalRevocation({
 armed=false,report=null
}={}){
 const state=safe(report?.status,STATES,'BLOCKED');
 const stage=safe(report?.stage,STAGES,'prerequisite');
 return '<section class="panel" aria-labelledby="ws02d-b3-revoke-title">'+
  '<div class="panel-header"><h2 id="ws02d-b3-revoke-title">B3 · Revoked-session denial acceptance</h2></div>'+
  '<div class="panel-body"><p class="muted">This intentionally signs out ONLY the CURRENT '+
  'browser session (scope=local), not other devices. The previous JWT is used '+
  'in memory for a single read-only denial test and is never copied or stored. '+
  'You must sign in again afterward. No account, workspace or RLS changes.</p>'+
  (armed?'<p><strong>Confirm current-session logout:</strong> This terminates '+
   'your present session and tests denial of its old JWT.</p>'+
   '<button class="primary" type="button" data-action="security-ws02d-b3-revoke-run">'+
    'Confirm: locally sign out and test revoked JWT</button>'+
   '<button class="secondary" type="button" data-action="security-ws02d-b3-revoke-cancel">'+
    'Cancel</button>':
   '<button class="secondary" type="button" data-action="security-ws02d-b3-revoke-arm">'+
    'Prepare current-session revocation test</button>')+
  (report?'<div role="status" aria-live="polite"><p><strong>Revocation: '+
   state+'</strong> · '+stage+'</p>'+
   '<p class="muted">Only a previously accepted JWT denied after an acknowledged '+
   'local logout qualifies as PASS.</p>'+
   '<button type="button" class="secondary" data-action="security-ws02d-b3-revoke-copy">'+
    'Copy nonsecret session-revocation result</button></div>':'')+
  '</div></section>';
}
