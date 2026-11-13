/** CP-TT-GPS01 — restricted attendance board GPS overlay.
 * Source of truth: server-side TimeTracker atomic attendance commit.
 * Never merge these rows into broadly visible general board item-page values.
 */
import {ApiError} from './session.js';

export const TT_BOARD_GPS_PROJECTION_ENABLED=true; // Server-enforced bootstrap/Supervisor read only.
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const fail=message=>{throw new ApiError(message,403);};
const geo=(source,label)=>{
 if(!source||typeof source!=='object'||Array.isArray(source)||
    source.status!=='captured')fail(label+' GPS data invalid');
 const lat=Number(source.latitude),lon=Number(source.longitude),accuracy=Number(source.accuracyM);
 if(source.latitude===null||source.longitude===null||source.accuracyM===null||
    typeof source.latitude==='boolean'||typeof source.longitude==='boolean'||
    !Number.isFinite(lat)||lat< -90||lat>90||
    !Number.isFinite(lon)||lon< -180||lon>180||
    !Number.isFinite(accuracy)||accuracy<0||accuracy>100000||
    !validTime(source.capturedAt))fail(label+' GPS fix invalid');
 return Object.freeze({latitude:lat,longitude:lon,accuracyM:accuracy,
  capturedAt:source.capturedAt});
};
export function validateTimeTrackerBoardGps(raw,{userId,workspaceId,boardId}){
 if(!id.test(userId||'')||!id.test(workspaceId||'')||!id.test(boardId||'')||
  !raw||raw.scope!=='AUTHORIZED_ATTENDANCE_BOARD'||raw.actorId!==userId||
  raw.workspaceId!==workspaceId||raw.boardId!==boardId||
  !Array.isArray(raw.rows)||raw.rows.length>100||typeof raw.hasMore!=='boolean')
  fail('Signed attendance board GPS scope mismatch');
 const seen=new Set();
 const rows=raw.rows.map(item=>{
  if(!item||!id.test(item.recordId||'')||!id.test(item.itemId||'')||
    seen.has(item.recordId)||typeof item.employeeName!=='string'||
    item.employeeName.length>100||!validTime(item.clockInAt)||
    !['Active','Completed'].includes(item.status)||
    (item.clockOutAt!==null&&!validTime(item.clockOutAt))||
    (item.clockOutAt!==null&&Date.parse(item.clockOutAt)<Date.parse(item.clockInAt))||
    (item.clockOutAt===null&&item.clockOutGps!==null)||
    (item.clockOutAt!==null&&item.clockOutGps===null)||
    (item.creditedMs!==null&&(!Number.isSafeInteger(item.creditedMs)||
      item.creditedMs<0))||
    (item.status==='Active'&&item.clockOutAt!==null)||
    (item.status==='Completed'&&item.clockOutAt===null))
   fail('Attendance board GPS row contract invalid');
  seen.add(item.recordId);
  return Object.freeze({
   recordId:item.recordId,itemId:item.itemId,employeeName:item.employeeName,
   clockInAt:item.clockInAt,clockOutAt:item.clockOutAt,status:item.status,
   creditedMs:item.creditedMs,clockInGps:geo(item.clockInGps,'Clock-in'),
   clockOutGps:item.clockOutGps===null?null:geo(item.clockOutGps,'Clock-out')
  });
 });
 return Object.freeze({status:'VERIFIED_READ',userId,workspaceId,boardId,
  rows:Object.freeze(rows),hasMore:raw.hasMore});
}
export async function loadTimeTrackerBoardGps({auth,api,boardId,workspaceId,enabled=
 TT_BOARD_GPS_PROJECTION_ENABLED}){
 if(enabled!==true) return {status:'DISABLED',rows:[]};
 if(!id.test(boardId||'')||!id.test(workspaceId||'')||
  typeof auth?.getVerifiedUser!=='function'||typeof api?.context!=='function'||
  typeof api?.rpc!=='function')fail('Signed attendance board API required');
 const current=await auth.getVerifiedUser();
 const ctx=await api.context();
 if(!id.test(current?.id||'')||ctx?.user_id!==current.id||
    ctx?.workspace_id!==workspaceId||ctx?.profile?.status!=='active')
  fail('Signed user and attendance workspace mismatch');
 const raw=await api.rpc('timetracker_board_private_snapshot',{
  p_board_id:boardId,p_limit:50
 });
 const after=await auth.getVerifiedUser();
 const check=await api.context();
 if(after?.id!==current.id||check?.user_id!==current.id||
    check?.workspace_id!==workspaceId||check?.profile?.status!=='active')
  fail('Signed session changed during attendance board GPS read');
 return validateTimeTrackerBoardGps(raw,{
  userId:current.id,workspaceId,boardId
 });
}
const at=value=>value?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'
}).format(new Date(value)):'—';
const place=point=>point?
 '<span class="tt-projection-gps">'+point.latitude.toFixed(6)+', '+
 point.longitude.toFixed(6)+' <small>±'+
 Math.round(point.accuracyM)+' m</small></span>':'—';
const hours=ms=>ms===null?'—':(ms/3600000).toFixed(2)+' h';
export function renderTimeTrackerBoardGps(data){
 if(data?.status!=='VERIFIED_READ')
  return '<p class="muted">Restricted attendance projection is not available.</p>';
 return '<p class="muted">Server-authorized attendance records. Clock-in and clock-out GPS fixes are independent; browser coordinates are not proof of physical presence.</p>'+
  '<div class="tt-projection-table-wrap" role="region" tabindex="0" '+
  'aria-label="Restricted TimeTracker attendance GPS table">'+
  '<table class="tt-projection-table"><thead><tr>'+
  ['Employee','Clock-In Time','Clock-In GPS','Clock-Out Time','Clock-Out GPS',
   'Attendance Status','Working Duration'].map(label=>'<th scope="col">'+esc(label)+'</th>').join('')+
  '</tr></thead><tbody>'+
  (data.rows.length?data.rows.map(row=>
   '<tr><td>'+esc(row.employeeName)+'</td>'+
   '<td>'+esc(at(row.clockInAt))+'</td>'+
   '<td>'+place(row.clockInGps)+'</td>'+
   '<td>'+esc(at(row.clockOutAt))+'</td>'+
   '<td>'+place(row.clockOutGps)+'</td>'+
   '<td>'+esc(row.status)+'</td>'+
   '<td>'+esc(hours(row.creditedMs))+'</td></tr>').join(''):
   '<tr><td colspan="7">No synchronized attendance board records have been projected yet. Historical attendance requires authorized reconciliation.</td></tr>')+
  '</tbody></table></div>'+
  (data.hasMore?'<p class="muted">Showing the latest 50 records. Additional pages require a reviewed cursor contract.</p>':'');
}
