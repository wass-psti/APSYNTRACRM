import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FUELTRACK_REQUEST_FILTER_DEFAULTS,FUELTRACK_REQUEST_PAGE_SIZE,
 fuelTrackRequestStatus,validFuelTrackDate,fuelTrackRequestsModel,
 fuelTrackRequestsSummary,fuelTrackRequestsCsv,renderFuelTrackRequests
} from '../fueltrack-v3-requests.js';
import {FUELTRACK_V3_ID} from '../fueltrack-v3-application.js';

const B=FUELTRACK_V3_ID;
const DATE='11111111-1111-4111-8111-111111111111';
const QTY='22222222-2222-4222-8222-222222222222';
const PUMP='33333333-3333-4333-8333-333333333333';
const REF='44444444-4444-4444-8444-444444444444';
const RECON='55555555-5555-4555-8555-555555555555';
const A='66666666-6666-4666-8666-666666666666';
const C='77777777-7777-4777-8777-777777777777';
const Z='88888888-8888-4888-8888-888888888888';
const value=(i,c,v)=>({item_id:i,column_id:c,value:v});
const item=(id,title,status,created_at='2026-11-09T08:40:00Z')=>({
 id,title,status,created_at,board_id:B,archived_at:null,notes:null
});
function detail(items=[]){
 return {board:{
  id:B,workspace_id:'00000000-0000-4000-8000-000000000001',
  status:'active',name:'FuelTrack+ v3',
  description:'[APSYNTRA:MODULE:fueltrack:v1] Fuel operations and reconciliation records.'
 },items,columns:[
  {id:DATE,name:'Event Date',data_type:'date',system_key:null,visible:true},
  {id:QTY,name:'Quantity Liters',data_type:'number',system_key:null,visible:true},
  {id:REF,name:'Fuel Event Ref',data_type:'text',system_key:null,visible:true},
  {id:PUMP,name:'Pump Ref',data_type:'text',system_key:null,visible:true},
  {id:RECON,name:'Reconcile Status',data_type:'status',system_key:null,visible:true}
 ],values:[]};
}
test('canonical board only and empty read model has no screenshot data',()=>{
 const d=detail(),model=fuelTrackRequestsModel(d,{},new Date('2026-11-09T10:00:00Z'));
 assert.equal(model.counts.all,0);
 assert.equal(model.completion,0);
 assert.equal(model.processedPercent,0);
 assert.equal(model.filteredCount,0);
 assert.deepEqual(model.visible,[]);
 const html=renderFuelTrackRequests({detail:d});
 assert.match(html,/No matching requests/);
 assert.doesNotMatch(html,/271 total|257|GBA 8424|Dale M. Rusiana/);
 d.board.id=Z;
 assert.equal(fuelTrackRequestsModel(d),null);
 assert.match(renderFuelTrackRequests({detail:d}),/unavailable/);
});
test('status aliases map only to known categories; unknown is other',()=>{
 assert.equal(fuelTrackRequestStatus('Done'),'done');
 assert.equal(fuelTrackRequestStatus('Completed'),'done');
 assert.equal(fuelTrackRequestStatus('Awaiting Refueling'),'pending');
 assert.equal(fuelTrackRequestStatus('Working'),'pending');
 assert.equal(fuelTrackRequestStatus('Approved'),'approved');
 assert.equal(fuelTrackRequestStatus('Rejected'),'rejected');
 assert.equal(fuelTrackRequestStatus('<script>'),'other');
});
test('status counts and daily/weekly totals are grounded in signed rows',()=>{
 const d=detail([
  item(A,'Submitted today','Working'),
  item(C,'Completed yesterday','Done','2026-11-08T08:00:00Z'),
  item(Z,'Not our board','Rejected')
 ]);
 d.items[2].board_id=Z;
 const m=fuelTrackRequestsModel(d,{},new Date('2026-11-09T10:00:00Z'));
 assert.equal(m.counts.all,2);
 assert.equal(m.counts.pending,1);
 assert.equal(m.counts.done,1);
 assert.equal(m.today,1);
 assert.equal(m.week,1); // Monday UTC, excludes previous Sunday
 assert.equal(m.completion,50);
 assert.equal(m.processedPercent,50);
 assert.match(fuelTrackRequestsSummary(m),/Total: 2/);
});
test('searches only actual title and authorized reference columns, not inferred identities',()=>{
 const d=detail([item(A,'Fuel Event — north','Done'),item(C,'South pickup','Rejected')]);
 d.values=[value(A,REF,'FUEL-001'),value(C,PUMP,'PUMP-90')];
 assert.equal(fuelTrackRequestsModel(d,{search:'FUEL-001'}).filteredCount,1);
 assert.equal(fuelTrackRequestsModel(d,{search:'pump-90'}).visible[0].id,C);
 assert.equal(fuelTrackRequestsModel(d,{search:'South'}).visible[0].id,C);
 assert.equal(fuelTrackRequestsModel(d,{search:'phantom requester'}).filteredCount,0);
 assert.equal(fuelTrackRequestsModel(d,{status:'rejected'}).visible[0].id,C);
 assert.equal(fuelTrackRequestsModel(d,{status:'approved'}).filteredCount,0);
});
test('dates validate real calendar days and filter Event Date only',()=>{
 assert.equal(validFuelTrackDate('2026-02-30'),false);
 assert.equal(validFuelTrackDate('2026-02-28'),true);
 assert.equal(validFuelTrackDate('2024-02-29'),true);
 const d=detail([item(A,'A','Done'),item(C,'C','Approved')]);
 d.values=[value(A,DATE,'2026-11-05'),value(C,DATE,{date:'2026-11-09'})];
 assert.deepEqual(fuelTrackRequestsModel(d,{from:'2026-11-08'}).visible.map(x=>x.id),[C]);
 assert.equal(fuelTrackRequestsModel(d,{to:'2026-11-06'}).visible[0].id,A);
 assert.equal(fuelTrackRequestsModel(d,{from:'2026-11-10',to:'2026-11-01'}).invalidRange,true);
 assert.equal(fuelTrackRequestsModel(d,{from:'2026-11-10',to:'2026-11-01'}).filteredCount,0);
});
test('sort and load more are deterministic and do not fabricate additional records',()=>{
 const items=Array.from({length:27},(_,i)=>item(
  '00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  'Request '+i,i%2?'Done':'Working',
  '2026-11-'+String(i+1).padStart(2,'0')+'T10:00:00Z'
 ));
 const d=detail(items);
 const first=fuelTrackRequestsModel(d);
 assert.equal(first.visible.length,FUELTRACK_REQUEST_PAGE_SIZE);
 assert.equal(first.filteredCount,27);
 assert.equal(first.canLoadMore,true);
 assert.equal(first.visible[0].title,'Request 26');
 const more=fuelTrackRequestsModel(d,{limit:50,sort:'oldest'});
 assert.equal(more.visible.length,27);
 assert.equal(more.visible[0].title,'Request 0');
 assert.equal(more.canLoadMore,false);
});
test('expanded details use verified Board item fields and never infer lifecycle',()=>{
 const d=detail([item(A,'Actual request','Approved')]);
 d.items[0].notes='Bring assigned fuel equipment';
 d.values=[
  value(A,DATE,'2026-11-08'),
  value(A,QTY,15.5),
  value(A,PUMP,'P-01'),
  value(A,RECON,'Synchronized')
 ];
 const html=renderFuelTrackRequests({detail:d,filters:{expandedId:A}});
 assert.match(html,/Request information/);
 assert.match(html,/15\.5 L/);
 assert.match(html,/P-01/);
 assert.match(html,/Bring assigned fuel equipment/);
 assert.match(html,/approval history are not provided/i);
 assert.match(html,/aria-expanded="true"/);
 assert.doesNotMatch(html,/Origin|Destination|Owner|Odometer reading|Invalid Date/);
});
test('malicious text is escaped and CSV spreadsheet formulas neutralized',()=>{
 const d=detail([item(A,'=HYPERLINK("https://evil") <svg onload=alert(1)>','<img src=x>')]);
 d.items[0].notes='<script>alert(1)</script>';
 d.values=[value(A,REF,'+SUM(1,1)'),value(A,PUMP,'@NOW()')];
 const html=renderFuelTrackRequests({detail:d,filters:{expandedId:A}});
 assert.doesNotMatch(html,/<svg|<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 const csv=fuelTrackRequestsCsv(fuelTrackRequestsModel(d));
 assert.match(csv,/"'=HYPERLINK/);
 assert.match(csv,/"'\+SUM/);
 assert.match(csv,/"'@NOW/);
 assert.doesNotMatch(csv,/<script>/);
});
test('renderer exposes functional controls and read-only scoped request data',()=>{
 const html=renderFuelTrackRequests({detail:detail()});
 for(const action of ['ft3-request-copy','ft3-request-export','ft3-request-sort','ft3-request-clear','refresh-board'])
  assert.ok(html.includes('data-action="'+action+'"'),action);
 for(const id of ['ft3-request-search','ft3-request-from','ft3-request-to'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/data-action="ft3-request-status"/);
 assert.match(html,/Event date/);
 assert.doesNotMatch(html,/<form|data-action="ft3-request-save"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'ft3-request-status'/);
 assert.match(app,/case 'ft3-request-expand'/);
 assert.match(app,/fuelTrackRequestReady/);
 assert.match(app,/await db.allowed\(boardId,'view'\)/);
});
test('invalid and foreign values never appear in per-row metadata',()=>{
 const d=detail([item(A,'Real request','Done')]);
 d.values=[value(Z,REF,'FOREIGN RECORD'),value(A,REF,'REAL REFERENCE')];
 const html=renderFuelTrackRequests({detail:d});
 assert.match(html,/REAL REFERENCE/);
 assert.doesNotMatch(html,/FOREIGN RECORD/);
 assert.deepEqual(FUELTRACK_REQUEST_FILTER_DEFAULTS.status,'all');
});
