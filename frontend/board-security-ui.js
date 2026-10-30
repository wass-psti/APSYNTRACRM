/** CP-A12.2 no-write read-only security acceptance. */
import {TARGET_BOARDS,TARGET_WORKSPACE_ID} from './board-security-targets.js';
import {identifySecurityScenario} from './board-negative-acceptance.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export function renderSecurityAcceptance({context,report,busy=false,progress=[]}={}){
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
  '<p class="muted" style="font-size:12px;margin:15px 0">For nonadministrator role denial, sign in with an existing authorized nonadmin in the primary workspace who is not a member of these boards. For cross-workspace denial, use an existing authorized user whose actual active workspace differs from Work Management. No impersonation, role switching, or temporary accounts.</p>'+
  '<button class="primary" data-action="security-run-negative" '+(busy||eligible==='not_eligible'||eligible==='admin_not_eligible'?'disabled':'')+'>'+
   (busy?'Verifying signed denials…':'Run read-only signed negative checks')+'</button>';
 if(eligible==='admin_not_eligible')html+='<p class="muted" style="font-size:12px">This administrator can legitimately access boards in the active workspace. A PASS would be misleading, so the test is disabled for this session.</p>';
 if(progress.length)html+='<p class="muted" style="font-size:12px;margin-top:12px">Last checked: '+escape(progress.at(-1).name)+' — '+escape(progress.at(-1).status.toUpperCase())+'</p>';
 if(report){
  html+='<div style="margin-top:22px"><h3>Signed result: '+escape(report.status.toUpperCase())+
    ' — '+Number(report.passed)+' / '+Number(report.total)+' boards</h3>';
  if(report.reason)html+='<p class="muted">'+escape(report.reason)+'</p>';
  if(report.scenario)html+='<p class="muted" style="font-size:12px">Scenario: '+escape(report.scenario.replaceAll('_',' '))+'</p>';
  html+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Target board</th><th>Access result</th><th>Verified read-only checks</th></tr></thead><tbody>';
  const found=new Map((report.results??[]).map(x=>[x.key,x]));
  for(const b of TARGET_BOARDS){
   const value=found.get(b.key);
   html+='<tr><td><strong>'+escape(b.name)+'</strong></td><td><span class="status '+(value?.status==='pass'?'done':value?.status==='fail'?'blocked':'todo')+'">'+
     escape(value?.status?.toUpperCase()||'NOT RUN')+'</span></td><td>'+
     (value?escape(Object.entries(value.checks).map(([name,data])=>name+': '+(data.ok?'PASS':'FAIL')).join(' · ')):'Pending a real signed account')+'</td></tr>';
  }
  html+='</tbody></table></div>';
  if(report.results?.length)html+='<button class="secondary" data-action="security-copy-report" style="margin-top:15px">Copy nonsecret result summary</button>';
  html+='</div>';
 }
 html+='</div></div>';
 html+='<div class="note security-note" style="margin-top:20px">The real target board UUIDs were confirmed through PostgreSQL inventory. A different workspace UUID is not a fabricated board. A successful negative result cannot substitute for application-level acceptance, membership revocation testing or field-level security. Reports are temporary in this browser tab and contain no names, emails, access tokens or location data.</div>';
 return html;
}
