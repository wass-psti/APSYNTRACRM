import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderFuelTrackSignedDashboardRich,renderFuelTrackSignedAnalyticsRich,
 renderFuelTrackSignedRequestsRich,modelFuelTrackSignedRequests
} from '../fueltrack-v3-signed-views.js';
import {renderFuelTrackV3Application,FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';
const boardId=FUELTRACK_V3_ID,workspaceId='11111111-1111-4111-8111-111111111111';
const detail={board:{id:boardId,workspace_id:workspaceId,name:'FuelTrack+ v3',
 status:'active',description:'[APSYNTRA:MODULE:fueltrack:v1] native'},
 items:[],columns:[],values:[]};
const a={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',state:'completed',kind:'vehicle',
 revision:4,requestor_name:'Requestor <b>',details:{plate:'G42 80H',purpose:'Site visit'},
 created_at:'2026-11-10T16:50:14Z'};
const b={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',state:'submitted',kind:'container',
 revision:1,requestor_name:'Operator',details:{containerCount:3,purpose:'Refill supplies'},
 created_at:'2026-11-09T02:20:00Z'};
const summary={total:2,submitted:1,approved:0,rejected:0,refuelingDone:0,completed:1,
 totalAmount:500,totalLiters:8.5};
const snapshot={status:'VERIFIED_READ',role:'Admin',boardId,workspaceId,summary,rows:[a,b]};
const analytics={status:'VERIFIED_READ',boardId,workspaceId,days:365,
 daily:[{day:'2026-11-11',transactions:1,amount:500,liters:8.5}]};

test('signed dashboard uses a premium overview with genuine signed values',()=>{
 const html=renderFuelTrackSignedDashboardRich(snapshot);
 assert.match(html,/FUEL CONTROL \/ VERIFIED OPERATIONS/);
 assert.match(html,/class="ft3-dashboard-hero"/);
 assert.match(html,/Fuel operations at a glance/);
 assert.match(html,/ft3-dashboard-pipeline/);
 assert.match(html,/Request pipeline/);
 assert.match(html,/Recent Fuel Requests/);
 assert.match(html,/₱500\.00/);
 assert.match(html,/8\.5 L/);
 assert.match(html,/stroke-dasharray="125\.6 251\.2"/);
 assert.match(html,/&lt;b&gt;/);
 assert.match(html,/View all requests/);
 assert.doesNotMatch(html,/<b>|271 transactions|258 processed|Top Vehicles/);
});
test('CP-FUELTRACK-DASHBOARD-UI-01 preserves all five statuses and calculates completion from signed counts',()=>{
 const complete={...snapshot,summary:{...summary,total:5,submitted:1,approved:1,refuelingDone:1,completed:1,rejected:1}};
 const html=renderFuelTrackSignedDashboardRich(complete);
 assert.match(html,/stroke-dasharray="50\.2 251\.2"/);
 assert.match(html,/aria-label="Completion rate 20 percent"/);
 assert.match(html,/1 of 5 requests completed/);
 assert.equal((html.match(/class="ft3-dashboard-stage ft3-dashboard-stage-/g)||[]).length,5);
 for(const key of ['submitted','approved','refueling_done','completed','rejected'])assert.match(html,new RegExp('ft3-dashboard-stage-'+key));
 for(const label of ['Pending Approval','Awaiting Refueling','Refueling Done','Completed','Rejected'])assert.ok(html.includes(label),label);
 assert.match(html,/Request status distribution:/i);
 assert.match(html,/data-status="rejected"/);
});
test('CP-FUELTRACK-DASHBOARD-UI-01 handles an empty signed workspace without NaN or fabricated totals',()=>{
 const empty={...snapshot,rows:[],summary:{...summary,total:0,submitted:0,approved:0,refuelingDone:0,completed:0,rejected:0,totalAmount:null,totalLiters:null}};
 const html=renderFuelTrackSignedDashboardRich(empty);
 assert.match(html,/stroke-dasharray="0\.0 251\.2"/);
 assert.match(html,/Completion rate 0 percent/);
 assert.match(html,/0 of 0 requests completed/);
 assert.match(html,/—/);
 assert.match(html,/No fuel requests in this signed response/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('CP-FUELTRACK-DASHBOARD-UI-01 styles desktop, tablet, mobile and dark dashboard surfaces',()=>{
 const css=readFileSync(new URL('../fueltrack-v3-application.css',import.meta.url),'utf8');
 const dark=readFileSync(new URL('../../frontend/dark-native-applications.css',import.meta.url),'utf8');
 const bundle=readFileSync(new URL('../apsyntra-styles.bundle.css',import.meta.url),'utf8');
 for(const token of ['ft3-dashboard-hero','ft3-dashboard-stage-grid','ft3-dashboard-progress','@media(max-width:1120px)','@media(max-width:760px)','@media(max-width:380px)'])assert.ok(css.includes(token),token);
 for(const token of ['ft3-dashboard-stage','ft3-dashboard-recent','var(--crm-native-elevated)'])assert.ok(dark.includes(token),token);
 assert.match(bundle,/CP-FUELTRACK-DASHBOARD-UI-01 — premium signed operations dashboard/);
 assert.match(bundle,/CP-FUELTRACK-DASHBOARD-UI-01 — FuelTrack dashboard dark appearance/);
});
test('signed analytics keeps tabs, date filters, metric filters, chart and daily records',()=>{
 const html=renderFuelTrackSignedAnalyticsRich(snapshot,analytics);
 assert.match(html,/class="ft3-analytics-range"/);
 assert.match(html,/class="ft3-analytics-section-nav"/);
 assert.match(html,/class="ft3-signed-bars"/);
 assert.match(html,/Consumption Trend/);
 assert.match(html,/Daily Summary/);
 assert.match(html,/₱500\.00/);
 assert.match(html,/8\.5 L/);
 assert.match(html,/href="#\/boards\/7af78b3f-67bf-4600-9aa1-9006d19d486e\/fueltrack\/analytics\/efficiency\/all\/both"/);
 assert.doesNotMatch(html,/271 transactions|258 processed/);
});
test('signed analytics tolerates absent or malformed optional period metadata without crashing',()=>{
 for(const days of [undefined,null,'invalid',0,-1,999999]){
  const html=renderFuelTrackSignedAnalyticsRich(snapshot,{...analytics,days});
  assert.match(html,/Consumption Trend/);
  assert.doesNotMatch(html,/NaN-NaN|Invalid Date/);
 }
});
test('unverified and mismatched analytics fail closed and never reconstruct data from the Board',()=>{
 assert.match(renderFuelTrackSignedAnalyticsRich(snapshot,null),/unavailable/);
 assert.match(renderFuelTrackSignedAnalyticsRich(snapshot,{...analytics,workspaceId:'foreign'}),/unavailable/);
 assert.match(renderFuelTrackSignedAnalyticsRich(snapshot,{...analytics,
  daily:[{day:'not-a-date',transactions:1,amount:10,liters:3}]}),/unavailable/);
});
test('signed requests preserve original filter, sort and expandable log interactions',()=>{
 const html=renderFuelTrackSignedRequestsRich(snapshot);
 assert.match(html,/class="ft3-request-stats"/);
 assert.match(html,/class="ft3-request-filters"/);
 assert.match(html,/id="ft3-signed-request-search"/);
 assert.match(html,/data-action="ft3-signed-request-status"/);
 assert.match(html,/data-action="ft3-signed-request-sort"/);
 assert.match(html,/data-action="ft3-signed-request-expand"/);
 const searched=modelFuelTrackSignedRequests(snapshot,{search:'G42',status:'completed'});
 assert.equal(searched.count,1);
 const filtered=renderFuelTrackSignedRequestsRich(snapshot,{search:'G42',status:'completed',expandedId:a.id});
 assert.match(filtered,/aria-expanded="true"/);
 assert.match(filtered,/Verified request details/);
 assert.match(filtered,/Site visit/);
 assert.doesNotMatch(filtered,/Refill supplies/);
 assert.doesNotMatch(filtered,/<b>/);
 assert.match(renderFuelTrackSignedRequestsRich(snapshot,{search:'nonexistent'}),/No matching requests/);
});
test('three signed application routes all use the richer renderers instead of minimal fallback',()=>{
 for(const [section,expected] of [
  ['dashboard','Request pipeline'],['analytics','Consumption Trend'],['requests','Request Log']
 ]){
  const html=renderFuelTrackV3Application({detail,section,backend:{snapshot,analytics}});
  assert.match(html,new RegExp(expected));
  assert.match(html,/Verified signed FuelTrack operations · Admin/);
 }
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/case 'ft3-signed-request-status':/);
 assert.match(source,/id==='ft3-signed-request-search'/);
});
