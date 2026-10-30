/** Phase A — dedicated board registry and operational readiness UI.
 * Verified statuses always come from live, authorized RPC responses.
 */
import {BOARD_MODULES,boardColumns,BOARD_CONTRACT_VERSION} from './board-manifest.js';
import {summarizeFoundation} from './board-foundation.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFoundation({rows=[],loading=false,provisioning=false,log=[],error='',canProvision=false}={}){
 const summary=summarizeFoundation(rows);
 const found=new Map(rows.map(r=>[r.module.key,r]));
 let html='<div class="page-head"><div><span class="label-top">Workspace / Integration foundation</span>'+
  '<h1>12 application boards</h1><p>Board infrastructure and contracts only. Application workflow acceptance comes later.</p></div>'+
  '<div class="head-actions"><button class="secondary" data-action="foundation-refresh" '+(loading||provisioning?'disabled':'')+'>↻ Check live readiness</button></div></div>';
 html+='<div class="stat-grid">'+
  '<div class="stat-card"><div class="stat-label">Dedicated boards verified</div><div class="stat-value">'+summary.ready+' / 12</div><div class="stat-footer">Signed PostgreSQL board RPC checks</div></div>'+
  '<div class="stat-card"><div class="stat-label">Still missing</div><div class="stat-value">'+summary.missing+'</div><div class="stat-footer">No fabricated board records</div></div>'+
  '<div class="stat-card"><div class="stat-label">Configuration problems</div><div class="stat-value">'+summary.blocked+'</div><div class="stat-footer">Mismatch / denied / duplicate</div></div>'+
  '<div class="stat-card"><div class="stat-label">Contract version</div><div class="stat-value">v'+BOARD_CONTRACT_VERSION+'</div><div class="stat-footer">Per-module typed schemas</div></div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>Provisioning and acceptance boundary</h3></div><div class="panel-body">'+
  '<div class="note">Phase A provisions empty, distinct boards using existing signed Work Management RPCs. It does not import source records, simulate attendance, invent GPS coordinates or certify the twelve application workflows. Only the authenticated platform administrator can request provisioning.</div>'+
  '<p class="muted" style="font-size:12px;margin:16px 0">Names and typed columns are checked against live PostgreSQL responses. Existing archived or unrelated boards are never renamed or modified. Source identity/revision columns are contract placeholders until Phase B integration implements deduplicated projection.</p>'+
  '<button class="primary" data-action="foundation-provision" '+(!canProvision||loading||provisioning?'disabled':'')+'>'+
  (provisioning?'Creating and verifying boards…':'＋ Provision missing dedicated boards')+'</button>'+
  (!canProvision?'<p class="muted" style="font-size:12px">Provisioning requires the existing platform administrator role.</p>':'')+
  (error?'<div class="error-banner" role="alert" style="margin-top:12px">'+esc(error)+'</div>':'')+
  (log.length?'<p class="muted" style="font-size:12px;margin-top:15px">Current operation: '+esc(log.at(-1))+'</p>':'')+
  '</div></div>';
 html+='<div class="section-header"><span class="section-title">Module-to-board readiness</span><span class="muted" style="font-size:12px">'+(loading?'Checking live backend…':'No application data created')+'</span></div>'+
 '<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr>'+
 '<th>Domain module</th><th>Expected fields</th><th>Board contract</th><th>Record source</th></tr></thead><tbody>';
 for(const module of BOARD_MODULES){
  const row=found.get(module.key);
  const status=row?.status??'pending';
  const colour=status==='ready'?'done':status==='missing'?'todo':'blocked';
  html+='<tr><td><strong>'+esc(module.name)+'</strong><div style="font-size:11px;color:#929bad;font-weight:400;margin-top:6px">'+esc(module.recordType)+'</div></td>'+
  '<td>'+boardColumns(module).length+' typed columns<div style="color:#929bad;font-size:11px;margin-top:4px">'+module.restricted.length+' protected source fields deferred</div></td>'+
  '<td><span class="status '+colour+'">'+esc(status.toUpperCase())+'</span><div class="muted" style="font-size:11px;margin-top:5px">'+esc(row?.note||'Awaiting live inspection')+'</div></td>'+
  '<td>'+(row?.status==='ready'?'<a class="inline-link" href="#/boards/'+esc(row.boardId)+'">Open verified board</a>':
  '<span style="color:#9da5b6">No certified source projection</span>')+'</td></tr>';
 }
 html+='</tbody></table></div></div>';
 html+='<div class="note security-note" style="margin-top:21px">TimeTracker and other restricted domains: do not expose employee identifiers, exact attendance times, GPS coordinates, finance, medical or performance fields through general board columns until backend-enforced field-level authorization and approved retention controls are implemented. No signed live CRUD or cross-workspace test is claimed by this page until separately executed.</div>';
 return html;
}
