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
 return Object.freeze({
 sessions:eligible.length,
 people:new Set(eligible.map(r=>r.ownerId||r.name||r.id)).size,
 today:eligible.filter(r=>manilaDay(r.clockIn)===manilaDay(now)).length,
 historical:eligible.filter(r=>manilaDay(r.clockIn)!==manilaDay(now)).length,
 completed:eligible.filter(r=>r.status==='Completed').length,
 active:eligible.filter(r=>r.status==='Active').length,
 late:eligible.filter(r=>r.classification==='Late').length,
 creditedMs:eligible.reduce((total,r)=>total+(
  r.status==='Completed'&&Number.isFinite(r.creditedMs)&&r.creditedMs>=0?
   r.creditedMs:0),0)
 });
}

const sessionRow=(r,query='')=>{
 const hidden=query&&!searchText(r).includes(query.toLocaleLowerCase().trim());
 const completed=r.status==='Completed';
 const status=r.classification==='Administrative closure'?
  'Administrative closure':completed?'Completed':r.status==='Active'?'Active':'Unknown';
 const badge=status==='Active'?'tt-log-badge-active':
  status==='Completed'?'tt-log-badge-done':'tt-log-badge-unknown';
 return '<tr class="tt-log-filterable" data-log-search="'+esc(searchText(r))+'"'+
  (hidden?' hidden':'')+'>'+
  '<td><strong>'+esc(r.name||'Signed member')+'</strong></td>'+ 
  '<td><strong>'+esc(phtTime(r.clockIn))+'</strong><small>Clock in</small></td>'+
  '<td><strong>'+esc(phtTime(r.clockOut))+'</strong><small>Clock out</small></td>'+
  '<td><span class="tt-log-location">'+esc(r.location||'Unspecified')+'</span></td>'+
  '<td>'+esc(r.department||'Unassigned')+'</td>'+
  '<td><span class="tt-log-badge '+badge+'">'+esc(status)+'</span></td>'+
  '<td>'+esc(r.classification||'Unknown')+'</td>'+
  '<td class="tt-log-hours">'+esc(creditedHours(r.creditedMs))+'</td>'+
  '<td><details class="tt-log-detail"><summary>Details</summary><div class="tt-log-detail-body">'+
   '<span>Clock In: '+esc(phtTime(r.clockIn))+'</span>'+
   '<span>Clock Out: '+esc(phtTime(r.clockOut))+'</span>'+
   '<span>Location: '+esc(r.location||'Unspecified')+'</span>'+
   '<span>Department: '+esc(r.department||'Unassigned')+'</span>'+
   '<span>Arrival: '+esc(r.classification||'Unknown')+'</span>'+
   '<span>Credited hours: '+esc(creditedHours(r.creditedMs))+'</span>'+
  '</div></details></td>'+
  '</tr>';
};
export function renderTimeTrackerLog({records=[],scope='OWN_ATTENDANCE_ONLY',filters={},now=new Date(),busy=false}={}){
 const options={...TT_LOG_DEFAULT_FILTERS,...filters};
 const rows=filterTimeTrackerLogRows(records,{...options,search:''},now);
 const visible=filterTimeTrackerLogRows(records,options,now);
 const query=String(options.search??'').slice(0,120);
 const summary=timeTrackerLogSummary(rows,now);
 const team=scope==='AUTHORIZED_WORKSPACE_TEAM';
 const locations=[...new Set(safeRows(records).map(r=>r.location).
  filter(v=>TT_LOCATIONS.includes(v)))].sort();
 const days=new Map();
 for(const r of rows){
  const key=manilaDay(r.clockIn);
  if(!days.has(key))days.set(key,[]);
  days.get(key).push(r);
 }
 const metrics=[
  ['Sessions',String(summary.sessions)],
  ['People',String(summary.people)],
  ['Today',String(summary.today)],
  ['Earlier',String(summary.historical)],
  ['Active',String(summary.active)],
  ['Completed',String(summary.completed)],
  ['Late',String(summary.late)]
 ];
 return '<section class="tt-log" aria-label="Signed attendance Log">'+
  '<header class="tt-log-hero"><div><h3>Attendance Log</h3>'+
   '<p>'+(team?'Authorized team history':'Your attendance history')+
   ' · Today and earlier sessions · Philippine Time</p>'+
   '</div><span class="tt-log-readonly">Read-only · '+(team?'Authorized team':'Signed account')+'</span></header>'+
  '<div class="tt-log-metrics">'+metrics.map(([label,value])=>
   '<div class="tt-log-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+
   '</strong></div>').join('')+'</div>'+
  '<section class="tt-log-controls" aria-label="Attendance Log filters">'+
   '<label class="tt-log-search">Search records'+
    '<input type="search" id="tt-log-search" placeholder="Search employee name, location, department or time" maxlength="120" value="'+esc(options.search)+'" autocomplete="off"></label>'+
   '<label>Date range'+choices('tt-log-period',periods,options.period)+'</label>'+
   '<label>Status'+choices('tt-log-status',statuses,options.status)+'</label>'+
   '<label>Location'+choices('tt-log-location',[
    ['all','All locations'],...locations.map(v=>[v,v])
   ],options.location)+'</label>'+
   '<label>Sort'+choices('tt-log-sort',sortModes,options.sort)+'</label>'+
  '</section>'+
  '<div class="tt-log-panel"><div class="tt-log-panel-top">'+
   '<div><h4>Attendance history</h4>'+
   '<p><span id="tt-log-visible-count">'+visible.length+'</span> sessions match the selected filters</p></div>'+
   '<button class="secondary" type="button" data-action="tt-log-export"'+
    (busy||!visible.length?' disabled':'')+'>Export filtered CSV</button></div>'+
   (days.size?[...days].map(([key,items])=>
    '<div class="tt-log-day"><h5>'+esc(phtDate(key+'T00:00:00+08:00'))+
    '<span>'+items.length+' session'+(items.length===1?'':'s')+'</span></h5>'+
    '<div class="tt-log-table-scroll"><table class="board-table tt-log-table">'+
    '<thead><tr><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Location</th>'+
    '<th>Department</th><th>Status</th><th>Arrival</th><th>Hours</th><th>Details</th></tr></thead>'+
    '<tbody>'+items.map(r=>sessionRow(r,query)).join('')+'</tbody></table></div></div>'
   ).join(''):'<p class="tt-log-empty">No signed attendance sessions match this view.</p>')+
   '<p id="tt-log-empty-search" class="tt-log-empty"'+(rows.length&&visible.length?' hidden':'')+
    '>'+(!rows.length?'':'No sessions match the search.')+'</p>'+
   '<p class="tt-log-footnote">Summary cards cover the selected date, status, and location; '+
    'search narrows the listed sessions and CSV export.</p>'+
   '<p class="tt-log-footnote">'+(team?
    'Only approved active workspace members in your central directory are included. ':
    'Only your own attendance history is included. ')+
    'Exact GPS coordinates and privileged audit or device details are excluded. '+
    'Historical members absent from the authorized active directory are not exposed. '+
    'Clock edits and manual corrections remain unavailable pending backend acceptance.</p>'+
  '</div></section>';
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
