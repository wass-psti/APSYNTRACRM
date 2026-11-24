import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTimeTrackerClock,formatTimeTrackerDateTime,formatTimeTrackerShortDateTime,
  formatTimeTrackerWallClock,parseTimeTrackerClockInput,
  formatTimeTrackerAdminWallDateTime,parseTimeTrackerAdminWallDateTime
} from '../time-tracker-time-format.js';
import {renderTimeTrackerOvertime} from '../time-tracker-overtime.js';
import {renderTimeTrackerAdminEditor,parseTimeTrackerAdminDateTime} from '../time-tracker-record-management.js';
import {ownAttendanceCsv} from '../time-tracker-ui.js';
import {timeTrackerOverviewCsv} from '../time-tracker-overview.js';
import {timeTrackerLogCsv} from '../time-tracker-log.js';

test('Philippine times display hh:mm AM/PM at midnight, noon and evening',()=>{
 assert.equal(formatTimeTrackerClock('2026-11-20T16:00:00Z'),'12:00 AM');
 assert.equal(formatTimeTrackerClock('2026-11-20T04:00:00Z'),'12:00 PM');
 assert.equal(formatTimeTrackerClock('2026-11-20T10:05:07Z',{seconds:true}),'06:05:07 PM');
 assert.equal(formatTimeTrackerDateTime('2026-11-20T10:05:00Z'),'Nov 20, 2026, 06:05 PM');
 assert.equal(formatTimeTrackerShortDateTime('2026-11-20T10:05:00Z'),'Nov 20, 06:05 PM');
 assert.equal(formatTimeTrackerClock('invalid'),'—');
});
test('overtime request uses native time controls and retains HH:mm payload values',()=>{
 for(const [raw,shown] of [['00:00','12:00 AM'],['12:00','12:00 PM'],['18:05','06:05 PM']]){
  assert.equal(formatTimeTrackerWallClock(raw),shown);
  assert.equal(parseTimeTrackerClockInput(shown),raw);
 }
 assert.throws(()=>parseTimeTrackerClockInput('25:12'));
 assert.throws(()=>parseTimeTrackerClockInput('13:00 PM'));
 const html=renderTimeTrackerOvertime({modalOpen:true,now:new Date('2026-11-20T04:00:00Z'),
  requests:[{id:'ot',name:'Employee',date:'2026-11-20',status:'Submitted',start:'18:00',end:'20:00',durationMinutes:120,task:'Job'}]});
 assert.match(html,/Start:<\/b> 06:00 PM/);
 assert.match(html,/tt-ot-start" name="start" type="time"/);
 assert.match(html,/value="18:00"/);
 assert.match(html,/tt-ot-end" name="end" type="time"/);
 assert.match(html,/value="20:00"/);
});
test('admin date-time display is 12-hour and converts to same server instant',()=>{
 const value='2026-11-20T18:05';
 const shown=formatTimeTrackerAdminWallDateTime(value);
 assert.equal(shown,'2026-11-20 06:05 PM');
 assert.equal(parseTimeTrackerAdminWallDateTime(shown),value);
 assert.equal(parseTimeTrackerAdminDateTime(shown),'2026-11-20T10:05:00.000Z');
 assert.equal(parseTimeTrackerAdminDateTime(value),'2026-11-20T10:05:00.000Z');
 const html=renderTimeTrackerAdminEditor({editor:{mode:'single',records:[{
  id:'id',ownerId:'cloud:user',ownerName:'Employee',
  clockIn:{timestamp:'2026-11-20T10:05:00.000Z'},clockOut:null
 }]},timeOnly:true});
 assert.match(html,/value="2026-11-20 06:05 PM"/);
 assert.doesNotMatch(html,/datetime-local/);
});
test('all attendance CSV exports present AM/PM rather than raw ISO clock stamps',()=>{
 const row={name:'Employee',department:'Engineering',location:'Office-Base Duty',
  clockIn:'2026-11-20T10:05:00.000Z',clockOut:'2026-11-20T12:05:00.000Z',
  status:'Completed',classification:'On time',creditedMs:7200000};
 for(const csv of [ownAttendanceCsv([row]),timeTrackerOverviewCsv([row]),
   timeTrackerLogCsv([row])]){
  assert.match(csv,/06:05 PM/);
  assert.match(csv,/08:05 PM/);
  assert.doesNotMatch(csv,/2026-11-20T10:05:00/);
 }
});
