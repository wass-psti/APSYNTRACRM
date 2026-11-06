/** CP-WS-02D/B3 — user-initiated genuine HTTPS signed-read acceptance.
 * Uses the existing signed AuthClient token ONLY as the authorization header
 * on the exact approved Supabase route. No token copies, storage, synthetic
 * actors, workspace overrides, service-role keys, writes, email or mutation.
 *
 * A PASS only proves this deployed read path for the current signed user.
 * It does NOT certify independent RLS table isolation, revoked-session
 * denial, other users' permissions, cross-actor privacy or B4 switching.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {validUuid} from './data.js';

export const WS02D_B3_HTTPS_CHECKPOINT='CP-WS-02D-B3-DEPLOYED-SIGNED-HTTPS';
const ORIGIN='https://wass-psti.github.io';
const ENDPOINT='https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-ws02d-b3-read';
const SERVER_CHECKPOINT='CP-WS-02D-B3-SIGNED-READ-PREFLIGHT';
const CHECKS=new Set(['signed-identity','authoritative-workspace',
 'module-access-read','stable-signed-context']);
const FIELDS=new Set(['checkpoint','status','checks','moduleProbeCount',
 'authorizedModuleCount','domainWritesVerified','providerDeliveriesVerified',
 'writesAttempted','identifiersDisclosed','acceptanceBoundary','trustBoundary']);
const STAGES=new Set(['prerequisite','identity','network-or-preflight',
 'gateway-denial','application-disabled-or-unavailable','server-contract',
 'session-changed','signed-https-complete']);
const STATES=new Set(['PASS','FAIL','BLOCKED']);
const positiveInt=n=>Number.isSafeInteger(n)&&n>=0&&n<=12;
const safeStage=x=>STAGES.has(x)?x:'prerequisite';
const report=(status,stage,modules=0,allowed=0)=>Object.freeze({
 checkpoint:WS02D_B3_HTTPS_CHECKPOINT,
 status:STATES.has(status)?status:'BLOCKED',stage:safeStage(stage),
 checks:status==='PASS'?Object.freeze([...CHECKS].map(name=>({name,status:'PASS'}))):[],
 moduleProbeCount:status==='PASS'?modules:0,
 authorizedModuleCount:status==='PASS'?allowed:0,
 genuineDeployedReadVerified:status==='PASS',
 independentTableRlsVerified:false,
 crossWorkspaceDenialVerified:false,
 revokedSessionDenialVerified:false,
 domainWritesVerified:0,providerDeliveriesVerified:0,writesAttempted:0,
 identifiersDisclosed:0
});

function validServerResult(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!FIELDS.has(k)))return false;
 if(body.checkpoint!==SERVER_CHECKPOINT||body.status!=='PASS'||
    body.moduleProbeCount!==12||!positiveInt(body.authorizedModuleCount)||
    body.identifiersDisclosed!==0||body.writesAttempted!==0||
    body.domainWritesVerified!==0||body.providerDeliveriesVerified!==0||
    body.acceptanceBoundary!=='READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE'||
    body.trustBoundary!=='SERVER_VERIFIED_GOTRUE_AND_USER_SCOPED_READ')return false;
 if(!Array.isArray(body.checks)||body.checks.length!==CHECKS.size||
    body.checks.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
      Object.keys(x).some(k=>k!=='name'&&k!=='status')||
      !CHECKS.has(x.name)||x.status!=='PASS'))return false;
 return new Set(body.checks.map(x=>x.name)).size===CHECKS.size;
}

export async function runWs02dB3DeployedHttpsAcceptance({
 auth,fetchImpl=globalThis.fetch,
 origin=globalThis.location?.origin
}={}){
 if(origin!==ORIGIN||SUPABASE_URL!=='https://jtlusodorfnyzgyuewkz.supabase.co'||
    typeof SUPABASE_PUBLISHABLE_KEY!=='string'||
    !SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')||
    typeof fetchImpl!=='function'||typeof auth?.getVerifiedUser!=='function'||
    typeof auth?.token!=='function')return report('BLOCKED','prerequisite');

 let actor,token;
 try{
  const user=await auth.getVerifiedUser();
  if(!validUuid(user?.id)||auth.userId!==user.id)
   return report('FAIL','identity');
  actor=user.id;
  token=await auth.token();
  if(typeof token!=='string'||token.length<65||token.length>10000)
   return report('BLOCKED','identity');
 }catch{return report('BLOCKED','identity');}

 let response;
 try{
  response=await fetchImpl(ENDPOINT,{
   method:'GET',mode:'cors',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+token,apikey:SUPABASE_PUBLISHABLE_KEY,
    Accept:'application/json'},
   signal:AbortSignal.timeout(15000)
  });
 }catch{return report('BLOCKED','network-or-preflight');}
 // No raw response or error object ever enters a report.
 if(response?.status===401||response?.status===403)
  return report('BLOCKED','gateway-denial');
 if(response?.status===503)return report('BLOCKED','application-disabled-or-unavailable');
 if(response?.status!==200)return report('BLOCKED','network-or-preflight');
 if(!response.headers?.get('content-type')?.toLowerCase().includes('application/json')||
    !response.headers?.get('cache-control')?.toLowerCase().includes('no-store'))
  return report('FAIL','server-contract');
 const len=response.headers.get('content-length');
 if(len&&(!/^\d+$/.test(len)||Number(len)>4096))
  return report('FAIL','server-contract');

 let body;
 try{
  const text=await response.text();
  if(typeof text!=='string'||text.length>4096)
   return report('FAIL','server-contract');
  body=JSON.parse(text);
 }catch{return report('FAIL','server-contract');}
 if(!validServerResult(body))return report('FAIL','server-contract');

 try{
  const after=await auth.getVerifiedUser();
  if(!after||after.id!==actor||auth.userId!==actor)
   return report('FAIL','session-changed');
 }catch{return report('BLOCKED','session-changed');}
 return report('PASS','signed-https-complete',
  body.moduleProbeCount,body.authorizedModuleCount);
}

export function sanitizeWs02dB3DeployedHttpsReport(input){
 const status=STATES.has(input?.status)?input.status:'BLOCKED';
 const valid=status==='PASS'&&input?.genuineDeployedReadVerified===true&&
  input?.moduleProbeCount===12&&positiveInt(input?.authorizedModuleCount);
 return JSON.stringify({
  checkpoint:WS02D_B3_HTTPS_CHECKPOINT,
  status:valid?'PASS':status==='PASS'?'BLOCKED':status,
  stage:safeStage(input?.stage),
  genuineDeployedReadVerified:valid,
  moduleProbeCount:valid?12:0,
  authorizedModuleCount:valid?input.authorizedModuleCount:0,
  independentTableRlsVerified:false,
  crossWorkspaceDenialVerified:false,
  revokedSessionDenialVerified:false,
  writesAttempted:0,identifiersDisclosed:0,
  acceptanceBoundary:'SIGNED_READ_ONLY_NO_RLS_ISOLATION_OR_REVOCATION_ATTESTATION'
 },null,2);
}

export function renderWs02dB3DeployedHttpsAcceptance({busy=false,result=null}={}){
 const status=STATES.has(result?.status)?result.status:'BLOCKED';
 const stage=safeStage(result?.stage);
 const valid=status==='PASS'&&result?.genuineDeployedReadVerified===true;
 return '<section class="panel" aria-labelledby="ws02d-b3-deployed-title">'+
  '<div class="panel-header"><h2 id="ws02d-b3-deployed-title">B3 · Deployed signed HTTPS acceptance</h2></div>'+
  '<div class="panel-body"><p class="muted">Runs a real GET to the deployed Supabase Edge host '+
  'under your existing signed browser session. Your token is sent only to the pinned '+
  'HTTPS endpoint; it is never copied, displayed or included in reports. '+
  'No database writes or permission changes. A PASS does not certify independent '+
  'table RLS, cross-workspace denial, or revoked sessions.</p>'+
  '<button class="primary" type="button" data-action="security-ws02d-b3-https-run"'+
  (busy?' disabled':'')+'>'+(busy?'Checking deployed signed HTTPS…':'Run deployed B3 signed HTTPS check')+'</button>'+
  (result?'<div role="status" aria-live="polite"><p><strong>Deployed HTTPS: '+
  status+'</strong> · Stage: '+stage+'</p>'+
  '<p class="muted">Verified module predicates: '+(valid?12:0)+'/12. '+
  'Independent table RLS, cross-workspace and revoked-session denials: NOT VERIFIED.</p>'+
  '<button type="button" class="secondary" data-action="security-ws02d-b3-https-copy">'+
  'Copy nonsecret deployed HTTPS result</button></div>':'')+
  '</div></section>';
}
