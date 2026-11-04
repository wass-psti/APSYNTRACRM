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
 groupId,groupItems=[],boardColumns=[],boardValues=[],
 projection=null,userId=null,workspaceId=null,boardId=null
}={}){
 const identityMatched=projection?.userId===userId&&
  projection.workspaceId===workspaceId&&projection.boardId===boardId;
 const privateRead=identityMatched&&projection?.status==='VERIFIED_READ'&&
  Array.isArray(projection.rows);
 const logRead=identityMatched&&projection?.status==='VERIFIED_LOG'&&
  ['OWN_ATTENDANCE_ONLY','AUTHORIZED_WORKSPACE_TEAM'].includes(projection.scope)&&
  Array.isArray(projection.rows);
 const visible=new Set(groupItems.map(item=>item.id));
 // The generic board source ID is a join key only; NEVER a source of employee,
 // clock, duration or GPS field values.
 const sourceColumn=boardColumns.find(c=>c.name==='Source Record ID'&&c.system_key==null);
 const recordByItem=new Map(sourceColumn?boardValues.filter(value=>
  visible.has(value.item_id)&&value.column_id===sourceColumn.id&&
  typeof value.value==='string').map(value=>[value.item_id,value.value]):[]);
 const recordIds=new Set(recordByItem.values());
 const rows=privateRead?projection.rows.filter(row=>visible.has(row.itemId)):
  logRead?projection.rows.filter(row=>recordIds.has(row.id)).map(row=>({
   employeeName:row.name,clockInAt:row.clockIn,clockOutAt:row.clockOut,
   clockInGps:null,clockOutGps:null,status:row.status,
   creditedMs:row.creditedMs,gpsRestricted:true
  })):[];
 const verified=privateRead||logRead;
 const safeStatus=verified?projection.status:projection?.status||'RESTRICTED';
 const message=safeStatus==='LOADING'?
  'Checking authorized attendance details…':
  safeStatus==='UNAVAILABLE'?
   'Attendance details are temporarily unavailable. Try refreshing this board.':
  !verified?
   'Detailed attendance is restricted by the current signed server scope. Open TimeTracker attendance for other permitted views. Precise GPS requires bootstrap or assigned Supervisor authorization.':
  privateRead&&projection.hasMore?
   'No matching records in the latest authorized page. Additional attendance history requires a reviewed cursor contract.':
   'No authorized attendance details match the records in this group.';
 const tableRows=rows.map(row=>{
  const status=['Active','Completed','Unknown'].includes(row.status)?row.status:'Unknown';
  const employee=esc(row.employeeName);
  const gpsRestricted=row.gpsRestricted===true;
  const gpsText='<span class="tt-main-unavailable">Restricted</span>';
  const missingOut=status==='Active'?'Not yet clocked out':'Clock-out unavailable';
  return '<tr data-searchable="'+esc(row.employeeName.toLowerCase())+'">'+
   '<td class="tt-main-employee"><strong>'+employee+'</strong></td>'+
   '<td><time datetime="'+esc(row.clockInAt)+'">'+esc(when(row.clockInAt))+'</time></td>'+
   '<td>'+(gpsRestricted?gpsText:point(row.clockInGps))+'</td>'+
   '<td>'+(row.clockOutAt?
    '<time datetime="'+esc(row.clockOutAt)+'">'+esc(when(row.clockOutAt))+'</time>':
    '<span class="tt-main-unavailable">'+missingOut+'</span>')+'</td>'+
   '<td>'+(row.clockOutAt?(gpsRestricted?gpsText:point(row.clockOutGps)):
    '<span class="tt-main-unavailable">Not recorded</span>')+'</td>'+
   '<td><span class="tt-main-status tt-main-status-'+status.toLowerCase()+'">'+esc(status)+'</span></td>'+
   '<td>'+(row.creditedMs===null&&status!=='Active'?
    '<span class="tt-main-unavailable">Unavailable</span>':duration(row.creditedMs))+'</td></tr>';
 }).join('');
 const remaining=privateRead&&projection.hasMore?
  '<p class="tt-main-footnote">Showing the latest authorized attendance page. Further records may not be included.</p>':
  logRead?'<p class="tt-main-footnote">Location coordinates are excluded from this signed non-GPS history view.</p>':'';
 return '<div class="panel board-group-panel tt-main-attendance-panel" data-tt-main-attendance>'+
  '<div class="table-scroll board-group-scroll" role="region" tabindex="0" '+
  'aria-label="TimeTracker Main Group employee attendance table">'+
  '<table class="board-table tt-main-attendance-table" data-group-id="'+esc(groupId||'ungrouped')+'">'+
  '<thead><tr>'+headings.map(heading=>'<th scope="col">'+esc(heading)+'</th>').join('')+'</tr></thead>'+
  '<tbody>'+(tableRows||'<tr><td colspan="7" class="tt-main-empty" role="status">'+
   esc(message)+'</td></tr>')+'</tbody></table></div>'+
  remaining+'</div>';
}
