/** Plain text UI for opt-in GitHub Pages persistence acceptance. */
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPagesAcceptance({qaBoard,result,running=false,nativeResult,nativeRunning=false}={}){
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
 if(qaBoard){
  view+='<div style="margin-top:27px;border-top:1px solid #eef0f7;padding-top:20px"><h3 style="font-size:15px">APSYNTRA native transactions</h3>'+
   '<p class="muted" style="font-size:12px">Server-validated Issue create, operator update, actor protection, cross-workspace denial, removal and audit via the hosted Supabase native transaction endpoint. This test creates a uniquely identified QA issue and retains its tombstone and audit events.</p>'+
   '<button class="secondary" data-action="run-native-acceptance" '+(nativeRunning?'disabled':'')+'>'+
   (nativeRunning?'Running native verification…':'Verify hosted native transactions')+'</button></div>';
 }
 if(nativeResult){
  view+='<div style="margin-top:17px"><h3 style="font-size:14px">Native transaction result: '+
    escapeText(nativeResult.status.toUpperCase())+' — '+nativeResult.passed+'/'+nativeResult.total+'</h3>';
  for(const check of nativeResult.steps)view+='<div style="padding:9px 0;border-top:1px solid #eef0f7"><strong style="font-size:12px">✓ '+
    escapeText(check.name)+'</strong><p class="muted" style="font-size:12px;margin:3px 0">'+escapeText(check.detail)+'</p></div>';
  if(nativeResult.error)view+='<div class="error-banner" role="alert">'+escapeText(nativeResult.error)+
    (nativeResult.cleanupConfirmed?' QA issue was tombstoned.':' Check whether a QA issue remains before retrying.')+'</div>';
  if(nativeResult.status==='pass')view+='<div class="note">Hosted native Issue transactions accepted for this isolated board. The full upstream transaction processor and remaining application boards are outside this test.</div>';
  view+='</div>';
 }
 if(result){
  view+='<div style="margin-top:22px"><h3 style="font-size:14px">Result: '+escapeText(result.status.toUpperCase())+' — '+result.passed+'/'+result.total+' checks</h3>';
  for(const step of result.steps){
   view+='<div style="border-top:1px solid #eef0f7;padding:10px 0"><strong style="color:#259c76">✓ '+escapeText(step.name)+'</strong>'+
     '<p class="muted" style="font-size:12px;margin:3px 0">'+escapeText(step.detail)+'</p></div>';
  }
  if(result.error)view+='<div class="error-banner" role="alert">'+escapeText(result.error)+
   (result.cleanupConfirmed?' QA test issue tombstoned.':' QA test issue may remain for review.')+'</div>';
  if(result.status==='pass')view+='<div class="note">Signed Issue persistence, CAS denial, tombstones and audit records passed on this QA board. The full upstream transaction processor, other application boards and role-revocation scenarios remain separate acceptance requirements.</div>';
  view+='</div>';
 }
 view+='</div></div>';
 return view;
}
