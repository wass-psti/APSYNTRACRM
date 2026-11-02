/** TimeTracker My Hours — read-only signed self-only history.
 * Input must be TimeTrackerNativeClient.snapshot().records (projectOwnAttendance),
 * NEVER module-wide result.log.rows or the team's Overview.
 */
import {manilaDay} from './time-tracker-overview.js';
import {timeTrackerCalendarMonth,shiftTimeTrackerCalendarMonth} from './time-tracker-calendar.js';

export const TT_MY_HOURS_WEEK_TARGET=45; // TT_POLICY.requiredWorkMs=9h × five working days
const MS_DAY=86400000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const validTime=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const dateMs=d=>Date.parse(d+'T00:00:00.000Z');
const dayOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 Number.isFinite(dateMs(d))&&iso(dateMs(d))===d;
const phtDay=t=>manilaDay(t);
const shortDate=d=>new Intl.DateTimeFormat('en-US',{
 timeZone:'UTC',month:'short',day:'numeric'
}).format(new Date(dateMs(d)));
const longDate=d=>new Intl.DateTimeFormat('en-US',{
 timeZone:'UTC',weekday:'short',month:'short',day:'numeric'
}).format(new Date(dateMs(d)));
const timePHT=v=>validTime(v)?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'
}).format(new Date(v)):'—';
const hours=ms=>(ms/3600000).toFixed(1);
const safeRows=(records,at,userId)=>{
 if(!Array.isArray(records)||records.length>25000)throw Error('Invalid self attendance source');
 const now=+new Date(at);
 if(!Number.isFinite(now))throw Error('Invalid My Hours date');
 return records.filter(r=>r&&typeof r==='object'&&validTime(r.clockIn)&&
   Date.parse(r.clockIn)<=now&&
   (!r.ownerId||r.ownerId==='cloud:'+userId)&&
   (r.status==='Active'||r.status==='Completed'||r.status==='Unknown')&&
   (!r.clockOut||validTime(r.clockOut)))
  .map(r=>Object.freeze({
   id:String(r.id||'').slice(0,150),
   clockIn:r.clockIn,clockOut:r.clockOut||null,
   location:String(r.location||'Unspecified').slice(0,100),
   department:String(r.department||'Unassigned').slice(0,100),
   classification:['Late','On time','Administrative closure'].includes(r.classification)?
    r.classification:'Unknown',status:r.status,
   creditedMs:r.status==='Completed'&&Number.isFinite(r.creditedMs)&&r.creditedMs>=0?
    r.creditedMs:null
  })).sort((a,b)=>Date.parse(b.clockIn)-Date.parse(a.clockIn));
};
const sumHours=rows=>rows.reduce((n,r)=>n+(r.creditedMs||0),0);
export function timeTrackerMyHoursWeek(weekOffset=0,at=new Date()){
 if(!Number.isInteger(weekOffset)||Math.abs(weekOffset)>104)
  throw Error('Invalid My Hours week offset');
 const today=phtDay(at);
 const sunday=dateMs(today)-new Date(dateMs(today)).getUTCDay()*MS_DAY+
  weekOffset*7*MS_DAY;
 const start=iso(sunday),end=iso(sunday+6*MS_DAY);
 return Object.freeze({start,end,days:Object.freeze(
  Array.from({length:7},(_,i)=>iso(sunday+i*MS_DAY))),
  label:shortDate(start)+' – '+shortDate(end),offset:weekOffset});
}
const statusOf=records=>{
 if(records.some(r=>r.classification==='Late'))return 'late';
 const complete=sumHours(records);
 if(complete>=9*3600000)return 'full';
 if(complete>0)return 'partial';
 if(records.some(r=>r.status==='Active'))return 'active';
 return 'unverified';
};
export function timeTrackerMyHoursData({
 records=[],userId='',weekOffset=0,month='',at=new Date()
}={}){
 const now=new Date(at),today=phtDay(now);
 const all=safeRows(records,now,userId);
 const week=timeTrackerMyHoursWeek(weekOffset,now);
 const actualMonth=month||timeTrackerCalendarMonth(now);
 // Reuse strict Calendar month validation without fabricating out-of-range months.
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(actualMonth)||
    shiftTimeTrackerCalendarMonth(actualMonth,0)!==actualMonth)
  throw Error('Invalid My Hours calendar month');
 const weekRows=all.filter(r=>{
  const d=phtDay(r.clockIn);return d>=week.start&&d<=week.end;
 });
 const monthRows=all.filter(r=>phtDay(r.clockIn).startsWith(actualMonth));
 const year=Number(actualMonth.slice(0,4)),m=Number(actualMonth.slice(5));
 const totalDays=new Date(Date.UTC(year,m,0)).getUTCDate();
 const byDay=Array.from({length:totalDays},(_,i)=>{
  const day=actualMonth+'-'+String(i+1).padStart(2,'0');
  const rows=monthRows.filter(r=>phtDay(r.clockIn)===day);
  return Object.freeze({day,dayNumber:i+1,records:Object.freeze(rows),
   creditedMs:sumHours(rows),status:statusOf(rows)});
 });
 return Object.freeze({
  week,month:actualMonth,today,
  weekRows:Object.freeze(weekRows),
  monthlyRows:Object.freeze(monthRows),
  weekCreditedMs:sumHours(weekRows),monthCreditedMs:sumHours(monthRows),
  sessions:weekRows.length,
  late:weekRows.filter(r=>r.classification==='Late').length,
  days:Object.freeze(byDay)
 });
}
const section=(label,detail='')=>
 '<div class="tt-hours-section"><strong>'+esc(label)+'</strong>'+
 '<span>'+esc(detail)+'</span></div>';
const sessionLine=r=>
 '<div class="tt-hours-session"><div><strong>'+esc(longDate(phtDay(r.clockIn)))+
 '</strong><small>'+esc(r.location)+' · '+esc(r.department)+'</small></div>'+
 '<div><span>'+esc(timePHT(r.clockIn))+' – '+esc(timePHT(r.clockOut))+
 '</span><small>'+esc(r.classification)+' · '+esc(r.status)+'</small></div>'+
 '<b>'+esc(r.creditedMs===null?'Pending':hours(r.creditedMs)+'h')+'</b></div>';
function monthGrid(data,selectedDay){
 const firstDay=new Date(dateMs(data.month+'-01')).getUTCDay();
 const n=Math.ceil((firstDay+data.days.length)/7)*7;
 let cells='';
 for(let i=0;i<n;i++){
  const index=i-firstDay;
  if(index<0||index>=data.days.length){
   cells+='<div class="tt-hours-day tt-hours-outside" aria-hidden="true"></div>';
   continue;
  }
  const entry=data.days[index],today=entry.day===data.today;
  const selected=selectedDay===entry.day;
  cells+='<button class="tt-hours-day tt-hours-'+entry.status+
   (today?' tt-hours-today':'')+(selected?' tt-hours-selected':'')+
   '" type="button" data-action="tt-hours-day" data-day="'+entry.day+
   '" aria-pressed="'+selected+'" aria-label="'+esc(longDate(entry.day))+': '+
   entry.records.length+' signed attendance session(s), '+entry.status+'">'+
   entry.dayNumber+(entry.records.length?'<small>'+entry.records.length+'</small>':'')+
   '</button>';
 }
 return '<div class="tt-hours-month-grid">'+
  '<div class="tt-hours-weekdays">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
   .map(day=>'<span>'+day+'</span>').join('')+'</div>'+
  '<div class="tt-hours-days">'+cells+'</div></div>';
}
export function renderTimeTrackerMyHours({
 records=[],access={},weekOffset=0,month='',selectedDay='',now=new Date(),busy=false
}={}){
 if(typeof access?.userId!=='string'||!access.userId)
  return '<section class="tt-my-hours"><p>Signed employee identity is required.</p></section>';
 const model=timeTrackerMyHoursData({records,userId:access.userId,weekOffset,month,at:now});
 const displayMonth=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'})
  .format(new Date(dateMs(model.month+'-01')));
 const h=new Date(+new Date(now)+8*3600000).getUTCHours();
 const greeting=h<12?'Good morning,':h<17?'Good afternoon,':'Good evening,';
 const selected=model.days.find(d=>d.day===selectedDay);
 const progress=Math.min(45,model.weekCreditedMs/3600000);
 return '<section class="tt-my-hours" aria-label="My signed attendance hours">'+
  '<header class="tt-hours-header"><div><h3>'+greeting+'</h3>'+
   '<h4>'+esc(access.name||'Signed employee')+'</h4>'+
   '<p>'+esc(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
    weekday:'long',month:'long',day:'numeric'}).format(new Date(now)))+
   '</p></div><div class="tt-hours-actions">'+
   '<button type="button" data-action="tt-refresh"'+(busy?' disabled':'')+
   '>Refresh</button><button type="button" disabled title="Correction submission requires an approved signed backend workflow">✎ Request Correction</button></div></header>'+
  '<div class="tt-hours-week-nav"><span>MY HOURS</span><div>'+
   '<button type="button" data-action="tt-hours-week-prev" aria-label="Previous week">‹</button>'+
   '<strong>'+esc(model.week.label)+'</strong>'+
   '<button type="button" data-action="tt-hours-week-next" aria-label="Next week">›</button>'+
   '<button type="button" data-action="tt-hours-week-current">This Week</button></div></div>'+
  '<div class="tt-hours-kpis">'+
   [['WEEK HOURS',hours(model.weekCreditedMs)+'h'],['MONTH HOURS',hours(model.monthCreditedMs)+'h'],
    ['SESSIONS',model.sessions],['LATE',model.late]].map(([label,value])=>
    '<div><strong>'+esc(value)+'</strong><span>'+label+'</span></div>').join('')+
  '</div>'+
  section("THIS WEEK'S ATTENDANCE",model.week.label)+
  '<section class="tt-hours-panel tt-hours-week-records">'+
   (model.weekRows.length?model.weekRows.map(sessionLine).join(''):
    '<div class="tt-hours-empty"><strong>No attendance records this week</strong>'+
    '<p>Signed sessions will appear after they are recorded.</p></div>')+
  '</section>'+
  section('WEEKLY PROGRESS','Completed credited hours')+
  '<section class="tt-hours-panel tt-hours-progress">'+
   '<div class="tt-hours-progress-kpis">'+
    [['WEEK TOTAL',hours(model.weekCreditedMs)],
     ['SESSIONS',model.sessions],['MONTH TOTAL',hours(model.monthCreditedMs)]]
    .map(([label,value])=>'<div><strong>'+esc(value)+'</strong><span>'+label+'</span></div>').join('')+
   '</div><div class="tt-hours-progress-foot"><progress max="45" value="'+
    progress.toFixed(4)+'" aria-label="Credited weekly hours toward 45-hour target"></progress>'+
    '<div><span>'+Math.round(progress/45*100)+'% of 45h weekly target</span>'+
    '<span>'+hours(Math.max(0,45*3600000-model.weekCreditedMs))+'h remaining</span></div></div>'+
  '</section>'+
  section('MONTHLY OVERVIEW',displayMonth)+
  '<section class="tt-hours-panel tt-hours-calendar"><div class="tt-hours-month-nav">'+
   '<button type="button" data-action="tt-hours-month-prev" aria-label="Previous month">‹</button>'+
   '<strong>'+esc(displayMonth)+'</strong>'+
   '<button type="button" data-action="tt-hours-month-next" aria-label="Next month">›</button>'+
   '<button type="button" data-action="tt-hours-month-current">This Month</button></div>'+
   monthGrid(model,selectedDay)+
   '<div class="tt-hours-legend">'+
    '<span><i class="tt-hours-key-full"></i> Full day (9h+)</span>'+
    '<span><i class="tt-hours-key-partial"></i> Partial</span>'+
    '<span><i class="tt-hours-key-late"></i> Late</span>'+
    '<span><i class="tt-hours-key-active"></i> Active / pending</span>'+
    '<span><i class="tt-hours-key-none"></i> No verified hours</span></div>'+
  '</section>'+
  (selected?'<section class="tt-hours-panel tt-hours-selected-records">'+
   '<h5>'+esc(longDate(selected.day))+' · '+selected.records.length+' session(s)</h5>'+
   (selected.records.length?selected.records.map(sessionLine).join(''):
    '<p>No signed attendance sessions recorded for this day.</p>')+'</section>':'')+
  '<p class="tt-hours-footnote">My Hours uses only the currently signed employee’s authorized history. Credited totals exclude active or unverified sessions. A 45h target is calculated from the existing 9h × 5-day TimeTracker standard; it is not a payroll determination. Correction requests remain disabled pending a secure audit workflow.</p>'+
 '</section>';
}
