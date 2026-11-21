import {isTimeTrackerHomeNoteRequired} from './time-tracker-offsite-note.js';
import {formatTimeTrackerDurationMs} from './time-tracker-duration-format.js';
import {formatTimeTrackerDateTime} from './time-tracker-time-format.js';
/** Native TimeTracker UI. Screen language adapted from the supplied Clock-tab reference.
 * Existing CRM shell, central identity, module access, and PostgreSQL data remain authoritative.
 */
import {
 TT_LOCATIONS,creditedAttendanceMs,filterMyAttendancePeriod,
 TT_LIVE_ATTENDANCE_WRITES_ACCEPTED,TT_POLICY
} from './time-tracker-native.js';
import {timeTrackerManilaDay} from './time-tracker-policy.js';
import {formatTimeTrackerAutoClockoutTime} from './time-tracker-auto-clockout.js';
import {renderTimeTrackerOverview} from './time-tracker-overview.js';
import {renderTimeTrackerLog} from './time-tracker-log.js';
import {renderTimeTrackerReports} from './time-tracker-reports.js';
import {renderTimeTrackerCalendar} from './time-tracker-calendar.js';
import {renderTimeTrackerOvertime} from './time-tracker-overtime.js';
import {renderTimeTrackerMyHours} from './time-tracker-my-hours.js';
import {renderTimeTrackerTeam} from './time-tracker-team.js';
import {renderTimeTrackerEmployees} from './time-tracker-application.js';
import {renderTimeTrackerMonitor} from './time-tracker-monitor.js';
import {renderTimeTrackerGps} from './time-tracker-gps.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const date=v=>v&&Number.isFinite(Date.parse(v))?
 formatTimeTrackerDateTime(v):'—';
const hrs=formatTimeTrackerDurationMs;
const sections=[
 ['overview','Overview',true],['clock','Clock',true],['employees','Employees',true],['log','Log',true],
 ['reports','Reports',true],['calendar','Calendar',true],
 ['ot','OT',true],['hours','My Hours',true],['team','Team',true],
 ['monitor','Monitor',true],['gps','GPS',true]
];
const sectionMeta=Object.freeze({
 overview:['Overview','Daily attendance activity and operational summary.'],
 clock:['Clock','Start or end your attendance session using the existing clock workflow.'],
 employees:['Employees','View active users with registered TimeTracker access in this workspace.'],
 log:['Attendance Log','Review attendance history and available attendance evidence.'],
 reports:['Reports','Review attendance summaries and export the available records.'],
 calendar:['Calendar','Review attendance across the Philippine calendar.'],
 ot:['Overtime','Review overtime requests and their current workflow state.'],
 hours:['My Hours','Track credited attendance hours across your work week and month.'],
 team:['Team','Review the available team directory and attendance context.'],
 monitor:['Monitor','Inspect TimeTracker service and synchronization status.'],
 gps:['GPS','Review permitted attendance location activity.']
});
const select=(id,values,placeholder,selected='')=>
 '<select id="'+id+'" name="'+id+'" required>'+
 '<option value="">'+esc(placeholder)+'</option>'+
 values.map(s=>'<option value="'+esc(s)+'"'+(s===selected?' selected':'')+'>'+esc(s)+'</option>').join('')+
 '</select>';

export function timeTrackerClockParts(at=new Date()){
 const time=new Date(at);
 if(!Number.isFinite(time.getTime()))throw new Error('Invalid clock date');
 // Philippine Time is UTC+08:00; never depend on the device/CI timezone.
 const ph=new Date(time.getTime()+8*60*60*1000);
 const hour=ph.getUTCHours();
 return {
  greeting:hour<12?'Good morning,':hour<17?'Good afternoon,':'Good evening,',
  day:time.toLocaleDateString('en-US',{
   timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric'
  }),
  hours:String(hour%12||12).padStart(2,'0'),
  minutes:String(ph.getUTCMinutes()).padStart(2,'0'),
  seconds:String(ph.getUTCSeconds()).padStart(2,'0'),
  period:hour>=12?'PM':'AM'
 };
}

/** Elapsed session duration is presentation only, not credited work or payroll. */
export function timeTrackerSessionElapsed(clockIn,at=new Date()){
 const start=Date.parse(clockIn);
 const now=new Date(at).getTime();
 if(!Number.isFinite(start)||!Number.isFinite(now))return {label:'00:00:00',progress:0};
 const elapsed=Math.max(0,now-start);
 return {
  label:formatTimeTrackerDurationMs(elapsed),
  progress:Math.min(1,elapsed/TT_POLICY.requiredWorkMs)
 };
}

/** Synchronize the clock and elapsed-time ring without rerendering or refetching. */
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
 const elapsed=root.querySelector('#tt-session-elapsed');
 if(elapsed?.dataset?.clockIn){
  const session=timeTrackerSessionElapsed(elapsed.dataset.clockIn,at);
  if(elapsed.textContent!==session.label)elapsed.textContent=session.label;
  const progress=root.querySelector('#tt-session-progress');
  progress?.setAttribute?.('stroke-dashoffset',String((339.292*(1-session.progress)).toFixed(3)));
 }
 const countdown=root?.querySelector?.('[data-tt-auto-clockout-countdown]');
 if(countdown?.dataset?.deadline){
  const remaining=Math.max(0,Date.parse(countdown.dataset.deadline)-new Date(at).getTime());
  const seconds=Math.floor(remaining/1000);
  const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),rest=seconds%60;
  const label=remaining<=0?'Due now':String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(rest).padStart(2,'0');
  if(countdown.textContent!==label)countdown.textContent=label;
 }
 return true;
}

export function ownAttendanceCsv(records){
 const rows=[['Clock In','Clock Out','Location','Department','Classification','Status','Credited Hours']];
 const safe=v=>'"'+String(v??'').replaceAll('"','""').replace(/^[=+@\-\t\r]/,"' $&")+'"';
 for(const r of records||[])rows.push([
  formatTimeTrackerDateTime(r.clockIn),r.clockOut?formatTimeTrackerDateTime(r.clockOut):'',r.location,r.department,r.classification,r.status,
  r.creditedMs===null?'':hrs(r.creditedMs)
 ]);
 return '\uFEFF'+rows.map(row=>row.map(safe).join(',')) .join('\r\n')+'\r\n';
}

function navigation(view,busy,bootstrapEligible=false,gpsEligible=false){
 return '<nav class="tt-navigation fm1-tabs" aria-label="TimeTracker sections">'+
  '<div class="tt-navigation-scroll" role="tablist" aria-label="TimeTracker views">'+
  sections.filter(([key])=>(key!=='team'||bootstrapEligible===true)&&
   (key!=='gps'||gpsEligible===true)).map(([key,label,enabled])=>
   '<button type="button" role="tab" class="tt-nav-tab fm1-tab'+(view===key?' is-current is-active':'')+
   '" aria-selected="'+(view===key)+'" data-action="tt-tab" data-target="'+key+'"'+
   (!enabled||busy?' disabled aria-disabled="true"':'')+
   (!enabled?' title="Awaiting native operational integration"':'')+
   '>'+esc(label)+'</button>'
  ).join('')+'</div></nav>';
}
function head(access,busy=false,view='clock'){
 return '<header class="tt-app-header fm1-app-header">'+
  '<div class="tt-pixi-backdrop" aria-hidden="true" data-pixi="fallback"></div>'+
  '<div class="tt-app-brand"><span class="tt-brand-icon" aria-hidden="true">◷</span>'+
   '<div><span class="fm1-eyebrow">APSYNTRA CRM · ATTENDANCE OPERATIONS</span>'+
    '<h1>TimeTracker <span>Attendance</span></h1>'+
    '<p>Attendance, scheduling &amp; team management</p></div></div>'+
  '<div class="tt-header-actions fm1-header-status">'+
   (view==='clock'?'<button type="button" class="tt-header-refresh" data-action="tt-refresh"'+
    (busy?' disabled':'')+' aria-label="Refresh TimeTracker attendance">↻ Refresh</button>':'')+
   '<button type="button" class="tt-header-link" data-action="tt-tab" data-target="hours"'+
    (busy?' disabled':'')+'>▦ &nbsp; My Hours <span aria-hidden="true">›</span></button>'+
   '<span class="tt-role-pill" title="Existing centralized TimeTracker role">'+
    esc(access?.moduleRole||(busy?'Checking signed access…':'Signed access required'))+'</span>'+
  '</div></header>';
}
function applicationHeading(view,busy){
 const [title,description]=sectionMeta[view]||sectionMeta.clock;
 return '<div class="fm1-page-heading tt-application-heading"><div>'+
  '<span class="fm1-eyebrow">TIMEKEEPING WORKSPACE</span><h2>'+esc(title)+'</h2>'+
  '<p>'+esc(description)+'</p></div>'+
  '<button type="button" class="fm1-quiet-button tt-refresh-button" data-action="tt-refresh"'+
  (busy?' disabled':'')+'>↻ Refresh</button></div>';
}
function applicationFooter(){
 return '<footer class="fm1-app-footer tt-application-footer"><span>APSYNTRA CRM · TimeTracker Attendance</span>'+
  '<span>Asia/Manila (UTC+8) · Existing attendance records</span></footer>';
}
function notifications(verified,writeReady=false,busy=false){
 return '<div class="tt-notices" role="status">'+
  (writeReady?'<span class="tt-notice tt-notice-neutral">✓ &nbsp; Signed Clock writes active</span>':
  '<span class="tt-notice '+(busy?'tt-notice-neutral':'tt-notice-warning')+'">'+
  (busy?'◷ &nbsp; Verifying Clock access…':'⚠ &nbsp; Clock actions pending backend acceptance')+'</span>')+
  (verified?'<span class="tt-notice tt-notice-neutral">ⓘ &nbsp; Signed workspace verified</span>':'')+
  '</div>';
}
function heading(title,desc){
 return '<div class="tt-subview-head"><div><h3>'+esc(title)+'</h3><p>'+
  esc(desc)+'</p></div></div>';
}
function clockPage(result,busy,now,clockPending=false,clockPendingAction='clock-out',locationPreference='',{
 success='',clockCorrectionNotice='',geoPromptVisible=false,geoPermission='unknown',geoMessage='',clockStage='idle'
}={}){
 const {access,records,active}=result;
 const writeReady=TT_LIVE_ATTENDANCE_WRITES_ACCEPTED&&access?.attendanceWritesAccepted===true;
 const t=timeTrackerClockParts(now);
 const today=timeTrackerManilaDay(now);
 const todayRows=records.filter(r=>timeTrackerManilaDay(r.clockIn)===today);
 const credited=todayRows.reduce((sum,r)=>sum+(r.creditedMs===null?
  creditedAttendanceMs(r.clockIn,now):r.creditedMs||0),0);
 const status=active?'Active':'Idle';
 const locationEnabled=geoPermission==='granted';
 const geoWarning=geoPermission==='denied'||geoPermission==='unavailable';
 const geoTitle=clockStage==='location'?'Getting GPS for this attendance action…':
  locationEnabled?'Location captured for this action':
  geoPermission==='denied'?'Location permission blocked':
  geoPermission==='unavailable'?'GPS unavailable':'Location could not be verified';
 const geoDescription=clockStage==='location'?
  'Location is requested because you pressed Start Session or End Session.':
  geoMessage||(locationEnabled?
  'A fresh GPS fix was captured for this attendance attempt.':
  geoPermission==='denied'?
  'Allow Location for this site in your browser settings and enable device Location Services, then press Start Session or End Session again.':
  geoPermission==='unavailable'?
  'Enable device Location Services and check connectivity, then press Start Session or End Session again.':
  'Please press Start Session or End Session to request a fresh location fix.');
 const employeeDepartment=access?.employeeDepartment||null;
 const location=TT_LOCATIONS.includes(locationPreference)?locationPreference:'';
 const showHomeNote=location==='Offsite (Home)';
 const requireHomeNote=isTimeTrackerHomeNoteRequired(location,access?.email,access?.userId);
 const session=active?timeTrackerSessionElapsed(active.clockIn,now):null;
 const autoClockout=active&&result.autoClockout?.recordId===active.id?result.autoClockout:null;
 const autoDeadline=autoClockout?.nextAt||autoClockout?.cutoffAt;
 const autoUnavailable=active&&result.autoClockoutUnavailable===true;
 const autoLabel=autoUnavailable?'Automatic clock-out status unavailable':
  !autoClockout?'':autoClockout.status==='MONITORING'?
  'Automatic clock-out monitoring · nine-hour threshold at ':
  autoClockout.status==='GRACE'?'Grace period active · automatic clock-out at ':
  autoClockout.status==='OVERTIME'?'Approved overtime active · automatic clock-out at ':
  autoClockout.status==='DUE'?'Automatic clock-out due · scheduled cutoff ':
  'Automatic clock-out monitoring unavailable';
 let html='<div class="tt-clock-stage tt-command-center">'+
  '<div class="tt-command-layout">'+
   '<section class="tt-time-dashboard" aria-label="Live time and attendance summary">'+
    '<div class="tt-time-scene" aria-hidden="true">'+
     '<div class="tt-pixi-backdrop" data-pixi="fallback"></div>'+
     '<span class="tt-time-orbit tt-time-orbit-outer"></span>'+
     '<span class="tt-time-orbit tt-time-orbit-inner"></span>'+
     '<span class="tt-time-orbit tt-time-orbit-horizon"></span>'+
    '</div>'+
    '<div class="tt-time-dashboard-head">'+
     '<span class="tt-dashboard-kicker">APSYNTRA <span class="tt-kicker-separator">/</span> TIMEKEEPING</span>'+
     '<span class="tt-timezone-pill">UTC +08:00</span>'+
    '</div>'+
    '<div class="tt-clock-hero">'+
     '<span class="tt-clock-eyebrow">PHILIPPINE STANDARD TIME</span>'+
     '<h3 id="tt-clock-greeting">'+t.greeting+'</h3>'+
     '<p id="tt-clock-date">'+t.day+'</p>'+
     '<div class="tt-clock-face" role="timer" aria-label="Current Philippine time">'+
      '<span id="tt-clock-hours">'+t.hours+'</span>'+
      '<span class="tt-clock-colon" aria-hidden="true">:</span>'+
      '<span id="tt-clock-minutes">'+t.minutes+'</span>'+
      '<span class="tt-clock-suffix"><span id="tt-clock-seconds">'+t.seconds+
      '</span><span id="tt-clock-period">'+t.period+'</span></span>'+
     '</div>'+
     '<p class="tt-clock-source">Live device time displayed in the organization’s timezone</p>'+
    '</div>'+
    '<div class="tt-dashboard-section-label">TODAY’S ATTENDANCE</div>'+
    '<div class="tt-session-summary" aria-label="My attendance today">'+
     '<div><strong>'+todayRows.length+'</strong><span>Sessions</span></div>'+
     '<div><strong>'+hrs(credited)+'</strong><span>Hours</span></div>'+
     '<div><strong class="tt-summary-status">'+status+'</strong><span>Status</span></div>'+
    '</div>'+
    '<p class="tt-dashboard-source">Attendance totals use your authorized TimeTracker records.</p>'+
   '</section>'+
   '<section class="tt-clock-card tt-attendance-console" aria-label="Attendance clock form">'+
    (success?'<div class="tt-clock-confirmed" role="status" aria-live="polite">'+
     '<span class="tt-clock-confirmed-icon" aria-hidden="true">✓</span>'+
     '<div><strong>'+(success.startsWith('Clock Out')?'Successfully clocked out':'Successfully clocked in')+
     '</strong><p>'+esc(success)+'</p></div></div>':'')+
    (clockCorrectionNotice?'<p class="tt-clock-sync-status" role="status" aria-live="polite">'+esc(clockCorrectionNotice)+'</p>':'')+
    '<div class="tt-console-kicker"><span class="tt-console-kicker-mark" aria-hidden="true"></span> ATTENDANCE CONTROL</div>'+
    '<div class="tt-clock-card-head"><h4>'+ (active?'Active Session':'Clock In')+
     '</h4><span class="tt-idle-badge '+(active?'tt-badge-active':'')+'">'+
      (active?'ACTIVE':'IDLE')+'</span></div>'+
    '<p class="tt-console-description">'+(active?
     'End the current signed attendance session using a fresh GPS fix.':
     'Start your work session with a signed record and a fresh GPS fix.')+'</p>'+
    (active?'<div class="tt-session-progress-wrap">'+
      '<div class="tt-session-ring" role="timer" aria-label="Elapsed time for active attendance session">'+
       '<svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">'+
        '<circle class="tt-session-ring-track" cx="64" cy="64" r="54"></circle>'+
        '<circle id="tt-session-progress" class="tt-session-ring-progress" cx="64" cy="64" r="54"'+
         ' stroke-dasharray="339.292" stroke-dashoffset="'+
         (339.292*(1-session.progress)).toFixed(3)+'"></circle></svg>'+
       '<div class="tt-session-ring-center"><strong id="tt-session-elapsed" data-clock-in="'+
        esc(active.clockIn)+'">'+session.label+'</strong><span>elapsed</span></div>'+
      '</div><p class="tt-session-progress-note">Session duration · credited hours may differ</p></div>'+
      ((autoClockout||autoUnavailable)?'<p class="tt-clock-hint tt-auto-clockout-state" role="status">'+esc(autoLabel)+
       (autoDeadline?'<strong>'+esc(formatTimeTrackerAutoClockoutTime(autoDeadline))+'</strong> · '+
        '<span data-tt-auto-clockout-countdown data-deadline="'+esc(autoDeadline)+'">—</span> remaining':'')+
       '</p>':'')+
      '<p class="tt-active-copy">Started '+esc(date(active.clockIn))+'</p>':'')+
    '<form id="tt-clock-form">'+
     (active?
      '<div class="tt-active-session-context" aria-label="Active attendance details">'+
       '<div><span>Recorded work location</span><strong>'+esc(active.location)+'</strong></div>'+
       '<div><span>Recorded department</span><strong>'+esc(active.department)+'</strong></div>'+
       '<p>Clock Out uses the same signed attendance session and captures a new browser GPS fix.</p>'+
      '</div>':
      '<label for="tt-location">Location'+select('tt-location',TT_LOCATIONS,'Select location…',location)+'</label>'+
      '<div class="tt-quick-location"><span>Quick select</span>'+
       '<button type="button" data-action="tt-location-shortcut" data-location="Office-Base Duty" aria-pressed="'+
        (location==='Office-Base Duty')+'" class="'+(location==='Office-Base Duty'?'is-selected':'')+'">◴ &nbsp; Office</button>'+
       '<button type="button" data-action="tt-location-shortcut" data-location="Offsite (Home)" aria-pressed="'+
        (location==='Offsite (Home)')+'" class="'+(location==='Offsite (Home)'?'is-selected':'')+'">⌖ &nbsp; Home</button>'+
      '</div>'+
      '<div class="tt-employee-department" aria-label="Assigned employee department">'+
       '<span>Department</span><strong>'+esc(employeeDepartment||'Not assigned')+'</strong>'+
       (employeeDepartment?'':'<small>Ask your TimeTracker administrator to assign your department before clocking in.</small>')+
      '</div>')+
     '<label for="tt-note" class="tt-note-field" id="tt-note-wrap"'+
      (((active&&active.location==='Offsite (Home)')||(!active&&showHomeNote))?'':' hidden')+'>'+
      'Offsite Work Note'+(!active?'<span id="tt-note-requirement">'+(requireHomeNote?' (required)':' (optional)')+'</span>':'')+'<textarea id="tt-note"'+((!active&&requireHomeNote)?' required':'')+
      (active?' readonly':'')+' maxlength="500" rows="3" placeholder="Describe your offsite work">'+
      (active?esc(active.workNote||''):'')+'</textarea></label>'+
     (geoPromptVisible?'<div class="tt-location-readiness '+(locationEnabled?'is-ready':geoWarning?'needs-action':'needs-permission')+
      '" role="status" aria-live="polite">'+
      '<span class="tt-location-indicator" aria-hidden="true">'+(locationEnabled?'✓':'⌖')+'</span>'+
      '<div class="tt-location-content"><strong>'+esc(geoTitle)+'</strong>'+
      '<p>'+esc(geoDescription)+'</p></div></div>':'')+
     (clockPending?
      '<p class="tt-clock-hint" role="status">'+(clockPendingAction==='clock-in'?'Clock-in':'Clock-out')+
      ' status needs verification. A second attendance write is blocked until a fresh signed read confirms the result.</p>'+
      '<button class="tt-start-button" type="button" data-action="tt-clock-verify"'+
       (busy?' disabled':'')+'>Verify session status</button>':
      '<button class="tt-start-button" type="submit" name="tt-action" value="'+
       (active?'clock-out':'clock-in')+'"'+
       (busy||!writeReady||(!active&&!employeeDepartment)?' disabled':'')+'>'+
       (busy&&clockStage==='location'?'Getting GPS…':
        busy&&clockStage==='saving'?'Saving securely…':
        busy&&clockStage==='verifying'?'Verifying record…':
        active?'End session':'Start session')+'</button>')+
     (!writeReady?
      '<p class="tt-write-restriction" role="status">Live writes remain disabled until server-side offsite work-note, dedicated-board authorization and audit logging are accepted.</p>':
      '<p class="tt-clock-hint">Your session is securely recorded when you start or end attendance.</p>')+
    '</form>'+
   '</section>'+
  '</div>'+
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

export function renderTimeTrackerNative({
 result=null,busy=false,clockPending=false,clockPendingAction='clock-out',locationPreference='',geoPromptVisible=false,geoPermission='unknown',geoMessage='',clockStage='idle',clockCorrectionNotice='',error='',success='',period='all',view='clock',now=new Date(),employeesSearch='',overviewFilters={},logFilters={},reportFilters={},calendarMonth='',calendarSelectedDay='',otFilters={},otExpandedRequestIds=[],otModalOpen=false,otDraft={},hoursWeekOffset=0,hoursMonth='',hoursSelectedDay='',teamEligible=false,teamDirectory=null,teamFilters={},teamBusy=false,teamError='',monitorResult=null,monitorHistory=[],monitorBusy=false,monitorError='',
 logGpsEligible=false,logGpsData=null,logGpsBusy=false,logGpsError='',logGpsErrorRecordId='',logExpandedRecordIds=[],mapEnabled=false,mapTheme='map',gpsEligible=false,gpsData=null,gpsView='map',gpsFilters={},gpsBusy=false,gpsError='',
 adminEligible=false,adminFullAccess=adminEligible,adminDirectory=[],adminSelectedIds=[],adminEditor=null,adminDeleteConfirm=null,adminBusy=false,adminError='',adminSuccess=''
}={}){
 const verified=result?.status==='VERIFIED_READ';
 const selected=((view==='team'&&teamEligible!==true)||
  (view==='gps'&&gpsEligible!==true))?'clock':
 ['overview','clock','employees','log','reports','calendar','ot','hours','team','monitor','gps'].includes(view)?view:'clock';
 let html='<section class="tt-native" aria-label="TimeTracker attendance application"><div class="fm1-app tt-application" data-tt-view="'+selected+'" data-tt-application-root>'+
  head(verified?result.access:null,busy,selected)+navigation(selected,busy,verified&&teamEligible===true,verified&&gpsEligible===true)+
  applicationHeading(selected,busy)+notifications(verified,verified&&result.access?.attendanceWritesAccepted===true,busy);
 if(busy&&verified&&selected==='clock')html+='<div class="tt-clock-sync-status" role="status" aria-live="polite">'+
  '<span class="tt-inline-spinner" aria-hidden="true"></span>Synchronizing signed attendance…</div>';
 if(error)html+='<div class="tt-feedback tt-feedback-error" role="alert">'+esc(error)+'</div>';
 if(success&&selected!=='clock')html+='<div class="tt-feedback tt-feedback-success" role="status">'+esc(success)+'</div>';
 if(!verified){
  html+='<div class="tt-unavailable"><div class="tt-signed-loading" role="status" aria-live="polite">'+
   (busy?'<span class="tt-loading-indicator" aria-hidden="true"></span>'+
    '<h3>Connecting to TimeTracker</h3>'+
    '<p>Verifying your signed account and latest attendance record…</p>'+
    '<small>Your Clock screen will appear automatically. No attendance action is being submitted.</small>':
    '<h3>Attendance access needs verification</h3>'+
    '<p>Signed workspace, board or module access is unavailable. Refresh or sign in again.</p>')+
   '</div></div>'+applicationFooter()+'</div></section>';
  return html;
 }
 if(selected==='overview')html+=renderTimeTrackerOverview({
  overview:result.overview,access:result.access,now,filters:overviewFilters
 });
 if(selected==='clock')html+=clockPage(result,busy,new Date(now),clockPending,clockPendingAction,locationPreference,{
  success,clockCorrectionNotice,geoPromptVisible,geoPermission,geoMessage,clockStage
 });
 if(selected==='employees')html+=renderTimeTrackerEmployees({
  directory:result.access?.employees,access:result.access,search:employeesSearch,loading:busy
 });
 if(selected==='log')html+=renderTimeTrackerLog({
  records:result.log?.rows||result.records,
  scope:result.log?.scope||'OWN_ATTENDANCE_ONLY',
  filters:logFilters,now,busy,
  gpsEligible:logGpsEligible,gpsData:logGpsData,gpsBusy:logGpsBusy,gpsError:logGpsError,
  gpsErrorRecordId:logGpsErrorRecordId,expandedRecordIds:logExpandedRecordIds,mapEnabled,mapTheme,
  adminEligible,adminFullAccess,adminDirectory,selectedIds:adminSelectedIds,adminEditor,adminDeleteConfirm,adminBusy,adminError,adminSuccess
 });
 if(selected==='reports')html+=renderTimeTrackerReports({
  rows:result.log?.rows||result.records,
  scope:result.log?.scope||'OWN_ATTENDANCE_ONLY',
  period,filters:reportFilters,now,busy,
  otRequests:result.otRequests||[],otContractActive:result.access?.otContractActive===true
 });
 if(selected==='calendar')html+=renderTimeTrackerCalendar({
  records:result.log?.rows||result.records,
  scope:result.log?.scope||'OWN_ATTENDANCE_ONLY',
  month:calendarMonth,selectedDay:calendarSelectedDay,now,busy
 });
 if(selected==='team')html+=renderTimeTrackerTeam({
  directory:teamDirectory,access:{...result.access,bootstrapTeamEligible:teamEligible===true},
  filters:teamFilters,loading:teamBusy,error:teamError,now
 });
 if(selected==='gps')html+=renderTimeTrackerGps({
  data:gpsData,eligible:gpsEligible,view:gpsView,filters:gpsFilters,
  loading:gpsBusy,error:gpsError,now,mapEnabled
 });
 if(selected==='monitor')html+=renderTimeTrackerMonitor({
  result:monitorResult,history:monitorHistory,loading:monitorBusy,error:monitorError,now
 });
 if(selected==='hours')html+=renderTimeTrackerMyHours({
  records:result.records,access:result.access,
  weekOffset:hoursWeekOffset,month:hoursMonth,
  selectedDay:hoursSelectedDay,now,busy
 });
 if(selected==='ot')html+=renderTimeTrackerOvertime({
  requests:result.otRequests||[],access:result.access,
  filters:otFilters,expandedRequestIds:otExpandedRequestIds,modalOpen:otModalOpen,form:otDraft,now
 });
 html+=applicationFooter()+'</div></section>';
 return html;
}
