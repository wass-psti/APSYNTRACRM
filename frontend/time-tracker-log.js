import {renderManualAttendanceEditor} from './apps/TimeTracker/time-tracker-manual-attendance-ui.js';
import {formatTimeTrackerDurationMs} from './time-tracker-duration-format.js';
import {formatTimeTrackerClock,formatTimeTrackerShortDateTime,formatTimeTrackerDateTime} from './time-tracker-time-format.js';
/** Native signed TimeTracker Log. System Admin mutations use the dedicated signed RPC; other roles remain read-only. */
import {TT_LOCATIONS,creditedAttendanceMs,manilaClockMinutes} from './time-tracker-policy.js';
import {filterMyAttendancePeriod} from './time-tracker-native.js';
import {manilaDay} from './time-tracker-overview.js';
import {mapFrame} from './time-tracker-map.js';
import {renderTimeTrackerAdminEditor,renderTimeTrackerAdminDeleteDialog,TT_ADMIN_RECORD_LIMIT} from './time-tracker-record-management.js';
import {renderTimeTrackerOjtAdminEditor} from './apps/TimeTracker/time-tracker-ojt-admin-editor.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeRows=rows=>Array.isArray(rows)?rows.filter(r=>r&&validTime(r.clockIn)):[];

/** Merge signed OJT and ordinary attendance for authorized admins.
 * OJT mutations require a separate signed admin RPC, never normal employee RPCs.
 */
export function timeTrackerLogRowsForSnapshot(snapshot){
 if(snapshot?.status!=='VERIFIED_READ')return [];
 const standard=snapshot.log?.rows||snapshot.records||[];
 if(!['System Admin','IT Administrator'].includes(snapshot.access?.moduleRole))
  return standard;
 const signed=snapshot.ojtAdminAttendance?.records;
 if(!Array.isArray(signed))return standard;
 const ojtRows=signed.filter(r=>r&&typeof r.id==='string'&&
  typeof r.internId==='string'&&typeof r.name==='string'&&validTime(r.clockIn)&&
  (r.clockOut===null||validTime(r.clockOut))).map(r=>Object.freeze({
   id:'ojt:'+r.id,ownerId:'ojt:'+r.internId,name:r.name,
   clockIn:r.clockIn,clockOut:r.clockOut,department:'OJT',
   location:TT_LOCATIONS.includes(r.location)?r.location:'Unspecified',
   status:r.clockOut?'Completed':'Active',
   classification:manilaClockMinutes(r.clockIn)>480?'Late':'On time',
   workNote:typeof r.workNote==='string'?r.workNote.slice(0,500):'',
   creditedMs:r.clockOut?creditedAttendanceMs(r.clockIn,r.clockOut):null,
   revision:Number.isSafeInteger(Number(r.revision))?Number(r.revision):null,
   isOjt:true
  }));
 return [...standard,...ojtRows];
}

/** Keep one open Log detail only while that signed record remains authorized.
 * Includes prefixed OJT sessions; never retains a stale or cross-role record.
 */
export function retainTimeTrackerLogDetailIds(snapshot,expandedIds=[]){
 const allowed=new Set(timeTrackerLogRowsForSnapshot(snapshot).map(row=>row.id));
 return (Array.isArray(expandedIds)?expandedIds:[])
  .filter(id=>typeof id==='string'&&allowed.has(id)).slice(-1);
}

const phtTime=value=>validTime(value)?formatTimeTrackerClock(value):'—';
const phtDate=value=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',weekday:'long',year:'numeric',month:'long',day:'numeric'
}).format(new Date(value));
const creditedHours=formatTimeTrackerDurationMs;
const choices=(id,values,selected)=>'<select id="'+id+'">'+
 values.map(([key,label])=>'<option value="'+esc(key)+'"'+
 (selected===key?' selected':'')+'>'+esc(label)+'</option>').join('')+
 '</select>';

export const TT_LOG_DEFAULT_FILTERS=Object.freeze({
 search:'',period:'all',status:'all',location:'all',department:'all',sort:'newest',employeeId:null,view:'all',start:'',end:'',date:''
});
const periods=[['all','All dates'],['today','Today'],
 ['last7','Last 7 days'],['week','This week'],['month','This month'],['custom','Custom range']];
const statuses=[['all','All statuses'],['Active','Active'],
 ['Completed','Completed'],['Late','Late'],['Administrative closure','Administrative closure']];
const sortModes=[['newest','Newest first'],['oldest','Oldest first']];
const searchText=r=>[r.name,r.location,r.department,r.classification,r.status,
 manilaDay(r.clockIn),phtTime(r.clockIn)]
 .map(x=>String(x??'').toLocaleLowerCase()).join(' ');

export function filterTimeTrackerLogRows(records=[],filters={},now=new Date()){
 const options={...TT_LOG_DEFAULT_FILTERS,...filters};
 const period=periods.some(([id])=>id===options.period)?options.period:'all';
 let result=filterMyAttendancePeriod(safeRows(records),['last7','custom'].includes(period)?'all':period,now);
 const today=manilaDay(now);
 const last7=manilaDay(new Date(new Date(now).getTime()-6*86400000));
 if(period==='last7')result=result.filter(r=>manilaDay(r.clockIn)>=last7&&Date.parse(r.clockIn)<=new Date(now).getTime());
 if(period==='custom')result=result.filter(r=>options.start&&options.end&&manilaDay(r.clockIn)>=options.start&&manilaDay(r.clockIn)<=options.end);
 const search=String(options.search??'').toLocaleLowerCase().trim().slice(0,120);
 result=result.filter(r=>
  (!options.date||manilaDay(r.clockIn)===options.date)&&
  (!options.employeeId||r.ownerId==='cloud:'+options.employeeId)&&
  (options.department==='all'||(r.department||'Unassigned')===options.department)&&
  (options.view==='all'||(options.view==='today'?manilaDay(r.clockIn)===today:r.status===options.view))&&
  (options.location==='all'||r.location===options.location)&&
  (options.status==='all'||(options.status==='Late'?
   r.classification==='Late':
   options.status==='Administrative closure'?
   r.classification==='Administrative closure':r.status===options.status))&&
  (!search||searchText(r).includes(search)));
 return [...result].sort((a,b)=>options.sort==='oldest'?
  Date.parse(a.clockIn)-Date.parse(b.clockIn):
  Date.parse(b.clockIn)-Date.parse(a.clockIn));
}

export function timeTrackerLogSummary(rows=[],now=new Date()){
 const eligible=safeRows(rows);
 const dateKey=manilaDay(now);
 const currentCount=eligible.filter(r=>manilaDay(r.clockIn)===dateKey).length;
 return Object.freeze({
 sessions:eligible.length,
 people:new Set(eligible.map(r=>r.ownerId||r.name||'Signed member')).size,
 today:currentCount,
 historical:eligible.length-currentCount,
 completed:eligible.filter(r=>r.status==='Completed').length,
 active:eligible.filter(r=>r.status==='Active').length,
 late:eligible.filter(r=>r.classification==='Late').length,
 creditedMs:eligible.reduce((total,r)=>total+(
  r.status==='Completed'&&Number.isFinite(r.creditedMs)&&r.creditedMs>=0?
   r.creditedMs:0),0)
 });
}


const dateTime=value=>validTime(value)?formatTimeTrackerShortDateTime(value):'—';
const durationLabel=formatTimeTrackerDurationMs;
const ratio=(num,total)=>total?Math.round(100*num/total):0;
const widthBucket=percent=>'tt-log-width-'+Math.max(0,Math.min(100,
 Math.round(percent/5)*5));
const openDuration=(row,now)=>row.status==='Active'?
 Math.max(0,Date.parse(now)-Date.parse(row.clockIn)):0;
const auditPill=(label,value,tone='neutral')=>
 '<div class="tt-log-audit-pill tt-log-audit-'+tone+'"><strong>'+esc(value)+
 '</strong><span>'+esc(label)+'</span></div>';
const locationsPalette=[
 ['Office-Base Duty','office'],['Offsite (Home)','offsite'],
 ['Local Field Works','local'],['Out of Town Assignment','outtown'],
 ['International Field Assignments','international']
];
function locationDistribution(rows){
 const total=rows.length;
 const buckets=locationsPalette.map(([location,color])=>({
  location,color,count:rows.filter(r=>r.location===location).length
 }));
 const unknown=rows.filter(r=>!TT_LOCATIONS.includes(r.location)).length;
 if(unknown)buckets.push({location:'Unspecified',color:'other',count:unknown});
 return '<section class="tt-log-location-panel" aria-label="Location distribution">'+
  '<div class="tt-log-section-heading"><h4>⌖ &nbsp; LOCATION DISTRIBUTION</h4>'+
   '<span>'+total+' sessions across '+buckets.filter(x=>x.count>0).length+
   ' location'+(buckets.filter(x=>x.count>0).length===1?'':'s')+'</span></div>'+
  '<div class="tt-log-location-track" role="img" aria-label="Attendance session location distribution">'+
   (total?buckets.filter(x=>x.count).map(x=>
    '<span class="tt-log-segment tt-log-segment-'+x.color+' '+
     widthBucket(100*x.count/total)+'" title="'+esc(x.location)+
     ': '+x.count+' session(s)">'+
     (ratio(x.count,total)>=12?x.count+' ('+ratio(x.count,total)+'%)':'')+
    '</span>').join(''):'<span class="tt-log-no-location">No signed sessions in this selection</span>')+
  '</div>'+
  '<div class="tt-log-location-legend">'+buckets.filter(x=>x.count).map(x=>
   '<span><i class="tt-log-dot tt-log-dot-'+x.color+'"></i>'+esc(x.location)+
   ' <strong>'+x.count+'</strong></span>').join('')+'</div></section>';
}
function dailyOperations(rows,now){
 const today=manilaDay(now);
 const todays=rows.filter(r=>manilaDay(r.clockIn)===today);
 const before=todays.filter(r=>r.classification==='On time').length;
 const late=todays.filter(r=>r.classification==='Late').length;
 const active=todays.filter(r=>r.status==='Active').length;
 const stagnant=todays.filter(r=>r.status==='Active'&&openDuration(r,now)>=14*3600000).length;
 const total=todays.length;
 const items=[
  ['✓','Before 8 AM',before,ratio(before,total),'green'],
  ['◷','Late Today',late,ratio(late,total),'orange'],
  ['⌁','Still Working',active,ratio(active,total),'green'],
  ['△','No Time-Out','—',null,'orange'],
  ['✎','Manual Edits','—',null,'neutral'],
  ['⚡','Stagnant (14h+)',stagnant,ratio(stagnant,total),'red']
 ];
 return '<section class="tt-log-operations" aria-label="Today daily operations">'+
  '<div class="tt-log-section-heading"><h4>DAILY OPERATIONS</h4>'+
   '<span>'+total+' authorized clock-in'+(total===1?'':'s')+
   ' today · Philippine Time</span></div>'+
  '<div class="tt-log-operation-grid">'+items.map(([symbol,label,value,rate,color])=>
   '<article class="tt-log-operation tt-log-operation-'+color+'">'+
   '<div><span aria-hidden="true">'+symbol+'</span>'+
   '<small>'+(rate===null?'Not verified':rate+'%')+'</small></div>'+
   '<strong>'+value+'</strong><span>'+esc(label)+'</span>'+
   '<div class="tt-log-operation-meter"><i class="'+
    widthBucket(rate===null?0:rate)+'"></i></div></article>').join('')+
  '</div></section>';
}
function shiftProgress(rows,now){
 const today=manilaDay(now);
 const todays=rows.filter(r=>manilaDay(r.clockIn)===today);
 const active=todays.filter(r=>r.status==='Active').length;
 const complete=todays.filter(r=>r.status==='Completed').length;
 const office=todays.filter(r=>r.location==='Office-Base Duty').length;
 const late=todays.filter(r=>r.classification==='Late').length;
 const credits=todays.reduce((sum,r)=>sum+(Number.isFinite(r.creditedMs)?
  r.creditedMs:0),0);
 const cards=[
  ['TOTAL',todays.length],['ACTIVE',active],['ON-SITE',office],
  ['LATE',late],['CREDITED HRS',durationLabel(credits)],['DONE',complete]
 ];
 return '<div class="tt-log-shift-strip" aria-label="Today shift progress">'+
  '<div class="tt-log-shift-cards">'+cards.map(([label,value])=>
   '<div><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>'+
  '<div class="tt-log-progress"><span>SHIFT PROGRESS</span>'+
   '<progress value="'+complete+'" max="'+Math.max(1,todays.length)+
   '" aria-label="Completed sessions among today clock-ins"></progress>'+
   '<strong>'+complete+' / '+todays.length+'</strong></div></div>';
}
function safeSessionDetails(row,now,{gpsEligible=false,gpsData=null,gpsBusy=false,gpsError='',gpsErrorRecordId='',mapEnabled=false,mapTheme='map',adminEligible=false,adminFullAccess=false,adminBusy=false,modal=false}={}){
 const start=Date.parse(row.clockIn),end=Date.parse(row.clockOut||now);
 const elapsed=Math.max(0,end-start);
 const active=row.status==='Active';
 const duration=active?'Current elapsed': 'Elapsed';
 const credit=Number.isFinite(row.creditedMs)?
  durationLabel(row.creditedMs):'Not finalized';
 const eventLabel=active?'Clock-out not yet recorded':
  row.clockOut?'Clock-out timestamp recorded':'Clock-out evidence unavailable';
 // Exact fixes originate ONLY from the server-authorized, identity-checked
 // timetracker_gps_snapshot RPC. The broad attendance Log never supplies GPS.
 const events=gpsEligible&&Array.isArray(gpsData?.events)?
  gpsData.events.filter(p=>p.recordId===row.id&&
   row.ownerId==='cloud:'+p.userId&&['in','out'].includes(p.kind)&&
   Array.isArray(gpsData.ranges)&&gpsData.ranges.some(range=>
    manilaDay(p.timestamp)>=range.from&&manilaDay(p.timestamp)<=range.to)):[];
 const days=[manilaDay(row.clockIn),...(row.clockOut?[manilaDay(row.clockOut)]:[])];
 const covered=Boolean(gpsEligible&&gpsData?.ranges?.some(r=>
  days.every(d=>d>=r.from&&d<=r.to)));
 const available=events.length>0;
 const gpsStatus=available?'Recorded':covered&&!gpsData?.truncated?
  'Not recorded':'Not loaded';
 const locationEvidence=gpsEligible?
  (available?
   '<div class="tt-log-gps-evidence" aria-label="Signed attendance GPS fixes">'+
   events.map(p=>'<div class="tt-log-gps-fix"><strong>'+
    (p.kind==='in'?'Clock In':'Clock Out')+' · '+esc(dateTime(p.timestamp))+'</strong>'+
    '<code>'+p.latitude.toFixed(6)+', '+p.longitude.toFixed(6)+'</code>'+
    '<span>±'+Math.round(p.accuracyM)+' m · '+esc(p.source)+'</span>'+
    '<a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" '+
    'title="Opens external OpenStreetMap and shares the selected point only after you click" '+
    'href="https://www.openstreetmap.org/?mlat='+p.latitude+'&mlon='+p.longitude+
    '#map=17/'+p.latitude+'/'+p.longitude+'">Open point on map</a></div>').join('')+
   '</div>':
   '<span>'+esc(gpsBusy?'Loading signed GPS evidence…':
    covered&&!gpsData?.truncated?'No captured GPS fix is available for this record.':
    'Exact GPS details are available through the privileged signed evidence endpoint.')+'</span>')+
  '<button type="button" class="tt-log-evidence-load" data-action="tt-log-gps-load" '+
   'data-record-id="'+esc(row.id)+'"'+(gpsBusy?' disabled':'')+
   '>'+esc(available?'Refresh GPS evidence':'Load recorded GPS')+'</button>'+
  (gpsError&&(!gpsErrorRecordId||gpsErrorRecordId===row.id)?
   '<p class="tt-log-gps-error" role="alert">'+esc(gpsError)+'</p>':''):
  '<span>Exact coordinates are restricted to bootstrap administrators and assigned TimeTracker Supervisors.</span>';

 const mapMarkup=(gpsEligible&&available?
     '<div class="tt-log-map-modes" role="group" aria-label="Street map style">'+
      '<button type="button" data-action="tt-map-style" data-theme="map" aria-pressed="'+(mapTheme!=='dark')+
      '" class="'+(mapTheme!=='dark'?'is-active':'')+'">Street</button>'+
      '<button type="button" data-action="tt-map-style" data-theme="dark" aria-pressed="'+(mapTheme==='dark')+
      '" class="'+(mapTheme==='dark'?'is-active':'')+'">Dark</button></div>':'')+
    (gpsEligible?mapFrame({hasPoints:available,enabled:mapEnabled,scope:'log'}):
     '<div class="tt-map-empty">Precise GPS maps require a privileged signed session.</div>')+
    (available?'<p class="tt-map-note">Green: Clock In · Orange: Clock Out. Connecting lines show straight-line distance, not a tracked route.</p>':'');
 const adminActions=(adminEligible?'<div class="tt-log-admin-row-actions"><span>'+
    (adminFullAccess?'System Admin record management':'Authorized time correction')+'</span>'+
   '<button type="button" data-action="tt-log-admin-correct-time" data-record-id="'+esc(row.id)+'"'+(adminBusy?' disabled':'')+'><span aria-hidden="true">✎</span> Correct time</button>'+
   (adminFullAccess?'<button type="button" data-action="tt-log-admin-edit" data-record-id="'+esc(row.id)+'"'+(adminBusy?' disabled':'')+'>Edit record</button>':'')+
   (adminFullAccess?'<button type="button" class="tt-log-admin-delete" data-action="tt-log-admin-delete" data-record-id="'+esc(row.id)+'"'+(adminBusy?' disabled':'')+'><span aria-hidden="true">⌫</span> Delete record</button>':'')+'</div>':'');
 if(modal){
  const field=(label,value,tone='')=>'<div class="tt-record-field"><small>'+esc(label)+'</small><span class="'+tone+'">'+esc(value)+'</span></div>';
  const evidence=(label,value,tone='neutral')=>'<div class="tt-record-evidence-row"><span>'+esc(label)+'</span><strong class="tt-record-tone-'+tone+'">'+esc(value)+'</strong></div>';
  const location=row.location||'Unspecified';
  const arrival=row.classification||'Unknown';
  const status=row.status||'Unknown';
  return '<div class="tt-record-grid">'+
   '<section class="tt-record-card tt-record-shift"><div class="tt-record-card-head"><h4>Shift</h4><span>'+esc(validTime(row.clockIn)?logRowDate(row.clockIn):'—')+'</span></div>'+
    '<div class="tt-record-timeline"><div><small>Clock in</small><strong>'+esc(phtTime(row.clockIn))+'</strong></div>'+
    '<div class="tt-record-track" aria-hidden="true"></div><div><small>Clock out</small><strong>'+esc(active?'Active':phtTime(row.clockOut))+'</strong></div></div>'+
    '<div class="tt-record-metrics"><div><small>'+esc(duration)+'</small><strong>'+esc(durationLabel(elapsed))+'</strong></div>'+
    '<div class="tt-record-credit"><small>Credited hours</small><strong>'+esc(credit)+'</strong></div></div></section>'+
   '<section class="tt-record-card tt-record-details"><h4>Details</h4><div class="tt-record-fields">'+
    field('Department',row.department||'Unassigned')+field('Location',location)+
    field('Arrival',arrival,arrival==='Late'?'tt-record-tone-amber':arrival==='On time'?'tt-record-tone-green':'')+
    field('Status',status,status==='Completed'?'tt-record-tone-green':active?'tt-record-tone-accent':'')+'</div>'+
    (row.location==='Offsite (Home)'&&row.workNote?'<div class="tt-record-note"><small>Offsite work note</small><p>'+esc(row.workNote)+'</p></div>':'')+'</section>'+
   '<section class="tt-record-card tt-record-evidence"><div class="tt-record-card-head"><h4>Evidence</h4><span class="tt-record-chip tt-record-chip-amber">Not independently verified</span></div>'+
    '<div class="tt-record-evidence-list">'+evidence('GPS',gpsStatus,available?'green':'neutral')+evidence('Timing','Recorded','green')+
    evidence('Edits','Not verified','amber')+evidence('Device','Unavailable')+evidence('Audit score','N/A')+'</div>'+
    '<p class="tt-record-disclaimer">Read-only view. Edit history and independent audit are not available.</p></section>'+
   '<section class="tt-record-card tt-record-location'+(gpsEligible?' tt-record-location-privileged':'')+'"><h4>Location</h4>'+
    (gpsEligible&&available?'<div class="tt-record-map">'+mapMarkup+'</div>':
     '<div class="tt-record-map-placeholder" role="img" aria-label="Map unavailable">'+logIcon('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>')+'Map unavailable</div>')+
    '<div class="tt-record-location-summary"><span>'+esc(location)+'</span><small>'+esc('GPS '+gpsStatus.toLowerCase())+'</small></div>'+
    '<div class="tt-record-location-access">'+locationEvidence+'</div></section>'+
   (adminActions?'<div class="tt-record-admin">'+adminActions+'</div>':'')+
   '</div>';
 }
 return '<div class="tt-log-expanded">'+
  '<div class="tt-log-evidence-title"><strong>AUDIT DETAILS</strong>'+
   '<span class="tt-log-evidence-unverified">Evidence not independently verified</span></div>'+
  '<div class="tt-log-audit-grid">'+
   auditPill('GPS',gpsStatus,available?'green':'neutral')+
   auditPill('Timing','Recorded','green')+
   auditPill('Edits','Not verified','neutral')+
   auditPill('Device','Unavailable','neutral')+
   auditPill('Audit score','N/A','neutral')+
  '</div>'+
  '<section class="tt-log-shift-card"><div class="tt-log-detail-title">'+
   '<h6>SHIFT SUMMARY</h6><span>'+esc(manilaDay(row.clockIn))+'</span></div>'+
   '<div class="tt-log-shift-timeline"><div><small>IN</small><strong>'+
    esc(phtTime(row.clockIn))+'</strong></div>'+
    '<div class="tt-log-time-track"><i></i></div>'+
    '<div><small>'+duration.toUpperCase()+'</small><strong>'+
     esc(durationLabel(elapsed))+'</strong></div>'+
    '<div><small>OUT</small><strong>'+esc(active?'Active':phtTime(row.clockOut))+
    '</strong></div></div>'+
   '<p>Credited hours: '+esc(credit)+'</p></section>'+
  '<section class="tt-log-evidence-info"><strong>RECORDED SESSION</strong>'+
   '<p>'+esc(eventLabel)+'. Historical event modifications and independent audit verification are not available in this read-only projection.</p>'+
   '<div class="tt-log-detail-fields">'+
    '<span><small>Employee</small>'+esc(row.name||'Signed member')+'</span>'+
    '<span><small>Clock In</small>'+esc(dateTime(row.clockIn))+'</span>'+
    '<span><small>Clock Out</small>'+esc(dateTime(row.clockOut))+'</span>'+
    '<span><small>Department</small>'+esc(row.department||'Unassigned')+'</span>'+
    '<span><small>Location</small>'+esc(row.location||'Unspecified')+'</span>'+
    '<span><small>Arrival</small>'+esc(row.classification||'Unknown')+'</span></div>'+
    (row.location==='Offsite (Home)'&&row.workNote?
     '<p class="tt-log-offsite-note"><strong>Offsite Work Note</strong> '+esc(row.workNote)+'</p>':'')+
    '</section>'+
  '<div class="tt-log-evidence-title"><strong>DEVICE &amp; LOCATION</strong></div>'+
  '<div class="tt-log-location-evidence"><div>'+
   '<h6>LOCATION EVIDENCE</h6><p>'+esc(row.location||'Unspecified')+'</p>'+
   locationEvidence+
   '</div><div class="tt-log-street-map">'+
    mapMarkup+
   '</div></div>'+
  adminActions+
  '</div>';
}
/** One authorized attendance detail at a time. Reuse the existing dialog shell and
 * the same signed, GPS-redacted details projection as the previous inline view.
 */
function renderTimeTrackerLogDetailDialog({row,now,gpsEligible=false,gpsData=null,
 gpsBusy=false,gpsError='',gpsErrorRecordId='',mapEnabled=false,mapTheme='map',
 adminEligible=false,adminFullAccess=false,adminBusy=false,selectedIds=[]}={}){
 if(!row)return '';
 const selected=selectedIds.includes(row.id);
 const details=safeSessionDetails(row,now,{gpsEligible:!row.isOjt&&gpsEligible,
  gpsData:row.isOjt?null:gpsData,gpsBusy,gpsError,gpsErrorRecordId,
  mapEnabled:!row.isOjt&&mapEnabled,mapTheme,
  adminEligible,adminFullAccess,adminBusy,modal:true});
 const status=row.status||'Unknown';
 const arrival=row.classification||'Unknown';
 const chip=(value,tone)=>'<span class="tt-record-chip tt-record-chip-'+tone+'">'+esc(value)+'</span>';
 return '<div class="tt-log-details-backdrop" data-tt-log-detail-backdrop>'+
  '<section class="tt-log-details-dialog" data-tt-log-detail-dialog data-record-id="'+esc(row.id)+'" role="dialog" aria-modal="true" aria-labelledby="tt-log-modal-title" tabindex="-1">'+
   '<div class="tt-record-grip" aria-hidden="true"></div><header class="tt-record-header">'+
    '<span class="tt-record-avatar" aria-hidden="true">'+esc(logInitials(row.name))+'</span>'+
    '<div class="tt-record-heading"><span class="tt-record-eyebrow">'+(row.isOjt?'SIGNED OJT ATTENDANCE':'SIGNED ATTENDANCE RECORD')+'</span>'+
    '<h3 id="tt-log-modal-title">'+esc(row.name||'Attendance details')+'</h3></div>'+
    '<button type="button" class="tt-record-close" data-action="tt-log-detail-close" aria-label="Close attendance details">'+logIcon('<path d="M6 6l12 12M18 6L6 18"/>')+'</button>'+
    '<div class="tt-record-chips">'+chip(status,status==='Completed'?'green':status==='Active'?'accent':'neutral')+
    chip(arrival==='Late'?'Late arrival':arrival,arrival==='Late'?'amber':arrival==='On time'?'green':'neutral')+
    chip(row.location||'Unspecified','neutral')+'</div></header>'+
   '<div class="tt-record-body">'+details+'</div>'+
   '<footer class="tt-record-footer"><span class="tt-record-footnote">'+(row.isOjt?'Shared-login OJT attendance · Admin corrections are audited':'Signed attendance details')+'</span>'+
    '<div>'+(adminFullAccess?'<button type="button" class="secondary" data-action="tt-log-detail-toggle-select" data-record-id="'+esc(row.id)+'"'+(adminBusy?' disabled':'')+' aria-pressed="'+selected+'">'+(selected?'Remove selection':'Select record')+'</button>':'')+
    '<button type="button" class="primary" data-action="tt-log-detail-close">Close details</button></div></footer>'+
  '</section></div>';
}
const logInitials=name=>String(name||'Signed member').trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0].toUpperCase()).join('');
const logRowTime=value=>validTime(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value)):'—';
const logRowDate=value=>new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(new Date(value));
const locationLabel=value=>value==='Office-Base Duty'?'Office':value==='Offsite (Home)'?'Offsite · Home':value;
const logIcon=body=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
const icons={
 filter:logIcon('<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
 chevron:logIcon('<path d="m6 9 6 6 6-6"/>'),
 edit:logIcon('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
 delete:logIcon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
 clear:logIcon('<path d="m6 6 12 12M18 6 6 18"/>'),
 add:logIcon('<path d="M12 5v14M5 12h14"/>'),
 export:logIcon('<path d="M12 4v11m-5-4 5 5 5-5M5 20h14"/>'),
 refresh:logIcon('<path d="M20 4v5h-5M20 9a8 8 0 1 0 0 6"/>'),
 info:logIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>')
};
const iconButton=(action,label,icon,disabled=false,cls='')=>'<button type="button" class="tt-log-icon '+cls+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" data-action="'+action+'"'+(disabled?' disabled':'')+'>'+icons[icon]+'</button>';
const field=(label,id,values,selected)=>'<label class="tt-log-filter-field"><span>'+label+'</span>'+choices(id,values,selected)+'</label>';

const TT_LOG_COLUMNS=Object.freeze([["in","Clock In"],["person","Employee"],["location","Working Location"],["department","Department"],["out","Clock Out"],["status","Status"]]);
const LOG_WIDTH_MIN=96,LOG_WIDTH_MAX=960,LOG_WIDTH_STEP=16;
export function boundTimeTrackerLogWidth(value){
 return Math.max(LOG_WIDTH_MIN,Math.min(LOG_WIDTH_MAX,Math.round((Number(value)||LOG_WIDTH_MIN)/LOG_WIDTH_STEP)*LOG_WIDTH_STEP));
}
/** Width-only presentation state. Numeric, bounded data attributes select static CSP-safe CSS. */
export function startTimeTrackerLogColumnResize(root){
 const doc=root?.ownerDocument;
 const win=doc?.defaultView;
 if(!win||!root.querySelector)return ()=>{};
 let widths=null,drag=null;
 const tableFor=handle=>handle?.closest('.tt-log-table');
 const readWidths=table=>Object.fromEntries(TT_LOG_COLUMNS.map(([key],i)=>[
  key,boundTimeTrackerLogWidth(table.tHead.rows[0].cells[i+1].getBoundingClientRect().width)
 ]));
 const apply=(table,values)=>{
  if(!table||!values)return;
  table.classList.add('tt-log-width-adjusted');
  for(const [key] of TT_LOG_COLUMNS){
   table.setAttribute('data-tt-log-width-'+key,String(values[key]));
   table.querySelector('[data-tt-log-resize="'+key+'"]')?.setAttribute('aria-valuenow',String(values[key]));
  }
 };
 const hydrate=()=>{
  const table=root.querySelector('.tt-log-table');
  if(!table)return;
  if(widths)apply(table,widths);
  else for(const [key] of TT_LOG_COLUMNS){
   const handle=table.querySelector('[data-tt-log-resize="'+key+'"]');
   if(handle)handle.setAttribute('aria-valuenow',String(boundTimeTrackerLogWidth(handle.parentElement.getBoundingClientRect().width)));
  }
 };
 const observer=new win.MutationObserver(hydrate);
 observer.observe(root,{childList:true,subtree:true});
 const handleFor=event=>event.target?.closest?.('[data-tt-log-resize]');
 const down=event=>{
  const handle=handleFor(event),table=tableFor(handle);
  if(!table||event.button!==0||drag)return;
  const key=handle.dataset.ttLogResize;
  if(!TT_LOG_COLUMNS.some(([k])=>k===key))return;
  widths=widths||readWidths(table);
  drag={table,key,x:event.clientX,start:widths[key],pointerId:event.pointerId};
  apply(table,widths);
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
 };
 const move=event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  widths={...widths,[drag.key]:boundTimeTrackerLogWidth(drag.start+event.clientX-drag.x)};
  apply(drag.table,widths);
 };
 const end=event=>{if(drag&&event.pointerId===drag.pointerId)drag=null;};
 const keyboard=event=>{
  const handle=handleFor(event),table=tableFor(handle);
  if(!table||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const key=handle.dataset.ttLogResize;
  widths=widths||readWidths(table);
  const next=event.key==='Home'?LOG_WIDTH_MIN:event.key==='End'?LOG_WIDTH_MAX:
   widths[key]+(event.key==='ArrowRight'?LOG_WIDTH_STEP:-LOG_WIDTH_STEP);
  widths={...widths,[key]:boundTimeTrackerLogWidth(next)};
  apply(table,widths);
  event.preventDefault();
 };
 root.addEventListener('pointerdown',down);
 root.addEventListener('keydown',keyboard);
 win.addEventListener('pointermove',move);
 win.addEventListener('pointerup',end);
 win.addEventListener('pointercancel',end);
 hydrate();
 return ()=>{
  observer.disconnect();
  root.removeEventListener('pointerdown',down);
  root.removeEventListener('keydown',keyboard);
  win.removeEventListener('pointermove',move);
  win.removeEventListener('pointerup',end);
  win.removeEventListener('pointercancel',end);
 };
}

const sessionRow=(r,query='',now=new Date(),gpsOptions={})=>{
 const hidden=query&&!searchText(r).includes(query.toLocaleLowerCase().trim());
 const selected=gpsOptions.selectedIds?.includes(r.id)===true||
  gpsOptions.expandedRecordIds?.includes(r.id)===true;
 const done=r.status==='Completed';
 const state=r.classification==='Administrative closure'?
  'Administrative closure':done?'Completed':r.status==='Active'?'Active':'Unknown';
 return '<tr class="tt-log-filterable aps-record-selectable'+(selected?' is-selected board-row-selected':'')+
  '" aria-selected="'+selected+'" data-record-id="'+esc(r.id)+'" data-log-search="'+esc(searchText(r))+'"'+
  (hidden?' hidden':'')+'>'+
  '<td class="tt-log-check-cell">'+(gpsOptions.adminFullAccess?'<button type="button" class="tt-log-checkbox" role="checkbox" aria-checked="'+selected+'" aria-label="Select '+esc(r.name||'employee')+'" data-action="tt-log-row-select" data-record-id="'+esc(r.id)+'"'+(gpsOptions.adminBusy?' disabled':'')+'>'+(selected?'✓':'')+'</button>':'')+'</td>'+
  '<td colspan="6"><details class="tt-log-detail" data-record-id="'+esc(r.id)+'">'+
   '<summary class="tt-log-row-summary" data-action="tt-log-open-detail" data-record-id="'+esc(r.id)+
    '" aria-haspopup="dialog" aria-label="Open attendance details for '+esc(r.name||'employee')+'">'+
   '<span class="tt-log-row-clock" title="'+esc(phtDate(r.clockIn))+'"><strong>'+esc(logRowTime(r.clockIn))+'</strong>'+
    (r.location==='Offsite (Home)'&&r.workNote?' <span class="tt-log-work-plan" title="'+esc(r.workNote)+'">'+esc(r.workNote)+'</span>':'')+'</span>'+
   '<span class="tt-log-row-person"><span class="tt-log-avatar" aria-hidden="true">'+esc(logInitials(r.name))+'</span><strong title="'+esc(r.name||'Signed member')+'">'+esc(r.name||'Signed member')+'</strong><small class="tt-log-row-date">'+esc(logRowDate(r.clockIn))+'</small></span>'+
   '<span class="tt-log-row-location" title="'+esc(r.location||'Unspecified')+'">'+esc(locationLabel(r.location||'Unspecified'))+'</span>'+
   '<span class="tt-log-row-department" title="'+esc(r.isOjt?'OJT intern · Shared login':r.department||'Unassigned')+'">'+esc(r.department||'Unassigned')+'</span>'+
   '<span class="tt-log-row-out" title="'+esc(validTime(r.clockOut)?phtDate(r.clockOut):'')+'">'+esc(validTime(r.clockOut)?formatTimeTrackerClock(r.clockOut,{seconds:true}):'—')+'</span><span class="tt-log-row-status"><span class="tt-log-badge '+(done?'tt-log-badge-done':
    state==='Active'?'tt-log-badge-active':'tt-log-badge-unknown')+'">'+esc(state)+'</span></span>'+
  '</summary>'+(gpsOptions.expandedRecordIds?.includes(r.id)?'':safeSessionDetails(r,now,gpsOptions))+'</details></td></tr>';
};
export function renderTimeTrackerLog({
 records=[],scope='OWN_ATTENDANCE_ONLY',filters={},now=new Date(),busy=false,
 gpsEligible=false,gpsData=null,gpsBusy=false,gpsError='',gpsErrorRecordId='',
 expandedRecordIds=[],mapEnabled=false,mapTheme='map',
 adminEligible=false,adminFullAccess=adminEligible,adminDirectory=[],selectedIds=[],adminEditor=null,adminDeleteConfirm=null,
 adminBusy=false,adminError='',adminSuccess=''
}={}){
 const options={...TT_LOG_DEFAULT_FILTERS,...filters};
 const rows=filterTimeTrackerLogRows(records,{...options,search:''},now);
 const visible=filterTimeTrackerLogRows(records,options,now);
 const editableVisible=visible.some(row=>!row.isOjt);
 const standardSelected=selectedIds.filter(id=>rows.some(row=>row.id===id&&!row.isOjt));
 const query=String(options.search??'').slice(0,120);
 const summary=timeTrackerLogSummary(rows,now);
 const places=[...new Set(safeRows(records).map(r=>r.location).
  filter(v=>TT_LOCATIONS.includes(v)))].sort();
 const scopeLabel=scope==='AUTHORIZED_WORKSPACE_TEAM'?'Authorized team history':'Your attendance history';
 const totals=timeTrackerLogSummary(safeRows(records).filter(r=>!options.date||manilaDay(r.clockIn)===options.date),now);
 const departments=[...new Set(safeRows(records).map(r=>r.department||'Unassigned'))].sort();
 const visibleStandard=visible.filter(r=>!r.isOjt);
 const allSelected=visibleStandard.length>0&&visibleStandard.every(r=>standardSelected.includes(r.id));
 const someSelected=visibleStandard.some(r=>standardSelected.includes(r.id));
 const selectionLabel=allSelected?'true':someSelected?'mixed':'false';
 return '<section class="tt-log tt-log-command" aria-label="'+scopeLabel+'" data-tt-log-reference>'+
  '<header class="tt-log-reference-header"><h2>Attendance Log</h2>'+
   '<section class="tt-log-controls" aria-label="Attendance Log filters">'+
    '<label class="tt-log-search"><span class="tt-log-filter-label">Search employee or department</span>'+
     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>'+
     '<input type="search" id="tt-log-search" maxlength="120" value="'+esc(options.search)+
      '" placeholder="Search employee or department" autocomplete="off"></label>'+
    '<details class="tt-log-filter-popover"><summary class="tt-log-filter-trigger">'+icons.filter+'Filter'+icons.chevron+'</summary>'+
     '<div class="tt-log-filter-panel"><div class="tt-log-filter-grid">'+
      field('Date','tt-log-period',periods,options.period)+
      field('Status','tt-log-status',statuses,options.status)+
      field('Working location','tt-log-location',[['all','All locations'],...places.map(v=>[v,locationLabel(v)])],options.location)+
      field('Department','tt-log-department',[['all','All departments'],...departments.map(v=>[v,v])],options.department)+
      field('Sort by','tt-log-sort',sortModes,options.sort)+
      '<div class="tt-log-custom-range"'+(options.period==='custom'?'':' hidden')+'><label class="tt-log-filter-field">From<input type="date" id="tt-log-start" value="'+esc(options.start)+'"></label><label class="tt-log-filter-field">To<input type="date" id="tt-log-end" value="'+esc(options.end)+'"></label></div>'+
     '</div><div class="tt-log-filter-footer"><button type="button" data-action="tt-log-filter-reset">Reset</button><button type="button" data-action="tt-log-filter-apply">Apply filters</button></div></div>'+
    '</details></section>'+
   (options.employeeId?'<button class="tt-log-employee-clear" type="button" data-action="tt-log-employee-clear">Clear employee filter</button>':'')+'</header>'+
  '<nav class="tt-log-flat-stats" aria-label="Signed attendance history snapshot">'+
   [['all','All sessions',totals.sessions],['today','Today',totals.today],['Completed','Completed',totals.completed],['Active','Active',totals.active]].map(([key,label,count])=>
    '<button type="button" class="tt-log-view-tab'+(options.view===key?' is-current':'')+'" aria-pressed="'+(options.view===key)+'" data-action="tt-log-view" data-target="'+key+'">'+label+'<span>'+count+'</span></button>').join('')+
   '<label class="tt-log-date-picker"><span>Date</span><input type="date" id="tt-log-date" aria-label="Attendance date (Philippine time)" value="'+esc(options.date)+'"></label>'+
   (options.date?'<button type="button" class="tt-log-date-clear" data-action="tt-log-date-clear">Clear date</button>':'')+
  '</nav>'+
  '<section class="tt-log-panel tt-log-records" aria-label="Attendance Records">'+
   '<div class="tt-log-reference-toolbar">'+
    (adminFullAccess?'<div class="tt-log-admin-toolbar" role="region" aria-label="System Admin attendance record management">'+
     '<div class="tt-log-admin-toolbar-copy"><button type="button" class="tt-log-checkbox" role="checkbox" aria-label="Select visible standard employee records" aria-checked="'+selectionLabel+'" data-action="tt-log-admin-select-visible"'+(!editableVisible||adminBusy?' disabled':'')+'>'+(allSelected?'✓':someSelected?'−':'')+'</button>'+
      '<span class="tt-log-admin-selection-status"><strong class="tt-log-admin-selected">'+selectedIds.length+'</strong> selected</span></div>'+
     '<div class="tt-log-admin-toolbar-actions">'+
      iconButton('tt-log-admin-bulk-edit','Edit selected','edit',!standardSelected.length||adminBusy)+
      iconButton('tt-log-admin-bulk-delete','Delete selected','delete',!standardSelected.length||adminBusy,'tt-log-admin-delete')+
      iconButton('tt-log-admin-clear-selection','Clear selection','clear',!selectedIds.length||adminBusy)+'</div></div>':'<span></span>')+
    '<div class="tt-log-reference-actions">'+
     (adminFullAccess?'<button type="button" class="tt-log-add" data-action="tt-log-admin-add"'+(adminBusy||adminEditor||adminDeleteConfirm?' disabled':'')+'>'+icons.add+'Add Log</button>':'')+
     iconButton('tt-log-export','Export CSV','export',busy||!visible.length)+
     iconButton('tt-refresh','Refresh attendance','refresh',busy)+
     iconButton('tt-log-insights','About this page and attendance insights','info')+
    '</div></div>'+
   (adminError&&!adminEditor?'<p class="tt-log-admin-feedback is-error" role="alert">'+esc(adminError)+'</p>':'')+
   (adminSuccess?'<p class="tt-log-admin-feedback is-success" role="status">'+esc(adminSuccess)+'</p>':'')+
   (rows.length?'<div class="tt-log-day"><div class="tt-log-table-scroll">'+
     '<table class="board-table tt-log-table"><colgroup><col class="tt-log-col-check"><col class="tt-log-col-in"><col class="tt-log-col-person"><col class="tt-log-col-location"><col class="tt-log-col-department"><col class="tt-log-col-out"><col class="tt-log-col-status"></colgroup><thead><tr>'+
     '<th class="tt-log-check-heading" aria-label="Selection"></th>'+TT_LOG_COLUMNS.map(([key,label])=>
      '<th>'+label+'<span class="tt-log-resize" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize '+label+' column" aria-valuemin="96" aria-valuemax="960" aria-valuenow="160" data-tt-log-resize="'+key+'"></span></th>').join('')+'</tr></thead>'+
     '<tbody>'+rows.map(r=>sessionRow(r,query,now,{
      gpsEligible:!r.isOjt&&gpsEligible,gpsData:r.isOjt?null:gpsData,gpsBusy,gpsError,gpsErrorRecordId,
      expandedRecordIds,mapEnabled:!r.isOjt&&mapEnabled,mapTheme,
      adminEligible,adminFullAccess,
      adminBusy,selectedIds})).join('')+
     '</tbody></table></div></div>':
     '<p class="tt-log-empty">No authorized attendance sessions match these filters.</p>')+
   (rows.length?'<p id="tt-log-empty-search" class="tt-log-empty"'+
    (visible.length?' hidden':'')+'>No sessions match the current search.</p>':'')+
   '<p class="tt-log-results-count" role="status"><span id="tt-log-visible-count">'+visible.length+'</span> of '+summary.sessions+' authorized sessions</p>'+
  '</section>'+
  '<details class="tt-log-secondary-analytics"><summary>Attendance insights · '+summary.historical+' earlier · '+summary.today+' today</summary>'+
   locationDistribution(rows)+dailyOperations(rows,now)+shiftProgress(rows,now)+
   (!adminEligible?'<p class="tt-log-footnote">Read-only history of authorized sessions, today and earlier.</p>':'')+
   '<p class="tt-log-footnote">Daily operations use the current Philippine date. Search narrows records and CSV only. Click any record to view its details in a popup. Authorized standard employee records can be selected in bulk; OJT corrections are individual. Intern attendance is drawn from the latest signed OJT snapshot (up to 100 entries).</p>'+
  '</details>'+(adminEditor||adminDeleteConfirm?'':renderTimeTrackerLogDetailDialog({row:rows.find(r=>expandedRecordIds.includes(r.id))||null,now,
    gpsEligible,gpsData,gpsBusy,gpsError,gpsErrorRecordId,mapEnabled,mapTheme,
    adminEligible,adminFullAccess,adminBusy,selectedIds}))+
   (adminFullAccess&&adminEditor?.mode==='manual'?renderManualAttendanceEditor({editor:adminEditor,busy:adminBusy,error:adminError,now}):adminEditor?.ojt?renderTimeTrackerOjtAdminEditor({editor:adminEditor,busy:adminBusy,error:adminError}):
    renderTimeTrackerAdminEditor({editor:adminEditor,directory:adminDirectory,busy:adminBusy,error:adminEditor?adminError:'',timeOnly:adminEditor?.timeOnly===true}))+
   renderTimeTrackerAdminDeleteDialog({confirmation:adminDeleteConfirm,busy:adminBusy})+'</section>';
}

const logCsvCell=value=>{
 const raw=String(value??'');
 const escaped=(/^[=+@-]/.test(raw)||raw.startsWith(String.fromCharCode(9))||
  raw.startsWith(String.fromCharCode(13))||raw.startsWith(String.fromCharCode(10)))?"'"+raw:raw;
 return '"'+escaped.replaceAll('"','""')+'"';
};
/** CSV contains only sanitized, already-authorized Log projections. */
export function timeTrackerLogCsv(rows=[]){
 return '\uFEFF'+[
  ['Employee','Department','Location','Clock In','Clock Out','Status','Arrival','Credited Hours'],
  ...safeRows(rows).map(row=>[
   row.name||'Signed member',row.department||'',row.location||'',formatTimeTrackerDateTime(row.clockIn),
   row.clockOut?formatTimeTrackerDateTime(row.clockOut):'',row.status||'',row.classification||'',creditedHours(row.creditedMs)
  ])
 ].map(row=>row.map(logCsvCell).join(',')).join('\r\n')+'\r\n';
}

/** Search only rows already authorized and rendered by the signed Log read. */
export function applyTimeTrackerLogSearch(root,query=''){
 const section=root?.querySelector?.('.tt-log');
 if(!section)return false;
 const search=String(query??'').toLocaleLowerCase().trim().slice(0,120);
 let count=0;
 for(const group of section.querySelectorAll('.tt-log-day')){
  let displayed=0;
  for(const row of group.querySelectorAll('.tt-log-filterable')){
   row.hidden=Boolean(search&&!String(row.dataset.logSearch||'').includes(search));
   if(!row.hidden){count++;displayed++;}
  }
  group.hidden=displayed===0;
 }
 const counter=section.querySelector('#tt-log-visible-count');
 if(counter)counter.textContent=String(count);
 const empty=section.querySelector('#tt-log-empty-search');
 if(empty){empty.hidden=count!==0;empty.textContent='No sessions match the current search.';}
 const exportButton=section.querySelector('[data-action="tt-log-export"]');
 if(exportButton)exportButton.disabled=count===0;
 return true;
}
