/** CP-WS-01C/B2 — user-triggered genuine GoTrue read-only discovery acceptance.
 * No manual JWTs, no impersonation, no workspace writes and no exposure of
 * user IDs, workspace IDs, names, tokens or raw server payloads in reports.
 * This is deliberately separate from WS01_DISCOVERY_ENABLED (general UI).
 */
import {validUuid} from './data.js';
import {normalizeServerWorkspaceCatalog} from './workspace-ui.js';

export const WS01_B2_CHECKPOINT='CP-WS-01C-B2-SIGNED-DISCOVERY';
const CHECK_NAMES=new Set(['signed-identity','workspace-context',
 'server-discovery','membership-catalog','stable-session']);
const STATUS=new Set(['PASS','FAIL','BLOCKED']);
const item=(name,status)=>({name,status});
const result=checks=>{
 const status=checks.some(x=>x.status==='FAIL')?'FAIL':
  checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PASS';
 return {checkpoint:WS01_B2_CHECKPOINT,status,checks,
  signedWorkspaceCount:0,writesAttempted:0,identifiersDisclosed:0};
};
export async function runWs01B2SignedDiscovery({auth,api}={}){
 if(typeof auth?.getVerifiedUser!=='function'||
  typeof api?.context!=='function'||typeof api?.rpc!=='function')
  return result([item('signed-identity','BLOCKED')]);
 let actor,context;
 try{
  actor=await auth.getVerifiedUser();context=await api.context();
 }catch{return result([item('signed-identity','BLOCKED')]);}
 if(!validUuid(actor?.id)||auth.userId!==actor.id||
  !validUuid(context?.workspace_id)||context?.user_id!==actor.id||
  context?.profile?.status!=='active')
  return result([item('signed-identity','FAIL')]);
 const checks=[item('signed-identity','PASS'),item('workspace-context','PASS')];
 let catalog;
 try{
  const raw=await api.rpc('wm_ws01_list',{});
  checks.push(item('server-discovery','PASS'));
  catalog=normalizeServerWorkspaceCatalog(raw,{
   userId:actor.id,workspaceId:context.workspace_id});
  checks.push(item('membership-catalog',
   catalog.status==='SIGNED_MEMBER_DISCOVERY'&&
    catalog.rows.length>=1&&catalog.rows.some(x=>x.id===context.workspace_id&&x.active)?
    'PASS':'FAIL'));
 }catch{
  checks.push(item('server-discovery','BLOCKED'));
  checks.push(item('membership-catalog','BLOCKED'));
 }
 try{
  const after=await auth.getVerifiedUser(),ctx=await api.context();
  checks.push(item('stable-session',
   after?.id===actor.id&&auth.userId===actor.id&&
   ctx?.user_id===actor.id&&ctx?.workspace_id===context.workspace_id&&
   ctx?.profile?.status==='active'?'PASS':'FAIL'));
 }catch{checks.push(item('stable-session','BLOCKED'));}
 const report=result(checks);
 report.signedWorkspaceCount=catalog?.status==='SIGNED_MEMBER_DISCOVERY'?
   catalog.rows.length:0;
 return report;
}
export function sanitizeWs01B2Report(report){
 return JSON.stringify({
  checkpoint:WS01_B2_CHECKPOINT,
  status:STATUS.has(report?.status)?report.status:'BLOCKED',
  checks:(Array.isArray(report?.checks)?report.checks:[]).slice(0,CHECK_NAMES.size)
   .filter(x=>CHECK_NAMES.has(x?.name))
   .map(x=>({name:x.name,status:STATUS.has(x.status)?x.status:'BLOCKED'})),
  signedWorkspaceCount:Number.isSafeInteger(report?.signedWorkspaceCount)&&
   report.signedWorkspaceCount>=0&&report.signedWorkspaceCount<=100?
   report.signedWorkspaceCount:0,
  writesAttempted:0,identifiersDisclosed:0
 },null,2);
}
export function renderWs01B2SignedAcceptance({busy=false,report=null}={}){
 const checks=Array.isArray(report?.checks)?report.checks.filter(x=>CHECK_NAMES.has(x.name)):[];
 const label=STATUS.has(report?.status)?report.status:'NOT RUN';
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 return '<section class="panel" aria-labelledby="ws01-b2-signed-title">'+
  '<div class="panel-header"><h2 id="ws01-b2-signed-title">Workspaces · B2 signed discovery acceptance</h2></div>'+
  '<div class="panel-body"><p class="muted">Checks the current genuine GoTrue session, '+
  'server-authorized workspace membership discovery, and session continuity. '+
  'No record changes, permission changes, workspace names, account identifiers or tokens are exported.</p>'+
  '<button class="primary" type="button" data-action="security-ws01-b2-run"'+
   (busy?' disabled':'')+'>'+(busy?'Checking signed memberships…':'Run B2 signed read checks')+'</button>'+
  (report?'<div role="status" aria-live="polite"><p><strong>Result: '+
   safe(label)+'</strong> · Verified signed memberships: '+
   (Number.isSafeInteger(report.signedWorkspaceCount)?report.signedWorkspaceCount:0)+'</p>'+
   '<div class="table-scroll"><table class="board-table"><thead><tr>'+
   '<th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody>'+
   checks.map(x=>'<tr><td>'+safe(x.name.replaceAll('-',' '))+'</td><td>'+
    safe(STATUS.has(x.status)?x.status:'BLOCKED')+'</td></tr>').join('')+
   '</tbody></table></div><p class="muted">Zero writes. This result certifies only '+
   'the current signed user; foreign-workspace and revoked-session browser tests are separate.</p>'+
   '<button type="button" class="secondary" data-action="security-ws01-b2-copy">Copy nonsecret result</button></div>':'')+
  '</div></section>';
}
