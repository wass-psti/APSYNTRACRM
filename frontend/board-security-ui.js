/** CP-A12.2 no-write read-only security acceptance. */
import {TARGET_BOARDS,TARGET_WORKSPACE_ID} from './board-security-targets.js';
import {identifySecurityScenario} from './board-negative-acceptance.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export function renderSecurityAcceptance({context,report,busy=false,progress=[],writeResult=null,writeBusy=false,frtResult=null,frtBusy=false,sec07Result=null,sec07Busy=false,sec09Result=null,sec09Busy=false}={}){
 const eligible=identifySecurityScenario(context);
 const source=eligible==='cross_workspace'?'Cross-workspace session':
  eligible==='unassigned_nonadmin'?'Existing nonadministrator session':
  eligible==='admin_not_eligible'?'Administrator session — not eligible':'Inactive or unknown workspace';
 let html='<div class="page-head"><div><span class="label-top">Phase A / Security</span>'+
  '<h1>Signed negative authorization</h1>'+
  '<p>Verify real server-side denial on the twelve existing boards without changing application data or memberships.</p></div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>Existing signed session</h3></div>'+
  '<div class="panel-body"><div class="note"><b>'+escape(source)+'</b> · Read-only.<br>'+
  'This test calls existing signed Supabase board access, detail, event-history and board-list RPCs. It never performs an INSERT, UPDATE or DELETE.</div>'+
  '<p class="muted csp-u033" >For nonadministrator role denial, sign in with an existing authorized nonadmin in the primary workspace who is not a member of these boards. For cross-workspace denial, use an existing authorized user whose actual active workspace differs from Work Management. No impersonation, role switching, or temporary accounts.</p>'+
  '<button class="primary" data-action="security-run-negative" '+(busy||eligible==='not_eligible'||eligible==='admin_not_eligible'?'disabled':'')+'>'+
   (busy?'Verifying signed denials…':'Run read-only signed negative checks')+'</button>';
 if(eligible==='admin_not_eligible')html+='<p class="muted csp-u027" >This administrator can legitimately access boards in the active workspace. A PASS would be misleading, so the test is disabled for this session.</p>';
 if(progress.length)html+='<p class="muted csp-u029" >Last checked: '+escape(progress.at(-1).name)+' — '+escape(progress.at(-1).status.toUpperCase())+'</p>';
 if(report){
  html+='<div class="csp-u053" ><h3>Signed result: '+escape(report.status.toUpperCase())+
    ' — '+Number(report.passed)+' / '+Number(report.total)+' boards</h3>';
  if(report.reason)html+='<p class="muted">'+escape(report.reason)+'</p>';
  if(report.scenario)html+='<p class="muted csp-u027" >Scenario: '+escape(report.scenario.replaceAll('_',' '))+'</p>';
  html+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Target board</th><th>Access result</th><th>Verified read-only checks</th></tr></thead><tbody>';
  const found=new Map((report.results??[]).map(x=>[x.key,x]));
  for(const b of TARGET_BOARDS){
   const value=found.get(b.key);
   html+='<tr><td><strong>'+escape(b.name)+'</strong></td><td><span class="status '+(value?.status==='pass'?'done':value?.status==='fail'?'blocked':'todo')+'">'+
     escape(value?.status?.toUpperCase()||'NOT RUN')+'</span></td><td>'+
     (value?escape(Object.entries(value.checks).map(([name,data])=>name+': '+(data.ok?'PASS':'FAIL')).join(' · ')):'Pending a real signed account')+'</td></tr>';
  }
  html+='</tbody></table></div>';
  if(report.status==='pass')html+='<div class="csp-u049" ><h3>Optional nonproduction write denial</h3><p class="muted">After passing twelve read-only checks, you may explicitly attempt an unauthorized create only on the separate APSYNTRA QA board. The expected result is HTTP 403 with no item created.</p><button class="secondary" data-action="security-deny-write" '+(writeBusy?'disabled':'')+'>'+(writeBusy?'Verifying…':'Verify denied QA write')+'</button></div>';
  if(writeResult)html+='<p class="muted"><b>QA write-denial: '+escape(writeResult.status.toUpperCase())+'</b> — '+escape(writeResult.detail)+'</p>';
  if(report.results?.length)html+='<button class="secondary csp-u047" data-action="security-copy-report" >Copy nonsecret result summary</button>';
  html+='</div>';
 }
 html+='</div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>FRT centralized role and signed-session acceptance</h3></div>'+
 '<div class="panel-body"><p class="muted">CP-FRT-SEC03 verifies the currently signed account and read-only role governance. This does not create users, assign permissions or modify financial records.</p>'+
 '<button class="primary" data-action="security-frt-readonly" '+(frtBusy?'disabled':'')+'>'+
 (frtBusy?'Verifying current signed session…':'Run FRT read-only signed acceptance')+'</button>';
 if(frtResult){
  const passed=(frtResult.checks||[]).filter(c=>c.status==='PASS').length;
  html+='<div class="csp-u053"><strong>FRT result: '+escape(frtResult.status||'BLOCKED')+
   ' ('+passed+' / '+(frtResult.checks||[]).length+' checks)</strong>'+
   '<p class="muted">Session category: '+escape(frtResult.scenario||'UNVERIFIED')+'</p>';
  if(frtResult.reason)html+='<p class="muted">'+escape(frtResult.reason)+'</p>';
  html+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Check</th><th>Status</th></tr></thead><tbody>'+
   (frtResult.checks||[]).map(c=>'<tr><td>'+escape(c.name)+'</td><td>'+
    escape(c.status)+'</td></tr>').join('')+'</tbody></table></div>';
  html+='<p class="muted">Changes attempted: 0. Results do not certify fresh-session role changes, cross-workspace writes or local 5173 board-host operations.</p>'+
  '<button class="secondary" data-action="security-frt-copy">Copy nonsecret FRT result</button></div>';
 }
 html+='</div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>CP-FRT-SEC07 · CRM platform-role activation</h3></div>'+
 '<div class="panel-body"><p class="muted">Run a signed, read-only test of the CRM platform-role backend and administrator isolation. A missing backend migration is BLOCKED, not PASS. No account, role, finance or board data is modified.</p>'+
 '<button class="primary" data-action="security-sec07-readonly" '+(sec07Busy?'disabled':'')+'>'+
 (sec07Busy?'Checking signed CRM backend…':'Verify signed CRM platform-role backend')+'</button>';
 if(sec07Result){
  const count=(sec07Result.checks||[]).filter(x=>x.status==='PASS').length;
  html+='<div class="csp-u053"><strong>SEC07 result: '+escape(sec07Result.status||'BLOCKED')+
   ' ('+count+' / '+(sec07Result.checks||[]).length+' checks)</strong>'+
   '<p class="muted">Signed scenario: '+escape(sec07Result.scenario||'UNVERIFIED')+'</p>';
  if(sec07Result.reason)html+='<p class="muted">Reason: '+escape(sec07Result.reason)+'</p>';
  html+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>'+
   (sec07Result.checks||[]).map(x=>'<tr><td>'+escape(x.name)+'</td><td>'+
    escape(x.status)+'</td></tr>').join('')+'</tbody></table></div>';
  html+='<p class="muted">Writes attempted: 0. This read-only result cannot certify role mutation, fresh post-change sessions, FRT finance writes or the native 5173 board host.</p>'+
   '<button class="secondary" data-action="security-sec07-copy">Copy nonsecret SEC07 result</button></div>';
 }
 html+='</div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>CP-FRT-SEC09 · Signed platform-role acceptance</h3></div>'+
 '<div class="panel-body"><p class="muted">Run the existing FRT governance and CRM backend acceptance checks together under this signed session. This requires both results to agree and attempts no role, membership, board or finance writes. A PASS does not certify role assignment/revocation or a new post-change session.</p>'+
 '<button class="primary" data-action="security-sec09-readonly" '+(sec09Busy?'disabled':'')+'>'+
 (sec09Busy?'Verifying paired signed acceptance…':'Run CP-FRT-SEC09 signed acceptance')+'</button>';
 if(sec09Result){
  const count=(sec09Result.checks||[]).filter(x=>x.status==='PASS').length;
  html+='<div class="csp-u053"><strong>SEC09 result: '+escape(sec09Result.status||'BLOCKED')+
   ' ('+count+' / '+(sec09Result.checks||[]).length+' checks)</strong>'+
   '<p class="muted">Signed scenario: '+escape(sec09Result.scenario||'UNVERIFIED')+'</p>';
  if(sec09Result.reason)html+='<p class="muted">Reason: '+escape(sec09Result.reason)+'</p>';
  html+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Check</th><th>Status</th></tr></thead><tbody>'+
   (sec09Result.checks||[]).map(c=>'<tr><td>'+escape(c.name)+'</td><td>'+escape(c.status)+'</td></tr>').join('')+
   (sec09Result.sources||[]).map(c=>'<tr><td>'+escape(c.checkpoint)+' · previous runner ('+
     (c.checks||[]).filter(x=>x.status==='PASS').length+'/'+(c.checks||[]).length+
     ')</td><td>'+escape(c.status)+'</td></tr>').join('')+
   '</tbody></table></div><p class="muted">Writes attempted: 0. No role changes or fresh-session permission transitions tested. Copy the nonsecret result for acceptance review.</p>'+
   '<button class="secondary" data-action="security-sec09-copy">Copy nonsecret SEC09 result</button></div>';
 }
 html+='</div></div>';
 html+='<div class="note security-note csp-u050" >The real target board UUIDs were confirmed through PostgreSQL inventory. A different workspace UUID is not a fabricated board. A successful negative result cannot substitute for application-level acceptance, membership revocation testing or field-level security. Reports are temporary in this browser tab and contain no names, emails, access tokens or location data.</div>';
 return html;
}
