import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectOwnAttendance} from '../time-tracker-native.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {
 timeTrackerMyHoursWeek,timeTrackerMyHoursData,renderTimeTrackerMyHours,
 TT_MY_HOURS_WEEK_TARGET
} from '../time-tracker-my-hours.js';

const user='10000000-0000-4000-8000-000000000011';
const colleague='10000000-0000-4000-8000-000000000012';
const access={userId:user,name:'My Signed User',moduleRole:'Employee'};
const now=new Date('2026-11-02T08:00:00Z'); // November 2, 4:00 PM PHT
const one=(id,owner,clockIn,clockOut=null)=>({
 id,ownerId:'cloud:'+owner,
 clockIn:{timestamp:clockIn,location:'Office-Base Duty',department:'Engineering',
  geo:{latitude:6.993,longitude:125.481}},
 clockOut:clockOut?{timestamp:clockOut}:null,
 audit:{privateDevice:'sensitive'}
});
const source={version:1,records:[
 one('november-first',user,'2026-10-31T16:30:00Z','2026-11-01T03:30:00Z'),
 one('november-second',user,'2026-11-02T00:00:00Z','2026-11-02T05:00:00Z'),
 one('active-today',user,'2026-11-02T06:30:00Z'),
 one('last-week',user,'2026-10-30T00:00:00Z','2026-10-30T09:00:00Z'),
 one('coworker',colleague,'2026-11-02T01:00:00Z','2026-11-02T10:00:00Z')
]};
const personal=projectOwnAttendance(source,user);
test('PHT Sunday–Saturday weeks preserve old and today sessions',()=>{
 const thisWeek=timeTrackerMyHoursWeek(0,now);
 assert.equal(thisWeek.start,'2026-11-01');
 assert.equal(thisWeek.end,'2026-11-07');
 assert.equal(timeTrackerMyHoursWeek(-1,now).start,'2026-10-25');
 assert.equal(timeTrackerMyHoursWeek(1,now).start,'2026-11-08');
 assert.throws(()=>timeTrackerMyHoursWeek(105,now),/offset/);
 assert.equal(personal.length,4);
 const current=timeTrackerMyHoursData({records:personal,userId:user,at:now});
 assert.equal(current.sessions,3);
 assert.equal(current.weekRows.length,3);
 assert.equal(current.days[0].records.length,1); // Oct 31 UTC → Nov 1 PHT
 assert.equal(current.days[1].records.length,2);
 const past=timeTrackerMyHoursData({records:personal,userId:user,weekOffset:-1,month:'2026-10',at:now});
 assert.equal(past.sessions,1);
 assert.equal(past.days[29].records.length,1);
});
test('weekly and monthly totals only credit completed sessions',()=>{
 const data=timeTrackerMyHoursData({records:personal,userId:user,at:now});
 // 11 hours elapsed on Nov 1 minus noon break when applicable; 5h on Nov 2.
 const expected=personal.filter(x=>['november-first','november-second'].includes(x.id))
  .reduce((sum,x)=>sum+x.creditedMs,0);
 assert.equal(data.weekCreditedMs,expected);
 assert.equal(data.monthCreditedMs,expected);
 assert.equal(data.sessions,3);
 assert.equal(data.late,1); // November 2, 2:30 PM PHT active session is late
 assert.equal(TT_MY_HOURS_WEEK_TARGET,45);
});
test('calendar cells distinguish late, partial, complete, active and no record',()=>{
 const rows=[
  {id:'full',clockIn:'2026-11-01T00:00:00Z',clockOut:'2026-11-01T10:00:00Z',
   creditedMs:9*3600000,status:'Completed',classification:'On time'},
  {id:'part',clockIn:'2026-11-02T00:00:00Z',clockOut:'2026-11-02T05:00:00Z',
   creditedMs:4*3600000,status:'Completed',classification:'On time'},
  {id:'late',clockIn:'2026-11-03T01:00:00Z',clockOut:'2026-11-03T06:00:00Z',
   creditedMs:4*3600000,status:'Completed',classification:'Late'},
  {id:'active',clockIn:'2026-11-04T00:00:00Z',clockOut:null,
   creditedMs:null,status:'Active',classification:'On time'}
 ];
 const result=timeTrackerMyHoursData({records:rows,userId:user,
  at:new Date('2026-11-05T08:00:00Z'),month:'2026-11'});
 assert.deepEqual(result.days.slice(0,5).map(x=>x.status),
 ['full','partial','late','active','unverified']);
});
test('rendered My Hours never substitutes team-wide Log or exposes raw GPS',()=>{
 const result={
  status:'VERIFIED_READ',access,records:personal,
  log:{scope:'AUTHORIZED_WORKSPACE_TEAM',rows:[
   {id:'bad',name:'Coworker Private',ownerId:'cloud:'+colleague,
    clockIn:'2026-11-02T00:00:00Z'}]}
 };
 const html=renderTimeTrackerNative({result,view:'hours',now, hoursMonth:'2026-11'});
 for(const title of ['My Hours','MY HOURS','THIS WEEK&#39;S ATTENDANCE',
  'WEEKLY PROGRESS','MONTHLY OVERVIEW','Request Correction'])
  assert.ok(html.includes(title),title);
 assert.doesNotMatch(html,/Coworker Private|latitude|longitude|125\.481|sensitive/);
 assert.match(html,/data-action="tt-hours-month-prev"/);
 assert.match(html,/data-action="tt-hours-week-next"/);
 assert.match(html,/Request Correction<\/button>/);
 assert.match(html,/button type="button" disabled title="Correction submission/);
 assert.match(html,/tt-hours-month-grid/);
 assert.doesNotMatch(html,/\bstyle\s*=\s*["']/);
});
test('My Hours defensively filters any explicitly foreign owner and escapes metadata',()=>{
 const rows=[{id:'self',ownerId:'cloud:'+user,clockIn:'2026-11-02T00:00:00Z',
  status:'Completed',classification:'On time',creditedMs:3600000,
  location:'<img src=x onerror=alert(1)>'},
 {id:'foreign',ownerId:'cloud:'+colleague,clockIn:'2026-11-02T00:00:00Z',
  status:'Completed',classification:'On time',creditedMs:3600000,
  location:'Private colleague location'}];
 const html=renderTimeTrackerMyHours({
  records:rows,access:{...access,name:'<script>malicious</script>'},
  now,month:'2026-11',selectedDay:'2026-11-02'
 });
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<script>|<img src=x|Private colleague location/);
 assert.equal(timeTrackerMyHoursData({records:rows,userId:user,at:now}).sessions,1);
});
test('My Hours state/actions are wired and old write gates preserved',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/time-tracker-ui.js','utf8');
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(ui,/records:result\.records,access:result\.access/);
 assert.match(ui,/\['hours','My Hours',true\]/);
 for(const label of ['tt-hours-week-prev','tt-hours-week-next',
  'tt-hours-week-current','tt-hours-month-prev','tt-hours-month-next',
  'tt-hours-month-current','tt-hours-day'])assert.ok(app.includes(label),label);
 assert.match(app,/ttHoursWeekOffset:0/);
 assert.match(app,/ttHoursSelectedDay/);
 assert.match(css,/CP-TT-MY-HOURS-01/);
 assert.match(readFileSync('frontend/time-tracker-native.js','utf8'),
  /TT_LIVE_ATTENDANCE_WRITES_ACCEPTED=false/);
 assert.match(readFileSync('frontend/time-tracker-overtime.js','utf8'),
  /TT_OT_WRITES_ACCEPTED=false/);
});
