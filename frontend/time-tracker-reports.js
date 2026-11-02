/** Read-only attendance Reports derived from centrally authorized TimeTracker Log rows.
 * No other personnel directory or GPS/audit state is accessed by this module.
 */
import {manilaDay} from './time-tracker-overview.js';

export const TT_REPORT_DEFAULT_FILTERS=Object.freeze({
 search:'',status:'all',start:'',end:''
});
const PHT_OFFSET=8*60*60*1000;
const DAY=24*60*60*1000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const isTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const safeNumber=n=>Number.isFinite(n)&&n>=0?n:0;
const fmtHours=ms=>(ms/3600000).toFixed(1);
const fmtTime=value=>isTime(value)?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',
 hour:'numeric',minute:'2-digit',hour12:true
}).format(new Date(value)):'—';
const fmtDay=day=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'
}).format(new Date(day+'T00:00:00+08:00'));
const validDay=v=>{
 if(typeof v!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const t=new Date(v+'T00:00:00.000Z');
 return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===v;
};
const phtDayBoundary=(now,period)=>{
 const local=new Date(now.getTime()+PHT_OFFSET);
 let start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
 if(period==='week')start-=((local.getUTCDay()+6)%7)*DAY;
 if(period==='month')start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1);
 return new Date(start).toISOString().slice(0,10);
};
const ordered=(rows,now)=>Array.isArray(rows)?
 rows.filter(r=>r&&isTime(r.clockIn)&&Date.parse(r.clockIn)<=now.getTime())
 .sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn)):[];
export function filterTimeTrackerReportRows(rows=[],{
 period='all',filters={},now=new Date(),includeSearch=true
}={}){
 const instant=new Date(now);
 if(!Number.isFinite(instant.getTime()))throw new Error('Invalid report time');
 const options={...TT_REPORT_DEFAULT_FILTERS,...filters};
 const today=manilaDay(instant);
 if(!['all','today','week','month','custom'].includes(period))period='all';
 const earliest=period==='all'||period==='custom'?null:
  phtDayBoundary(instant,period);
 const start=period==='custom'&&validDay(options.start)?options.start:null;
 const end=period==='custom'&&validDay(options.end)?options.end:null;
 if(period==='custom'&&(!start||!end||start>end))return [];
 const status=['all','Late','Active','Completed'].includes(options.status)?
  options.status:'all';
 const query=includeSearch?String(options.search||'').toLocaleLowerCase().trim().slice(0,120):'';
 return ordered(rows,instant).filter(r=>{
  const day=manilaDay(r.clockIn);
  return (!earliest||day>=earliest)&&day<=today&&
   (period!=='custom'||day>=start&&day<=end)&&
   (status==='all'||status==='Late'&&r.classification==='Late'||
    status==='Active'&&r.status==='Active'||
    status==='Completed'&&r.status==='Completed')&&
   (!query||[r.name,r.department,r.location,r.status,r.classification,day].
    some(x=>String(x??'').toLocaleLowerCase().includes(query)));
 });
}
const weekday=v=>new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Manila',weekday:'short'
}).format(new Date(v));
const hour=v=>Number(new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Manila',hour:'2-digit',hourCycle:'h23'
}).format(new Date(v)));
export function summarizeTimeTrackerReports(rows=[]){
 const completed=rows.filter(r=>r.status==='Completed'&&
  Number.isFinite(r.creditedMs)&&r.creditedMs>=0);
 const eligible=rows.filter(r=>['Late','On time'].includes(r.classification));
 const late=eligible.filter(r=>r.classification==='Late');
 const people=new Set(rows.map(r=>r.ownerId||r.name||r.id));
 const departments=new Map(),patterns=new Map(),arrivals=new Map();
 for(const r of rows){
  const department=String(r.department||'Unassigned').slice(0,80);
  const d=departments.get(department)||{department,count:0,completed:0,creditedMs:0};
  d.count++;
  if(r.status==='Completed'&&Number.isFinite(r.creditedMs)&&r.creditedMs>=0){
   d.completed++;d.creditedMs+=r.creditedMs;
  }
  departments.set(department,d);
  const date=manilaDay(r.clockIn);
  const group=patterns.get(date)||{date,weekday:weekday(r.clockIn),onTime:0,late:0};
  if(r.classification==='Late')group.late++;
  if(r.classification==='On time')group.onTime++;
  patterns.set(date,group);
  const h=hour(r.clockIn);
  arrivals.set(h,(arrivals.get(h)||0)+1);
 }
 return Object.freeze({
  records:rows.length,employees:people.size,completed:completed.length,
  active:rows.filter(r=>r.status==='Active').length,late:late.length,
  onTimeRate:eligible.length?
   Math.round(100*(eligible.length-late.length)/eligible.length):null,
  averageMs:completed.length?
   completed.reduce((sum,r)=>sum+r.creditedMs,0)/completed.length:null,
  departments:[...departments.values()].sort((a,b)=>b.count-a.count||
   a.department.localeCompare(b.department)),
  patterns:[...patterns.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-14),
  arrivals:[...arrivals].sort((a,b)=>a[0]-b[0]).map(([hour,count])=>({hour,count}))
 });
}
const stat=(label,value)=>'<div class="tt-report-stat"><strong>'+esc(value)+
 '</strong><span>'+esc(label)+'</span></div>';
const color=(type)=>type==='late'?'tt-report-ink-late':'tt-report-ink-good';
const svgColumns=(groups,stacked=false)=>{
 if(!groups.length)return '<p class="tt-report-empty">No authorized arrivals in this range.</p>';
 const max=Math.max(1,...groups.map(x=>stacked?x.onTime+x.late:x.count));
 const w=540,h=210,base=172,top=18,plot=base-top;
 const groupW=w/groups.length;
 let bars='';
 groups.forEach((g,i)=>{
  const width=Math.max(7,Math.min(45,groupW*.64));
  const x=Math.round((i+.5)*groupW-width/2);
  const good=stacked?g.onTime:g.count;
  const goodHeight=Math.round((good/max)*plot);
  const lateHeight=stacked?Math.round((g.late/max)*plot):0;
  const text=stacked?(g.weekday+' '+g.date.slice(5)):String(g.hour).padStart(2,'0')+':00';
  bars+='<rect class="tt-report-bar-good" x="'+x+'" y="'+
   (base-goodHeight)+'" width="'+width+'" height="'+goodHeight+'"/>';
  if(lateHeight)bars+='<rect class="tt-report-bar-late" x="'+x+'" y="'+
   (base-goodHeight-lateHeight)+'" width="'+width+'" height="'+lateHeight+'"/>';
  bars+='<text x="'+Math.round((i+.5)*groupW)+
   '" y="192" text-anchor="middle">'+esc(text)+'</text>';
 });
 return '<svg class="tt-report-svg" viewBox="0 0 540 210" role="img" aria-label="'+
  (stacked?'On-time and late arrivals by date':'Clock-in counts by hour')+'">'+
  '<line x1="0" y1="172" x2="540" y2="172" class="tt-report-axis"/>'+
  bars+'</svg>';
};
const departmentItems=(items,kind)=>{
 if(!items.length)return '<p class="tt-report-empty">No authorized department data.</p>';
 const maximum=Math.max(1,...items.map(x=>kind==='hours'?x.completed?
  x.creditedMs/x.completed:0:x.count));
 return '<div class="tt-report-departments">'+items.map(item=>{
  const value=kind==='hours'?(item.completed?item.creditedMs/item.completed:0):item.count;
  const display=kind==='hours'?(item.completed?fmtHours(value)+' h':'No completed sessions'):
   item.count+' session'+(item.count===1?'':'s');
  return '<div class="tt-report-dept"><div><strong>'+esc(item.department)+
   '</strong><small>'+esc(display)+'</small></div>'+
   '<progress aria-label="'+esc(item.department)+'" value="'+
   Math.round((value/maximum)*100)+'" max="100"></progress></div>';
 }).join('')+'</div>';
};
const details=r=>'<details class="tt-report-record-details"><summary>Details</summary>'+
 '<div><span>Clock In: '+esc(fmtTime(r.clockIn))+'</span>'+
 '<span>Clock Out: '+esc(fmtTime(r.clockOut))+'</span>'+
 '<span>Location: '+esc(r.location||'Unspecified')+'</span>'+
 '<span>Department: '+esc(r.department||'Unassigned')+'</span>'+
 '<span>Arrival: '+esc(r.classification||'Unknown')+'</span></div></details>';
const recordRow=r=>{
 const terms=[r.name,r.department,r.location,r.status,r.classification,
  manilaDay(r.clockIn)].join(' ').toLocaleLowerCase();
 return '<tr class="tt-report-filterable" data-report-search="'+esc(terms)+'">'+
  '<td><strong>'+esc(r.name||'Signed member')+'</strong></td>'+
  '<td>'+esc(fmtTime(r.clockIn))+'</td><td>'+esc(fmtTime(r.clockOut))+'</td>'+
  '<td>'+esc(r.location||'Unspecified')+'</td>'+
  '<td>'+esc(r.department||'Unassigned')+'</td>'+
  '<td>'+esc(r.classification||'Unknown')+'</td>'+
  '<td>'+esc(r.status||'Unknown')+'</td>'+
  '<td>'+esc(Number.isFinite(r.creditedMs)?fmtHours(r.creditedMs)+' h':'—')+'</td>'+
  '<td>'+details(r)+'</td></tr>';
};
const option=(value,label,selected)=>'<option value="'+value+'"'+
 (value===selected?' selected':'')+'>'+label+'</option>';

export function renderTimeTrackerReports({
 rows=[],scope='OWN_ATTENDANCE_ONLY',period='all',filters={},now=new Date(),busy=false
}={}){
 const settings={...TT_REPORT_DEFAULT_FILTERS,...filters};
 const filtered=filterTimeTrackerReportRows(rows,{period,filters:{...settings,search:''},now});
 const visible=filterTimeTrackerReportRows(rows,{period,filters:settings,now});
 const summary=summarizeTimeTrackerReports(filtered);
 const dates=filtered.map(r=>manilaDay(r.clockIn)).sort();
 const current=manilaDay(now);
 const range=period==='all'?'All available authorized dates':period==='custom'?
  (settings.start&&settings.end?settings.start+' → '+settings.end:'Select both dates'):
  phtDayBoundary(new Date(now),period)+' → '+current;
 const team=scope==='AUTHORIZED_WORKSPACE_TEAM';
 const metrics=[
  ['Records',String(summary.records)],['Employees',String(summary.employees)],
  ['Avg Hours',summary.averageMs===null?'—':fmtHours(summary.averageMs)+' h'],
  ['Late',String(summary.late)],['On-time Rate',summary.onTimeRate===null?'—':summary.onTimeRate+'%']
 ];
 const periods=[['all','All dates'],['today','Today'],
  ['week','This Week'],['month','This Month'],['custom','Custom']];
 return '<section class="tt-reports" aria-label="Authorized attendance Reports">'+
  '<div class="tt-reports-heading"><div><h3>Reports</h3><p>Attendance trends &amp; analytics · '+
   (team?'Authorized workspace team':'Your own signed attendance')+'</p></div>'+
  '<div class="tt-reports-actions">'+
   '<button type="button" class="secondary" data-action="tt-refresh"'+(busy?' disabled':'')+
   '>Refresh</button><button type="button" class="secondary" data-action="tt-export"'+
   (busy||!visible.length?' disabled':'')+'>Export report CSV</button></div></div>'+
  '<section class="tt-reports-range"><label for="tt-report-period">DATE RANGE</label>'+
   '<div class="tt-report-presets">'+
   periods.map(([key,label])=>'<button type="button" data-action="tt-report-preset"'+
    ' data-period="'+key+'" aria-pressed="'+(period===key)+'"'+
    (period===key?' class="is-active"':'')+'>'+label+'</button>').join('')+'</div>'+
   '<select id="tt-report-period" aria-label="Report period">'+
   periods.map(([key,label])=>option(key,label,period)).join('')+'</select>'+
   (period==='custom'?'<div class="tt-reports-custom">'+
     '<label for="tt-report-start">From</label><input type="date" id="tt-report-start" value="'+
     esc(settings.start)+'" max="'+esc(current)+'">'+
     '<label for="tt-report-end">Through</label><input type="date" id="tt-report-end" value="'+
     esc(settings.end)+'" max="'+esc(current)+'"></div>':'')+
   '<p>'+esc(range)+' · '+summary.records+' authorized record'+
    (summary.records===1?'':'s')+'</p></section>'+
  '<div class="tt-report-kpis">'+metrics.map(([label,value])=>stat(label,value)).join('')+'</div>'+
  '<div class="tt-reports-section-title">ANALYTICS <span>'+esc(range)+'</span></div>'+
  '<div class="tt-report-analytics">'+
   '<section class="tt-report-panel"><h4>Arrival Patterns</h4>'+
    '<p>On-time versus late arrivals · most recent 14 attendance dates</p>'+
    svgColumns(summary.patterns,true)+'</section>'+
   '<section class="tt-report-panel"><h4>Department Utilization</h4>'+
    '<p>Authorized session count by department</p>'+
    departmentItems(summary.departments,'count')+'</section>'+
   '<section class="tt-report-panel"><h4>Arrival Distribution</h4>'+
    '<p>Clock-ins by Philippine Time hour</p>'+
    svgColumns(summary.arrivals)+'</section>'+
   '<section class="tt-report-panel"><h4>Avg Hours by Department</h4>'+
    '<p>Completed sessions only · unpaid break excluded</p>'+
    departmentItems(summary.departments,'hours')+'</section></div>'+
  '<div class="tt-reports-section-title">RECORDS <span>'+summary.records+
   ' authorized sessions in period</span></div>'+
  '<section class="tt-report-panel tt-report-records">'+
   '<div class="tt-reports-record-head"><h4>Attendance Records</h4>'+
    '<label for="tt-report-search">Search records</label>'+
    '<input type="search" id="tt-report-search" maxlength="120" autocomplete="off"'+
    ' placeholder="Search employee, department, location…" value="'+
    esc(settings.search)+'"></div>'+
   '<div class="tt-report-record-chips">'+
    [['all','All'],['Late','Late'],['Active','Active'],['Completed','Completed']].
    map(([key,label])=>'<button type="button" data-action="tt-report-status"'+
      ' data-status="'+key+'" aria-pressed="'+(settings.status===key)+'"'+
      (settings.status===key?' class="is-active"':'')+'>'+label+'</button>').join('')+
   '</div>'+
   '<p class="tt-report-match"><span id="tt-report-visible-count">'+visible.length+
    '</span> session(s) matching search</p>'+
   '<div class="tt-reports-table-scroll"><table class="board-table tt-report-table">'+
    '<thead><tr><th>Employee</th><th>Clock In</th><th>Clock Out</th>'+
    '<th>Location</th><th>Department</th><th>Arrival</th><th>Status</th>'+
    '<th>Hours</th><th>Details</th></tr></thead>'+
    '<tbody>'+filtered.map(recordRow).join('')+'</tbody></table></div>'+
   '<p id="tt-report-empty-search" class="tt-report-empty"'+
    (visible.length?' hidden':'')+'>No authorized sessions match this selection.</p>'+
   '<p class="tt-report-footnote">Charts and headline metrics use selected date/status filters. '+
    'Search additionally narrows visible rows and CSV. '+
    'Only existing centrally authorized attendance data is shown; exact GPS and private audit metadata are not exposed.</p>'+
  '</section><div class="tt-reports-section-title">TIME CORRECTIONS</div>'+
  '<section class="tt-report-panel"><p class="tt-report-footnote">'+
   'Manual time corrections and overtime calculations require separate verified server authorization and audit workflows. No changes can be submitted here.</p></section>'+
  '</section>';
}
/** Search only sanitized records already rendered for the permitted date/status scope. */
export function applyTimeTrackerReportSearch(root,query=''){
 const section=root?.querySelector?.('.tt-reports');
 if(!section)return false;
 const normalized=String(query||'').toLocaleLowerCase().trim().slice(0,120);
 let count=0;
 for(const row of section.querySelectorAll('.tt-report-filterable')){
  row.hidden=Boolean(normalized&&!String(row.dataset.reportSearch||'').includes(normalized));
  if(!row.hidden)count++;
 }
 const label=section.querySelector('#tt-report-visible-count');
 if(label)label.textContent=String(count);
 const empty=section.querySelector('#tt-report-empty-search');
 if(empty)empty.hidden=count!==0;
 const exportButton=section.querySelector('[data-action="tt-export"]');
 if(exportButton)exportButton.disabled=count===0;
 return true;
}
