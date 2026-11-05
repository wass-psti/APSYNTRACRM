/** CP-TL-03C Stage A — real signed-session read-only acceptance.
 * Runs only by explicit user click against the current GoTrue bearer.
 * No synthetic sessions, impersonation, record content in reports, or write RPCs.
 */
import {validUuid} from './data.js';
import {TRADELINK_BOARD_ID} from './tradelink-board-items.js';
import {inspectMySignedEffectiveAccess} from './signed-effective-access.js';

export const TL03_STAGE_A_CHECKPOINT='CP-TL-03C-STAGE-A-SIGNED-READ';
const OUTCOMES=new Set(['PASS','FAIL','BLOCKED']);
const SCENARIOS=new Set(['AUTHORIZED_MANAGER','MODULE_ROLE_DENIED',
 'BOARD_MANAGER_DENIED','FOREIGN_WORKSPACE_DENIED','UNVERIFIED']);
const TARGET_WORKSPACE='00000000-0000-4000-8000-000000000001';
const WRONG_BOARD='00000000-0000-4000-8000-000000000002';
const SAFE_CHECKS=new Set(['signed-identity','effective-access','document-list',
 'missing-document-read','wrong-board-denial','stable-session']);
const entry=(name,status,detail)=>({name,status,detail});
const deny=e=>[401,403].includes(e?.status)||e?.code==='42501';
const finish=(checks,scenario='UNVERIFIED')=>{
 const status=checks.some(x=>x.status==='FAIL')?'FAIL':
  checks.some(x=>x.status==='BLOCKED')?'BLOCKED':'PASS';
 return {checkpoint:TL03_STAGE_A_CHECKPOINT,status,
  scenario:SCENARIOS.has(scenario)?scenario:'UNVERIFIED',
  checks,writesAttempted:0,documentsDisclosed:0};
};
const invalidClients=()=>finish([
 entry('signed-identity','BLOCKED','Signed GoTrue and board API clients unavailable.')]);
const validList=rows=>Array.isArray(rows)&&rows.length<=1&&
 rows.every(r=>validUuid(r?.documentId)&&validUuid(r?.boardItemId)&&
  typeof r?.documentType==='string'&&Number.isSafeInteger(r?.revision)&&r.revision>=1);
export async function runTradeLinkStageASignedReadOnly({auth,api,createProbeId=()=>globalThis.crypto?.randomUUID?.()}={}){
 if(typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
    typeof api?.rpc!=='function')return invalidClients();
 const checks=[];
 let actor,context;
 try{
  actor=await auth.getVerifiedUser();
  context=await api.context();
 }catch{
  return finish([entry('signed-identity','BLOCKED','Live GoTrue user or workspace could not be verified.')]);
 }
 if(!validUuid(actor?.id)||actor.id!==auth.userId||context?.user_id!==actor.id||
    context?.profile?.status!=='active'||!validUuid(context.workspace_id))
  return finish([entry('signed-identity','FAIL','Verified identity and workspace do not match.')]);
 checks.push(entry('signed-identity','PASS','Current GoTrue identity matches the active workspace.'));

 let scenario='UNVERIFIED';
 try{
  const snapshot=await inspectMySignedEffectiveAccess({auth,api});
  if(snapshot.status!=='PASS'){
   checks.push(entry('effective-access','BLOCKED',
    'Authoritative platform/module/board permissions were not verified.'));
  }else{
   const mod=snapshot.modules.find(x=>x.moduleId==='tradelink');
   const board=snapshot.boards.find(x=>x.id===TRADELINK_BOARD_ID);
   const foreign=context.workspace_id!==TARGET_WORKSPACE;
   if(!mod||typeof mod.allowed!=='boolean'||
      (board&&(!board.view||typeof board.manage!=='boolean'))){
    checks.push(entry('effective-access','FAIL',
     'Authoritative self-access snapshot is incomplete or inconsistent.'));
   }else{
    scenario=foreign?'FOREIGN_WORKSPACE_DENIED':
     !board?.manage?'BOARD_MANAGER_DENIED':
     (mod.role!=='General Manager'||!mod.allowed)?'MODULE_ROLE_DENIED':
     'AUTHORIZED_MANAGER';
    checks.push(entry('effective-access','PASS',
     'Server-authoritative platform ceiling, module role and board access were checked.'));
   }
  }
 }catch{
  checks.push(entry('effective-access','BLOCKED',
   'Authoritative effective-access inspection could not complete.'));
 }
 const expectedAllow=scenario==='AUTHORIZED_MANAGER';
 const expectedDeny=SCENARIOS.has(scenario)&&
  scenario!=='AUTHORIZED_MANAGER'&&scenario!=='UNVERIFIED';
 const classify=(name,error,valid)=>{
  if(!expectedAllow&&!expectedDeny)return entry(name,'BLOCKED',
   'Effective role expectation is unknown; result cannot be certified.');
  if(error){
   return entry(name,deny(error)?(expectedDeny?'PASS':'FAIL'):'BLOCKED',
    deny(error)?(expectedDeny?'Server denied this signed role as required.':
     'Expected authorized manager was denied.'):'Server/network response was inconclusive.');
  }
  return entry(name,valid?(expectedAllow?'PASS':'FAIL'):'FAIL',
   valid?(expectedAllow?'Read-only RPC returned a verified, bounded response.':
     'A signed role without document access unexpectedly received a response.'):
    'Read-only RPC returned an invalid response.');
 };
 try{
  const rows=await api.rpc('tl03_documents_list',{
   p_board_id:TRADELINK_BOARD_ID,p_limit:1
  });
  checks.push(classify('document-list',null,validList(rows)));
 }catch(error){checks.push(classify('document-list',error,false));}
 // The probe uses an unpredictable nonexisting ID, not a production document ID.
 // Never render or copy the resulting document body.
 const randomId=typeof createProbeId==='function'?createProbeId():null;
 if(!validUuid(randomId))checks.push(entry('missing-document-read','BLOCKED',
  'A cryptographically random document ID was unavailable.'));
 else {
  try{
   const response=await api.rpc('tl03_document_read',{
    p_board_id:TRADELINK_BOARD_ID,p_document_id:randomId
   });
   checks.push(classify('missing-document-read',null,response===null));
  }catch(error){checks.push(classify('missing-document-read',error,false));}
 }
 // This checks exact board-ID scope, not a substitute for a genuine
 // foreign-workspace signed account (scenario above).
 try{
  await api.rpc('tl03_documents_list',{p_board_id:WRONG_BOARD,p_limit:1});
  checks.push(entry('wrong-board-denial','FAIL',
   'Stage A allowed a document list for an unrelated board ID.'));
 }catch(error){
  checks.push(entry('wrong-board-denial',deny(error)?'PASS':'BLOCKED',
   deny(error)?'Server refused access to an unrelated board identifier.':
    'Wrong-board response was inconclusive.'));
 }
 try{
  const next=await auth.getVerifiedUser(),ctx=await api.context();
  checks.push(entry('stable-session',
   next?.id===actor.id&&auth.userId===actor.id&&ctx?.user_id===actor.id&&
   ctx?.workspace_id===context.workspace_id&&ctx?.profile?.status==='active'?
    'PASS':'FAIL','Signed identity and workspace reverified after read requests.'));
 }catch{
  checks.push(entry('stable-session','BLOCKED',
   'Session could not be reverified after the read-only checks.'));
 }
 return finish(checks,scenario);
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function sanitizeTradeLinkStageAReport(report){
 const scenario=SCENARIOS.has(report?.scenario)?report.scenario:'UNVERIFIED';
 const checks=Array.isArray(report?.checks)?report.checks.slice(0,SAFE_CHECKS.size)
  .map(c=>({name:SAFE_CHECKS.has(c?.name)?c.name:'invalid-check',
    status:OUTCOMES.has(c?.status)?c.status:'BLOCKED'})):[];
 return JSON.stringify({checkpoint:TL03_STAGE_A_CHECKPOINT,
  status:OUTCOMES.has(report?.status)?report.status:'BLOCKED',scenario,checks,
  writesAttempted:0,documentsDisclosed:0},null,2);
}
export function renderTradeLinkStageAAcceptance({busy=false,report=null}={}){
 const status=OUTCOMES.has(report?.status)?report.status:'NOT RUN';
 const scenario=SCENARIOS.has(report?.scenario)?report.scenario:'UNVERIFIED';
 const checks=Array.isArray(report?.checks)?report.checks.filter(c=>SAFE_CHECKS.has(c?.name)): [];
 return '<section class="panel security-check-panel" aria-labelledby="tl03-stagea-title">'+
  '<div class="panel-header security-panel-header"><h2 id="tl03-stagea-title">TradeLink · Stage A signed read acceptance</h2></div>'+
  '<div class="panel-body"><p class="muted">Use an existing signed account. Checks GoTrue identity, the server-authoritative platform/module/board ceiling, TradeLink document read/list RPCs and wrong-board denial. Read-only: zero uploads, role changes, data writes or record-content exports.</p>'+
  '<p class="muted">Run separately as an authorized TradeLink General Manager, an existing nonmanager, and an existing foreign-workspace account where available. Real expired/revoked-session tests require separate controlled acceptance; this panel does not revoke a session.</p>'+
  '<button type="button" class="primary" data-action="security-tl03-stage-a-run"'+
   (busy?' disabled':'')+'>'+(busy?'Checking signed Stage A access…':'Run Stage A signed read checks')+'</button>'+
  (report?'<div role="status" aria-live="polite"><p><strong>Result: '+escape(status)+'</strong> · '+escape(scenario.replaceAll('_',' '))+'</p>'+
   '<div class="table-scroll"><table class="board-table"><thead><tr><th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody>'+
   checks.map(c=>'<tr><td>'+escape(c.name.replaceAll('-',' '))+'</td><td>'+escape(c.status)+'</td></tr>').join('')+
   '</tbody></table></div><p class="muted">Writes attempted: 0 · Document contents disclosed: 0. A PASS applies only to this genuine signed role/session, not all roles or revocation scenarios.</p>'+
   '<button type="button" class="secondary" data-action="security-tl03-stage-a-copy">Copy nonsecret result</button></div>':'')+
  '</div></section>';
}
