/** CP-FRT-WF-05A archive presentation. */
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const dateLabel=value=>{
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('en-PH');
};
export function renderFRTArchive({requests=[],error='',canRestore=false,companyCode=''}={}){
 const rows=Array.isArray(requests)?requests:[];
 return '<section class="panel frt-archive-panel" aria-label="Archived Fund Tracker requests">'+
  '<div class="panel-body"><div class="note">Archived requests for '+e(companyCode)+
  ' are hidden from the active tracker. Their voucher, liquidation and audit history are retained.</div>'+
  (error?'<p class="note" role="alert">'+e(error)+'</p>':'')+
  '<div class="frt-archive-summary"><strong>'+rows.length+'</strong> archived requests'+
  (rows.length===500?' · Showing the latest 500':'')+'</div>'+
  '<div class="table-scroll"><table class="board-table"><thead><tr><th>Request</th><th>Voucher</th><th>Status</th><th>Liquidation</th><th>Date needed</th><th>Archived</th><th>Action</th></tr></thead><tbody>'+
  (rows.map(row=>'<tr><td>'+e(row.title)+'</td><td>'+e(row.voucher)+'</td>'+
   '<td>'+e(row.status)+'</td><td>'+e(row.liquidationStatus)+'</td>'+
   '<td>'+e(row.dateNeeded)+'</td><td>'+e(dateLabel(row.archivedAt))+'</td><td>'+
   (canRestore?'<button type="button" class="secondary" data-action="frt-archive-restore" data-request-id="'+
    e(row.requestId)+'">Restore</button>':'—')+'</td></tr>'
  ).join('')||'<tr><td colspan="7">No archived requests were found for this company.</td></tr>')+
  '</tbody></table></div></div></section>';
}
