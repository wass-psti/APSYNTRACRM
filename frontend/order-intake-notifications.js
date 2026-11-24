const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function recipientFields(directory){
 return '<p>Original account manager: '+esc(directory.manager||'Unassigned')+'</p><p>Confirm the workspace member who should receive future critical status notifications. Source account-manager information is unchanged.</p>'+
 '<label>Notification recipient<select name="recipient" required><option value="">Select a member</option>'+
 directory.members.map(member=>'<option value="'+esc(member.id)+'"'+(member.id===directory.recipientId?' selected':'')+'>'+esc(member.name||member.email)+' ('+esc(member.email)+')</option>').join('')+'</select></label>';
}
export function notificationInbox({rows=[],hasMore=false}={}){
 return '<div class="oi-inbox"><p>Messages are available here after a committed status change. No email or push delivery is implied.</p>'+
 (rows.length?'<ol class="oi-activity">'+rows.map(row=>'<li><strong>'+esc(row.po_number)+' · '+esc(row.status)+'</strong><p>'+esc(row.message)+'</p><time>'+esc(row.created_at)+'</time>'+
 (row.read_at?'<p>Read</p>':'<button class="secondary" type="button" data-oi-notification-read="'+esc(row.id)+'">Mark as read</button>')+'</li>').join('')+'</ol>':'<p>No notifications.</p>')+
 (hasMore?'<button class="secondary" type="button" data-oi-inbox-more>Load older notifications</button>':'')+'</div>';
}
