/** Phase A — dedicated board registry and operational readiness UI.
 * Verified statuses always come from live, authorized RPC responses.
 */
import {BOARD_MODULES,boardColumns,BOARD_CONTRACT_VERSION} from './board-manifest.js';
import {summarizeFoundation} from './board-foundation.js';
import {foundationIcon} from './foundation-visuals.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFoundation({rows=[],loading=false,provisioning=false,testing=false,testResult=null,log=[],error='',canProvision=false}={}){
 const summary=summarizeFoundation(rows);
 const found=new Map(rows.map(r=>[r.module.key,r]));
 let html='<div class="aps-foundation"><section class="page-head foundation-hero foundation-entrance" aria-labelledby="foundation-page-title">'+
  '<div class="foundation-hero-copy"><span class="label-top"><span class="foundation-hero-dot" aria-hidden="true"></span> Workspace / Integration foundation</span>'+
  '<h1 id="foundation-page-title">12 application boards<span class="foundation-heading-stop">.</span></h1><p>Board infrastructure and contracts only. Application workflow acceptance comes later.</p></div>'+
  '<div class="head-actions"><button type="button" class="secondary foundation-refresh" data-action="foundation-refresh" '+(loading||provisioning?'disabled':'')+'>'+foundationIcon('refresh')+'<span>Check live readiness</span></button></div>'+
  '<svg class="foundation-hero-art" viewBox="0 0 470 230" aria-hidden="true" focusable="false" fill="none">'+
   '<circle cx="390" cy="28" r="126" stroke="currentColor" stroke-opacity=".14"/>'+
   '<circle cx="390" cy="28" r="183" stroke="currentColor" stroke-opacity=".06"/>'+
   '<path d="M165 233C253 55 359 91 477 123" stroke="currentColor" stroke-opacity=".14"/>'+
   '<circle cx="258" cy="87" r="4" fill="#9eece6" fill-opacity=".8"/>'+
  '</svg></section>';
 html+='<section class="stat-grid foundation-stats foundation-entrance" aria-label="Foundation readiness statistics">'+
  '<div class="stat-card foundation-stat-ready"><span class="foundation-stat-icon">'+foundationIcon('grid')+'</span><div class="stat-label">Dedicated boards verified</div><div class="stat-value">'+summary.ready+' / 12</div><div class="stat-footer">Signed PostgreSQL board RPC checks</div></div>'+
  '<div class="stat-card foundation-stat-missing"><span class="foundation-stat-icon">'+foundationIcon('missing')+'</span><div class="stat-label">Still missing</div><div class="stat-value">'+summary.missing+'</div><div class="stat-footer">No fabricated board records</div></div>'+
  '<div class="stat-card foundation-stat-blocked"><span class="foundation-stat-icon">'+foundationIcon('warning')+'</span><div class="stat-label">Configuration problems</div><div class="stat-value">'+summary.blocked+'</div><div class="stat-footer">Mismatch / denied / duplicate</div></div>'+
  '<div class="stat-card foundation-stat-version"><span class="foundation-stat-icon">'+foundationIcon('layers')+'</span><div class="stat-label">Contract version</div><div class="stat-value">v'+BOARD_CONTRACT_VERSION+'</div><div class="stat-footer">Per-module typed schemas</div></div></section>';
 html+='<section class="panel foundation-operations foundation-entrance" aria-labelledby="foundation-operations-title">'+
  '<div class="panel-header"><span class="foundation-panel-icon" aria-hidden="true">'+foundationIcon('database')+'</span><h2 id="foundation-operations-title">Provisioning and acceptance boundary</h2></div><div class="panel-body">'+
  '<div class="note">Phase A provisions empty, distinct boards using existing signed Work Management RPCs. It does not import source records, simulate attendance, invent GPS coordinates or certify the twelve application workflows. Only the authenticated platform administrator can request provisioning.</div>'+
  '<p class="muted csp-u034" >Names and typed columns are checked against live PostgreSQL responses. Existing archived or unrelated boards are never renamed or modified. Source identity/revision columns are contract placeholders until Phase B integration implements deduplicated projection.</p>'+
  '<button type="button" class="primary foundation-provision-button" data-action="foundation-provision" '+(!canProvision||loading||provisioning?'disabled':'')+'>'+
  (provisioning?'Creating and verifying boards…':'＋ Provision missing dedicated boards')+'</button>'+
  (!canProvision?'<p class="muted csp-u027" >Provisioning requires the existing platform administrator role.</p>':'')+
  (summary.ready===12?
   '<div class="csp-u051 foundation-operational-section" >'+
   '<h3 class="csp-u037" >Signed nonproduction operational acceptance</h3>'+
   '<p class="muted csp-u027" >Creates and removes one unique QA item in each EMPTY dedicated board; verifies persisted cells, conditional updates, stale-write denial and authenticated audit events. No existing records are modified. This is not application acceptance.</p>'+
   '<button type="button" class="secondary foundation-qa-button" data-action="foundation-operational-test" '+
   (!canProvision||testing||provisioning?'disabled':'')+'>'+
   (testing?'Running controlled checks…':'Run 12-board operational checks')+'</button></div>':'' )+
  (testResult?renderOperationalResult(testResult):'')+
  (error?'<div class="error-banner csp-u045" role="alert" >'+esc(error)+'</div>':'')+
  (log.length?'<p class="muted csp-u030" >Current operation: '+esc(log.at(-1))+'</p>':'')+
  '</div></section>';
 html+='<div class="section-header foundation-heading foundation-entrance"><span class="section-title">Module-to-board readiness</span><span class="muted csp-u027" >'+(loading?'Checking live backend…':'No application data created')+'</span></div>'+
 '<section class="panel foundation-table-panel foundation-entrance" aria-label="Module-to-board readiness table"><div class="table-scroll foundation-table-scroll"><table class="board-table foundation-readiness-table"><caption class="foundation-visually-hidden">Module-to-board readiness</caption><thead><tr>'+
 '<th scope="col">Domain module</th><th scope="col">Expected fields</th><th scope="col">Board contract</th><th scope="col">Record source</th></tr></thead><tbody>';
 for(const module of BOARD_MODULES){
  const row=found.get(module.key);
  const status=row?.status??'pending';
  const colour=status==='ready'?'done':status==='missing'?'todo':'blocked';
  html+='<tr><td><strong>'+esc(module.name)+'</strong><div class="csp-u021" >'+esc(module.recordType)+'</div></td>'+
  '<td>'+boardColumns(module).length+' typed columns<div class="csp-u012" >'+module.restricted.length+' protected source fields deferred</div></td>'+
  '<td><span class="status '+colour+'">'+esc(status.toUpperCase())+'</span><div class="muted csp-u024" >'+esc(row?.note||'Awaiting live inspection')+'</div></td>'+
  '<td>'+(row?.status==='ready'?'<a class="inline-link foundation-board-link" href="#/boards/'+esc(row.boardId)+'">Open verified board</a>':
  '<span class="csp-u013" >No certified source projection</span>')+'</td></tr>';
 }
 html+='</tbody></table></div></section>';
 html+='<div class="note security-note csp-u052 foundation-security-note" role="note"><span class="foundation-note-icon" aria-hidden="true">'+foundationIcon('shield')+'</span><p>TimeTracker and other restricted domains: do not expose employee identifiers, exact attendance times, GPS coordinates, finance, medical or performance fields through general board columns until backend-enforced field-level authorization and approved retention controls are implemented. No signed live CRUD or cross-workspace test is claimed by this page until separately executed.</p></div>';
 return html+'</div>';
}

/** Distinct, persistent-to-the-current-tab check report. Never mark an unrun board PASS. */
export function renderOperationalResult(report){
 const completed=new Map((report?.results??[]).map(r=>[r.module,r]));
 let html='<section class="csp-u049" aria-label="12-board operational acceptance report" >'+
  '<h3 class="csp-u037" >Signed operational acceptance: '+esc(String(report?.status??'pending').toUpperCase())+
  ' — '+Number(report?.passed??0)+'/12 boards passed</h3>'+
  '<p class="muted csp-u027" >A ready board is not automatically an accepted board. Each PASS must contain five signed CRUD/CAS/audit steps and confirmed QA cleanup.</p>'+
  '<div class="table-scroll"><table class="board-table"><thead><tr><th>Dedicated board</th><th>Operational status</th><th>Verified steps</th><th>QA cleanup</th></tr></thead><tbody>';
 for(const m of BOARD_MODULES){
  const result=completed.get(m.key);
  const passed=result?.status==='pass'&&result?.steps?.length===5&&result?.cleaned===true;
  const failed=!!result&&!passed;
  html+='<tr><td><strong>'+esc(m.name)+'</strong></td><td><span class="status '+(passed?'done':failed?'blocked':'todo')+'">'+
   (passed?'PASS':failed?'FAILED':'NOT RUN')+'</span></td>'+
   '<td>'+esc(result?.steps?.length??0)+'/5'+
   (result?.steps?.length?'<div class="muted csp-u024" >'+
     result.steps.map(x=>esc(x)).join(' · ')+'</div>':'')+
   (result?.error?'<div class="error-banner csp-u055" role="alert" >'+esc(result.error)+'</div>':'')+
   '</td><td>'+(!result?'Not attempted':result.cleaned?'Confirmed removed':
      'Not confirmed — inspect QA item before retry')+'</td></tr>';
 }
 html+='</tbody></table></div>'+
 '<p class="muted csp-u023" >This signed UI report is not independent SQL evidence. A 12/12 PASS still requires database-side event reconciliation and separate negative authorization evidence.</p></section>';
 return html;
}
