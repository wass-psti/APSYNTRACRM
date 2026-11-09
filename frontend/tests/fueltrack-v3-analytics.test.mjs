import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FUELTRACK_ANALYTICS_VIEWS,normalizeFuelTrackAnalyticsRange,
 normalizeFuelTrackAnalyticsMetric,normalizeFuelTrackAnalyticsView,
 fuelTrackAnalyticsHref,fuelTrackAnalyticsModel,renderFuelTrackAnalytics
} from '../fueltrack-v3-analytics.js';
import {FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';

const BOARD=FUELTRACK_V3_ID;
const DATE='11111111-1111-4111-8111-111111111111';
const LITERS='22222222-2222-4222-8222-222222222222';
const A='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const OUTSIDER='55555555-5555-4555-8555-555555555555';
const make=(id,title,status)=>({id,board_id:BOARD,title,status,archived_at:null});
function fixture(items=[]){
 return {board:{
  id:BOARD,name:'FuelTrack+ v3',status:'active',
  workspace_id:'00000000-0000-4000-8000-000000000001',
  description:'[APSYNTRA:MODULE:fueltrack:v1] Fuel operations and reconciliation records.'
 },items,columns:[
  {id:DATE,name:'Event Date',data_type:'date',system_key:null,visible:true},
  {id:LITERS,name:'Quantity Liters',data_type:'number',system_key:null,visible:true}
 ],values:[]};
}
const value=(item,column,v)=>({item_id:item,column_id:column,value:v});
test('five analytics categories explicitly exclude Service and Receipts',()=>{
 assert.deepEqual(FUELTRACK_ANALYTICS_VIEWS.map(v=>v.label),[
  'Fuel Price','Efficiency','Frequency','Requestors','Odometer'
 ]);
 assert.equal(FUELTRACK_ANALYTICS_VIEWS.length,5);
 assert.equal(normalizeFuelTrackAnalyticsView('service'),'fuel-price');
 assert.equal(normalizeFuelTrackAnalyticsView('receipts'),'fuel-price');
 const html=renderFuelTrackAnalytics({detail:fixture()});
 assert.doesNotMatch(html,/Service Reminders|Receipts|Load More Items/);
 assert.equal((html.match(/class="ft3-analytics-section-tab(?: is-active)?"/g)||[]).length,5);
});
test('deep links normalize invalid view, range and metric without arbitrary operations',()=>{
 assert.equal(normalizeFuelTrackAnalyticsRange('random'),'all');
 assert.equal(normalizeFuelTrackAnalyticsMetric('cost-per-vehicle'),'both');
 assert.equal(fuelTrackAnalyticsHref('efficiency','week','volume'),
  '#/boards/'+BOARD+'/fueltrack/analytics/efficiency/week/volume');
 assert.equal(fuelTrackAnalyticsHref('service','unknown','arbitrary'),
  '#/boards/'+BOARD+'/fueltrack/analytics/fuel-price/all/both');
});
test('empty signed dataset never copies screenshot amounts, rankings or mileage',()=>{
 const model=fuelTrackAnalyticsModel(fixture());
 assert.equal(model.requestCount,0);
 assert.equal(model.completed,0);
 assert.equal(model.totalVolume,0);
 assert.deepEqual(model.trend,[]);
 const html=renderFuelTrackAnalytics({detail:fixture()});
 assert.match(html,/0 authorized board requests/);
 assert.match(html,/Vehicle rankings/);
 assert.match(html,/No dated fuel consumption yet/);
 assert.doesNotMatch(html,/372,123\.08|4,515\.56|137 completed|15,505\.13|22 trips/);
});
test('monthly consumption is aggregated only from signed board date and quantity fields',()=>{
 const d=fixture([make(A,'A','Done'),make(B,'B','Rejected')]);
 d.values=[
  value(A,DATE,'2026-10-14'),value(B,DATE,{date:'2026-11-08'}),
  value(A,LITERS,{number:10.25}),value(B,LITERS,'5.5'),
  value(OUTSIDER,LITERS,'99999')
 ];
 const model=fuelTrackAnalyticsModel(d,{now:new Date('2026-11-09T10:00:00Z')});
 assert.equal(model.requestCount,2);
 assert.equal(model.completed,1);
 assert.equal(model.totalVolume,15.75);
 assert.deepEqual(model.trend.map(t=>[t.month,t.volume]),[['2026-10',10.25],['2026-11',5.5]]);
 const html=renderFuelTrackAnalytics({detail:d,metric:'volume'});
 assert.match(html,/15\.75 L/);
 assert.match(html,/Monthly fuel volume trend in liters/);
 assert.doesNotMatch(html,/99999|style="/);
});
test('date filters operate on actual Event Date; no title-derived dates',()=>{
 const d=fixture([make(A,'old 2026','Done'),make(B,'new 2026','Completed')]);
 d.values=[value(A,DATE,'2026-03-05'),value(B,DATE,'2026-11-09'),
  value(A,LITERS,10),value(B,LITERS,20)];
 const now=new Date('2026-11-09T10:00:00Z');
 assert.equal(fuelTrackAnalyticsModel(d,{range:'all',now}).requestCount,2);
 assert.equal(fuelTrackAnalyticsModel(d,{range:'six-months',now}).requestCount,1);
 assert.equal(fuelTrackAnalyticsModel(d,{range:'month',now}).requestCount,1);
 assert.equal(fuelTrackAnalyticsModel(d,{range:'week',now}).requestCount,1);
 assert.equal(fuelTrackAnalyticsModel(d,{range:'week',now}).totalVolume,20);
});
test('invalid, missing or malformed numeric fields suppress total and trend',()=>{
 const d=fixture([make(A,'A','Done'),make(B,'B','Done')]);
 d.values=[value(A,DATE,'2026-11-08'),value(B,DATE,'2026-11-09'),
  value(A,LITERS,12),value(B,LITERS,'-2')];
 let model=fuelTrackAnalyticsModel(d);
 assert.equal(model.totalVolume,null);
 assert.deepEqual(model.trend,[]);
 assert.match(renderFuelTrackAnalytics({detail:d}),/Incomplete fuel quantities/);
 d.values[3]=value(B,LITERS,'not a number');
 assert.equal(fuelTrackAnalyticsModel(d).totalVolume,null);
});
test('financial/vehicle/requester/mileage views never infer protected data from strings',()=>{
 const d=fixture([make(A,'Vehicle A - Requester Jane 200km ₱1000','Done')]);
 d.values=[value(A,DATE,'2026-11-09'),value(A,LITERS,10)];
 for(const view of FUELTRACK_ANALYTICS_VIEWS){
  const html=renderFuelTrackAnalytics({detail:d,view:view.key});
  assert.match(html,/Awaiting verified/);
  assert.doesNotMatch(html,/Vehicle A - Requester Jane|200km|₱1000/);
  assert.doesNotMatch(html,/<form|data-action="save|style="/);
 }
 assert.match(renderFuelTrackAnalytics({detail:d,metric:'spend'}),/Spending trend unavailable/);
 assert.match(renderFuelTrackAnalytics({detail:d,metric:'both'}),/spending data is not connected/i);
});
test('bad board and untrusted names have no analytics visibility or unsafe markup',()=>{
 const bad=fixture();
 bad.board.id=OUTSIDER;
 assert.equal(fuelTrackAnalyticsModel(bad),null);
 assert.match(renderFuelTrackAnalytics({detail:bad}),/unavailable/);
 const d=fixture([make(A,'<svg onload=alert(1)>','<script>')]);
 d.values=[value(A,DATE,'2026-11-09'),value(A,LITERS,1)];
 const html=renderFuelTrackAnalytics({detail:d});
 assert.doesNotMatch(html,/<script>|onload=alert/);
});
test('app route parser carries five analytics categories, date range and metric to read-only renderer',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/state\.fuelTrackAnalyticsView=normalizeFuelTrackAnalyticsView\(parts\[4\]\)/);
 assert.match(app,/state\.fuelTrackAnalyticsRange=normalizeFuelTrackAnalyticsRange\(parts\[5\]\)/);
 assert.match(app,/state\.fuelTrackAnalyticsMetric=normalizeFuelTrackAnalyticsMetric\(parts\[6\]\)/);
 assert.match(app,/analyticsRenderer:renderFuelTrackAnalytics/);
});
