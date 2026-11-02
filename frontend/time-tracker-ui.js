/** Native TimeTracker UI. Screen language adapted from the supplied Clock-tab reference.
 * Existing CRM shell, central identity, module access, and PostgreSQL data remain authoritative.
 */
import {
 TT_LOCATIONS,TT_DEPARTMENTS,creditedAttendanceMs,filterMyAttendancePeriod,
 TT_LIVE_ATTENDANCE_WRITES_ACCEPTED
} from './time-tracker-native.js';
import {renderTimeTrackerOverview} from './time-tracker-overview.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const date=v=>v&&Number.isFinite(Date.parse(v))?
 new Date(v).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';
const hrs=ms=>Number.isFinite(ms)?(ms/3600000).toFixed(2)+' h':'—';
const sections=[
 ['overview','Overview',true],['clock','Clock',true],['log','Log',true],
 ['reports','Reports',true],['calendar','Calendar',false],
 ['ot','OT',true],['hours','My Hours',false],['team','Team',false],
 ['roles','Roles',false],['monitor','Monitor',false],['gps','GPS',false]
];
const select=(id,values,placeholder)=>
 '<select id="'+id+'" name="'+id+'" required>'+
 '<option value="">'+esc(placeholder)+'</option>'+
 values.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('')+
 '</select>';

export function timeTrackerClockParts(at=new Date()){
 const time=new Date(at);
 if(!Number.isFinite(time.getTime()))throw new Error('Invalid clock date');
 const hour=time.getHours();
 return {
  greeting:hour<12?'Good morning,':hour<17?'Good afternoon,':'Good evening,',
  day:time.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}),
  hours:String(hour%12||12).padStart(2,'0'),
  minutes:String(time.getMinutes()).padStart(2,'0'),
  seconds:String(time.getSeconds()).padStart(2,'0'),
  period:hour>=12?'PM':'AM'
 };
}

/** Update only four text nodes; never re-render the board or refetch records. */
export function syncTimeTrackerClock(root,at=new Date()){
 const hours=root?.querySelector?.('#tt-clock-hours');
 if(!hours)return false;
 const parts=timeTrackerClockParts(at);
 const nodes={
  'tt-clock-greeting':parts.greeting,'tt-clock-date':parts.day,
  'tt-clock-hours':parts.hours,'tt-clock-minutes':parts.minutes,
  'tt-clock-seconds':parts.seconds,'tt-clock-period':parts.period
 };
 for(const [id,value] of Object.entries(nodes)){
  const node=root.querySelector('#'+id);
  if(node&&node.textContent!==value)node.textContent=value;
 }
 return true;
}

export function ownAttendanceCsv(records){
 const rows=[['Clock In','Clock Out','Location','Department','Classification','Status','Credited Hours']];
 const safe=v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+@\-\t\r]/,"' $&")+'"';
 for(const r of records||[])rows.push([
  r.clockIn,r.clockOut||'',r.location,r.department,r.classification,r.status,
  r.creditedMs===null?'':(r.creditedMs/3600000).toFixed(2)
 ]);
 return '\uFEFF'+rows.map(row=>row.map(safe).join(',')) .join('\r\n')+'\r\n';
}

function navigation(view,busy){
 return '<nav class="tt-navigation" aria-label="TimeTracker sections">'+
  '<div class="tt-navigation-scroll" role="tablist" aria-label="TimeTracker views">'+
  sections.map(([key,label,enabled])=>
   '<button type="button" role="tab" class="tt-nav-tab'+(view===key?' is-current':'')+
   '" aria-selected="'+(view===key)+'" data-action="tt-tab" data-target="'+key+'"'+
   (!enabled||busy?' disabled aria-disabled="true"':'')+
   (!enabled?' title="Awaiting native operational integration"':'')+
   '>'+esc(label)+'</button>'
  ).join('')+'</div></nav>';
}
function head(access){
 return '<header class="tt-app-header">'+
  '<div class="tt-app-brand"><span class="tt-brand-icon" aria-hidden="true">◷</span>'+
   '<div><h2>TimeTracker</h2><p>Attendance, scheduling &amp; team management</p></div></div>'+
  '<div class="tt-header-actions">'+
   '<span class="tt-role-pill" title="Existing centralized TimeTracker role">'+
    esc(access?.moduleRole||'Signed access required')+'</span>'+
  '</div></header>';
}
function notifications(verified){
 return '<div class="tt-notices" role="status">'+
  '<span class="tt-notice tt-notice-warning">⚠ &nbsp; Clock actions pending backend acceptance</span>'+
  (verified?'<span class="tt-notice tt-notice-neutral">ⓘ &nbsp; Signed workspace verified</span>':'')+
  '</div>';
}
function heading(title,desc){
 return '<div class="tt-subview-head"><div><h3>'+esc(title)+'</h3><p>'+
  esc(desc)+'</p></div></div>';
}
function clockPage(result,busy,now){
 const {access,records,active}=result;
 const t=timeTrackerClockParts(now);
 const today=now.toDateString();
 const todayRows=records.filter(r=>new Date(r.clockIn).toDateString()===today);
 const credited=todayRows.reduce((sum,r)=>sum+(r.creditedMs===null?
  creditedAttendanceMs(r.clockIn,now):r.creditedMs||0),0);
 const status=active?'Active':'Idle';
 let html='<div class="tt-clock-stage">'+
  '<div class="tt-clock-hero"><h3 id="tt-clock-greeting">'+t.greeting+'</h3>'+
   '<p id="tt-clock-date">'+t.day+'</p>'+
   '<div class="tt-clock-face" role="timer" aria-label="Current local time">'+
    '<span id="tt-clock-hours">'+t.hours+'</span>'+
    '<span class="tt-clock-colon" aria-hidden="true">:</span>'+
    '<span id="tt-clock-minutes">'+t.minutes+'</span>'+
    '<span class="tt-clock-suffix"><span id="tt-clock-seconds">'+t.seconds+
    '</span><span id="tt-clock-period">'+t.period+'</span></span>'+
   '</div></div>'+
  '<div class="tt-session-summary" aria-label="My attendance today">'+
   '<div><strong>'+todayRows.length+'</strong><span>Sessions</span></div>'+
   '<div><strong>'+(credited/3600000).toFixed(1)+'</strong><span>Hours</span></div>'+
   '<div><strong class="tt-summary-status">'+status+'</strong><span>Status</span></div>'+
  '</div>'+
  '<section class="tt-clock-card" aria-label="Attendance clock form">'+
   '<div class="tt-clock-card-head"><h4>'+ (active?'Clock Out':'Clock In')+
   '</h4><span class="tt-idle-badge '+(active?'tt-badge-active':'')+'">'+
    (active?'ACTIVE':'IDLE')+'</span></div>'+
   (active?'<p class="tt-active-copy">Your signed session began '+esc(date(active.clockIn))+
     '.</p>':'')+
   '<form id="tt-clock-form">'+
    '<label for="tt-location">Location'+select('tt-location',TT_LOCATIONS,'Select location…')+'</label>'+
    '<div class="tt-quick-location"><span>Quick select</span>'+
     '<button type="button" data-action="tt-location-shortcut" data-location="Office-Base Duty">◴ &nbsp; Office</button>'+
     '<button type="button" data-action="tt-location-shortcut" data-location="Offsite (Home)">⌖ &nbsp; Home</button>'+
    '</div>'+
    '<label for="tt-department">Department'+select('tt-department',TT_DEPARTMENTS,'Select department…')+'</label>'+
    '<label for="tt-note" class="tt-note-field" id="tt-note-wrap" hidden>'+
     'Offsite Work Note<textarea id="tt-note" maxlength="500" rows="3" placeholder="Describe your offsite work"></textarea></label>'+
    '<button class="tt-start-button" type="submit" name="tt-action" value="'+
      (active?'clock-out':'clock-in')+'"'+
      (busy||!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED?' disabled':'')+'>'+
      (active?'End session':'Start session')+'</button>'+
    (!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED?
     '<p class="tt-write-restriction" role="status">Live writes remain disabled until server-side offsite work-note, dedicated-board authorization and audit logging are accepted.</p>':
     '<p class="tt-clock-hint">Your attendance uses signed PostgreSQL timestamps and current GPS permission.</p>')+
   '</form></section>'+
  '<p class="tt-clock-footnote">Time records and permissions are provided by APSYNTRA CRM. No standalone TimeTracker login or local attendance store is used.</p>'+
 '</div>';
 return html;
}
function attendanceTable(records){
 return '<div class="table-scroll"><table class="board-table">'+
  '<thead><tr><th>Clock In</th><th>Clock Out</th><th>Location</th>'+
  '<th>Department</th><th>Status</th><th>Credited work</th></tr></thead><tbody>'+
  (records.slice(0,200).map(r=>'<tr><td>'+esc(date(r.clockIn))+'</td>'+
   '<td>'+esc(date(r.clockOut))+'</td><td>'+esc(r.location)+'</td>'+
   '<td>'+esc(r.department)+'</td><td>'+esc(r.classification)+' · '+esc(r.status)+'</td>'+
   '<td>'+esc(r.creditedMs===null?'Active':hrs(r.creditedMs))+'</td></tr>').join('')||
   '<tr><td colspan="6">No authenticated attendance records for this view.</td></tr>')+
  '</tbody></table></div>';
}
function historyPage(result,period,busy,view){
 const periodOptions=[
  ['today','Today'],['week','This week'],['month','This month'],['all','All history']
 ];
 const rows=view==='reports'?filterMyAttendancePeriod(result.records,period):result.records;
 return '<div class="tt-secondary-content">'+
  heading(view==='reports'?'My attendance reports':'My attendance history',
   'Authorized personal attendance records from the centralized TimeTracker store.')+
  '<div class="tt-content-panel"><div class="tt-panel-toolbar">'+
   '<h4>'+esc(view==='reports'?'Attendance report':'My attendance history')+'</h4>'+
   (view==='reports'?'<label for="tt-report-period">Report period <select id="tt-report-period">'+
     periodOptions.map(([key,label])=>'<option value="'+key+'"'+
      (period===key?' selected':'')+'>'+label+'</option>').join('')+'</select></label>':'')+
   '<button class="secondary" type="button" data-action="tt-export"'+
    (busy||!rows.length?' disabled':'')+'>Export my attendance CSV</button></div>'+
   attendanceTable(rows)+
   '<p class="tt-muted">Only your signed account’s records are displayed. GPS evidence, privileged audit payloads and other employees’ records are not included.</p>'+
  '</div></div>';
}
function overtimePage(result){
 const rows=Array.isArray(result.otRequests)?result.otRequests:[];
 return '<div class="tt-secondary-content">'+
 heading('My overtime requests','Read-only requests from the existing centralized TimeTracker state.')+
 '<div class="tt-content-panel"><h4>My overtime requests</h4>'+
 '<div class="table-scroll"><table class="board-table"><thead><tr>'+
 '<th>Date</th><th>Time</th><th>Duration</th><th>Status</th><th>Task</th>'+
 '</tr></thead><tbody>'+
 (rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.start)+'–'+esc(r.end)+
 '</td><td>'+esc(r.durationMinutes===null?'—':(r.durationMinutes/60).toFixed(2)+' h')+
 '</td><td>'+esc(r.status)+'</td><td>'+esc(r.task)+'</td></tr>').join('')||
 '<tr><td colspan="5">No authorized overtime requests available.</td></tr>')+
 '</tbody></table></div><p class="tt-muted">OT creation, approval and hour adjustments remain disabled until server-authorized workflows are verified.</p>'+
 '</div></div>';
}
export function renderTimeTrackerNative({
 result=null,busy=false,error='',success='',period='week',view='clock',now=new Date(),overviewFilters={}
}={}){
 const verified=result?.status==='VERIFIED_READ';
 const selected=['overview','clock','log','reports','ot'].includes(view)?view:'clock';
 let html='<section class="tt-native" aria-label="TimeTracker attendance application">'+
  head(verified?result.access:null)+notifications(verified)+navigation(selected,busy);
 if(error)html+='<div class="tt-feedback tt-feedback-error" role="alert">'+esc(error)+'</div>';
 if(success)html+='<div class="tt-feedback tt-feedback-success" role="status">'+esc(success)+'</div>';
 if(!verified){
  html+='<div class="tt-unavailable"><p>'+(busy?
   'Checking signed TimeTracker access and attendance records…':
   'Attendance is unavailable until signed workspace, board and module access are verified.')+
   '</p></div></section>';
  return html;
 }
 if(selected==='overview')html+=renderTimeTrackerOverview({
  overview:result.overview,access:result.access,now,filters:overviewFilters
 });
 if(selected==='clock')html+=clockPage(result,busy,new Date(now));
 if(selected==='log'||selected==='reports')
  html+=historyPage(result,period,busy,selected);
 if(selected==='ot')html+=overtimePage(result);
 html+='</section>';
 return html;
}
