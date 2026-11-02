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

test('privileged signed GPS snapshot displays matching attendance fixes, not raw projection GPS',()=>{
 const gpsData={actorId:'bootstrap',workspaceId:'workspace',boardId:'board',
  ranges:[{from:'2026-11-01',to:'2026-11-02'}],
  events:[{userId:'one',recordId:'today',kind:'in',
    timestamp:'2026-11-02T01:00:00Z',latitude:10.234567,
    longitude:123.987654,accuracyM:12,source:'Browser GPS'},
   {userId:'two',recordId:'older',kind:'in',
    timestamp:'2026-10-28T01:00:00Z',latitude:11.34,
    longitude:124.55,accuracyM:20,source:'Browser GPS'}]};
 const privileged=renderTimeTrackerLog({records,gpsEligible:true,gpsData,now});
 assert.match(privileged,/10\.234567, 123\.987654/);
 assert.match(privileged,/Recorded from signed GPS|Recorded<\/strong>/);
 assert.match(privileged,/Open point on map/);
 assert.match(privileged,/data-action="tt-log-gps-load"/);
 assert.doesNotMatch(privileged,/11\.340000, 124\.550000/);
 const ordinary=renderTimeTrackerLog({records,gpsEligible:false,gpsData,now});
 assert.doesNotMatch(ordinary,/10\.234567|123\.987654|href="https:\/\/www\.openstreetmap\.org/);
 assert.doesNotMatch(ordinary,/data-action="tt-log-gps-load"/);
 const foreign=renderTimeTrackerLog({records,gpsEligible:true,gpsData:{
  events:[{...gpsData.events[0],userId:'other-user'}],ranges:gpsData.ranges},now});
 assert.doesNotMatch(foreign,/10\.234567, 123\.987654/);
});
test('Log GPS loading uses dedicated signed RPC, maintains authorization and no broad GPS scope',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/async function loadTimeTrackerLogGps/);
 assert.match(app,/timeTracker\.gpsEvidence\(boardId,params\)/);
 assert.match(app,/if\(next==='log'\)await loadTimeTrackerLogGps\(\)/);
 assert.match(app,/case 'tt-log-gps-load'/);
 assert.match(app,/state\.ttLogGpsData=null/);
 const raw=readFileSync('frontend/time-tracker-native.js','utf8');
 assert.match(raw,/timetracker_gps_snapshot/);
});

test('GPS load retains expanded audit details and scopes errors to selected record',()=>{
 const pending=renderTimeTrackerLog({records,now,gpsEligible:true,gpsBusy:true,
  expandedRecordIds:['today']});
 assert.match(pending,/class="tt-log-detail" data-record-id="today" open/);
 assert.match(pending,/class="tt-log-detail" data-record-id="older"/);
 assert.doesNotMatch(pending,/data-record-id="older" open/);
 assert.match(pending,/Loading signed GPS evidence/);
 const failed=renderTimeTrackerLog({records,now,gpsEligible:true,
  expandedRecordIds:['today'],gpsError:'Signed GPS request failed validation.',
  gpsErrorRecordId:'today'});
 assert.match(failed,/class="tt-log-detail" data-record-id="today" open/);
 assert.equal((failed.match(/Signed GPS request failed validation\./g)||[]).length,1);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/function preserveTimeTrackerLogExpansion/);
 assert.match(app,/querySelectorAll\('\.tt-log-detail\[open\]\[data-record-id\]'\)/);
 assert.match(app,/preserveTimeTrackerLogExpansion\(\);/);
 assert.match(app,/state\.ttLogGpsErrorRecordId=record\?\.id/);
 assert.doesNotMatch(app,/state\.ttLogGpsData=null;\s*state\.ttLogGpsError='Signed GPS evidence could not be verified/);
});
