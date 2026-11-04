/** Signed TimeTracker Main Group presentation.
 * The seven operational fields come ONLY from the server-authorized private
 * attendance projection. Generic board values are never treated as employee
 * identity, timestamps or geolocation. A denied read stays redacted.
 */
const headings=Object.freeze([
 'Employee','Clock-In Time','Clock-In GPS','Clock-Out Time',
 'Clock-Out GPS','Attendance Status','Working Duration'
]);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const datetime=new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'
});
const when=value=>value?datetime.format(new Date(value)):'Not yet clocked out';
const point=value=>value?
 '<span class="tt-main-fix"><span>'+esc(value.latitude.toFixed(5)+', '+value.longitude.toFixed(5))+
 '</span><small>±'+esc(Math.round(value.accuracyM))+' m</small></span>':
 '<span class="tt-main-unavailable">Not recorded</span>';
const duration=value=>value===null?
 '<span class="tt-main-unavailable">In progress</span>':
 '<span class="tt-main-duration">'+esc((value/3600000).toFixed(2))+' h</span>';
export const TIMETRACKER_MAIN_GROUP_HEADINGS=headings;

/** Always restrict records to the board's currently visible group item IDs.
 * Never fall back to raw board values if the signed projection is unavailable.
 */
export function renderTimeTrackerMainGroup({
 groupId,groupItems=[],projection=null,userId=null,workspaceId=null,boardId=null
}={}){
 const verified=projection?.status==='VERIFIED_READ'&&
  projection.userId===userId&&projection.workspaceId===workspaceId&&
  projection.boardId===boardId;
 const visible=new Set(groupItems.map(item=>item.id));
 const rows=verified?projection.rows.filter(row=>visible.has(row.itemId)):[];
 const safeStatus=verified?'VERIFIED_READ':projection?.status||'RESTRICTED';
 const message=safeStatus==='LOADING'?
  'Checking authorized attendance details…':
  safeStatus==='UNAVAILABLE'?
   'Attendance details are temporarily unavailable. Try refreshing this board.':
  safeStatus==='RESTRICTED'||!verified?
   'Employee attendance details require an authorized signed TimeTracker role. GPS remains restricted to the existing privileged server endpoint.':
  projection.hasMore?
   'No matching records in the latest authorized page. Additional attendance history requires a reviewed cursor contract.':
   'No authorized attendance details are available for the records in this group.';
 const tableRows=rows.map(row=>{
  const status=row.status==='Active'?'Active':'Completed';
  const employee=esc(row.employeeName);
  return '<tr data-searchable="'+esc(row.employeeName.toLowerCase())+'">'+
   '<td class="tt-main-employee"><strong>'+employee+'</strong></td>'+
   '<td><time datetime="'+esc(row.clockInAt)+'">'+esc(when(row.clockInAt))+'</time></td>'+
   '<td>'+point(row.clockInGps)+'</td>'+
   '<td>'+(row.clockOutAt?
    '<time datetime="'+esc(row.clockOutAt)+'">'+esc(when(row.clockOutAt))+'</time>':
    '<span class="tt-main-unavailable">Not yet clocked out</span>')+'</td>'+
   '<td>'+point(row.clockOutGps)+'</td>'+
   '<td><span class="tt-main-status tt-main-status-'+status.toLowerCase()+'">'+esc(status)+'</span></td>'+
   '<td>'+duration(row.creditedMs)+'</td></tr>';
 }).join('');
 const remaining=verified&&projection.hasMore?
  '<p class="tt-main-footnote">Showing the latest authorized attendance page. Further records may not be included.</p>':'';
 return '<div class="panel board-group-panel tt-main-attendance-panel" data-tt-main-attendance>'+
  '<div class="table-scroll board-group-scroll" role="region" tabindex="0" '+
  'aria-label="TimeTracker Main Group employee attendance table">'+
  '<table class="board-table tt-main-attendance-table" data-group-id="'+esc(groupId||'ungrouped')+'">'+
  '<thead><tr>'+headings.map(heading=>'<th scope="col">'+esc(heading)+'</th>').join('')+'</tr></thead>'+
  '<tbody>'+(tableRows||'<tr><td colspan="7" class="tt-main-empty" role="status">'+
   esc(message)+'</td></tr>')+'</tbody></table></div>'+
  remaining+'</div>';
}
