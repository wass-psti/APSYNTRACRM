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
import {renderTimeTrackerLog,timeTrackerLogRowsForSnapshot} from './time-tracker-log.js';
import {renderTimeTrackerReports} from './time-tracker-reports.js';
import {renderTimeTrackerCalendar} from './time-tracker-calendar.js';
import {renderTimeTrackerOvertime} from './time-tracker-overtime.js';
import {renderTimeTrackerMyHours} from './time-tracker-my-hours.js';
import {renderTimeTrackerTeam} from './time-tracker-team.js';
import {renderTimeTrackerEmployees,canViewTimeTrackerEmployees} from './time-tracker-application.js';
import {renderTimeTrackerOjtClock} from './apps/TimeTracker/time-tracker-ojt.js';
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
 ['ot','OT',true],['reports','Reports',true],['calendar','Calendar',true],
 ['hours','My Hours',true],['team','Team',true],
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

/** Live credited work for the signed session, using the same PHT lunch policy as attendance totals. */
function normalizedGoalMs(value){
 return Number.isFinite(value)&&value>=TT_POLICY.requiredWorkMs&&value<=15*60*60*1000?
  value:TT_POLICY.requiredWorkMs;
}
function timeTrackerGoalLabel(targetWorkMs){
 const minutes=Math.round(normalizedGoalMs(targetWorkMs)/60000);
 const hours=Math.floor(minutes/60),remainder=minutes%60;
 return remainder?hours+'h '+remainder+'m goal':hours+'h goal';
}
export function timeTrackerSessionElapsed(clockIn,at=new Date(),targetWorkMs=TT_POLICY.requiredWorkMs){
 const start=Date.parse(clockIn);
 const now=new Date(at).getTime();
 if(!Number.isFinite(start)||!Number.isFinite(now))return {label:'00:00:00',progress:0};
 const elapsed=creditedAttendanceMs(clockIn,at);
 return {
  label:formatTimeTrackerDurationMs(elapsed),
  progress:Math.min(1,elapsed/normalizedGoalMs(targetWorkMs))
 };
}

function timeTrackerGoalRemaining(clockIn,at,targetWorkMs=TT_POLICY.requiredWorkMs){
 const goal=normalizedGoalMs(targetWorkMs);
 const minutes=Math.ceil(Math.max(0,goal-creditedAttendanceMs(clockIn,at))/60000);
 return minutes?Math.floor(minutes/60)+'h '+minutes%60+'m to goal':timeTrackerGoalLabel(goal)+' reached';
}

/** Change a text node in place instead of replacing the element's children. */
function updateClockText(node,value){
 if(!node)return false;
 const next=String(value??'');
 if(node.textContent===next)return false;
 if(node.childNodes?.length===1&&node.firstChild?.nodeType===3)
  node.firstChild.nodeValue=next;
 else node.textContent=next;
 return true;
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
  if(node)updateClockText(node,value);
 }
 const welcome=root.querySelector('[data-tt-welcome-greeting]');
 if(welcome)updateClockText(welcome,parts.greeting);
 const elapsed=root.querySelector('#tt-session-elapsed');
 if(elapsed?.dataset?.clockIn){
  const target=Number(elapsed.dataset.goalTargetMs);
  const session=timeTrackerSessionElapsed(elapsed.dataset.clockIn,at,target);
  updateClockText(elapsed,session.label);
  const progress=root.querySelector('#tt-session-progress');
  const dashOffset=String((339.292*(1-session.progress)).toFixed(3));
  if(progress&&progress.getAttribute?.('stroke-dashoffset')!==dashOffset)
   progress.setAttribute('stroke-dashoffset',dashOffset);
 }
 const total=root.querySelector('[data-tt-live-total]');
 if(total?.dataset?.ttLiveTotal){
  const value=total.querySelector('strong');
  if(value)updateClockText(value,hrs(Number(total.dataset.creditedBase||0)+creditedAttendanceMs(total.dataset.ttLiveTotal,at)));
 }
 const goal=root.querySelector('[data-tt-goal-remaining]');
 if(goal?.dataset?.ttGoalRemaining){
  updateClockText(goal,timeTrackerGoalRemaining(goal.dataset.ttGoalRemaining,at,
   Number(goal.dataset.ttGoalTargetMs)));
 }
 const countdown=root?.querySelector?.('[data-tt-auto-clockout-countdown]');
 if(countdown?.dataset?.deadline){
  const remaining=Math.max(0,Date.parse(countdown.dataset.deadline)-new Date(at).getTime());
  const seconds=Math.floor(remaining/1000);
  const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),rest=seconds%60;
  const label=remaining<=0?'Due now':String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(rest).padStart(2,'0');
  updateClockText(countdown,label);
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

function navigation(view,busy,bootstrapEligible=false,gpsEligible=false,employeesEligible=false){
 return '<nav class="tt-navigation fm1-tabs" aria-label="TimeTracker sections">'+
  '<div class="tt-navigation-scroll" role="tablist" aria-label="TimeTracker views">'+
  sections.filter(([key])=>(key!=='team'||bootstrapEligible===true)&&
   (key!=='gps'||gpsEligible===true)&&
   (key!=='employees'||employeesEligible===true)).map(([key,label,enabled])=>
   '<button type="button" role="tab" class="tt-nav-tab fm1-tab'+(view===key?' is-current is-active':'')+
   '" aria-selected="'+(view===key)+'" data-action="tt-tab" data-target="'+key+'"'+
   (!enabled||busy?' disabled aria-disabled="true"':'')+
   (!enabled?' title="Awaiting native operational integration"':'')+
   '>'+esc(label)+'</button>'
  ).join('')+'</div></nav>';
}
/** Reparent the existing authorized tabs; never synthesize a second set of actions.
 * Narrow screens and the collapsed icon rail retain the original in-content navigation.
 */
// Load only the same-origin font when the standalone reference Clock is mounted.
let referenceFont;
function loadTimeTrackerReferenceFont(documentRef){
 if(!documentRef?.fonts||typeof FontFace==='undefined')return;
 if(referenceFont)return;
 const url=new URL('./assets/fonts/Montserrat-SemiBold.woff2',import.meta.url);
 referenceFont=new FontFace('Montserrat','url("'+url.href+'")',{weight:'600',style:'normal',display:'swap'});
 documentRef.fonts.add(referenceFont);
 referenceFont.load().catch(()=>{documentRef.fonts.delete(referenceFont);referenceFont=null;});
}
export function syncTimeTrackerSidebar(shell,{enabled=false,expanded=false,fresh=false,submenuOpen=true}={}){
 const sidebar=shell.querySelector('.aps-sidebar');
 const application=shell.querySelector('.main-content .tt-application');
 if(enabled&&application?.hasAttribute?.('data-tt-reference-shell'))loadTimeTrackerReferenceFont(shell.ownerDocument);
 const parent=sidebar?.querySelector('a.nav-link[href="#/time-tracker"]');
 const previous=sidebar?.querySelector('.tt-navigation');
 if(fresh)previous?.remove();
 const nav=application?.querySelector('.tt-navigation')||(!fresh?previous:null);
 const mounted=Boolean(enabled&&expanded&&parent&&application&&nav);
 if(mounted){
  if(parent.nextElementSibling!==nav)parent.after(nav);
  nav.hidden=!submenuOpen;
  nav.setAttribute?.('id','tt-sidebar-submenu');
  parent.setAttribute('aria-expanded',String(submenuOpen));
  parent.setAttribute('aria-controls','tt-sidebar-submenu');
  parent.setAttribute('role','button');
  parent.setAttribute('data-action','tt-sidebar-disclosure');
  nav.querySelector('[role="tablist"]')?.setAttribute('aria-orientation','vertical');
 }else{
  for(const attr of ['aria-expanded','aria-controls','role','data-action'])parent?.removeAttribute(attr);
  if(nav){nav.hidden=false;nav.removeAttribute?.('id');}
  if(nav&&application&&sidebar?.contains(nav)){
   const header=application.querySelector('.tt-app-header');
   if(header)header.after(nav);
   else application.prepend(nav);
   nav.querySelector('[role="tablist"]')?.removeAttribute('aria-orientation');
  }else if(!application)previous?.remove();
 }
 shell.classList.toggle('tt-sidebar-mounted',mounted);
 // Attendance Log controls belong to its content; keep the global topbar uniform.
 const breadcrumb=shell.querySelector('.breadcrumb');
 const old=breadcrumb?.querySelector('.tt-section-crumb');
 const label=enabled?nav?.querySelector('[aria-selected="true"]')?.textContent:'';
 if(label&&breadcrumb){
  const item=old||breadcrumb.ownerDocument.createElement('span');
  item.className='tt-section-crumb';
  item.textContent='› '+label;
  if(!old)breadcrumb.append(item);
 }else old?.remove();
 return mounted;
}

function head(access,busy=false,view='clock'){
 const role=access?.moduleRole||'';
 const roleLabel=role==='System Admin'?'System admin':role||(busy?'Checking signed access…':'Signed access required');
 const initials=role?role.trim().split(/\s+/).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join(''):'—';
 const icon=body=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
 const clock=icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
 const refresh=icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-2L20 12M4 12l2.3 6A7 7 0 0 0 18 16"/>');
 const calendar=icon('<rect x="3" y="5" width="15" height="15" rx="2"/><path d="M7 3v4m7-4v4M3 10h15"/><circle cx="18" cy="17" r="5"/><path d="M18 14.5V17l1.5 1"/>');
 const chevron=icon('<path d="m7 10 5 5 5-5"/>');
 return '<header class="tt-app-header fm1-app-header">'+
  '<div class="tt-pixi-backdrop" aria-hidden="true" data-pixi="fallback"></div>'+
  '<div class="tt-app-brand"><span class="tt-brand-icon" aria-hidden="true">'+clock+'</span>'+
   '<div><span class="fm1-eyebrow">APSYNTRA CRM · ATTENDANCE OPERATIONS</span>'+
    '<h1>TimeTracker <span>Attendance</span></h1>'+
    '<p>Attendance, scheduling and team management</p></div></div>'+
  '<div class="tt-header-actions fm1-header-status">'+
   '<div class="tt-header-utilities">'+
   (view==='clock'?'<button type="button" class="tt-header-refresh" data-action="tt-refresh"'+
    (busy?' disabled':'')+' aria-label="Refresh TimeTracker attendance" title="Refresh attendance">'+refresh+'</button>':'')+
   '<button type="button" class="tt-header-link" data-action="tt-tab" data-target="hours"'+
    (busy?' disabled':'')+'>'+calendar+'<span>My hours</span><span class="tt-header-chevron" aria-hidden="true">'+chevron+'</span></button></div>'+
   '<span class="tt-header-identity" title="Existing centralized TimeTracker role">'+
    '<span class="tt-header-avatar" aria-hidden="true">'+esc(initials)+'</span>'+
    '<span class="tt-header-role">'+esc(roleLabel)+'</span></span>'+
  '</div></header>';
}
function applicationHeading(view,busy,adminEligible=false,adminFullAccess=false){
 const [title,defaultDescription]=sectionMeta[view]||sectionMeta.clock;
 const description=view==='log'?(adminEligible?(adminFullAccess?'Authorized attendance history and record management.':'Authorized attendance history and time corrections.'):'Read-only history of authorized sessions, today and earlier.'):defaultDescription;
 return '<div class="fm1-page-heading tt-application-heading"><div>'+
  '<span class="fm1-eyebrow">TIMEKEEPING WORKSPACE</span><h2>'+esc(title)+'</h2>'+
  '<p>'+esc(description)+'</p></div>'+
  '<button type="button" class="fm1-quiet-button tt-refresh-button" data-action="tt-refresh"'+
  (busy?' disabled':'')+(view==='log'?' aria-label="Refresh attendance" title="Refresh attendance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-2L20 12M4 12l2.3 6A7 7 0 0 0 18 16"/></svg>':'>↻ Refresh')+'</button></div>';
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
 success='',clockCorrectionNotice='',geoPromptVisible=false,geoPermission='unknown',geoMessage='',clockStage='idle',workPlanDraft='',displayName='',referenceShell=false,gpsDiagnosticsAvailable=false
}={}){
 const {access,records,active}=result;
 const writeReady=TT_LIVE_ATTENDANCE_WRITES_ACCEPTED&&access?.attendanceWritesAccepted===true;
 const t=timeTrackerClockParts(now);
 const today=timeTrackerManilaDay(now);
 const todayRows=records.filter(r=>timeTrackerManilaDay(r.clockIn)===today);
 const credited=todayRows.reduce((sum,r)=>sum+(r.creditedMs===null?
  creditedAttendanceMs(r.clockIn,now):r.creditedMs||0),0);
 const status=active?'Active':'Not clocked in';
 const locationEnabled=geoPermission==='granted';
 const geoWarning=geoPermission==='denied'||geoPermission==='unavailable';
 const automaticGps=clockStage==='auto-location'||clockStage==='auto-saving';
 const geoTitle=clockStage==='auto-location'?'Getting GPS for automatic clock-out…':
  clockStage==='auto-saving'?'Completing automatic clock-out…':
  clockStage==='location'?'Getting GPS for this attendance action…':
  locationEnabled?'Location captured for this action':
  geoPermission==='denied'?'Location permission blocked':
  geoPermission==='unavailable'?'GPS unavailable':'Location could not be verified';
 const geoDescription=automaticGps?geoMessage||'The scheduled clock-out is pending until a fresh foreground GPS fix is captured.':
  clockStage==='location'?
  'Location is requested because you pressed Start Session or End Session.':
  geoMessage||(locationEnabled?
  'A fresh GPS fix was captured for this attendance attempt.':
  geoPermission==='denied'?
  'Allow Location for this site in your browser settings and enable device Location Services, then press Start Session or End Session again.':
  geoPermission==='unavailable'?
  'Enable device Location Services and check connectivity, then press Start Session or End Session again.':
  'Please press Start Session or End Session to request a fresh location fix.');
 const employeeDepartment=access?.employeeDepartment||null;
 const location=TT_LOCATIONS.includes(locationPreference)?locationPreference:'Office-Base Duty';
 const requireHomeNote=isTimeTrackerHomeNoteRequired(location,access?.email,access?.userId);
 // Exempt employees have no Home note field, whether starting or ending a session.
 const showHomeNote=location==='Offsite (Home)'&&requireHomeNote;
 const showActiveHomeNote=active?.location==='Offsite (Home)'&&
  isTimeTrackerHomeNoteRequired(active.location,access?.email,access?.userId);
 const autoClockout=active&&result.autoClockout?.recordId===active.id?result.autoClockout:null;
 const overtimeCutoff=autoClockout?.overtimeCutoffAt;
 const cutoffWorkMs=overtimeCutoff?creditedAttendanceMs(active.clockIn,overtimeCutoff):TT_POLICY.requiredWorkMs;
 const goalTargetMs=Number.isFinite(cutoffWorkMs)&&cutoffWorkMs>TT_POLICY.requiredWorkMs?
  normalizedGoalMs(cutoffWorkMs):TT_POLICY.requiredWorkMs;
 const goalLabel=timeTrackerGoalLabel(goalTargetMs);
 const session=active?timeTrackerSessionElapsed(active.clockIn,now,goalTargetMs):null;
 const autoDeadline=autoClockout?.status==='PENDING_GPS'?null:
  autoClockout?.overtimeCutoffAt||autoClockout?.nextAt||autoClockout?.cutoffAt;
 const autoUnavailable=active&&result.autoClockoutUnavailable===true;
 const autoLabel=autoUnavailable?'Automatic clock-out status unavailable':
  !autoClockout?'':autoClockout.status==='MONITORING'?
  (autoClockout.overtimeCutoffAt?'Approved overtime scheduled · automatic clock-out at ':
   'Automatic clock-out monitoring · nine-hour threshold at '):
  autoClockout.status==='GRACE'?'Grace period active · automatic clock-out at ':
  autoClockout.status==='OVERTIME'?'Approved overtime active · automatic clock-out at ':
  autoClockout.status==='PENDING_GPS'?'Automatic clock-out pending · fresh foreground GPS required':
  autoClockout.status==='DUE'?'Automatic clock-out due · scheduled cutoff ':
  'Automatic clock-out monitoring unavailable';
 let html='<div class="tt-clock-stage tt-command-center">'+
  '<h2 class="tt-reference-welcome"><span data-tt-welcome-greeting>'+t.greeting+'</span> '+
   esc(referenceShell?(String(displayName||'').trim().split(/\s+/)[0]||'there'):(displayName||(access?.moduleRole==='System Admin'?'System admin':access?.moduleRole)||''))+(referenceShell?'!':'')+'</h2>'+
  (referenceShell?'<button type="button" class="tt-reference-refresh" data-action="tt-refresh"'+(busy?' disabled':'')+'>Refresh attendance</button>':'')+
  '<div class="tt-command-layout tt-clock-compact" data-session-state="'+(active?'active':'idle')+'">'+
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
     '<h3 id="tt-clock-greeting" class="tt-compact-sr">'+t.greeting+'</h3>'+
     '<div class="tt-compact-header"><p id="tt-clock-date">'+t.day+'</p></div>'+
     '<div class="tt-clock-face" role="timer" aria-label="Current Philippine time">'+
      '<span id="tt-clock-hours">'+t.hours+'</span>'+
      '<span class="tt-clock-colon" aria-hidden="true">:</span>'+
      '<span id="tt-clock-minutes">'+t.minutes+'</span>'+
      '<span class="tt-clock-suffix"><span id="tt-clock-seconds">'+t.seconds+
      '</span><span id="tt-clock-period">'+t.period+'</span></span>'+
     '</div>'+
     '<span class="tt-idle-badge '+(active?'tt-badge-active':'')+'">'+status+'</span>'+
     '<p class="tt-clock-source">Live device time displayed in the organization’s timezone</p>'+
    '</div>'+
    (active?'<div class="tt-session-progress-wrap">'+
      '<div class="tt-session-ring">'+
       '<svg viewBox="0 0 128 128" focusable="false" aria-hidden="true">'+
        '<circle class="tt-session-ring-track" cx="64" cy="64" r="54"></circle>'+
        '<circle id="tt-session-progress" class="tt-session-ring-progress" cx="64" cy="64" r="54"'+
         ' stroke-dasharray="339.292" stroke-dashoffset="'+
         (339.292*(1-session.progress)).toFixed(3)+'"></circle></svg>'+
      '<div class="tt-compact-elapsed" role="timer" aria-label="Elapsed time for active attendance session">'+
       '<span>Elapsed this session</span><strong id="tt-session-elapsed" data-clock-in="'+
        esc(active.clockIn)+'" data-goal-target-ms="'+goalTargetMs+'">'+session.label+'</strong>'+
       '<span class="tt-session-goal">of '+goalLabel+'</span></div></div>'+
       '<p class="tt-active-copy">Started '+esc(formatTimeTrackerAutoClockoutTime(active.clockIn))+
       '<span data-tt-auto-clockout-inline'+(autoDeadline?'':' hidden')+'>'+
        ' · auto clock-out <strong data-tt-auto-clockout-inline-time>'+
         esc(autoDeadline?formatTimeTrackerAutoClockoutTime(autoDeadline):'')+'</strong></span>'+
       ' · <span data-tt-goal-remaining="'+esc(active.clockIn)+'" data-tt-goal-target-ms="'+goalTargetMs+'">'+timeTrackerGoalRemaining(active.clockIn,now,goalTargetMs)+'</span></p>'+
       '<span class="tt-compact-sr">Elapsed working time excludes the unpaid 12 PM to 1 PM Philippine lunch break.</span>'+
       '<p class="tt-clock-hint tt-auto-clockout-state'+
        (autoUnavailable||autoClockout?.status!=='MONITORING'?'':' tt-compact-sr')+'" role="status"'+
        ((autoClockout||autoUnavailable)?'':' hidden')+'>'+
        '<span data-tt-auto-clockout-label>'+esc(autoLabel)+'</span>'+
        (autoDeadline?'<span data-tt-auto-clockout-deadline-group>'+
         '<strong data-tt-auto-clockout-time>'+esc(formatTimeTrackerAutoClockoutTime(autoDeadline))+'</strong> · '+
         '<span data-tt-auto-clockout-countdown data-deadline="'+esc(autoDeadline)+'">—</span> remaining'+
        '</span>':'')+'</p>'+
      '</div>':'')+
    '<div class="tt-dashboard-section-label">TODAY’S ATTENDANCE</div>'+
    '<div class="tt-session-summary" aria-label="My attendance today">'+
     '<div><span>Sessions today</span><strong>'+todayRows.length+'</strong></div>'+
     '<div'+(active&&todayRows.some(r=>r.id===active.id&&r.creditedMs===null)?' data-tt-live-total="'+esc(active.clockIn)+'" data-credited-base="'+todayRows.filter(r=>r.id!==active.id).reduce((sum,r)=>sum+(r.creditedMs||0),0)+'"':'')+'><span>Total logged</span><strong>'+hrs(credited)+'</strong></div>'+
    '</div>'+
    '<p class="tt-dashboard-source">Attendance totals use your authorized TimeTracker records.</p>'+
   '</section>'+
   '<section class="tt-clock-card tt-attendance-console'+(active?' tt-compact-active':'')+'" aria-label="Attendance clock form">'+
    (success?'<div class="tt-clock-confirmed" role="status" aria-live="polite">'+
     '<span class="tt-clock-confirmed-icon" aria-hidden="true">✓</span>'+
     '<div><strong>'+(success.startsWith('Clock Out')?'Successfully clocked out':'Successfully clocked in')+
     '</strong><p>'+esc(success)+'</p></div></div>':'')+
    (clockCorrectionNotice?'<p class="tt-clock-sync-status" role="status" aria-live="polite">'+esc(clockCorrectionNotice)+'</p>':'')+
    '<div class="tt-console-kicker"><span class="tt-console-kicker-mark" aria-hidden="true"></span> ATTENDANCE CONTROL</div>'+
    (active?'':'<div class="tt-clock-card-head"><h4>Ready to start</h4></div>')+
    '<p class="tt-console-description">'+(active?
     'End the current signed attendance session using a fresh GPS fix.':
     'GPS is requested only when you start or end a session.')+'</p>'+
    '<form id="tt-clock-form">'+
     (active?
      '<div class="tt-active-session-context" aria-label="Active attendance details">'+
       '<div><span><span aria-hidden="true">⌖</span> Location</span><strong>'+esc(active.location==='Offsite (Home)'?'Offsite · Home':active.location)+'</strong></div>'+
       '<div><span><span aria-hidden="true">▦</span> Department</span><strong>'+esc(active.department)+'</strong></div>'+
      '</div>':
      '<label for="tt-location">Work Location'+select('tt-location',TT_LOCATIONS,'Select location…',location)+'</label>'+
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
      ((active?showActiveHomeNote:showHomeNote)?'':' hidden')+'>'+
      'Work Plan'+(!active?'<span id="tt-note-requirement">'+(requireHomeNote?' (required)':' (optional)')+'</span>':'')+'<textarea id="tt-note"'+((!active&&requireHomeNote)?' required':'')+
      (active?' readonly':'')+(active?' data-tt-synced-work-note="'+esc(active.workNote||'')+'"':'')+
      ' maxlength="500" rows="3" aria-describedby="tt-work-plan-validation" placeholder="Describe your offsite work plan">'+
      (active?esc(active.workNote||''):esc(workPlanDraft))+'</textarea><span id="tt-work-plan-validation" class="tt-work-plan-validation" role="alert" hidden>Work Plan is required for Offsite (Home).</span></label>'+
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
       (busy&&clockStage==='auto-location'?'Getting GPS for automatic clock-out…':
        busy&&clockStage==='auto-saving'?'Completing automatic clock-out…':
        busy&&clockStage==='location'?'Getting GPS…':
        busy&&clockStage==='saving'?'Saving securely…':
        busy&&clockStage==='verifying'?'Verifying record…':
        active?'End session':'Start session')+'</button>')+
     (!writeReady?
      '<p class="tt-write-restriction" role="status">Live writes remain disabled until server-side offsite work-note, dedicated-board authorization and audit logging are accepted.</p>':
      '')+
    '</form>'+
   '</section>'+
   '<p class="tt-clock-footnote">'+(writeReady?'Session is secured with a fresh GPS fix on start and end.':'Clock actions require signed workspace and backend verification.')+'</p>'+
   (gpsDiagnosticsAvailable?'<div class="tt-gps-diagnostics-tools"><button type="button" class="tt-secondary-button" data-action="tt-gps-diagnostics-copy">Copy GPS diagnostics</button><small>Local browser diagnostics only. Precise coordinates are excluded.</small></div>':'')+
  '</div>'+
 '</div>';
 return html;
}

function compatibleClockNode(current,next){
 if(current.nodeType!==next.nodeType)return false;
 return current.nodeType!==1||current.tagName===next.tagName;
}
function morphClockNode(current,next){
 if(!compatibleClockNode(current,next))return next.cloneNode(true);
 if(current.nodeType===3||current.nodeType===8){
  if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
  return current;
 }
 for(const attribute of [...current.attributes]){
  if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
 }
 for(const attribute of [...next.attributes]){
  if(current.getAttribute(attribute.name)!==attribute.value)
   current.setAttribute(attribute.name,attribute.value);
 }
 const previousChildren=[...current.childNodes];
 const nextChildren=[...next.childNodes];
 const retained=new Set();
 nextChildren.forEach((nextChild,index)=>{
  let match=null;
  if(nextChild.nodeType===1&&nextChild.id){
   match=previousChildren.find(child=>!retained.has(child)&&
    child.nodeType===1&&child.id===nextChild.id&&compatibleClockNode(child,nextChild))||null;
  }
  if(!match){
   const candidate=previousChildren[index];
   if(candidate&&!retained.has(candidate)&&
      !(candidate.nodeType===1&&candidate.id)&&compatibleClockNode(candidate,nextChild))
    match=candidate;
  }
  if(!match&&!(nextChild.nodeType===1&&nextChild.id)){
   match=previousChildren.find(child=>!retained.has(child)&&
    !(child.nodeType===1&&child.id)&&compatibleClockNode(child,nextChild))||null;
  }
  const updated=match?morphClockNode(match,nextChild):nextChild.cloneNode(true);
  if(match&&updated!==match&&match.parentNode===current)current.replaceChild(updated,match);
  const reference=current.childNodes[index]||null;
  if(updated!==reference)current.insertBefore(updated,reference);
  retained.add(updated);
 });
 for(const child of [...current.childNodes]){
  if(!retained.has(child))current.removeChild(child);
 }
 return current;
}

/**
 * Apply a signed Clock snapshot without reconciling or moving the Clock DOM.
 * A full local structure change is reserved for a real idle/active transition.
 */
export function syncTimeTrackerClockView(root,{
 result,now=new Date(),clockPending=false,clockPendingAction='clock-out',
 locationPreference='',workPlanDraft='',success='',clockCorrectionNotice='',
 geoPromptVisible=false,geoPermission='unknown',geoMessage='',clockStage='idle',
 forceReconcile=false,displayName='',referenceShell=false,gpsDiagnosticsAvailable=false,clearError=false
}={}){
 const current=root?.querySelector?.('.tt-clock-stage');
 if(!current||result?.status!=='VERIFIED_READ')return false;

 const active=result.active||null;
 const currentLayout=current.querySelector('.tt-command-layout');
 const currentIsActive=currentLayout?.dataset.sessionState==='active';
 const nextIsActive=Boolean(active);

 // A signed session identity or pending-action change can also require
 // reconciling the action controls, without replacing the application shell.
 if(currentIsActive!==nextIsActive||forceReconcile){
  const template=document.createElement('template');
  template.innerHTML=clockPage(result,false,now,clockPending,clockPendingAction,
   locationPreference,{success,clockCorrectionNotice,geoPromptVisible,geoPermission,
    geoMessage,clockStage,workPlanDraft,displayName,referenceShell,gpsDiagnosticsAvailable});
  const next=template.content.firstElementChild;
  if(!next||!next.classList.contains('tt-clock-stage'))return false;
  morphClockNode(current,next);
  if(clearError)current.closest('.tt-application')?.querySelector('.tt-feedback-error')?.remove();
  return true;
 }

 if(!active)return true;

 // Keep the existing ring and timer mounted. Update the timer's source only
 // when a signed Clock-In correction actually changes it.
 const elapsed=current.querySelector('#tt-session-elapsed');
 if(elapsed&&elapsed.dataset.clockIn!==String(active.clockIn||'')){
  elapsed.dataset.clockIn=String(active.clockIn||'');
  const goal=current.querySelector('[data-tt-goal-remaining]');
  if(goal)goal.dataset.ttGoalRemaining=String(active.clockIn||'');
  const total=current.querySelector('[data-tt-live-total]');
  if(total)total.dataset.ttLiveTotal=String(active.clockIn||'');
 }
 syncTimeTrackerClock(root,now);

 // Session context is patched as text only. Never replace its containers.
 const context=current.querySelector('.tt-active-session-context');
 const values=context?.querySelectorAll('div > strong')||[];
 const locationLabel=active.location==='Offsite (Home)'?'Offsite · Home':String(active.location||'');
 const departmentLabel=String(active.department||'');
 if(values[0])updateClockText(values[0],locationLabel);
 if(values[1])updateClockText(values[1],departmentLabel);

 // The active Work Plan is read-only. Apply a genuine remote correction only
 // when the field is not focused and still matches its last signed value.
 const note=current.querySelector('#tt-note');
 if(note){
  const lastSignedNote=note.dataset.ttSyncedWorkNote??'';
  const nextSignedNote=String(active.workNote||'');
  if(note.dataset.ttSyncedWorkNote!==nextSignedNote&&
     note.value===lastSignedNote&&
     root.ownerDocument?.activeElement!==note){
   if(note.value!==nextSignedNote)note.value=nextSignedNote;
   note.dataset.ttSyncedWorkNote=nextSignedNote;
  }
 }

 // Keep today's summary values accurate without rebuilding their containers.
 const todayKey=timeTrackerManilaDay(now);
 const todayRows=(result.records||[]).filter(row=>
  timeTrackerManilaDay(row.clockIn)===todayKey);
 const summary=current.querySelector('.tt-session-summary');
 const sessionCount=summary?.querySelector(':scope > div:first-child strong');
 updateClockText(sessionCount,todayRows.length);
 const totalRow=summary?.querySelector(':scope > div:nth-child(2)');
 if(totalRow){
  const creditedBase=todayRows.filter(row=>row.id!==active.id)
   .reduce((sum,row)=>sum+(Number(row.creditedMs)||0),0);
  const baseValue=String(creditedBase);
  if(totalRow.dataset.creditedBase!==baseValue)
   totalRow.dataset.creditedBase=baseValue;
  const activeIsToday=todayRows.some(row=>
   row.id===active.id&&row.creditedMs===null);
  if(activeIsToday){
   const liveStart=String(active.clockIn||'');
   if(totalRow.dataset.ttLiveTotal!==liveStart)
    totalRow.dataset.ttLiveTotal=liveStart;
  }else{
   delete totalRow.dataset.ttLiveTotal;
   updateClockText(totalRow.querySelector('strong'),hrs(creditedBase));
  }
 }

 // Reconcile automatic clock-out messaging in stable, pre-mounted nodes.
 const autoClockout=result.autoClockout?.recordId===active.id?result.autoClockout:null;
 const autoUnavailable=result.autoClockoutUnavailable===true;
 const autoDeadline=autoClockout?.status==='PENDING_GPS'?'':
  String(autoClockout?.overtimeCutoffAt||autoClockout?.nextAt||autoClockout?.cutoffAt||'');
 const autoLabel=autoUnavailable?'Automatic clock-out status unavailable':
  !autoClockout?'':autoClockout.status==='MONITORING'?
  (autoClockout.overtimeCutoffAt?'Approved overtime scheduled · automatic clock-out at ':
   'Automatic clock-out monitoring · nine-hour threshold at '):
  autoClockout.status==='GRACE'?'Grace period active · automatic clock-out at ':
  autoClockout.status==='OVERTIME'?'Approved overtime active · automatic clock-out at ':
  autoClockout.status==='PENDING_GPS'?'Automatic clock-out pending · fresh foreground GPS required':
  autoClockout.status==='DUE'?'Automatic clock-out due · scheduled cutoff ':
  'Automatic clock-out monitoring unavailable';
 const inlineDeadline=current.querySelector('[data-tt-auto-clockout-inline]');
 if(inlineDeadline){
  inlineDeadline.hidden=!autoDeadline;
  updateClockText(inlineDeadline.querySelector('[data-tt-auto-clockout-inline-time]'),
   autoDeadline?formatTimeTrackerAutoClockoutTime(autoDeadline):'');
 }
 const autoState=current.querySelector('.tt-auto-clockout-state');
 if(autoState){
  autoState.hidden=!autoClockout&&!autoUnavailable;
  autoState.classList.toggle('tt-compact-sr',!autoUnavailable&&autoClockout?.status==='MONITORING');
  updateClockText(autoState.querySelector('[data-tt-auto-clockout-label]'),autoLabel);
  let deadlineGroup=autoState.querySelector('[data-tt-auto-clockout-deadline-group]');
  if(!autoDeadline&&deadlineGroup){
   deadlineGroup.remove();
   deadlineGroup=null;
  }else if(autoDeadline&&!deadlineGroup){
   deadlineGroup=root.ownerDocument.createElement('span');
   deadlineGroup.dataset.ttAutoClockoutDeadlineGroup='';
   const deadlineText=root.ownerDocument.createElement('strong');
   deadlineText.dataset.ttAutoClockoutTime='';
   const countdown=root.ownerDocument.createElement('span');
   countdown.dataset.ttAutoClockoutCountdown='';
   deadlineGroup.append(deadlineText,root.ownerDocument.createTextNode(' · '),countdown,
    root.ownerDocument.createTextNode(' remaining'));
   autoState.append(deadlineGroup);
  }
  if(deadlineGroup){
   const deadlineText=deadlineGroup.querySelector('[data-tt-auto-clockout-time]');
   const countdown=deadlineGroup.querySelector('[data-tt-auto-clockout-countdown]');
   updateClockText(deadlineText,formatTimeTrackerAutoClockoutTime(autoDeadline));
   if(countdown&&countdown.dataset.deadline!==autoDeadline)
    countdown.dataset.deadline=autoDeadline;
  }
 }

 return true;
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

/** OJT keeps its existing personal Clock and gains strictly read-only views. */
export function renderTimeTrackerOjtSharedRead(sharedRead){
 if(!sharedRead)return '<p class="tt-muted">Shared attendance and OT are unavailable. Refresh to retry.</p><button type="button" class="secondary" data-action="tt-refresh">Refresh shared records</button>';
 const rows=timeTrackerLogRowsForSnapshot({status:'VERIFIED_READ',sharedRead});
 const attendance=rows.slice().sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn));
 const ot=sharedRead.overtime||[];
 const table=(headers,records)=>'<div class="table-scroll"><table class="board-table"><thead><tr>'+
  headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
  (records.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')||
   '<tr><td colspan="'+headers.length+'">No authorized records.</td></tr>')+'</tbody></table></div>';
 return '<section class="tt-secondary-content" aria-label="Shared attendance and overtime">'+
  '<h3>Shared records</h3><p class="tt-muted">View authorized employee and intern records. Read-only.</p>'+
  '<button type="button" class="secondary" data-action="tt-refresh">Refresh shared records</button>'+
  '<details><summary>Attendance Log ('+attendance.length+')</summary>'+
  table(['Employee','Department','Clock In','Clock Out','Status'],attendance.map(r=>[
   r.name,r.department,date(r.clockIn),date(r.clockOut),r.status]))+'</details>'+
  '<details><summary>Overtime ('+ot.length+')</summary>'+
  table(['Employee','Date','Requested Hours','Status'],ot.map(r=>[
   r.name,r.date,r.durationMinutes===null?'—':String(r.durationMinutes/60),r.status==='Submitted'?'Pending':r.status]))+
  '</details></section>';
}
export function renderTimeTrackerNative({
 result=null,displayName='',referenceShell=false,busy=false,clockPending=false,clockPendingAction='clock-out',locationPreference='',workPlanDraft='',ojtWorkPlanDraft='',geoPromptVisible=false,geoPermission='unknown',geoMessage='',clockStage='idle',clockCorrectionNotice='',error='',success='',period='all',view='clock',now=new Date(),employeesSearch='',employeesTab='directory',employeesDepartment='',overviewFilters={},logFilters={},reportFilters={},calendarMonth='',calendarSelectedDay='',otFilters={},otManualVisibleCount=50,otExpandedRequestIds=[],otModalOpen=false,otDraft={},hoursWeekOffset=0,hoursMonth='',hoursSelectedDay='',teamEligible=false,teamDirectory=null,teamFilters={},teamBusy=false,teamError='',monitorResult=null,monitorHistory=[],monitorBusy=false,monitorError='',
 logGpsEligible=false,logGpsData=null,logGpsBusy=false,logGpsError='',logGpsErrorRecordId='',logExpandedRecordIds=[],mapEnabled=false,mapTheme='map',gpsEligible=false,gpsData=null,gpsView='map',gpsFilters={},gpsBusy=false,gpsError='',
 adminEligible=false,adminFullAccess=adminEligible,adminDirectory=[],adminSelectedIds=[],adminEditor=null,adminDeleteConfirm=null,adminBusy=false,adminError='',adminSuccess='',
 ojtSelected=null,ojtAttendance=null,ojtBusy=false,ojtError='',ojtSuccess='',
 ojtLocationSelection='Office-Base Duty',ojtGeoProgress='',gpsDiagnosticsAvailable=false
}={}){
 const verified=result?.status==='VERIFIED_READ';
 const employeesEligible=verified&&canViewTimeTrackerEmployees(result.access);
 const selected=((view==='employees'&&!employeesEligible)||(view==='team'&&teamEligible!==true)||
  (view==='gps'&&gpsEligible!==true))?'clock':
 ['overview','clock','employees','log','reports','calendar','ot','hours','team','monitor','gps'].includes(view)?view:'clock';
 const sharedOjt=verified&&['SHARED_LOGIN','SHARED_DISABLED','SERVICE_UNAVAILABLE','SETUP_REQUIRED'].includes(result.ojtRoster?.mode);
 const reference=referenceShell&&verified&&!sharedOjt;
 let html='<section class="tt-native" aria-label="TimeTracker attendance application"><div class="fm1-app tt-application" data-tt-view="'+selected+'" data-tt-application-root'+(reference?' data-tt-reference-shell':'')+'>'+
  (reference?'':head(verified?result.access:null,busy,selected))+
  (sharedOjt?'<nav class="tt-ojt-navigation" aria-label="Intern attendance"><strong>OJT attendance</strong></nav>':
   navigation(selected,busy,verified&&teamEligible===true,verified&&gpsEligible===true,employeesEligible))+
  (sharedOjt||selected==='employees'||(verified&&selected==='log')?'':applicationHeading(selected,busy,verified&&adminEligible,verified&&adminFullAccess)+((verified&&(selected==='log'||(selected==='clock'&&TT_LIVE_ATTENDANCE_WRITES_ACCEPTED&&result.access?.attendanceWritesAccepted===true)))?'':notifications(verified,verified&&result.access?.attendanceWritesAccepted===true,busy)));
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
 if(sharedOjt){
  html+=renderTimeTrackerOjtClock({roster:result.ojtRoster,selected:ojtSelected,
   attendance:ojtAttendance,busy:busy||ojtBusy,error:ojtError,success:ojtSuccess,
   workPlanDraft:ojtWorkPlanDraft,locationSelection:ojtLocationSelection,geoProgress:ojtGeoProgress});
  if(ojtSelected&&result.ojtRoster?.mode==='SHARED_LOGIN'&&ojtAttendance)
   html+=renderTimeTrackerOjtSharedRead(ojtAttendance.sharedRead);
  html+=applicationFooter()+'</div></section>';
  return html;
 }
 if(selected==='overview')html+=renderTimeTrackerOverview({
  overview:result.overview,access:result.access,now,filters:overviewFilters
 });
 if(selected==='clock')html+=clockPage(result,busy,new Date(now),clockPending,clockPendingAction,locationPreference,{
  success,clockCorrectionNotice,geoPromptVisible,geoPermission,geoMessage,clockStage,workPlanDraft,displayName,referenceShell:reference,gpsDiagnosticsAvailable
 });
 if(selected==='employees'){
  html+=renderTimeTrackerEmployees({
   directory:result.access?.employees,access:result.access,search:employeesSearch,
   tab:employeesTab,department:employeesDepartment,loading:busy,ojtAdmin:result.ojtAdmin,
   ojtAttendance:result.ojtAdminAttendance,ojtBusy
  });
 }
 if(selected==='log')html+=renderTimeTrackerLog({
  records:timeTrackerLogRowsForSnapshot(result),
   otRequests:result.otRequests||[],otContractActive:result.access?.otContractActive===true,
  scope:result.sharedRead?.log?.scope||result.log?.scope||'OWN_ATTENDANCE_ONLY',
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
  filters:otFilters,manualVisibleCount:otManualVisibleCount,expandedRequestIds:otExpandedRequestIds,modalOpen:otModalOpen,form:otDraft,now,busy
 });
 html+=applicationFooter()+'</div></section>';
 return html;
}
