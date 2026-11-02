/** TimeTracker Calendar — authorized historical sessions and verified PH national holidays.
 * The signed Log snapshot supplies all rows. This module does not query a second registry,
 * access raw GPS, change permissions, create attendance, or claim holiday-pay eligibility.
 */
import {manilaDay} from './time-tracker-overview.js';

const PH_2026_HOLIDAYS=Object.freeze([
 ['2026-01-01','New Year’s Day','regular'],
 ['2026-02-17','Chinese New Year','special'],
 ['2026-02-25','EDSA People Power Revolution Anniversary','working'],
 ['2026-04-02','Maundy Thursday','regular'],
 ['2026-04-03','Good Friday','regular'],
 ['2026-04-04','Black Saturday','special'],
 ['2026-04-09','Araw ng Kagitingan','regular'],
 ['2026-05-01','Labor Day','regular'],
 ['2026-06-12','Independence Day','regular'],
 ['2026-08-21','Ninoy Aquino Day','special'],
 ['2026-08-31','National Heroes Day','regular'],
 ['2026-11-01','All Saints’ Day','special'],
 ['2026-11-02','All Souls’ Day','special'],
 ['2026-11-30','Bonifacio Day','regular'],
 ['2026-12-08','Feast of the Immaculate Conception of Mary','special'],
 ['2026-12-24','Christmas Eve','special'],
 ['2026-12-25','Christmas Day','regular'],
 ['2026-12-30','Rizal Day','regular'],
 ['2026-12-31','Last Day of the Year','special']
].map(([day,name,type])=>Object.freeze({day,name,type})));
export const TT_HOLIDAY_SOURCE='https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/7/99678';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const two=value=>String(value).padStart(2,'0');
const validMonth=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
 &&Number(month.slice(0,4))>=2000&&Number(month.slice(0,4))<=2100;
export const timeTrackerCalendarMonth=(now=new Date())=>manilaDay(now).slice(0,7);
export function shiftTimeTrackerCalendarMonth(month,offset){
 if(!validMonth(month)||!Number.isInteger(offset)||Math.abs(offset)>12)
  throw new Error('Invalid calendar month shift');
 const date=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+offset,1));
 const next=date.toISOString().slice(0,7);
 return validMonth(next)?next:month;
}
export function timeTrackerCalendarHolidays(month){
 if(!validMonth(month))return [];
 // National holidays sourced from Presidential Proclamation No. 1006, for 2026 ONLY.
 // Other years and additional proclamations are deliberately not inferred.
 return PH_2026_HOLIDAYS.filter(item=>item.day.startsWith(month));
}
const weekdayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const phtTime=value=>validTime(value)?new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
}).format(new Date(value)):'—';
const safeRecords=(records,now)=>Array.isArray(records)?
 records.filter(row=>row&&validTime(row.clockIn)&&Date.parse(row.clockIn)<=now.getTime())
 :[];
const weekDay=day=>new Date(day+'T00:00:00.000Z').getUTCDay();
const monthDays=month=>{
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 return new Date(Date.UTC(year,m,0)).getUTCDate();
};
export function timeTrackerCalendarData(records=[],month,now=new Date()){
 const date=new Date(now);
 if(!Number.isFinite(date.getTime())||!validMonth(month))throw Error('Invalid calendar context');
 const all=safeRecords(records,date);
 const rows=all.filter(row=>manilaDay(row.clockIn).startsWith(month));
 const days=monthDays(month);
 const entries=Array.from({length:days},(_,i)=>{
  const day=month+'-'+two(i+1);
  const recordsForDay=rows.filter(r=>manilaDay(r.clockIn)===day);
  return Object.freeze({
   day,index:i+1,weekday:weekDay(day),count:recordsForDay.length,
   people:new Set(recordsForDay.map(r=>r.ownerId||r.name||r.id)).size,
   records:Object.freeze(recordsForDay.slice().sort((a,b)=>
    Date.parse(a.clockIn)-Date.parse(b.clockIn)))
  });
 });
 const activeDays=entries.filter(item=>item.count>0);
 const peak=Math.max(0,...entries.map(item=>item.count));
 const eligibleDays=month<timeTrackerCalendarMonth(date)?days:
  month===timeTrackerCalendarMonth(date)?Number(manilaDay(date).slice(8)):0;
 const byWeekday=weekdayLabels.map((name,weekday)=>{
  const count=entries.filter(x=>x.weekday===weekday).reduce((sum,x)=>sum+x.count,0);
  const occurrences=entries.filter(x=>x.weekday===weekday&&x.day<=manilaDay(date)).length;
  return Object.freeze({name,weekday,count,occurrences,
   average:occurrences?count/occurrences:0});
 });
 return Object.freeze({
  month,days,rows:Object.freeze(rows),entries:Object.freeze(entries),
  sessions:rows.length,activeDays:activeDays.length,peak,
  averagePerActiveDay:activeDays.length?rows.length/activeDays.length:0,
  coverage:eligibleDays?Math.round(activeDays.length/eligibleDays*100):null,
  byWeekday:Object.freeze(byWeekday),
  holidays:Object.freeze(timeTrackerCalendarHolidays(month))
 });
}
const heading=(text,meta)=>'<div class="tt-cal-section-title"><strong>'+esc(text)+
 '</strong><span>'+esc(meta)+'</span></div>';
const horizontalBars=(data)=>{
 const max=Math.max(1,...data.map(x=>x.average));
 return '<div class="tt-cal-weekbars">'+data.map(item=>
  '<div class="tt-cal-weekbar"><span>'+item.name+'</span>'+
   '<progress value="'+item.average+'" max="'+max+
   '" aria-label="'+item.name+' average authorized attendance"></progress>'+
   '<strong>'+esc(item.occurrences?item.average.toFixed(1):'—')+'</strong></div>'
 ).join('')+'</div>';
};
const lineChart=data=>{
 const active=data.entries.filter(x=>x.day<=manilaDay(data.now));
 const max=Math.max(1,...active.map(x=>x.count));
 const width=670,base=180,top=18,h=base-top;
 const count=Math.max(1,data.entries.length);
 const bars=data.entries.map((entry,index)=>{
  if(!entry.count)return '';
  const barWidth=Math.max(5,Math.min(16,640/count-5));
  const x=16+index*(640/count);
  const height=Math.max(3,(entry.count/max)*h);
  return '<rect class="tt-cal-trend-bar" x="'+x.toFixed(1)+'" y="'+
   (base-height).toFixed(1)+'" width="'+barWidth.toFixed(1)+
   '" height="'+height.toFixed(1)+'"><title>'+entry.day+': '+
   entry.count+' authorized session(s)</title></rect>';
 }).join('');
 return '<svg class="tt-cal-trend" viewBox="0 0 670 200" role="img" aria-label="Daily authorized attendance trend">'+
  '<line x1="0" x2="'+width+'" y1="'+base+'" y2="'+base+'" class="tt-cal-baseline"/>'+
  bars+'</svg>';
};
const dateText=day=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'UTC',weekday:'short',month:'short',day:'numeric'
}).format(new Date(day+'T00:00:00Z'));
const recordDetails=entry=>'<section class="tt-cal-selected"><h4>Attendance for '+
 esc(dateText(entry.day))+'</h4>'+
 (entry.records.length?'<div class="tt-cal-attendees">'+entry.records.map(row=>
   '<div class="tt-cal-attendee"><div><strong>'+esc(row.name||'Signed member')+
   '</strong><small>'+esc(row.department||'Unassigned')+' · '+
   esc(row.location||'Unspecified')+'</small></div><div><span>'+
   esc(phtTime(row.clockIn))+'</span><small>'+esc(row.status||'Unknown')+
   ' · '+esc(row.classification||'Unknown')+'</small></div></div>'
  ).join('')+'</div>':
  '<p>No authorized attendance records on this date.</p>')+'</section>';
export function renderTimeTrackerCalendar({
 records=[],scope='OWN_ATTENDANCE_ONLY',month='',selectedDay='',now=new Date(),busy=false
}={}){
 const today=manilaDay(now);
 const requested=validMonth(month)?month:today.slice(0,7);
 const data=timeTrackerCalendarData(records,requested,now);
 const year=Number(requested.slice(0,4)),index=Number(requested.slice(5))-1;
 const date=new Date(Date.UTC(year,index,1));
 const monthName=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(date);
 const offset=date.getUTCDay(),cells=Math.ceil((offset+data.days)/7)*7;
 const holidays=new Map(data.holidays.map(h=>[h.day,h]));
 const todayMonth=today.slice(0,7)===requested;
 const selected=data.entries.find(e=>e.day===selectedDay);
 const counts=data.entries.map(e=>e.count);
 const max=Math.max(1,...counts);
 const scopeText=scope==='AUTHORIZED_WORKSPACE_TEAM'?
  'Authorized workspace team':'Your authorized sessions';
 const cards=[
  ['Clock-ins',data.sessions],['Avg / active day',data.averagePerActiveDay.toFixed(1)],
  ['Peak',data.peak],['Day coverage',data.coverage===null?'—':data.coverage+'%']
 ];
 let grid='';
 for(let slot=0;slot<cells;slot++){
  const number=slot-offset+1;
  const entry=number>=1&&number<=data.days?data.entries[number-1]:null;
  if(!entry){grid+='<div class="tt-cal-day tt-cal-outside" aria-hidden="true"></div>';continue;}
  const holiday=holidays.get(entry.day);
  const isToday=today===entry.day;
  const intensity=entry.count>=max&&entry.count>0?'tt-cal-high':
   entry.count>0?'tt-cal-has-records':'';
  grid+='<button class="tt-cal-day '+intensity+
   (holiday?' tt-cal-holiday-'+holiday.type:'')+
   (isToday?' tt-cal-today':'')+
   (selectedDay===entry.day?' tt-cal-selected-day':'')+
   '" type="button" data-action="tt-calendar-day" data-day="'+entry.day+
   '" aria-pressed="'+(selectedDay===entry.day)+'" aria-label="'+
   esc(dateText(entry.day))+': '+entry.count+' authorized sessions'+
   (holiday?', '+holiday.name:'')+'">'+
   '<span class="tt-cal-day-number">'+number+'</span>'+
   (isToday?'<span class="tt-cal-now">TODAY</span>':'')+
   (entry.count?'<strong class="tt-cal-count">'+entry.count+'</strong>'+
    '<small>'+entry.people+' emp</small>':'')+
   (holiday?'<span class="tt-cal-holiday-label">'+esc(holiday.name)+'</span>':'')+
   '</button>';
 }
 return '<section class="tt-calendar" aria-label="TimeTracker monthly attendance calendar">'+
  '<header class="tt-cal-header"><div><h3>Calendar</h3>'+
   '<p>Monthly attendance &amp; Philippine national holidays · '+
   esc(scopeText)+'</p></div>'+
   '<button class="secondary" type="button" data-action="tt-refresh"'+
   (busy?' disabled':'')+'>Refresh</button></header>'+
  '<div class="tt-cal-navigate"><div><small>NAVIGATE</small>'+
   '<div><button type="button" data-action="tt-calendar-prev"'+
   (requested==='2000-01'?' disabled':'')+' aria-label="Previous month">‹</button>'+
   '<strong>'+monthName+' <span>'+year+'</span></strong>'+
   '<button type="button" data-action="tt-calendar-next"'+
   (requested==='2100-12'?' disabled':'')+' aria-label="Next month">›</button>'+
   '<button type="button" data-action="tt-calendar-today">Today</button></div></div>'+
   '<p>'+esc(todayMonth?'Current month':'Viewing '+requested)+
   ' · '+data.sessions+' authorized session(s)</p></div>'+
  '<div class="tt-cal-kpis">'+cards.map(([label,value])=>
   '<div><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>'
  ).join('')+'</div>'+
  '<p class="tt-cal-metric-note">Coverage = days with attendance ÷ elapsed calendar days '+
   '(or all days for past months). Peak = most clock-ins on a date.</p>'+
  heading('ANALYTICS',monthName+' '+year)+
  '<div class="tt-cal-analytics"><section class="tt-cal-panel"><h4>Daily Attendance Trend</h4>'+
   '<p>Recorded clock-ins by date, including earlier sessions</p>'+
   lineChart({...data,now})+'</section>'+
   '<section class="tt-cal-panel"><h4>Avg Attendance by Day of Week</h4>'+
   '<p>Average authorized sessions per elapsed weekday</p>'+
   horizontalBars(data.byWeekday)+'</section></div>'+
  heading('ATTENDANCE CALENDAR',monthName+' '+year)+
  '<section class="tt-cal-panel tt-cal-month">'+
   '<div class="tt-cal-weekdays">'+weekdayLabels.map(name=>
    '<span>'+name+'</span>').join('')+'</div>'+
   '<div class="tt-cal-grid">'+grid+'</div>'+
   '<p class="tt-cal-heatmap-note">Attendance intensity: low – high ('+data.peak+
   ' max sessions). Select a date to view authorized employee sessions.</p></section>'+
  (selected?recordDetails(selected):'')+
  '<div class="tt-cal-legend"><span>● Regular holiday</span>'+
   '<span>● Special non-working</span><span>● Special working</span>'+
   '<span>● Today</span><span>● Weekend</span></div>'+
  heading('HOLIDAYS THIS MONTH',data.holidays.length+
   ' verified national date(s)')+
  '<section class="tt-cal-panel tt-cal-holiday-list">'+
   (data.holidays.length?data.holidays.map(holiday=>
    '<div><span class="tt-cal-holiday-type tt-cal-type-'+holiday.type+'">'+
    (holiday.type==='regular'?'REG':holiday.type==='working'?'WORK':'SPL')+
    '</span><strong>'+esc(holiday.name)+'</strong>'+
    '<time datetime="'+holiday.day+'">'+esc(dateText(holiday.day))+
    '</time></div>').join(''):
    '<p>No verified national holiday entries for this month.</p>')+
   '<p class="tt-cal-source">'+(year===2026?
    '2026 national dates only. Additional or later proclamations may change the list.':
    'National holiday dates for this year have not been verified; no dates are inferred.')+
   ' <a href="'+TT_HOLIDAY_SOURCE+'" target="_blank" rel="noopener noreferrer">'+
   '2026 Proclamation No. 1006</a>. Holidays do not establish payroll entitlements.</p>'+
  '</section></section>';
}
