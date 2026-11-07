/** CP-TL-03E — opt-in local session revocation acceptance for TradeLink Stage A.
 * After an explicit two-step UI confirmation, verify a genuinely permitted
 * signed manager read, locally sign out once, then retry only the read/list RPC
 * using the old in-memory access token. Never print, copy or persist JWTs.
 * This is NOT approval for domain writes, broad logout or workflow activation.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {TRADELINK_BOARD_ID} from './tradelink-board-items.js';
import {runTradeLinkStageASignedReadOnly} from './tradelink-stage-a-signed-acceptance.js';

export const TL03_REVOKED_SESSION_CHECKPOINT='CP-TL-03E-LOCAL-SESSION-REVOCATION';
const ORIGIN='https://wass-psti.github.io';
const HOST='https://jtlusodorfnyzgyuewkz.supabase.co';
const URL=HOST+'/rest/v1/rpc/tl03_documents_list';
const STATES=new Set(['PASS','FAIL','BLOCKED','INCONCLUSIVE']);
const STAGES=new Set(['prerequisite','manager-preflight-unavailable',
 'token-too-close-to-expiration','local-signout-not-acknowledged',
 'revoked-rpc-denied','revoked-jwt-still-accepted',
 'post-signout-network','expired-during-probe']);
const CHECKS=new Set(['signed-identity','effective-access','document-list',
 'missing-document-read','wrong-board-denial','stable-session']);
const safe=(value,values,other)=>values.has(value)?value:other;

function result(status,stage,{preflight=false,logout=false,httpStatus=null}={}){
 const pass=status==='PASS'&&stage==='revoked-rpc-denied'&&
  preflight===true&&logout===true&&[401,403].includes(httpStatus);
 return Object.freeze({
  checkpoint:TL03_REVOKED_SESSION_CHECKPOINT,
  status:safe(status,STATES,'BLOCKED'),
  stage:safe(stage,STAGES,'prerequisite'),
  priorSignedManagerReadVerified:preflight===true,
  localSignoutAcknowledged:logout===true,
  revokedTradeLinkReadDenied:pass,
  denialHttpStatus:[401,403,200].includes(httpStatus)?httpStatus:null,
  logoutScope:'local',domainWritesAttempted:0,identifiersDisclosed:0,
  persistedDocumentContentsDisclosed:0,
  acceptanceBoundary:'ONE_PREVIOUSLY_ALLOWED_MANAGER_TOKEN_DENIED_AFTER_LOCAL_LOGOUT'
 });
}
function jwtExpiration(token){
 if(typeof token!=='string'||token.length<65||token.length>10000)return null;
 try{
  const parts=token.split('.');
  if(parts.length!==3)return null;
  const base64=parts[1].replaceAll('-','+').replaceAll('_','/');
  const claims=JSON.parse(atob(base64+'='.repeat((4-base64.length%4)%4)));
  return Number.isSafeInteger(claims.exp)?claims.exp*1000:null;
 }catch{return null;}
}
function managerPassed(report){
 return report?.status==='PASS'&&report.scenario==='AUTHORIZED_MANAGER'&&
  report.writesAttempted===0&&report.documentsDisclosed===0&&
  Array.isArray(report.checks)&&report.checks.length===CHECKS.size&&
  report.checks.every(c=>CHECKS.has(c?.name)&&c.status==='PASS')&&
  new Set(report.checks.map(c=>c.name)).size===CHECKS.size;
}

/** Only call from the explicitly confirmed Security-page action.
 * Failed prerequisites preserve the current session; no signout occurs.
 */
export async function runTradeLinkLocalSessionRevocation({
 auth,api,origin=globalThis.location?.origin,
 fetchImpl=globalThis.fetch,clock=()=>Date.now(),
 readRunner=runTradeLinkStageASignedReadOnly
}={}){
 if(origin!==ORIGIN||SUPABASE_URL!==HOST||
   typeof SUPABASE_PUBLISHABLE_KEY!=='string'||
   !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(SUPABASE_PUBLISHABLE_KEY)||
   typeof fetchImpl!=='function'||typeof clock!=='function'||
   typeof readRunner!=='function'||typeof auth?.token!=='function'||
   typeof auth?.signOut!=='function'||!api)
  return result('BLOCKED','prerequisite');

 let oldToken=null,expiresAt=null,preflight=false;
 try{
  oldToken=await auth.token();
  expiresAt=jwtExpiration(oldToken);
  if(!expiresAt||expiresAt<=clock()+120000)
   return result('BLOCKED','token-too-close-to-expiration');
  const before=await readRunner({auth,api});
  preflight=managerPassed(before)&&auth.accessToken===oldToken&&
   expiresAt>clock()+120000;
 }catch{/* Do not alter a session when genuine signed preflight is unavailable. */}
 if(!preflight){
  oldToken=null;
  return result('BLOCKED','manager-preflight-unavailable');
 }
 let logout=false;
 try{logout=await auth.signOut({scope:'local'})===true;}
 catch{/* The caller will reconcile local session state; no false PASS. */}
 if(!logout){
  oldToken=null;
  return result('INCONCLUSIVE','local-signout-not-acknowledged',{preflight});
 }
 if(expiresAt<=clock()+30000){
  oldToken=null;
  return result('INCONCLUSIVE','expired-during-probe',{preflight,logout});
 }
 let httpStatus=null;
 try{
  const response=await fetchImpl(URL,{
   method:'POST',mode:'cors',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+oldToken,apikey:SUPABASE_PUBLISHABLE_KEY,
    'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({p_board_id:TRADELINK_BOARD_ID,p_limit:1}),
   signal:AbortSignal.timeout(10000)
  });
  httpStatus=response?.status;
 }catch{
  oldToken=null;
  return result('INCONCLUSIVE','post-signout-network',{preflight,logout});
 }
 oldToken=null;
 if(expiresAt<=clock()+30000)
  return result('INCONCLUSIVE','expired-during-probe',{preflight,logout,httpStatus});
 if(httpStatus===401||httpStatus===403)
  return result('PASS','revoked-rpc-denied',{preflight,logout,httpStatus});
 if(httpStatus===200)
  return result('FAIL','revoked-jwt-still-accepted',{preflight,logout,httpStatus});
 return result('INCONCLUSIVE','post-signout-network',{preflight,logout,httpStatus});
}
export function sanitizeTradeLinkRevocationReport(report){
 const status=safe(report?.status,STATES,'BLOCKED');
 const stage=safe(report?.stage,STAGES,'prerequisite');
 const preflight=report?.priorSignedManagerReadVerified===true;
 const logout=report?.localSignoutAcknowledged===true;
 const httpStatus=[401,403,200].includes(report?.denialHttpStatus)?
  report.denialHttpStatus:null;
 const pass=status==='PASS'&&stage==='revoked-rpc-denied'&&preflight&&
  logout&&report?.revokedTradeLinkReadDenied===true&&
  [401,403].includes(httpStatus);
 return JSON.stringify({
  checkpoint:TL03_REVOKED_SESSION_CHECKPOINT,
  status:status==='PASS'&&!pass?'BLOCKED':status,
  stage,priorSignedManagerReadVerified:preflight,
  localSignoutAcknowledged:logout,revokedTradeLinkReadDenied:pass,
  denialHttpStatus:httpStatus,logoutScope:'local',
  domainWritesAttempted:0,identifiersDisclosed:0,
  persistedDocumentContentsDisclosed:0,
  acceptanceBoundary:'ONE_PREVIOUSLY_ALLOWED_MANAGER_TOKEN_DENIED_AFTER_LOCAL_LOGOUT'
 },null,2);
}
export function renderTradeLinkSessionRevocation({armed=false,report=null}={}){
 const stage=safe(report?.stage,STAGES,'prerequisite');
 const status=safe(report?.status,STATES,'BLOCKED');
 return '<section class="panel" aria-labelledby="tl03-revocation-title">'+
  '<div class="panel-header"><h2 id="tl03-revocation-title">TradeLink · Revoked-session read denial</h2></div>'+
  '<div class="panel-body">'+
  '<p class="muted">TradeLink-specific read-only test, not the Workspace B3 Edge test. Requires a verified TradeLink manager. This test signs out only the CURRENT browser session (scope=local) after a successful signed-read preflight, then requests the TradeLink list once with the old in-memory token. Other sessions are not revoked. You will need to sign in again. No document write, role change or token export.</p>'+
  (armed?'<p><strong>Confirm local sign-out:</strong> The current session will end only if the authorized read preflight passes.</p>'+
   '<button type="button" class="primary" data-action="security-tl03-revoke-run">Confirm: sign out locally and verify TradeLink denial</button>'+
   '<button type="button" class="secondary" data-action="security-tl03-revoke-cancel">Cancel</button>':
   '<button type="button" class="secondary" data-action="security-tl03-revoke-arm">Prepare TradeLink session-revocation test</button>')+
  (report?'<div role="status" aria-live="polite"><strong>TradeLink revocation: '+
   status+'</strong> · '+stage+'</div>':'')+
  '</div></section>';
}
export function renderTradeLinkSignedOutRevocationResult(report){
 const parsed=JSON.parse(sanitizeTradeLinkRevocationReport(report));
 return '<section class="panel" role="status" aria-live="polite" aria-label="TradeLink revocation result">'+
  '<strong>TradeLink revoked-session check: '+parsed.status+'</strong>'+
  '<p>Stage: '+parsed.stage+' · HTTP: '+(parsed.denialHttpStatus??'n/a')+
  ' · Sign out scope: local. No document writes or identifiers exported.</p>'+
  '<button type="button" class="secondary" data-action="security-tl03-revoke-copy">'+
  'Copy nonsecret TradeLink revocation report</button>'+
  '<p>Sign in again to continue using APSYNTRA CRM. This result is kept only in this tab and clears on reload.</p>'+
  '</section>';
}
