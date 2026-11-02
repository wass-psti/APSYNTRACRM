/** Native signed TimeTracker Log. Read-only: never increases server-side record scope. */
import {TT_LOCATIONS} from './time-tracker-policy.js';
import {filterMyAttendancePeriod} from './time-tracker-native.js';
import {manilaDay} from './time-tracker-overview.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const safeRows=rows=>Array.isArray(rows)?rows.filter(r=>r&&validTime(r.clockIn)):[];
const phtTime=value=>validTime(value)?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:true
}).format(new Date(value)):'—';
const phtDate=value=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',weekday:'long',year:'numeric',month:'long',day:'numeric'
}).format(new Date(value));
const creditedHours=ms=>Number.isFinite(ms)&&ms>=0?(ms/3600000).toFixed(2):'—';
const choices=(id,values,selected)=>'<select id="'+id+'">'+
 values.map(([key,label])=>'<option value="'+esc(key)+'"'+
 (selected===key?' selected':'')+'>'+esc(label)+'</option>').join('')+
 '</select>';

export const TT_LOG_DEFAULT_FILTERS=Object.freeze({
 search:'',period:'all',status:'all',location:'all',sort:'newest'
});
const periods=[['all','All dates'],['today','Today'],
 ['week','This week'],['month','This month']];
const statuses=[['all','All statuses'],['Active','Active'],
 ['Completed','Completed'],['Late','Late'],['Administrative closure','Administrative closure']];
const sortModes=[['newest','Newest first'],['oldest','Oldest first']];
const searchText=r=>[r.name,r.location,r.department,r.classification,r.status,
 manilaDay(r.clockIn),phtTime(r.clockIn)]
 .map(x=>String(x??'').toLocaleLowerCase()).join(' ');

export function filterTimeTrackerLogRows(records=[],filters={},now=new Date()){
 const options={...TT_LOG_DEFAULT_FILTERS,...filters};
 const period=periods.some(([id])=>id===options.period)?options.period:'all';
 let result=filterMyAttendancePeriod(safeRows(records),period,now);
 const search=String(options.search??'').toLocaleLowerCase().trim().slice(0,120);
 result=result.filter(r=>
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


const dateTime=value=>validTime(value)?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',
 hour:'numeric',minute:'2-digit',hour12:true
}).format(new Date(value)):'—';
const durationLabel=ms=>{
 if(!Number.isFinite(ms)||ms<0)return '—';
 const minutes=Math.floor(ms/60000);
 return Math.floor(minutes/60)+'h '+String(minutes%60).padStart(2,'0')+'m';
};
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
function safeSessionDetails(row,now,{gpsEligible=false,gpsData=null,gpsBusy=false,gpsError=''}={}){
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
  (gpsError?'<p class="tt-log-gps-error" role="alert">'+esc(gpsError)+'</p>':''):
  '<span>Exact coordinates are restricted to bootstrap administrators and assigned TimeTracker Supervisors.</span>';
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
    '<span><small>Arrival</small>'+esc(row.classification||'Unknown')+'</span></div></section>'+
  '<div class="tt-log-evidence-title"><strong>DEVICE &amp; LOCATION</strong></div>'+
  '<div class="tt-log-location-evidence"><div>'+
   '<h6>LOCATION EVIDENCE</h6><p>'+esc(row.location||'Unspecified')+'</p>'+
   locationEvidence+
   '</div><div class="tt-log-map-unavailable" role="note">'+
   '<strong>Satellite map unavailable</strong><p>'+
    (available?'Coordinates are from the signed server GPS snapshot. Map links open an external service only when selected.':
     'No satellite imagery is loaded. GPS positions are never inferred from work-location labels.')+
   '</p>'+
   '</div></div>'+
  '</div>';
}
const sessionRow=(r,query='',now=new Date(),gpsOptions={})=>{
 const hidden=query&&!searchText(r).includes(query.toLocaleLowerCase().trim());
 const done=r.status==='Completed';
 const state=r.classification==='Administrative closure'?
  'Administrative closure':done?'Completed':r.status==='Active'?'Active':'Unknown';
 return '<tr class="tt-log-filterable" data-log-search="'+esc(searchText(r))+'"'+
  (hidden?' hidden':'')+'><td colspan="9">'+
  '<details class="tt-log-detail"><summary class="tt-log-row-summary">'+
   '<span class="tt-log-row-person"><strong>'+esc(r.name||'Signed member')+
    '</strong><small>'+esc(r.department||'Unassigned')+'</small></span>'+
   '<span title="'+esc(phtDate(r.clockIn))+'">'+esc(dateTime(r.clockIn))+'</span>'+
   '<span>'+esc(dateTime(r.clockOut))+'</span>'+
   '<span class="tt-log-row-location">'+esc(r.location||'Unspecified')+'</span>'+
   '<span>'+esc(r.department||'Unassigned')+'</span>'+
   '<span class="tt-log-row-arrival">'+esc(r.classification||'Unknown')+'</span>'+
   '<span class="tt-log-badge '+(done?'tt-log-badge-done':
    state==='Active'?'tt-log-badge-active':'tt-log-badge-unknown')+'">'+esc(state)+'</span>'+
   '<span class="tt-log-hours">'+esc(creditedHours(r.creditedMs))+'</span>'+
   '<span class="tt-log-disclosure" aria-label="Expand session evidence">⌄</span>'+
  '</summary>'+safeSessionDetails(r,now,gpsOptions)+'</details></td></tr>';
};
export function renderTimeTrackerLog({
 records=[],scope='OWN_ATTENDANCE_ONLY',filters={},now=new Date(),busy=false,
 gpsEligible=false,gpsData=null,gpsBusy=false,gpsError=''
}={}){
 const options={...TT_LOG_DEFAULT_FILTERS,...filters};
 const rows=filterTimeTrackerLogRows(records,{...options,search:''},now);
 const visible=filterTimeTrackerLogRows(records,options,now);
 const query=String(options.search??'').slice(0,120);
 const summary=timeTrackerLogSummary(rows,now);
 const team=scope==='AUTHORIZED_WORKSPACE_TEAM';
 const places=[...new Set(safeRows(records).map(r=>r.location).
  filter(v=>TT_LOCATIONS.includes(v)))].sort();
 return '<section class="tt-log" aria-label="Signed attendance Log">'+
  '<header class="tt-log-hero"><div><h3>Attendance Log</h3>'+
   '<p>'+esc(phtDate(now))+' · '+(team?
    'Authorized team history':'Your attendance history')+
   ' · Today and earlier sessions</p></div>'+
   '<span class="tt-log-readonly">Read-only · '+
    (team?'Authorized team':'Signed account')+'</span></header>'+
  '<section class="tt-log-controls" aria-label="Attendance Log filters">'+
   '<label class="tt-log-search">Search employee or department'+
   '<input type="search" id="tt-log-search" maxlength="120" value="'+esc(options.search)+
    '" placeholder="Search employee, department or location…" autocomplete="off"></label>'+
   '<label>Date range'+choices('tt-log-period',periods,options.period)+'</label>'+
   '<label>Status'+choices('tt-log-status',statuses,options.status)+'</label>'+
   '<label>Location'+choices('tt-log-location',[
    ['all','All locations'],...places.map(v=>[v,v])
   ],options.location)+'</label>'+
   '<label>Sort'+choices('tt-log-sort',sortModes,options.sort)+'</label>'+
   '<span class="tt-log-results-count">'+visible.length+' of '+summary.sessions+
   ' authorized sessions</span>'+
   '<button class="secondary" type="button" data-action="tt-log-export"'+
    (busy||!visible.length?' disabled':'')+'>Export CSV</button></section>'+
  locationDistribution(rows)+dailyOperations(rows,now)+shiftProgress(rows,now)+
  '<section class="tt-log-panel tt-log-records">'+
   '<div class="tt-log-panel-top"><div><h4>Attendance Records</h4>'+
    '<p>Attendance history · <span id="tt-log-visible-count">'+visible.length+'</span> of '+
    summary.sessions+' sessions match filters · '+summary.people+
    ' authorized employee'+(summary.people===1?'':'s')+'</p></div>'+
    '<span class="tt-log-readonly">'+summary.historical+
    ' earlier · '+summary.today+' today</span></div>'+
   (rows.length?'<div class="tt-log-day"><div class="tt-log-table-scroll">'+
     '<table class="board-table tt-log-table"><thead><tr>'+
     '<th>Employee</th><th>Clock In</th><th>Clock Out</th>'+
     '<th>Location</th><th>Department</th><th>Arrival</th>'+
     '<th>Status</th><th>Hours</th><th>Details</th></tr></thead>'+
     '<tbody>'+rows.map(r=>sessionRow(r,query,now,{
      gpsEligible,gpsData,gpsBusy,gpsError})).join('')+
     '</tbody></table></div></div>':
     '<p class="tt-log-empty">No authorized attendance sessions match these filters.</p>')+
   '<p id="tt-log-empty-search" class="tt-log-empty"'+
    (visible.length?' hidden':'')+'>No sessions match the current search.</p>'+
   '<p class="tt-log-footnote">Daily operations are based on the current Philippine date. Location and shift summaries reflect the selected date, status and location. Search narrows records and CSV only.</p>'+
   '<p class="tt-log-footnote">Exact GPS positions are shown only after a bootstrap administrator or assigned Supervisor receives a valid signed server GPS snapshot. Audit scores, satellite imagery, device fingerprints and manual-edit evidence are not inferred.</p>'+
  '</section></section>';
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
   row.name||'Signed member',row.department||'',row.location||'',row.clockIn,
   row.clockOut||'',row.status||'',row.classification||'',creditedHours(row.creditedMs)
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
 if(empty){empty.hidden=count!==0;empty.textContent='No signed sessions match this search.';}
 const exportButton=section.querySelector('[data-action="tt-log-export"]');
 if(exportButton)exportButton.disabled=count===0;
 return true;
}
