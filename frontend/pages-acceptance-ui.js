/** Plain text UI for opt-in GitHub Pages persistence acceptance. */
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPagesAcceptance({qaBoard,result,running=false}={}){
 let view='<div class="page-head"><div><span class="label-top">Workspace / Pages acceptance</span><h1>Production Pages acceptance</h1>'+
  '<p>Verify signed PostgreSQL persistence through the existing Supabase backend, without the Mac development host.</p></div></div>';
 view+='<div class="panel"><div class="panel-header"><h3>Approved backend: Supabase Auth + board RPC + forced RLS</h3></div><div class="panel-body">';
 view+='<div class="note">This is an explicit, real-write acceptance test. It creates, updates and removes only one unique Issue in a dedicated APSYNTRA QA board and verifies its append-only audit events. No test account or privileged API key is used.</div>';
 if(!qaBoard){
  view+='<p class="muted" style="font-size:13px;margin:18px 0">No active board named <strong>APSYNTRA QA</strong> is available to your account. Create a dedicated, isolated nonproduction board with that exact name before running any write acceptance.</p>'+
   '<a class="secondary" href="#/boards">Open boards</a>';
 }else{
  view+='<div class="settings-detail"><label>Isolated board</label><strong>'+escapeText(qaBoard.name)+'</strong></div>'+
  '<p class="muted" style="font-size:12px">You must confirm that this board is isolated from production work. The backend independently enforces edit permissions and workspace isolation.</p>'+
  '<button class="primary" data-action="run-pages-acceptance" '+(running?'disabled':'')+'>'+(running?'Running acceptance…':'Run signed persistence acceptance')+'</button>';
 }
 if(result){
  view+='<div style="margin-top:22px"><h3 style="font-size:14px">Result: '+escapeText(result.status.toUpperCase())+' — '+result.passed+'/'+result.total+' checks</h3>';
  for(const step of result.steps){
   view+='<div style="border-top:1px solid #eef0f7;padding:10px 0"><strong style="color:#259c76">✓ '+escapeText(step.name)+'</strong>'+
     '<p class="muted" style="font-size:12px;margin:3px 0">'+escapeText(step.detail)+'</p></div>';
  }
  if(result.error)view+='<div class="error-banner" role="alert">'+escapeText(result.error)+
   (result.cleanupConfirmed?' QA test issue tombstoned.':' QA test issue may remain for review.')+'</div>';
  if(result.status==='pass')view+='<div class="note">Signed Issue persistence, CAS denial, tombstones and audit records passed on this QA board. Node-only native TxProcessor, other application boards and role-revocation scenarios remain separate acceptance requirements.</div>';
  view+='</div>';
 }
 view+='</div></div>';
 return view;
}
