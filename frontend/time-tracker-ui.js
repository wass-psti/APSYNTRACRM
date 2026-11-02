/** Native TimeTracker board surface. Never embeds the standalone app. */
import {TT_LOCATIONS,TT_DEPARTMENTS,creditedAttendanceMs} from './time-tracker-native.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—':'—';
const hrs=ms=>Number.isFinite(ms)?(ms/3600000).toFixed(2)+' h':'—';
const select=(id,values,placeholder)=>'<select id="'+id+'" name="'+id+'" required>'+
 '<option value="">'+esc(placeholder)+'</option>'+
 values.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('')+'</select>';
export function ownAttendanceCsv(records){
 const rows=[['Clock In','Clock Out','Location','Department','Classification','Status','Credited Hours']];
 const safe=v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+@\-\t\r]/,'\' $&')+'"';
 for(const r of records||[])rows.push([r.clockIn,r.clockOut||'',r.location,r.department,
  r.classification,r.status,r.creditedMs===null?'':(r.creditedMs/3600000).toFixed(2)]);
 return '\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
export function renderTimeTrackerNative({result=null,busy=false,error='',success=''}={}){
 let html='<section class="tt-native" aria-label="TimeTracker attendance application">'+
  '<div class="tt-title"><div><span class="label-top">Native application / TimeTracker</span>'+
  '<h2>Attendance workspace</h2><p>Signed, server-authoritative timekeeping within APSYNTRA CRM.</p></div>'+
  '<button class="secondary" type="button" data-action="tt-refresh" '+(busy?'disabled':'')+'>↻ Refresh</button></div>';
 if(error)html+='<div class="error-banner" role="alert">'+esc(error)+'</div>';
 if(success)html+='<div class="note" role="status">'+esc(success)+'</div>';
 if(!result||result.status!=='VERIFIED_READ'){
  html+='<div class="panel"><div class="panel-body"><p class="muted">'+(busy?
   'Checking signed TimeTracker access and current attendance…':
   'Attendance actions are unavailable until signed workspace, board and module access are verified.')+'</p></div></div></section>';
  return html;
 }
 const {access,records,active}=result;
 const now=Date.now();
 const completed=records.filter(x=>x.status==='Completed').length;
 const late=records.filter(x=>x.classification==='Late').length;
 const today=new Date().toDateString();
 const todayCount=records.filter(x=>new Date(x.clockIn).toDateString()===today).length;
 html+='<div class="tt-stats">'+
  [['My records',records.length],['Today',todayCount],['Completed',completed],['Late arrivals',late]]
   .map(([label,value])=>'<div class="stat-card"><div class="stat-label">'+esc(label)+
    '</div><div class="stat-value">'+esc(value)+'</div></div>').join('')+'</div>'+
  '<div class="tt-grid"><div class="panel"><div class="panel-header"><h3>Clock In / Clock Out</h3>'+
   '<span class="status '+(active?'working':'done')+'">'+(active?'Active session':'Ready')+'</span></div>'+
   '<div class="panel-body"><p class="muted">'+esc(access.moduleRole)+' · '+esc(access.platformRole)+
   ' · '+esc(access.name)+'</p>'+
   (active?'<p>Active since <strong>'+esc(date(active.clockIn))+'</strong></p>':
     '<p>No active attendance session for your signed account.</p>')+
   '<form id="tt-clock-form"><div class="tt-form-fields"><label for="tt-location">Work location'+
    select('tt-location',TT_LOCATIONS,'Select work location')+'</label>'+
    '<label for="tt-department">Department'+select('tt-department',TT_DEPARTMENTS,'Select department')+'</label></div>'+
    '<label class="tt-note-field" for="tt-note" id="tt-note-wrap" hidden>Offsite Work Note'+
    '<textarea id="tt-note" maxlength="500" rows="3" placeholder="Describe your offsite work"></textarea></label>'+
    '<p class="muted">Precise browser GPS permission is required for each action. Timestamp and revision are committed by PostgreSQL, not by this browser.</p>'+
    '<div class="head-actions"><button class="primary" type="submit" name="tt-action" value="clock-in"'+
    (busy||active?' disabled':'')+'>Clock In</button><button class="secondary" type="submit" name="tt-action" value="clock-out"'+
    (busy||!active?' disabled':'')+'>Clock Out</button></div></form></div></div>'+
   '<div class="panel"><div class="panel-header"><h3>Attendance policy</h3></div>'+
    '<div class="panel-body"><p>Standard clock-in: <strong>08:00</strong> (local)</p>'+
    '<p>Unpaid break: <strong>12:00–13:00</strong></p>'+
    '<p>Base required work: <strong>9 credited hours</strong></p>'+
    '<p class="muted">Approved overtime and launch-only automatic clock-out require a separately verified authoritative operational workflow. This native surface does not invent or backdate attendance events.</p>'+
    '</div></div></div>';
 html+='<div class="panel"><div class="panel-header"><h3>My attendance history</h3>'+
   '<span>'+records.length+' authorized record(s)</span></div><div class="panel-body">'+
   '<div class="head-actions"><button class="secondary" type="button" data-action="tt-export"'+
   (busy||!records.length?' disabled':'')+'>Export my attendance CSV</button></div>'+
   '<div class="table-scroll"><table class="board-table"><thead><tr>'+
   '<th>Clock In</th><th>Clock Out</th><th>Location</th><th>Department</th>'+
   '<th>Status</th><th>Credited work</th></tr></thead><tbody>'+
   (records.slice(0,200).map(r=>'<tr><td>'+esc(date(r.clockIn))+'</td><td>'+
    esc(date(r.clockOut))+'</td><td>'+esc(r.location)+'</td><td>'+esc(r.department)+
    '</td><td>'+esc(r.classification)+' · '+esc(r.status)+'</td>'+
    '<td>'+esc(r.creditedMs===null?hrs(creditedAttendanceMs(r.clockIn,now)):hrs(r.creditedMs))+
    (r.creditedMs===null?' (running)':'')+'</td></tr>').join('')||
    '<tr><td colspan="6">No authenticated attendance records yet.</td></tr>')+
    '</tbody></table></div>'+
   '<p class="muted">Only records owned by your signed account are projected here. Exact GPS evidence, privileged audit payloads, and other employees’ records are not displayed.</p>'+
   '</div></div></section>';
 return html;
}
