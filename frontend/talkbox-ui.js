import {talkBoxMetrics} from './talkbox-native.js';
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderTalkBoxApplication({page,selected,busy=false,error='',canEdit=false,filter={},features={},meetingOpen=false,meetingDate=''}={}){
 const rows=page?.items||[],metrics=talkBoxMetrics(rows);
 const summary=(value,label,tone)=>'<article class="tb-metric tb-metric-'+tone+'"><span>'+label+'</span><strong>'+e(value)+'</strong><small>Loaded workspace records</small></article>';
 const stateLabel=status=>'<span class="tb-status tb-status-'+(status==='Done'?'done':status==='Stuck'?'stuck':'working')+'"><span aria-hidden="true"></span>'+e(status)+'</span>';
 const deadline=value=>value?e(value):'<span class="tb-muted">Not scheduled</span>';
 const meetingTitle=meetingOpen?'Meeting Sheet':'Meeting overview';
 return '<section class="tb-app'+(meetingOpen?' tb-meeting-active':'')+'" aria-label="TalkBox">'+
 '<div class="tb-hero"><div class="tb-hero-top"><div class="tb-brand-mark" aria-hidden="true">T<span>·</span></div>'+
 '<div class="tb-hero-name"><span class="tb-eyebrow">APSYNTRA / WORK MANAGEMENT</span><strong>TalkBox</strong><span>Meeting &amp; Issue Tracker</span></div>'+
 '<span class="tb-live-indicator"><span aria-hidden="true"></span> Native workspace</span></div>'+
 '<div class="tb-hero-content"><div><span class="tb-kicker">MEETING OPERATIONS</span><h2>Every issue. One clear conversation.</h2>'+
 '<p>Run focused meetings, review your active issues and follow work through to resolution.</p></div>'+
 '<div class="tb-hero-actions"><label for="tb-meeting-date">Meeting date</label><input id="tb-meeting-date" type="date" value="'+e(meetingDate)+'">'+
 '<button class="tb-enter" type="button" data-action="'+(meetingOpen?'tb-meeting-back':'tb-meeting-enter')+'">'+
 (meetingOpen?'← Meeting overview':'Enter Meeting →')+'</button></div></div></div>'+
 '<div class="tb-workspace-bar"><div class="tb-path"><span>WORKSPACE</span><span aria-hidden="true">/</span><strong>'+e(meetingTitle)+'</strong></div>'+
 '<div class="tb-workspace-tools"><span>Native APSYNTRA CRM workspace records</span>'+
 '<button type="button" class="secondary" data-action="tb-refresh"'+(busy?' disabled':'')+'>↻ Refresh</button></div></div>'+
 (error?'<div class="tb-error" role="alert">'+e(error)+'</div>':'')+
 '<div class="tb-metrics" aria-label="Issue overview">'+
 summary(page?.total??'—','Total issues','total')+
 summary(metrics.open,'Active issues','open')+
 summary(metrics.stuck,'Need attention','stuck')+
 summary(metrics.done,'Resolved','done')+'</div>'+
 '<section class="tb-panel" aria-label="'+e(meetingTitle)+'"><div class="tb-panel-heading"><div><span class="tb-section-overline">'+
 (meetingOpen?'MEETING SHEET':'ISSUE WORKSPACE')+'</span><h3>'+(meetingOpen?'Main issues log':'Issue overview')+'</h3>'+
 '<p>'+(meetingOpen?'Work through issues with your team. This meeting date is a view label, not a saved meeting record.':'Your workspace issues, discussions and follow-up actions in one place.')+'</p></div>'+
 '<div class="tb-panel-actions">'+(meetingOpen&&meetingDate?'<span class="tb-date-chip">'+e(meetingDate)+'</span>':'')+
 (canEdit?'<button class="primary" data-action="tb-new">＋ New issue</button>':'')+'</div></div>'+
 '<div class="tb-filter"><label for="tb-search-text">Search issues</label>'+
 '<input id="tb-search-text" type="search" maxlength="500" placeholder="Search by issue name…" value="'+e(filter.name||'')+'">'+
 '<label for="tb-search-status">Status</label><select id="tb-search-status">'+
 ['All','Working on it','Stuck','Done'].map(status=>
 '<option value="'+e(status)+'"'+((filter.status||'All')===status?' selected':'')+'>'+e(status)+'</option>').join('')+'</select>'+
 '<button type="button" class="secondary" data-action="tb-filter"'+(busy?' disabled':'')+'>Apply</button>'+
 '<button type="button" class="secondary" data-action="tb-clear-filter"'+(busy?' disabled':'')+'>Clear</button></div>'+
 (busy?'<p class="tb-loading" role="status">Loading signed issues…</p>':rows.length?
 '<div class="tb-scroll"><table><thead><tr><th scope="col">Issue</th><th scope="col">Status</th><th scope="col">Target date</th><th scope="col">Assigned to</th><th scope="col"><span class="tb-sr-only">Actions</span></th></tr></thead><tbody>'+
 rows.map(row=>'<tr><td><button class="tb-issue-link" type="button" data-action="tb-open" data-id="'+e(row.id)+'"><span class="tb-issue-glyph" aria-hidden="true">◈</span><span>'+e(row.name)+'</span></button></td><td>'+(meetingOpen&&canEdit?
 '<select id="tb-inline-status-'+e(row.id)+'" class="tb-inline-status" data-tb-inline-status="'+e(row.id)+'" aria-label="Update status for '+e(row.name)+'">'+
 ['Working on it','Stuck','Done'].map(status=>'<option value="'+e(status)+'"'+(row.status===status?' selected':'')+'>'+e(status)+'</option>').join('')+'</select>':
 stateLabel(row.status))+'</td><td>'+deadline(row.date)+'</td><td>'+e((row.person||[]).map(p=>p.name||p.id).join(', ')||'—')+'</td><td><button class="tb-row-action" type="button" data-action="tb-open" data-id="'+e(row.id)+'" aria-label="Open '+e(row.name)+'">View details →</button></td></tr>').join('')+
 '</tbody></table></div>':'<div class="tb-empty"><span aria-hidden="true">◈</span><strong>No issues found</strong><p>Adjust the filters or create an issue to begin.</p></div>')+
 '<div class="tb-panel-footer"><span>Showing '+e(rows.length)+' of '+e(page?.total??'—')+' signed issues</span>'+
 (page?.cursor?'<button class="secondary" data-action="tb-more">Load more issues</button>':'')+'</div></section>'+
 (selected?'<div class="tb-overlay"><button type="button" class="tb-shade" data-action="tb-close" aria-label="Close issue"></button>'+
 '<aside class="tb-drawer" role="dialog" aria-modal="true" aria-label="Issue details"><header><div><h3>'+e(selected.name)+'</h3>'+
 '<small>Issue #'+e(selected.id)+'</small></div><button class="secondary" data-action="tb-close" aria-label="Close issue">✕</button></header>'+
 '<div class="tb-body"><div class="tb-detail-overview"><div><span>STATUS</span>'+stateLabel(selected.status)+'</div><div><span>TARGET DATE</span><strong>'+deadline(selected.date)+'</strong></div></div>'+
 '<p class="tb-detail-meta"><span>TRACKED TIME</span><strong>Tracked time: '+e(Number(selected.timeTracking?.hours)||0)+'h '+e(Number(selected.timeTracking?.minutes)||0)+'m</strong></p>'+
 '<p class="tb-detail-meta"><span>ASSIGNED TEAM</span><strong>Assigned: '+e(selected.person.map(p=>p.name||p.id).join(', ')||'Unassigned')+'</strong></p>'+
 (selected.timeTracking?.running?.startedAt?
 '<p class="tb-running-time" role="status">Timer running since '+e(selected.timeTracking.running.startedAt)+'</p>':'')+
 (canEdit?'<div class="tb-actions"><button class="secondary" data-action="tb-edit">Edit issue</button> '+
 '<button class="secondary" data-action="tb-assignees">Assign members</button> '+
 '<button class="secondary" data-action="tb-time-edit">Correct tracked time</button> '+
 (selected.timeTracking?.running?.startedAt?
 '<button class="secondary" data-action="tb-timer-stop">Stop timer</button> ':
 '<button class="secondary" data-action="tb-timer-start">Start timer</button> ')+
 '<button class="secondary" data-action="tb-archive">Archive issue</button></div>':'')+
 '<h4 class="tb-detail-section">Discussion &amp; updates</h4>'+(selected.updates.length?selected.updates.filter(u=>!u.replyTo).map(u=>
 '<article class="tb-update"><b>'+e(u.creator?.name||'Team member')+
 '</b><small> · '+e(u.created_at?new Date(u.created_at).toLocaleString():'')+'</small><p>'+e(u.text_body)+'</p>'+
 (canEdit&&features.threadedReplies?'<button type="button" class="secondary" data-action="tb-reply" data-id="'+e(u.id)+'">Reply</button>':'')+
 (features.threadedReplies?selected.updates.filter(reply=>String(reply.replyTo||'')===String(u.id)).map(reply=>
 '<div class="tb-reply"><b>'+e(reply.creator?.name||'Team member')+'</b><small> · '+
 e(reply.created_at?new Date(reply.created_at).toLocaleString():'')+'</small><p>'+e(reply.text_body)+'</p></div>').join(''):'')+
 '</article>').join(''):'<p>No updates yet.</p>')+
 (canEdit?'<label for="tb-message">Add update</label><textarea id="tb-message" rows="3" maxlength="20000"></textarea>'+
 '<button class="primary" data-action="tb-post">Post update</button>':'')+
 '<h4 class="tb-detail-section">Attachments</h4>'+
 (selected.assets?.length?'<ul class="tb-files">'+selected.assets.map(asset=>'<li><span>'+e(asset.name)+
 ' ('+e(Math.ceil((Number(asset.size)||0)/1024))+' KiB)</span> '+
 '<button type="button" class="secondary" data-action="tb-file-download" data-id="'+e(asset.id)+'">Download</button>'+
 (canEdit&&features.attachmentRemoval?' <button type="button" class="secondary" data-action="tb-file-remove" data-id="'+e(asset.id)+'">Remove</button>':'')+
 '</li>').join('')+'</ul>':
 '<p>No issue attachments yet.</p>')+
 (canEdit?'<div class="tb-file-input"><label for="tb-upload-file">Attach file (up to 50 MiB)</label>'+
 '<input id="tb-upload-file" type="file" aria-label="Select TalkBox attachment">'+
 '<button class="secondary" type="button" data-action="tb-file-upload">Upload attachment</button></div>':'')+
 (features.attachmentRemoval&&selected.pendingAttachmentCleanup?.length?
 '<div class="tb-pending-cleanup" role="group" aria-label="Unfinished private attachment cleanup">'+
 '<h5>Attachment cleanup pending</h5>'+
 selected.pendingAttachmentCleanup.map(asset=>
 '<div><span>'+e(asset.name)+'</span> '+
 '<button type="button" class="secondary" data-action="tb-file-cleanup" data-id="'+e(asset.id)+'">Retry cleanup</button></div>').join('')+
 '</div>':'')+
 '<h4 class="tb-detail-section">Subtasks</h4>'+(canEdit?'<button class="secondary" data-action="tb-subtask-new">＋ Add subtask</button>':'')+(selected.subitems.length?'<ul>'+selected.subitems.map(x=>'<li>'+e(x.name)+' — '+e(x.status)+(canEdit? ' <button type="button" class="secondary" data-action="tb-subtask-status" data-id="'+e(x.id)+'">Edit subtask</button>'+
 ' <button type="button" class="secondary" data-action="tb-subtask-delete" data-id="'+e(x.id)+'">Delete subtask</button>':'')+'</li>').join('')+'</ul>':'<p>No subtasks yet.</p>')+
 '</div></aside></div>':'')+'</section>';
}
