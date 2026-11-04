/** CP-PAGES-VIS01 — view-only presentation; signed write actions remain in app.js. */
import {pagesAcceptanceIcon as icon} from './pages-acceptance-visuals.js';
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPagesAcceptance({qaBoard,result,running=false,nativeResult,nativeRunning=false}={}){
 let view='<div class="aps-pages-acceptance">';
 view+='<section class="page-head pages-hero pages-entrance" aria-labelledby="pages-title">'+
  '<div class="pages-hero-copy"><span class="label-top"><span class="pages-hero-dot" aria-hidden="true"></span>Workspace / Pages acceptance</span>'+
  '<h1 id="pages-title">Production Pages <span>acceptance.</span></h1>'+
  '<p>Verify signed PostgreSQL persistence through the existing Supabase backend, without the Mac development host.</p>'+
  '<div class="pages-hero-tags"><span>'+icon('lock')+' Signed-session workflow</span>'+
  '<span>'+icon('database')+' PostgreSQL-backed</span></div></div>'+
  '<div class="pages-hero-emblem" aria-hidden="true">'+
  '<svg viewBox="0 0 300 210" fill="none" focusable="false">'+
  '<circle cx="151" cy="108" r="87" stroke="currentColor" stroke-opacity=".14"/>'+
  '<circle cx="151" cy="108" r="62" stroke="currentColor" stroke-opacity=".25"/>'+
  '<path d="m151 50 53 22v39c0 42-25 65-53 78-28-13-53-36-53-78V72l53-22Z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>'+
  '<path d="m126 114 16 16 32-34" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'+
  '<circle cx="66" cy="62" r="5" fill="currentColor" fill-opacity=".5"/><circle cx="241" cy="145" r="4" fill="currentColor" fill-opacity=".5"/>'+
  '</svg></div></section>';
 view+='<section class="panel pages-backend-panel pages-entrance" aria-labelledby="pages-backend-title">'+
  '<div class="panel-header pages-panel-header"><span class="pages-backend-icon" aria-hidden="true">'+icon('database')+'</span>'+
  '<div class="pages-backend-heading"><span class="pages-overline">APPROVED INFRASTRUCTURE</span>'+
  '<h2 id="pages-backend-title">Approved backend: Supabase Auth + board RPC + forced RLS</h2>'+
  '</div><span class="pages-stage-tag">'+icon('shield')+' Scoped QA checks</span></div>';
 view+='<div class="panel-body pages-panel-body"><div class="pages-test-grid">';
 view+='<section class="pages-test-card pages-test-primary" aria-labelledby="pages-persistence-title">'+
  '<div class="pages-test-header"><span class="pages-test-card-icon" aria-hidden="true">'+icon('checks')+'</span>'+
  '<div><span class="pages-step-label">01 / SIGNED PERSISTENCE</span>'+
  '<h3 id="pages-persistence-title">Board persistence &amp; audit</h3></div></div>'+
  '<div class="note pages-write-warning">'+icon('warning')+
  '<p>This is an explicit, real-write acceptance test. It creates, updates and removes only one unique Issue in a dedicated APSYNTRA QA board and verifies its append-only audit events. No test account or privileged API key is used.</p></div>';
 if(!qaBoard){
  view+='<div class="pages-qa-missing" role="status">'+icon('warning')+
   '<p>No active board named <strong>APSYNTRA QA</strong> is available to your account. Create a dedicated, isolated nonproduction board with that exact name before running any write acceptance.</p></div>'+
   '<a class="secondary pages-open-boards" href="#/boards">'+icon('external')+' Open boards</a>';
 }else{
  view+='<div class="pages-board-scope"><span class="pages-board-icon" aria-hidden="true">'+icon('layers')+'</span>'+
   '<div class="pages-board-info"><span>ISOLATED BOARD</span><strong>'+escapeText(qaBoard.name)+'</strong></div>'+
   '<span class="pages-board-qa-tag">QA only</span></div>'+
   '<p class="muted pages-test-description">You must confirm that this board is isolated from production work. The backend independently enforces edit permissions and workspace isolation.</p>'+
   '<button type="button" class="primary pages-run-primary" data-action="run-pages-acceptance" '+(running?'disabled':'')+'>'+
   icon('play')+' <span>'+(running?'Running acceptance…':'Run signed persistence acceptance')+'</span></button>';
 }
 view+='</section>';
 if(qaBoard){
  view+='<section class="pages-test-card pages-test-secondary" aria-labelledby="pages-native-title">'+
   '<div class="pages-test-header"><span class="pages-test-card-icon pages-native-icon" aria-hidden="true">'+icon('arrows')+'</span>'+
   '<div><span class="pages-step-label">02 / NATIVE TRANSACTIONS</span><h3 id="pages-native-title">APSYNTRA native transactions</h3></div></div>'+
   '<p class="pages-test-description">Server-validated Issue create, operator update, actor protection, cross-workspace denial, removal and audit via the hosted Supabase native transaction endpoint. This test creates a uniquely identified QA issue and retains its tombstone and audit events.</p>'+
   '<div class="pages-native-facts"><span>'+icon('lock')+' Workspace isolation</span>'+
   '<span>'+icon('check')+' Actor protection</span><span>'+icon('database')+' Retained audit events</span></div>'+
   '<button type="button" class="secondary pages-run-secondary" data-action="run-native-acceptance" '+
   (nativeRunning?'disabled':'')+'>'+icon('checks')+' <span>'+
   (nativeRunning?'Running native verification…':'Verify hosted native transactions')+'</span></button></section>';
 }
 view+='</div>';
 if(nativeResult||result)view+='<div class="pages-results" aria-live="polite" aria-relevant="additions text">';
 if(nativeResult){
  view+='<section class="pages-result-card" aria-labelledby="pages-native-result-title"><h3 id="pages-native-result-title">'+
    icon('checks')+' Native transaction result: '+escapeText(nativeResult.status.toUpperCase())+
    ' — '+nativeResult.passed+'/'+nativeResult.total+'</h3>';
  for(const check of nativeResult.steps)view+='<div class="pages-result-step"><strong>✓ '+
    escapeText(check.name)+'</strong><p class="muted">'+escapeText(check.detail)+'</p></div>';
  if(nativeResult.error)view+='<div class="error-banner" role="alert">'+escapeText(nativeResult.error)+
    (nativeResult.cleanupConfirmed?' QA issue was tombstoned.':' Check whether a QA issue remains before retrying.')+'</div>';
  if(nativeResult.status==='pass')view+='<div class="note pages-result-note">Hosted native Issue transactions accepted for this isolated board. The full upstream transaction processor and remaining application boards are outside this test.</div>';
  view+='</section>';
 }
 if(result){
  view+='<section class="pages-result-card" aria-labelledby="pages-persistence-result-title"><h3 id="pages-persistence-result-title">'+
    icon('checks')+' Result: '+escapeText(result.status.toUpperCase())+' — '+result.passed+'/'+result.total+' checks</h3>';
  for(const step of result.steps)view+='<div class="pages-result-step"><strong>✓ '+
    escapeText(step.name)+'</strong><p class="muted">'+escapeText(step.detail)+'</p></div>';
  if(result.error)view+='<div class="error-banner" role="alert">'+escapeText(result.error)+
   (result.cleanupConfirmed?' QA test issue tombstoned.':' QA test issue may remain for review.')+'</div>';
  if(result.status==='pass')view+='<div class="note pages-result-note">Signed Issue persistence, CAS denial, tombstones and audit records passed on this QA board. The full upstream transaction processor, other application boards and role-revocation scenarios remain separate acceptance requirements.</div>';
  view+='</section>';
 }
 if(nativeResult||result)view+='</div>';
 view+='</div></section></div>';
 return view;
}
