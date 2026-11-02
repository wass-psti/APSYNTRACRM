import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderTimeTrackerLog,filterTimeTrackerLogRows,timeTrackerLogSummary
} from '../time-tracker-log.js';

const now=new Date('2026-11-02T10:00:00Z');
const records=[
 {id:'today',ownerId:'cloud:one',name:'Employee One',
  clockIn:'2026-11-02T01:00:00Z',clockOut:null,
  department:'Engineering',location:'Office-Base Duty',
  status:'Active',classification:'Late',creditedMs:null},
 {id:'older',ownerId:'cloud:two',name:'Employee Two',
  clockIn:'2026-10-27T23:00:00Z',clockOut:'2026-10-28T09:00:00Z',
  department:'HR',location:'Local Field Works',
  status:'Completed',classification:'On time',creditedMs:32400000}
];

test('reference Log sections render on the existing signed history',()=>{
 const html=renderTimeTrackerLog({
  records,scope:'AUTHORIZED_WORKSPACE_TEAM',now
 });
 for(const heading of [
  'LOCATION DISTRIBUTION','DAILY OPERATIONS','SHIFT PROGRESS',
  'Attendance Records','AUDIT DETAILS','SHIFT SUMMARY',
  'DEVICE &amp; LOCATION','Satellite map unavailable'
 ])assert.ok(html.includes(heading),heading);
 for(const heading of [
  'Before 8 AM','Late Today','Still Working','No Time-Out',
  'Manual Edits','Stagnant (14h+)'
 ])assert.ok(html.includes(heading),heading);
 assert.match(html,/October 28/);
 assert.match(html,/November 2/);
 assert.match(html,/Employee One/);
 assert.match(html,/Employee Two/);
 assert.match(html,/class="tt-log-detail"/);
});

test('CSP-safe rendering never embeds precise location or invented scores',()=>{
 const html=renderTimeTrackerLog({
  records:[{...records[0],name:'<img src=x onerror=alert(1)>',
   latitude:6.91,longitude:125.49,audit:{score:100}}],
  now
 });
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/style="/);
 assert.doesNotMatch(html,/125\.49|6\.91/);
 assert.match(html,/Evidence not independently verified/);
 assert.match(html,/Audit score/);
 assert.match(html,/Satellite map unavailable/);
 const css=readFileSync('frontend/styles.css','utf8');
 assert.match(css,/CP-TT-LOG-VISUAL-03/);
 assert.match(css,/CP-TT-LOG-WIDTHS-CSP/);
});

test('today operations do not remove old authorized history',()=>{
 const html=renderTimeTrackerLog({records,now});
 assert.match(html,/1 earlier/);
 assert.equal(timeTrackerLogSummary(records,now).historical,1);
 assert.equal(filterTimeTrackerLogRows(records,{period:'all'},now).length,2);
 assert.equal(filterTimeTrackerLogRows(records,{period:'today'},now).length,1);
});
