import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderFuelTrackSignedDashboardRich,renderFuelTrackSignedAnalyticsRich,
 renderFuelTrackSignedRequestsRich,modelFuelTrackSignedRequests,fuelTrackAnalyticsCsv
} from '../fueltrack-v3-signed-views.js';
import {renderFuelTrackV3Application,FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';
import {parseFuelTrackApplicationRoute} from '../fueltrack-v3-application-route.js';
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
test('CP-FT-ANALYTICS-01 derives weighted cost per liter and daily frequency only from signed aggregates',()=>{
 const records={...analytics,daily:[
  {day:'2026-11-11',transactions:2,amount:500,liters:8.5},
  {day:'2026-11-12',transactions:1,amount:200,liters:5}
 ]};
 const html=renderFuelTrackSignedAnalyticsRich(snapshot,records,{now:new Date('2026-11-12T04:00:00Z')});
 assert.match(html,/Fuel Analytics/);
 assert.match(html,/₱700\.00/);
 assert.match(html,/13\.5 L/);
 assert.match(html,/₱51\.85/);
 assert.match(html,/Weighted effective cost per liter/);
 assert.match(html,/not a posted station price/);
 assert.match(html,/class="ft3-analytics-series" data-metric="amount"/);
 assert.match(html,/class="ft3-analytics-series" data-metric="liters"/);
 const frequency=renderFuelTrackSignedAnalyticsRich(snapshot,records,{view:'frequency',now:new Date('2026-11-12T04:00:00Z')});
 assert.match(frequency,/Daily completed refueling count/);
 assert.match(frequency,/class="ft3-analytics-series" data-metric="transactions"/);
 assert.match(frequency,/class="ft3-analytics-series-total">3<\/strong>/);
});
test('analytics reporting windows use the exact requested rolling day count',()=>{
 const records={...analytics,days:365,daily:[
  {day:'2026-11-01',transactions:1,amount:100,liters:2},
  {day:'2026-11-06',transactions:1,amount:200,liters:4},
  {day:'2026-11-12',transactions:1,amount:300,liters:6},
  {day:'2026-11-13',transactions:2,amount:900,liters:10}
 ]};
 const now=new Date('2026-11-12T04:00:00Z');
 const week=renderFuelTrackSignedAnalyticsRich(snapshot,records,{range:'week',now});
 assert.match(week,/Last 7 days/);
 assert.match(week,/₱500\.00/);
 assert.doesNotMatch(week,/₱100\.00/);
 const month=renderFuelTrackSignedAnalyticsRich(snapshot,records,{range:'month',now});
 assert.match(month,/Last 30 days/);
 assert.match(month,/₱600\.00/);
 assert.match(month,/Showing last 30 days/);
 assert.doesNotMatch(month,/₱900\.00/);
});
test('FuelTrack analytics explains unsupported dimensions without inventing fleet metrics',()=>{
 const records={...analytics,daily:[{day:'2026-11-11',transactions:1,amount:500,liters:8.5}]};
 const efficiency=renderFuelTrackSignedAnalyticsRich(snapshot,records,{view:'efficiency'});
 const requestors=renderFuelTrackSignedAnalyticsRich(snapshot,records,{view:'requestors'});
 const odometer=renderFuelTrackSignedAnalyticsRich(snapshot,records,{view:'odometer'});
 assert.match(efficiency,/distance travelled, vehicle mileage, or efficiency targets/);
 assert.match(requestors,/does not expose requestor-level totals/);
 assert.match(odometer,/Verified odometer readings/);
 for(const html of [efficiency,requestors,odometer]){
  assert.match(html,/Additional signed data required/);
  assert.doesNotMatch(html,/42\.5 km\/L|Plate No\.|Jane Doe|12,500 km/);
 }
});
test('CP-FT-ANALYTICS-01 provides responsive and dark-theme analytics styling',()=>{
 const css=readFileSync(new URL('../../frontend/fueltrack-v3-analytics.css',import.meta.url),'utf8');
 const dark=readFileSync(new URL('../../frontend/dark-native-applications.css',import.meta.url),'utf8');
 for(const token of ['ft3-analytics-hero','ft3-analytics-toolbar','ft3-analytics-kpi','ft3-analytics-trend-grid','ft3-analytics-table','@media(max-width:800px)','@media(max-width:540px)'])assert.ok(css.includes(token),token);
 for(const token of ['ft3-analytics-v2','ft3-analytics-kpi','ft3-analytics-series','var(--crm-native-panel)','data-aps-monday-theme="dark"'])assert.ok(dark.includes(token),token);
});

test('CP-FT-ANALYTICS-01 exports only verified daily aggregates and rejects duplicate dates',()=>{
 const records={...analytics,daily:[
  {day:'2026-11-11',transactions:2,amount:500,liters:8.5},
  {day:'2026-11-12',transactions:1,amount:200,liters:5}
 ]};
 const csv=fuelTrackAnalyticsCsv(records);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.match(csv,/Completion date/);
 assert.match(csv,/2026-11-11/);
 assert.match(csv,/51\.85/);
 assert.match(csv,/40\.00/);
 assert.equal(fuelTrackAnalyticsCsv({...records,status:'UNVERIFIED'}),null);
 assert.equal(fuelTrackAnalyticsCsv({...records,daily:[...records.daily,records.daily[0]]}),null);
 assert.equal(fuelTrackAnalyticsCsv({...records,daily:[{...records.daily[0],day:'2026-02-30'}]}),null);
});
test('analytics route links preserve the selected view, reporting window and chart metric',()=>{
 const route=parseFuelTrackApplicationRoute(['fueltrack','analytics','fuel-price','week','spend']);
 assert.equal(route.section,'analytics');
 assert.equal(route.analyticsView,'fuel-price');
 assert.equal(route.analyticsRange,'week');
 assert.equal(route.analyticsMetric,'spend');
 assert.equal(route.canonicalHash,'#/fueltrack/analytics/fuel-price/week/spend');
 const fallback=parseFuelTrackApplicationRoute(['fueltrack','analytics','unknown','bad','bad']);
 assert.equal(fallback.analyticsView,'fuel-price');
 assert.equal(fallback.analyticsRange,'all');
 assert.equal(fallback.analyticsMetric,'both');
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
 assert.ok(html.includes('ft3-request-filters'));
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
test('CP-FT-ALL-REQUESTS-01 renders a complete request workspace with truthful status totals',()=>{
 const html=renderFuelTrackSignedRequestsRich(snapshot);
 assert.ok(html.includes('ft3-requests-v2'));
 assert.match(html,/FUEL CONTROL \/ REQUEST MANAGEMENT/);
 assert.match(html,/Request workspace/);
 for(const token of ['ft3-requests-kpi-total','ft3-requests-kpi-pending','ft3-requests-kpi-progress','ft3-requests-kpi-completed'])assert.match(html,new RegExp(token));
 for(const token of ['Total requests','Pending approval','In progress','data-status="refueling_done"','aria-label="Filter requests by status"','Search requestor, plate, purpose or reference','ft3-requests-table','class="ft3-requests-avatar"','class="ft3-requests-purpose"','View details','class="ft3-requests-mobile-label"'])assert.ok(html.includes(token),token);
 assert.match(html,/Showing 2 of 2 matching requests/);
 assert.doesNotMatch(html,/271 transactions|258 processed|Jane Doe|42.5 km per liter/);
 const css=readFileSync(new URL('../fueltrack-v3-application.css',import.meta.url),'utf8');
 const dark=readFileSync(new URL('../../frontend/dark-native-applications.css',import.meta.url),'utf8');
 const bundle=readFileSync(new URL('../apsyntra-styles.bundle.css',import.meta.url),'utf8');
 for(const token of ['ft3-requests-hero','ft3-requests-kpi','ft3-requests-workspace','ft3-requests-table','@media(max-width:700px)','@media(max-width:380px)'])assert.ok(css.includes(token),token);
 for(const token of ['ft3-requests-v2','ft3-requests-kpi','ft3-requests-empty','var(--crm-native-panel)'])assert.ok(dark.includes(token),token);
 assert.match(bundle,/CP-FT-ALL-REQUESTS-01 — premium request workspace/);
 assert.match(bundle,/CP-FT-ALL-REQUESTS-01 — FuelTrack signed request workspace dark appearance/);
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
 assert.match(source,/case 'ft3-analytics-export':/);
 assert.match(source,/fuelTrackAnalyticsCsv/);
 assert.match(source,/id==='ft3-signed-request-search'/);
});
