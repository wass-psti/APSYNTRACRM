import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectTimeTrackerLog} from '../time-tracker-history.js';
import {
 timeTrackerCalendarMonth,shiftTimeTrackerCalendarMonth,timeTrackerCalendarHolidays,
 timeTrackerCalendarData,renderTimeTrackerCalendar
} from '../time-tracker-calendar.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const hr='10000000-0000-4000-8000-000000000001';
const one='10000000-0000-4000-8000-000000000002';
const two='10000000-0000-4000-8000-000000000003';
const hidden='10000000-0000-4000-8000-000000000004';
const now=new Date('2026-11-02T08:00:00.000Z'); // Nov 2, 16:00 PHT
const directory=[
 {id:hr,status:'active',display_name:'HR Manager'},
 {id:one,status:'active',display_name:'Employee One'},
 {id:two,status:'active',display_name:'Employee Two'},
 {id:hidden,status:'inactive',display_name:'Inactive Member'}
];
const record=(id,owner,clockIn,clockOut=null)=>({
 id,ownerId:'cloud:'+owner,
 clockIn:{timestamp:clockIn,location:'Office-Base Duty',department:'Engineering',
  geo:{latitude:6.9911,longitude:125.4811}},
 clockOut:clockOut?{timestamp:clockOut}:null,
 audit:{device:'private fingerprint'}
});
const state={version:1,records:[
 record('today-one',one,'2026-11-02T01:15:00Z'),
 record('today-two',two,'2026-11-02T00:15:00Z','2026-11-02T07:30:00Z'),
 record('november-first',one,'2026-10-31T23:45:00Z'),
 record('october',hr,'2026-10-20T00:00:00Z','2026-10-20T10:00:00Z'),
 record('inactive',hidden,'2026-11-02T00:00:00Z'),
 record('future',one,'2026-11-03T02:00:00Z')
]};
const history=(role='HR',userId=hr)=>projectTimeTrackerLog({
 value:state,directory,moduleRole:role,userId
});

test('calendar shows authorized current and historical Philippine dates',()=>{
 const authorized=history();
 assert.equal(authorized.rows.length,5); // future retained in signed history
 const november=timeTrackerCalendarData(authorized.rows,'2026-11',now);
 assert.equal(november.sessions,3);
 assert.equal(november.activeDays,2);
 assert.equal(november.peak,2);
 assert.equal(november.coverage,100); // two of two elapsed days
 assert.equal(november.entries[0].count,1); // Oct 31 UTC is Nov 1 PHT
 assert.equal(november.entries[1].count,2);
 assert.equal(november.entries[1].people,2);
 assert.equal(november.rows.some(r=>r.id==='future'),false);
 const october=timeTrackerCalendarData(authorized.rows,'2026-10',now);
 assert.equal(october.sessions,1);
 assert.equal(october.entries[19].count,1);
 assert.equal(november.byWeekday[0].count,1);
 assert.equal(november.byWeekday[1].count,2);
});

test('Calendar does not expose coworkers to nonmanagement roles',()=>{
 for(const role of ['Employee','OJT','Finance','Supervisor']){
  const signed=history(role,one);
  assert.equal(signed.scope,'OWN_ATTENDANCE_ONLY');
  const html=renderTimeTrackerCalendar({
   records:signed.rows,scope:signed.scope,month:'2026-11',
   selectedDay:'2026-11-02',now
  });
  assert.match(html,/Employee One/);
  assert.doesNotMatch(html,/Employee Two|HR Manager|Inactive Member/);
 }
});

test('month navigation is stable across years and validates boundaries',()=>{
 assert.equal(timeTrackerCalendarMonth(now),'2026-11');
 assert.equal(shiftTimeTrackerCalendarMonth('2026-11',-1),'2026-10');
 assert.equal(shiftTimeTrackerCalendarMonth('2026-12',1),'2027-01');
 assert.equal(shiftTimeTrackerCalendarMonth('2000-01',-1),'2000-01');
 assert.equal(shiftTimeTrackerCalendarMonth('2100-12',1),'2100-12');
 assert.throws(()=>shiftTimeTrackerCalendarMonth('bad',1),/month shift/);
 assert.throws(()=>timeTrackerCalendarData([],'2026-13',now),/calendar context/);
});

test('2026 November verified holidays do not become invented time records',()=>{
 const holidays=timeTrackerCalendarHolidays('2026-11');
 assert.deepEqual(holidays.map(h=>[h.day,h.type]),[
  ['2026-11-01','special'],['2026-11-02','special'],
  ['2026-11-30','regular']
 ]);
 assert.equal(timeTrackerCalendarHolidays('2027-11').length,0);
 const html=renderTimeTrackerCalendar({
  records:history().rows,scope:'AUTHORIZED_WORKSPACE_TEAM',
  month:'2026-11',now
 });
 for(const label of ['All Saints','All Souls','Bonifacio Day',
  'Daily Attendance Trend','Avg Attendance by Day of Week',
  'ATTENDANCE CALENDAR','HOLIDAYS THIS MONTH','Clock-ins'])
  assert.ok(html.includes(label),label);
 assert.match(html,/tt-cal-grid/);
 assert.match(html,/UPCOMING NATIONAL HOLIDAY/);
 assert.match(html,/In 28 days/);
 assert.match(html,/data-action="tt-calendar-prev"/);
 assert.match(html,/data-action="tt-calendar-next"/);
 assert.match(html,/data-action="tt-calendar-today"/);
 assert.equal(timeTrackerCalendarData([], '2026-11',now).sessions,0);
});

test('selected date shows only sanitized authorized employees and no raw GPS',()=>{
 const signed=history();
 const html=renderTimeTrackerCalendar({
  records:signed.rows,scope:signed.scope,month:'2026-11',
  selectedDay:'2026-11-02',now
 });
 assert.match(html,/Employee One/);
 assert.match(html,/Employee Two/);
 assert.doesNotMatch(html,/125\.4811|6\.9911|private fingerprint|Inactive Member/);
 assert.doesNotMatch(html,/\bstyle\s*=\s*["']/);
 const userFacing=renderTimeTrackerCalendar({
  records:[{...signed.rows.find(row=>row.id==='today-one'),name:'<img src=x onerror=alert(1)>'}],
  month:'2026-11',selectedDay:'2026-11-02',now
 });
 assert.match(userFacing,/&lt;img/);
 assert.doesNotMatch(userFacing,/<img src=x/);
});

test('native tab and app handlers are wired without enabling Clock writes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const style=readFileSync('frontend/styles.css','utf8');
 assert.match(app,/case 'tt-calendar-prev'/);
 assert.match(app,/case 'tt-calendar-day'/);
 assert.match(app,/state\.ttCalendarSelectedDay/);
 assert.match(app,/state\.ttAttendance\.log\?\.rows|result\.log\?\.rows/);
 assert.match(style,/CP-TT-CALENDAR-01/);
 const html=renderTimeTrackerNative({
  view:'calendar',result:{
   status:'VERIFIED_READ',access:{moduleRole:'HR'},
   records:[],log:history(),otRequests:[]
  },now
 });
 assert.match(html,/data-target="calendar"/);
 assert.doesNotMatch(html,/data-target="calendar" disabled aria-disabled="true"/);
 assert.match(html,/Employee Two|ATTENDANCE CALENDAR/);
 assert.doesNotMatch(html,/value="clock-in"[^>]*disabled/); // Calendar has no clock form
});
