import test from 'node:test';
import assert from 'node:assert/strict';
import {formatTimeTrackerDurationMs,formatTimeTrackerDurationMinutes,parseTimeTrackerDuration} from '../time-tracker-duration-format.js';
import {timeTrackerSessionElapsed,ownAttendanceCsv} from '../time-tracker-ui.js';
import {timeTrackerLogCsv} from '../time-tracker-log.js';
import {timeTrackerOverviewCsv} from '../time-tracker-overview.js';

test('canonical duration rendering retains seconds, zero padding and unbounded hours',()=>{
 for(const [hours,label] of [[0,'00:00:00'],[0.5,'00:30:00'],[1.25,'01:15:00'],[1.5,'01:30:00'],[8.75,'08:45:00'],[9.5,'09:30:00'],[25.5,'25:30:00']]){
  assert.equal(formatTimeTrackerDurationMs(hours*3600000),label);
 }
 assert.equal(formatTimeTrackerDurationMs(3723456),'01:02:03');
 assert.equal(formatTimeTrackerDurationMs(59999),'00:00:59');
 assert.equal(formatTimeTrackerDurationMs(360000000),'100:00:00');
 assert.equal(formatTimeTrackerDurationMs(null),'—');
 assert.equal(formatTimeTrackerDurationMs(-1),'—');
 assert.equal(formatTimeTrackerDurationMinutes(91),'01:31:00');
});
test('manual duration HH:MM:SS parses into unchanged integer milliseconds',()=>{
 for(const v of ['00:00:00','01:02:03','25:30:00','744:00:00']){
  const ms=parseTimeTrackerDuration(v);
  assert.equal(formatTimeTrackerDurationMs(ms),v);
 }
 for(const v of ['1.5','01:60:00','1:00:00','744:00:01','-01:00:00','foo'])assert.equal(parseTimeTrackerDuration(v),null);
});
test('live elapsed session includes seconds and passes 24 hours',()=>{
 assert.equal(timeTrackerSessionElapsed('2026-11-18T00:00:00Z',new Date('2026-11-19T01:30:05Z')).label,'25:30:05');
});
test('TimeTracker CSV export durations use HH:MM:SS',()=>{
 const row={clockIn:'2026-11-18T00:00:00Z',clockOut:'2026-11-19T01:30:00Z',creditedMs:91800000,name:'Employee',location:'Office-Base Duty',department:'IT',status:'Completed'};
 for(const csv of [ownAttendanceCsv([row]),timeTrackerLogCsv([row]),timeTrackerOverviewCsv([row])]){
  assert.match(csv,/25:30:00/);
  assert.doesNotMatch(csv,/25\.50|25\.5 h/);
 }
});
