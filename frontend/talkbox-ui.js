import {talkBoxMetrics} from './talkbox-native.js';
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderTalkBoxApplication({page,selected,busy=false,error='',canEdit=false}={}){
 const rows=page?.items||[],metrics=talkBoxMetrics(rows);
 return '<section class="tb-app" aria-label="TalkBox">'+
 '<header class="tb-header"><div><span class="tb-eyebrow">APSYNTRA · TOOLBOX OPERATIONS</span><h2>TalkBox</h2><p>Meeting &amp; Issue Tracker</p></div>'+
 '<div><button class="secondary" data-action="tb-refresh"'+(busy?' disabled':'')+'>Refresh</button> '+
 (canEdit?'<button class="primary" data-action="tb-new">＋ New issue</button>':'')+'</div></header>'+
 '<p class="tb-note">Viewing signed APSYNTRA Toolbox Issues records. The original monday.com board is not yet synchronized.</p>'+
 (error?'<div class="tb-error" role="alert">'+e(error)+'</div>':'')+
 '<div class="tb-metrics"><article><strong>'+e(page?.total??'—')+'</strong><span>Total issues</span></article>'+
 '<article><strong>'+e(metrics.open)+'</strong><span>Open (loaded)</span></article>'+
 '<article><strong>'+e(metrics.done)+'</strong><span>Done (loaded)</span></article>'+
 '<article><strong>'+e(metrics.stuck)+'</strong><span>Stuck (loaded)</span></article></div>'+
 '<section class="tb-panel"><h3>Issues</h3>'+
 (busy?'<p role="status">Loading signed issues…</p>':rows.length?
 '<div class="tb-scroll"><table><thead><tr><th>Issue</th><th>Status</th><th>Target date</th><th>Action</th></tr></thead><tbody>'+
 rows.map(row=>'<tr><td>'+e(row.name)+'</td><td>'+e(row.status)+'</td><td>'+e(row.date||'—')+'</td><td>'+
 '<button class="secondary" data-action="tb-open" data-id="'+e(row.id)+'">Open issue</button></td></tr>').join('')+
 '</tbody></table></div>':'<p>No Toolbox issue records returned.</p>')+
 (page?.cursor?'<button class="secondary" data-action="tb-more">Load more</button>':'')+'</section>'+
 (selected?'<div class="tb-overlay"><button type="button" class="tb-shade" data-action="tb-close" aria-label="Close issue"></button>'+
 '<aside class="tb-drawer" role="dialog" aria-modal="true" aria-label="Issue details"><header><div><h3>'+e(selected.name)+'</h3>'+
 '<small>Issue #'+e(selected.id)+'</small></div><button class="secondary" data-action="tb-close" aria-label="Close issue">✕</button></header>'+
 '<div class="tb-body"><p>Status: <strong>'+e(selected.status)+'</strong></p><p>Target: '+e(selected.date||'—')+'</p>'+
 '<p>Assigned: '+e(selected.person.map(p=>p.name||p.id).join(', ')||'Unassigned')+'</p>'+
 (canEdit?'<button class="secondary" data-action="tb-edit">Edit issue</button>':'')+
 '<h4>Updates</h4>'+(selected.updates.length?selected.updates.map(u=>'<article class="tb-update"><b>'+e(u.creator?.name||'Team member')+
 '</b><p>'+e(u.text_body)+'</p></article>').join(''):'<p>No updates yet.</p>')+
 (canEdit?'<label for="tb-message">Add update</label><textarea id="tb-message" rows="3" maxlength="20000"></textarea>'+
 '<button class="primary" data-action="tb-post">Post update</button>':'')+
 '<h4>Subtasks</h4>'+(canEdit?'<button class="secondary" data-action="tb-subtask-new">＋ Add subtask</button>':'')+(selected.subitems.length?'<ul>'+selected.subitems.map(x=>'<li>'+e(x.name)+' — '+e(x.status)+(canEdit? ' <button type="button" class="secondary" data-action="tb-subtask-status" data-id="'+e(x.id)+'">Change status</button>':'')+'</li>').join('')+'</ul>':'<p>No subtasks yet.</p>')+
 '</div></aside></div>':'')+'</section>';
}
