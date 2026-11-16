/** CP-FRT-WF-05A activity, discussion and archive presentation. */
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const dateLabel=value=>{
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('en-PH');
};
export function renderFRTActivityLog({events=[],error='',companyCode=''}={}){
 const rows=Array.isArray(events)?events:[];
 return '<section class="panel frt-operations-panel" aria-label="Fund Tracker activity log">'+
  '<div class="panel-body"><div class="note">Showing up to 1,000 signed audit events from the last 30 days for '+escape(companyCode)+'. Historical audit records remain stored.</div>'+
  (error?'<p class="note" role="alert">'+escape(error)+'</p>':'')+
  '<div class="frt-operations-toolbar"><strong>'+rows.length+' activity records</strong>'+
  '<button type="button" class="secondary" data-frt-export-activity '+(rows.length?'':'disabled')+'>Export CSV</button></div>'+
  '<div class="table-scroll"><table class="board-table"><thead><tr><th>Date</th><th>Activity</th><th>Request</th><th>Voucher</th><th>Performed by</th><th>Details</th></tr></thead><tbody>'+
  (rows.map(row=>{
   const details=Object.entries(row.details||{}).map(([key,value])=>key+': '+String(value)).join(' · ');
   return '<tr><td>'+escape(dateLabel(row.createdAt))+'</td><td>'+escape(row.action)+'</td>'+
    '<td>'+escape(row.title)+'</td><td>'+escape(row.voucher)+'</td>'+
    '<td>'+escape(row.actorName)+'</td><td>'+escape(details||'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="6">No activity was recorded in the selected period.</td></tr>')+
  '</tbody></table></div></div></section>';
}
export function renderFRTComments({comments=[],error='',requestTitle=''}={}){
 const rows=Array.isArray(comments)?comments:[];
 return '<section class="panel frt-operations-panel" aria-label="Fund request discussion">'+
  '<div class="panel-body"><div class="note">Discussion for '+escape(requestTitle)+'. Comments are saved to the existing Fund Tracker discussion history.</div>'+
  (error?'<p class="note" role="alert">'+escape(error)+'</p>':'')+
  '<div class="frt-comment-list">'+(rows.map(row=>
   '<article class="frt-comment"><header><strong>'+escape(row.authorName)+'</strong>'+
   '<time datetime="'+escape(row.createdAt)+'">'+escape(dateLabel(row.createdAt))+'</time></header>'+
   '<p>'+escape(row.body).replace(/\n/g,'<br>')+'</p></article>'
  ).join('')||'<p class="muted">No comments have been posted for this request.</p>')+'</div>'+
  '<label class="field" for="frt-comment-body">Add comment<textarea id="frt-comment-body" name="comment" rows="3" maxlength="4000" required placeholder="Write a comment..."></textarea></label>'+
  '</div></section>';
}
export function renderFRTArchive({requests=[],error='',canRestore=false,companyCode=''}={}){
 const rows=Array.isArray(requests)?requests:[];
 return '<section class="panel frt-operations-panel" aria-label="Archived Fund Tracker requests">'+
  '<div class="panel-body"><div class="note">Archived requests for '+escape(companyCode)+
  ' are hidden from the active tracker. Their financial history and related records are retained.</div>'+
  (error?'<p class="note" role="alert">'+escape(error)+'</p>':'')+
  '<div class="table-scroll"><table class="board-table"><thead><tr><th>Request</th><th>Voucher</th><th>Status</th><th>Liquidation</th><th>Date needed</th><th>Archived</th><th>Action</th></tr></thead><tbody>'+
  (rows.map(row=>'<tr><td>'+escape(row.title)+'</td><td>'+escape(row.voucher)+'</td>'+
   '<td>'+escape(row.status)+'</td><td>'+escape(row.liquidationStatus)+'</td>'+
   '<td>'+escape(row.dateNeeded)+'</td><td>'+escape(dateLabel(row.archivedAt))+'</td><td>'+
   (canRestore?'<button type="button" class="secondary" data-action="frt-archive-restore" data-request-id="'+
    escape(row.requestId)+'">Restore</button>':'—')+'</td></tr>'
  ).join('')||'<tr><td colspan="7">No archived requests were found for this company.</td></tr>')+
  '</tbody></table></div></div></section>';
}
function csvCell(value){
 let text=String(value??'');
 if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function serializeFRTActivityCsv(events){
 const rows=Array.isArray(events)?events:[];
 const columns=['Date','Activity','Request','Voucher','Performed By','Details'];
 return [columns.map(csvCell).join(','),...rows.map(row=>[
  row.createdAt,row.action,row.title,row.voucher,row.actorName,
  JSON.stringify(row.details||{})
 ].map(csvCell).join(','))].join('\r\n');
}
