import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTimeTrackerReportRows,summarizeTimeTrackerReports,renderTimeTrackerReports} from '../time-tracker-reports.js';
const now=new Date('2026-11-02T08:00:00.000Z');
const rows=[
 {id:'one',ownerId:'cloud:a',name:'Employee One',department:'Engineering',location:'Office-Base Duty',clockIn:'2026-11-02T01:00:00.000Z',clockOut:null,status:'Active',classification:'Late',creditedMs:null},
 {id:'two',ownerId:'cloud:b',name:'Employee Two',department:'HR',location:'Office-Base Duty',clockIn:'2026-10-31T23:00:00.000Z',clockOut:'2026-11-01T05:00:00.000Z',status:'Completed',classification:'On time',creditedMs:18000000}
];
test('authorized Reports include current and older sessions',()=>{
 assert.equal(filterTimeTrackerReportRows(rows,{period:'all',now}).length,2);
 assert.equal(filterTimeTrackerReportRows(rows,{period:'today',now}).length,1);
 assert.equal(filterTimeTrackerReportRows(rows,{period:'month',now}).length,2);
 assert.equal(filterTimeTrackerReportRows(rows,{period:'custom',filters:{start:'2026-11-01',end:'2026-11-02'},now}).length,2);
});
test('Reports analytics and rendered names use projected records',()=>{
 const result=summarizeTimeTrackerReports(rows);
 assert.equal(result.records,2);
 assert.equal(result.employees,2);
 assert.equal(result.late,1);
 const html=renderTimeTrackerReports({rows,period:'all',now});
 assert.match(html,/Employee One/);
 assert.match(html,/Employee Two/);
 assert.match(html,/Arrival Patterns/);
 assert.match(html,/Department Utilization/);
});
