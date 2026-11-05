/** CP-WS-02D/B3 — user-triggered signed-session READ-ONLY preflight.
 * Cannot certify domain write denial or delivery activation, which remain
 * unavailable while production WS02D role/invitation contracts are dormant.
 * No synthetic identity, JWT copy, provider call or write-capable RPC.
 */
import {validUuid} from './data.js';

export const WS02D_B3_READ_CHECKPOINT='CP-WS-02D-B3-SIGNED-READ-PREFLIGHT';
const MODULES=Object.freeze([
 'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
 'fund-released-tracker','fueltrans','order-intake','tool-traceability',
 'material-request-hub','aps-aims','employee-eval','charter-navigator'
]);
const CHECKS=new Set(['signed-identity','authoritative-workspace',
 'module-access-read','stable-signed-context']);
const STATUSES=new Set(['PASS','FAIL','BLOCKED']);
const check=(name,status)=>({name,status});
function build(checks,moduleProbeCount=0,authorizedModuleCount=0){
 const status=checks.some(x=>x.status==='FAIL')?'FAIL':
  checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PASS';
 return Object.freeze({
  checkpoint:WS02D_B3_READ_CHECKPOINT,status,checks,
  moduleProbeCount,authorizedModuleCount,
  domainWritesVerified:0,providerDeliveriesVerified:0,
  writesAttempted:0,identifiersDisclosed:0
 });
}
export async function runWs02dB3SignedReadPreflight({auth,api}={}){
 if(typeof auth?.getVerifiedUser!=='function'||
    typeof api?.context!=='function'||typeof api?.rpc!=='function')
  return build([check('signed-identity','BLOCKED')]);
 let actor,ctx;
 try{
  actor=await auth.getVerifiedUser();
  ctx=await api.context();
 }catch{
  return build([check('signed-identity','BLOCKED')]);
 }
 if(!validUuid(actor?.id)||auth.userId!==actor.id||
   ctx?.user_id!==actor.id||!validUuid(ctx?.workspace_id)||
   ctx?.profile?.status!=='active')
  return build([check('signed-identity','FAIL')]);
 const checks=[check('signed-identity','PASS'),
  check('authoritative-workspace','PASS')];
 let probes=0,allowed=0;
 try{
  // No p_user_id argument: the RPC uses the signed auth.uid() default.
  const results=await Promise.all(MODULES.map(
   p_module_id=>api.rpc('has_module_access',{p_module_id})
  ));
  probes=results.length;
  const valid=probes===MODULES.length&&
   results.every(x=>typeof x==='boolean');
  if(valid)allowed=results.filter(Boolean).length;
  checks.push(check('module-access-read',valid?'PASS':'FAIL'));
 }catch{
  checks.push(check('module-access-read','BLOCKED'));
 }
 try{
  const nextUser=await auth.getVerifiedUser(),nextCtx=await api.context();
  checks.push(check('stable-signed-context',
   nextUser?.id===actor.id&&auth.userId===actor.id&&
   nextCtx?.user_id===actor.id&&nextCtx?.workspace_id===ctx.workspace_id&&
   nextCtx?.profile?.status==='active'?'PASS':'FAIL'));
 }catch{
  checks.push(check('stable-signed-context','BLOCKED'));
 }
 return build(checks,probes,allowed);
}
const safeStatus=value=>STATUSES.has(value)?value:'BLOCKED';
const safeCount=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max?value:0;
export function sanitizeWs02dB3SignedReport(report){
 return JSON.stringify({
  checkpoint:WS02D_B3_READ_CHECKPOINT,
  status:safeStatus(report?.status),
  checks:(Array.isArray(report?.checks)?report.checks:[]).slice(0,CHECKS.size)
   .filter(x=>CHECKS.has(x?.name))
   .map(x=>({name:x.name,status:safeStatus(x.status)})),
  moduleProbeCount:safeCount(report?.moduleProbeCount,MODULES.length),
  authorizedModuleCount:safeCount(report?.authorizedModuleCount,MODULES.length),
  domainWritesVerified:0,providerDeliveriesVerified:0,writesAttempted:0,
  identifiersDisclosed:0,
  acceptanceBoundary:'READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE'
 },null,2);
}
export function renderWs02dB3SignedPreflight({busy=false,report=null}={}){
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const checks=(Array.isArray(report?.checks)?report.checks:[])
  .filter(x=>CHECKS.has(x?.name));
 return '<section class="panel" aria-labelledby="ws02d-b3-signed-title">'+
  '<div class="panel-header"><h2 id="ws02d-b3-signed-title">B3 · Signed domain read preflight</h2></div>'+
  '<div class="panel-body"><p class="muted">Checks the current GoTrue user, authoritative workspace, '+ 
  '12 existing read-only module-access predicates, and stable signed identity. No writes, '+ 
  'email, role changes or invitation issuance. Passing does not certify Viewer write denial '+ 
  'or trusted delivery.</p>'+
  '<button class="primary" type="button" data-action="security-ws02d-b3-run"'+
  (busy?' disabled':'')+'>'+(busy?'Checking signed access…':'Run B3 signed read preflight')+'</button>'+
  (report?'<div role="status" aria-live="polite"><p><strong>Read preflight: '+
   safe(safeStatus(report.status))+'</strong> · Module predicates: '+
   safe(safeCount(report.moduleProbeCount,MODULES.length))+'/'+MODULES.length+
   '</p><p class="muted">Domain write-denial acceptance: NOT RUN. '+ 
   'Trusted provider delivery: NOT RUN. Production role ceilings remain inactive.</p>'+
   '<div class="table-scroll"><table class="board-table"><thead><tr>'+
   '<th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody>'+
   checks.map(x=>'<tr><td>'+safe(x.name.replaceAll('-',' '))+
    '</td><td>'+safe(safeStatus(x.status))+'</td></tr>').join('')+
   '</tbody></table></div>'+
   '<button type="button" class="secondary" data-action="security-ws02d-b3-copy">'+
   'Copy nonsecret B3 preflight</button></div>':'')+
  '</div></section>';
}
