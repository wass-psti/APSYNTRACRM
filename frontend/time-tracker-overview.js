/** Native TimeTracker Overview — strictly scoped to current signed workspace/module.
 * No GPS, email, company-wide user registry, or standalone backend is used.
 */
import {TT_LOCATIONS,creditedAttendanceMs} from './time-tracker-policy.js';
const timeTrackerClockParts=value=>{
 const t=new Date(value);
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',hourCycle:'h23'}).format(t));
 return {
  greeting:hour<12?'Good morning,':hour<17?'Good afternoon,':'Good evening,',
  day:new Intl.DateTimeFormat('en-US',{
   timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric'
  }).format(t),
  hours:String(hour%12||12).padStart(2,'0'),
  minutes:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',minute:'2-digit'}).format(t).padStart(2,'0'),
  seconds:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',second:'2-digit'}).format(t).padStart(2,'0'),
  period:new Intl.DateTimeFormat('en-US',{
   timeZone:'Asia/Manila',hour:'numeric',hour12:true
  }).formatToParts(t).find(p=>p.type==='dayPeriod')?.value||'AM'
 };
};

export const TT_TEAM_OVERVIEW_ROLES=Object.freeze([
 'System Admin','IT Administrator','HR'
]);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const clockTime=v=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:true
}).format(new Date(v));
const shortTime=v=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',hour:'numeric',hour12:true
}).format(new Date(v));
const timeParts=v=>new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Manila',year:'numeric',month:'2-digit',
 day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).formatToParts(new Date(v)).reduce((obj,p)=>(obj[p.type]=p.value,obj),{});
export const manilaDay=v=>{
 const p=timeParts(v);
 return p.year+'-'+p.month+'-'+p.day;
};
const arrivalMinutes=v=>{
 const p=timeParts(v);
 return Number(p.hour)*60+Number(p.minute);
};
const clockMs=(row,now)=>row.clockOut?
 creditedAttendanceMs(row.clockIn,row.clockOut):
 creditedAttendanceMs(row.clockIn,now);
const hours=ms=>(Math.max(0,ms)/3600000).toFixed(1);
const safeText=(v,n=120)=>String(v??'').slice(0,n);
const allLocations=[...TT_LOCATIONS];
const deny=text=>{throw new Error(text);};

/** Only names present in the backend-authorized directory can be projected.
 * Employee/OJT and unscoped Supervisor/Finance see their OWN session only.
 */
export function projectTimeTrackerOverview({
 value,directory=[],userId,moduleRole,now=new Date()
}={}){
 if(typeof userId!=='string'||!userId||
    !Array.isArray(directory)||directory.length>10000||
    !isTime(new Date(now).toISOString()))
  deny('Signed TimeTracker overview context is invalid');
 const broad=TT_TEAM_OVERVIEW_ROLES.includes(moduleRole);
 const members=new Map();
 for(const user of directory){
  if(!isObject(user)||typeof user.id!=='string'||!user.id||
     (user.id!==userId&&!broad)||user.status!=='active')continue;
  members.set('cloud:'+user.id,{
   id:user.id,name:safeText(user.display_name||'Workforce member',100)
  });
 }
 if(!members.has('cloud:'+userId))
  deny('Verified TimeTracker directory does not include signed user');
 let state;
 try{state=typeof value==='string'?JSON.parse(value):value;}
 catch{deny('Attendance overview state is malformed');}
 if(!isObject(state)||state.version!==1||!Array.isArray(state.records)||
    state.records.length>25000)deny('Attendance overview schema is invalid');
 const today=manilaDay(now);
 const rows=[];
 for(const record of state.records){
  if(!isObject(record)||typeof record.id!=='string'||record.id.length>150||
     !members.has(record.ownerId)||!isObject(record.clockIn)||
     !isTime(record.clockIn.timestamp)||
     manilaDay(record.clockIn.timestamp)!==today)continue;
  const member=members.get(record.ownerId);
  const out=isObject(record.clockOut)&&isTime(record.clockOut.timestamp)?
    record.clockOut.timestamp:null;
  if(out&&Date.parse(out)<Date.parse(record.clockIn.timestamp))continue;
  const lateMinutes=Math.max(0,arrivalMinutes(record.clockIn.timestamp)-480);
  const location=allLocations.includes(record.clockIn.location)?
    record.clockIn.location:'Unspecified';
  rows.push(Object.freeze({
   id:record.id,ownerId:record.ownerId,name:member.name,department:
    safeText(record.clockIn.department||'Unassigned',80),
   location,clockIn:record.clockIn.timestamp,clockOut:out,
   status:out?'Completed':'Active',lateMinutes,
   creditedMs:clockMs({
    clockIn:record.clockIn.timestamp,clockOut:out
   },now)
  }));
 }
 rows.sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn));
 // Count each employee only once for the headcount/whereabouts distribution.
 const latestByOwner=new Map();
 for(const row of rows){
  if(!latestByOwner.has(row.ownerId))latestByOwner.set(row.ownerId,row);
 }
 const people=[...latestByOwner.values()];
 const active=people.filter(r=>r.status==='Active');
 const completed=people.filter(r=>r.status==='Completed');
 const late=people.filter(r=>r.lateMinutes>0);
 const locations=allLocations.map(location=>({
  location,count:active.filter(r=>r.location===location).length
 }));
 const departmentCounts=[...new Set(people.map(r=>r.department))].sort()
  .map(department=>({department,count:people.filter(r=>r.department===department).length}))
  .sort((a,b)=>b.count-a.count||a.department.localeCompare(b.department));
 const hourly=new Map();
 for(const row of rows){
  const p=timeParts(row.clockIn);
  const key=p.hour;
  hourly.set(key,(hourly.get(key)||0)+1);
 }
 return Object.freeze({
  scope:broad?'AUTHORIZED_WORKSPACE_TEAM':'OWN_ATTENDANCE_ONLY',
  day:today,peopleCount:people.length,activeCount:active.length,
  completedCount:completed.length,lateCount:late.length,
  onsiteCount:active.filter(r=>r.location==='Office-Base Duty').length,
  onTimeRate:people.length?Math.round(100*(people.length-late.length)/people.length):null,
  averageCreditedMs:people.length?
   people.reduce((sum,r)=>sum+r.creditedMs,0)/people.length:0,
  arrivalBeforeEight:people.filter(r=>arrivalMinutes(r.clockIn)<480).length,
  stagnantCount:active.filter(r=>Date.parse(now)-Date.parse(r.clockIn)>=14*3600000).length,
  locations,departmentCounts,
  hourly:[...hourly].sort((a,b)=>a[0].localeCompare(b[0]))
   .map(([hour,count])=>({hour,count})),
  rows,people
 });
}
export function filterTimeTrackerOverviewRows(rows=[],{
 search='',location='all',department='all',status='all',sort='newest'
}={}){
 const query=String(search).toLowerCase().trim();
 const filtered=rows.filter(r=>
  (location==='all'||r.location===location)&&
  (department==='all'||r.department===department)&&
  (status==='all'||status==='Late'&&r.lateMinutes>0||r.status===status)&&
  (!query||[r.name,r.department,r.location,r.id].some(x=>
   String(x).toLowerCase().includes(query))));
 return filtered.sort((a,b)=>sort==='oldest'?
  Date.parse(a.clockIn)-Date.parse(b.clockIn):
  Date.parse(b.clockIn)-Date.parse(a.clockIn));
}
const csvValue=v=>'"'+String(v??'').replaceAll('"','""')
 .replace(/^[=+@\-\t\r]/,"' $&")+'"';
export function timeTrackerOverviewCsv(rows=[]){
 return '\uFEFF'+[
  ['Name','Department','Location','Clock In','Clock Out',
   'Status','Late Minutes','Credited Hours'],
  ...rows.map(r=>[r.name,r.department,r.location,r.clockIn,
   r.clockOut||'',r.status,r.lateMinutes,hours(r.creditedMs)])
 ].map(row=>row.map(csvValue).join(',')).join('\r\n')+'\r\n';
}
const toMin=ms=>{
 const x=Math.max(0,Math.floor(ms/60000));
 return (x>=60?Math.floor(x/60)+'h ':'')+(x%60)+'m';
};
const locationLabel=v=>({
 'Office-Base Duty':'Office-Base Duty','Offsite (Home)':'Offsite (Home)',
 'Local Field Works':'Local field works',
 'Out of Town Assignment':'Out of town assignment',
 'International Field Assignments':'International field assignment'
}[v]||v);
const ratio=(a,total)=>total?Math.round(100*a/total):0;
const bucket=value=>'tt-ov-p'+Math.max(0,Math.min(100,Math.round(Number(value)/5)*5));
const dropdown=(id,values,selected,caption)=>{
 return '<label for="'+id+'">'+escapeHtml(caption)+
 '<select id="'+id+'">'+values.map(([key,label])=>
 '<option value="'+escapeHtml(key)+'"'+(key===selected?' selected':'')+'>'+
 escapeHtml(label)+'</option>').join('')+'</select></label>';
};
const entry=row=>'<tr class="tt-overview-filterable" data-tt-search="'+
 escapeHtml([row.name,row.department,row.location,row.id].join(' ').toLowerCase())+
 '" data-tt-location="'+escapeHtml(row.location)+
 '" data-tt-department="'+escapeHtml(row.department)+
 '" data-tt-status="'+escapeHtml(row.status)+
 '" data-tt-late="'+(row.lateMinutes>0?'true':'false')+'">'+
 '<td>'+escapeHtml(row.name)+'</td><td>'+escapeHtml(row.department)+'</td>'+
 '<td>'+escapeHtml(locationLabel(row.location))+'</td>'+
 '<td>'+escapeHtml(clockTime(row.clockIn))+'</td><td>'+
 escapeHtml(row.clockOut?clockTime(row.clockOut):'Active')+'</td>'+
 '<td>'+escapeHtml(row.lateMinutes?toMin(row.lateMinutes):'—')+'</td>'+
 '<td>'+escapeHtml(toMin(row.creditedMs))+'</td>'+
 '<td><span class="tt-status-dot '+(row.status==='Active'?'is-active':'')+'"></span>'+
 escapeHtml(row.status)+'</td></tr>';
const initials=name=>String(name||'W').trim().split(/\s+/).slice(0,2)
 .map(x=>x.charAt(0)).join('').toUpperCase();

/** The surrounding CRM remains the only application shell. */
export function renderTimeTrackerOverview({
 overview,access,now=new Date(),filters={}
}={}){
 if(!overview||!access)return '<div class="tt-unavailable" role="status">Signed TimeTracker overview unavailable.</div>';
 const t=timeTrackerClockParts(now);
 const allRows=filterTimeTrackerOverviewRows(overview.rows,filters);
 const filterData={
  search:filters.search||'',location:filters.location||'all',
  department:filters.department||'all',status:filters.status||'all',
  sort:filters.sort||'newest'
 };
 const departments=[...new Set(overview.rows.map(r=>r.department))].sort();
 const maxHourly=Math.max(1,...overview.hourly.map(x=>x.count));
 const totalLocations=overview.locations.reduce((n,x)=>n+x.count,0);
 const late=overview.people.filter(x=>x.lateMinutes>0);
 const selected=overview.rows.filter(x=>x.status==='Active');
 const heading=t.greeting+' '+(String(access.name||'').split(/\s+/)[0]||'');
 let html='<div class="tt-overview tt-overview-command" data-tt-view="overview">'+
  '<section class="tt-overview-hero tt-overview-command-hero" aria-label="Authorized attendance intelligence">'+
   '<div class="tt-overview-graphics" aria-hidden="true">'+
    '<div class="tt-pixi-backdrop" data-pixi="fallback"></div>'+
    '<span class="tt-ov-orbit tt-ov-orbit-outer"></span>'+
    '<span class="tt-ov-orbit tt-ov-orbit-inner"></span>'+
    '<span class="tt-ov-orbit tt-ov-orbit-ring"></span>'+
   '</div>'+
   '<div class="tt-overview-hero-content">'+
    '<div class="tt-ov-heading-kicker"><span class="tt-ov-heading-dot" aria-hidden="true"></span>'+
     'APSYNTRA <span class="tt-ov-heading-divider">/</span> WORKFORCE INTELLIGENCE</div>'+
    '<h3>'+escapeHtml(heading)+'</h3>'+
    '<p>'+escapeHtml(t.day)+'</p>'+
    '<div class="tt-ov-scope">'+
     '<span class="tt-ov-scope-indicator" aria-hidden="true"></span>'+
     (overview.scope==='AUTHORIZED_WORKSPACE_TEAM'?
      'Authorized workspace team':'My authorized attendance')+
    '</div>'+
   '</div>'+
   '<div class="tt-ov-telemetry">'+
    '<div class="tt-ov-telemetry-title"><span>SIGNED SNAPSHOT</span><span class="tt-ov-live-marker" aria-hidden="true"></span></div>'+
    '<div class="tt-overview-live">'+
     '<time id="tt-overview-time">'+escapeHtml(t.hours+':'+t.minutes+':'+t.seconds+' '+t.period)+'</time>'+
     '<span>Philippine Time · UTC +08:00</span>'+
    '</div>'+
    '<div class="tt-ov-telemetry-stats" aria-label="Current attendance snapshot">'+
     '<div><strong>'+overview.activeCount+'</strong><span>Working now</span></div>'+
     '<div><strong>'+overview.completedCount+'</strong><span>Completed</span></div>'+
     '<div><strong>'+(overview.onTimeRate===null?'—':overview.onTimeRate+'%')+
      '</strong><span>On-time rate</span></div>'+
    '</div>'+
    '<button type="button" class="secondary tt-ov-refresh" data-action="tt-refresh" aria-label="Refresh authorized attendance">↻ Refresh authorized data</button>'+
   '</div>'+
  '</section>'+
  '<div class="tt-overview-search"><label for="tt-overview-search">Search today’s authorized attendance</label>'+
   '<input id="tt-overview-search" type="search" placeholder="Search by name, department, or location…" value="'+escapeHtml(filterData.search)+'" autocomplete="off" /></div>'+
  '<section class="tt-overview-metrics" aria-label="Today attendance summary">'+
   [
    ['Employees',overview.peopleCount],['Active',overview.activeCount],
    ['Completed',overview.completedCount],['On-Site',overview.onsiteCount],
    ['Late',overview.lateCount],['Avg Hours',hours(overview.averageCreditedMs)]
   ].map(([label,value])=>'<div class="tt-overview-metric"><strong>'+
     escapeHtml(value)+'</strong><span>'+escapeHtml(label)+'</span></div>').join('')+
   '<div class="tt-on-time"><span>On-time rate</span><div class="tt-on-time-bar"><i class="'+bucket(overview.onTimeRate??0)+'"></i></div><b>'+
    (overview.onTimeRate===null?'No arrivals':overview.onTimeRate+'%')+
    '</b></div></section>'+
  '<div class="tt-overview-filters">'+
   dropdown('tt-overview-location',[['all','All Locations'],
    ...TT_LOCATIONS.map(x=>[x,locationLabel(x)])],filterData.location,'Location')+
   dropdown('tt-overview-department',[['all','All Departments'],
    ...departments.map(x=>[x,x])],filterData.department,'Department')+
   dropdown('tt-overview-status',[
    ['all','All Status'],['Active','Active'],['Completed','Completed'],
    ['Late','Late']],filterData.status,'Status')+
   dropdown('tt-overview-sort',[
    ['newest','Time In (Newest)'],['oldest','Time In (Oldest)']],
    filterData.sort,'Sort')+'</div>'+
  '<section class="tt-overview-locations" aria-label="Current work locations">'+
   overview.locations.map(x=>
    '<article class="tt-overview-location"><strong>'+x.count+'</strong>'+
     '<span>'+escapeHtml(locationLabel(x.location))+'</span>'+
     '<small>'+ (x.count?ratio(x.count,totalLocations)+'% of active workforce':'No active employees')+
     '</small></article>').join('')+'</section>'+
  '<section class="tt-overview-panel tt-location-distribution"><div class="tt-overview-panel-heading">'+
   '<h4>Location distribution</h4><b>'+totalLocations+' active</b></div>'+
   '<div class="tt-location-track" role="img" aria-label="Location distribution for active workers">'+
   overview.locations.map((x,i)=>x.count?
    '<span class="tt-location-segment tt-location-color-'+i+' '+bucket(ratio(x.count,totalLocations))+
    '" title="'+
    escapeHtml(locationLabel(x.location)+': '+x.count)+'">'+x.count+'</span>':'').join('')+
   '</div><div class="tt-location-legend">'+overview.locations.map((x,i)=>
    '<span><i class="tt-location-color-'+i+'"></i>'+
    escapeHtml(locationLabel(x.location))+' · '+x.count+'</span>').join('')+
   '</div></section>'+
  '<div class="tt-overview-analytics">'+
   '<section class="tt-overview-panel"><div class="tt-overview-panel-heading"><h4>Clock-In Distribution</h4>'+
    '<small>Arrivals by hour · PHT</small></div>'+
    '<div class="tt-arrival-bars" role="img" aria-label="Hourly attendance arrivals">'+
     (overview.hourly.map(x=>
      '<div class="tt-arrival-bar"><b>'+x.count+'</b><i class="'+bucket(x.count/maxHourly*100)+'"></i><span>'+escapeHtml(x.hour)+':00</span></div>').join('')||
      '<p>No attendance arrivals today.</p>')+'</div></section>'+
   '<section class="tt-overview-panel"><div class="tt-overview-panel-heading"><h4>Attendance Pulse</h4>'+
     '<small>'+overview.rows.length+' records</small></div>'+
    '<div class="tt-pulse-grid">'+[
     ['Before 8 AM',overview.arrivalBeforeEight],
     ['Late Today',overview.lateCount],['Still Working',overview.activeCount],
     ['No Time-out',overview.activeCount],['Completed',overview.completedCount],
     ['Stagnant (14h+)',overview.stagnantCount]
     ].map(([label,value])=>'<div><strong>'+value+'</strong><small>'+
      escapeHtml(label)+'</small></div>').join('')+'</div></section>'+
   '<section class="tt-overview-panel"><div class="tt-overview-panel-heading"><h4>Late Arrivals</h4>'+
    '<small>'+late.length+' late</small></div><div class="tt-late-list">'+
    (late.map(x=>'<div><b>'+escapeHtml(x.name)+'</b><span>'+
      escapeHtml(clockTime(x.clockIn))+' · +'+escapeHtml(toMin(x.lateMinutes))+
      '</span></div>').join('')||'<p>No late arrivals recorded today.</p>')+
    '</div></section></div>'+
  '<div class="tt-overview-bottom">'+
   '<section class="tt-overview-panel"><div class="tt-overview-panel-heading"><h4>Arrival Pattern</h4>'+
    '<small>'+(overview.onTimeRate??'—')+'% on time</small></div>'+
    '<div class="tt-arrival-summary"><b>'+overview.arrivalBeforeEight+'</b> before 8 AM · '+
     '<b>'+overview.lateCount+'</b> late</div>'+
    '<div class="tt-arrival-timeline">'+
     overview.people.map(x=>'<i title="'+
      escapeHtml(x.name+': '+clockTime(x.clockIn))+
      '" class="'+bucket((arrivalMinutes(x.clockIn)-300)/420*100)+' '+
      (x.lateMinutes?'is-late':'is-ontime')+'"></i>').join('')+
    '</div><div class="tt-arrival-hours"><span>5 AM</span><span>8 AM</span><span>12 PM</span></div>'+
   '</section>'+
   '<section class="tt-overview-panel"><div class="tt-overview-panel-heading"><h4>Department Breakdown</h4>'+
    '<small>'+overview.departmentCounts.length+' departments</small></div>'+
    overview.departmentCounts.map(x=>
     '<div class="tt-department-row"><div><b>'+escapeHtml(x.department)+'</b>'+
     '<span>'+x.count+' ('+ratio(x.count,overview.peopleCount)+'%)</span></div>'+
     '<div><i class="'+bucket(ratio(x.count,overview.peopleCount))+'"></i></div></div>'
    ).join('')+'</section></div>'+
  '<section class="tt-overview-whereabouts"><div class="tt-overview-panel-heading"><h4>Employee Whereabouts</h4>'+
   '<small>'+selected.length+' active</small></div>'+
   (overview.locations.filter(x=>selected.some(r=>r.location===x.location)).map(x=>
    '<div class="tt-whereabouts-group"><h5>'+escapeHtml(locationLabel(x.location))+
     ' <span>· '+x.count+'</span></h5><div class="tt-employee-grid">'+
    selected.filter(r=>r.location===x.location).map(r=>
     '<article class="tt-employee-card tt-overview-filterable" data-tt-search="'+
     escapeHtml([r.name,r.department,r.location,r.id].join(' ').toLowerCase())+
     '" data-tt-location="'+escapeHtml(r.location)+
     '" data-tt-department="'+escapeHtml(r.department)+
     '" data-tt-status="'+escapeHtml(r.status)+
     '" data-tt-late="'+(r.lateMinutes>0?'true':'false')+'">'+
      '<div class="tt-employee-identity"><span>'+escapeHtml(initials(r.name))+'</span>'+
       '<strong>'+escapeHtml(r.name)+'</strong></div>'+
      '<p>'+escapeHtml(r.department)+'</p><p>In: <b>'+escapeHtml(clockTime(r.clockIn))+
      '</b></p><small>Active · '+escapeHtml(toMin(r.creditedMs))+'</small>'+
     '</article>').join('')+'</div></div>'
   ).join('')||'<p class="tt-muted">No active workers in the authorized attendance scope.</p>')+
  '</section>'+
  '<section class="tt-overview-panel tt-attendance-list"><div class="tt-overview-panel-heading"><h4>Attendance Records</h4>'+
   '<span>'+allRows.length+' entries</span>'+
   '<button type="button" class="secondary" data-action="tt-overview-export"'+
   (!allRows.length?' disabled':'')+'>Export CSV</button></div>'+
   '<div class="table-scroll"><table class="board-table"><thead><tr>'+
    '<th>Name</th><th>Department</th><th>Location</th><th>In</th><th>Out</th>'+
    '<th>Late</th><th>Hours</th><th>Status</th></tr></thead>'+
   '<tbody>'+ (allRows.map(entry).join('')||
    '<tr><td colspan="8">No authorized attendance records today.</td></tr>')+
   '</tbody></table></div>'+
   '<p class="tt-muted">Data is limited to the current workspace and your central TimeTracker role. Exact GPS positions and private audit data are not included.</p>'+
  '</section></div>';
 return html;
}
/** Fast DOM filtering without network calls or a full board rerender. */
export function applyTimeTrackerOverviewFilters(root){
 const section=root?.querySelector?.('.tt-overview');
 if(!section)return 0;
 const selection=id=>section.querySelector('#'+id)?.value||'all';
 const search=String(section.querySelector('#tt-overview-search')?.value||'').toLowerCase().trim();
 const location=selection('tt-overview-location');
 const department=selection('tt-overview-department');
 const status=selection('tt-overview-status');
 let count=0;
 for(const row of section.querySelectorAll('.tt-overview-filterable')){
  const d=row.dataset||{};
  const visible=(!search||String(d.ttSearch||'').includes(search))&&
   (location==='all'||d.ttLocation===location)&&
   (department==='all'||d.ttDepartment===department)&&
   (status==='all'||status==='Late'&&d.ttLate==='true'||d.ttStatus===status);
  row.hidden=!visible;
  if(visible&&row.tagName==='TR')count++;
 }
 return count;
}
export function syncTimeTrackerOverviewClock(root,now=new Date()){
 const node=root?.querySelector?.('#tt-overview-time');
 if(!node)return false;
 const t=timeTrackerClockParts(now);
 const value=t.hours+':'+t.minutes+':'+t.seconds+' '+t.period;
 if(node.textContent!==value)node.textContent=value;
 return true;
}
