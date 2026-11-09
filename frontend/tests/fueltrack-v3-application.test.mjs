import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FUELTRACK_V3_ID,FUELTRACK_TABS,isFuelTrackV3ApplicationBoard,
 fuelTrackDashboardModel,fuelTrackHref,normalizeFuelTrackSection,renderFuelTrackV3Application
} from '../fueltrack-v3-application.js';

const BOARD=FUELTRACK_V3_ID;
const W='00000000-0000-4000-8000-000000000001';
const DATE='11111111-1111-4111-8111-111111111111';
const VOLUME='22222222-2222-4222-8222-222222222222';
const ITEM_A='33333333-3333-4333-8333-333333333333';
const ITEM_B='44444444-4444-4444-8444-444444444444';
function fixture(items=[]){
 return {
  board:{id:BOARD,name:'FuelTrack+ v3',status:'active',workspace_id:W,
   description:'[APSYNTRA:MODULE:fueltrack:v1] Fuel operations and reconciliation records.'},
  items,columns:[
   {id:DATE,name:'Event Date',data_type:'date',system_key:null,visible:true},
   {id:VOLUME,name:'Quantity Liters',data_type:'number',system_key:null,visible:true}
  ],values:[]
 };
}
const item=(id,title,status)=>({id,board_id:BOARD,title,status,created_at:'2026-11-01T00:00:00Z'});

test('only the canonical FuelTrack board in an active signed snapshot is eligible',()=>{
 const source=fixture();
 assert.equal(isFuelTrackV3ApplicationBoard(source.board),true);
 assert.equal(fuelTrackDashboardModel({...source,board:{...source.board,id:ITEM_A}}),null);
 assert.equal(fuelTrackDashboardModel({...source,board:{...source.board,status:'archived'}}),null);
 assert.equal(fuelTrackDashboardModel({...source,board:{...source.board,description:'unverified'}}),null);
 assert.equal(renderFuelTrackV3Application({detail:{board:{name:'FuelTrack+ v3'}}}).includes('unavailable'),true);
});

test('exact seven tabs and canonical application deep links',()=>{
 assert.deepEqual(FUELTRACK_TABS.map(t=>t.label),[
  'Dashboard','Analytics','All Requests','New Fuel Request','Approvals','LightFuels','Activity'
 ]);
 assert.equal(normalizeFuelTrackSection('untrusted'),'dashboard');
 assert.equal(fuelTrackHref('dashboard'),'#/boards/'+BOARD+'/fueltrack/dashboard');
 assert.equal(fuelTrackHref('new-request'),'#/boards/'+BOARD+'/fueltrack/new-request');
 const markup=renderFuelTrackV3Application({detail:fixture(),section:'dashboard'});
 assert.equal((markup.match(/class="ft3-app-tab(?: is-active)?"/g)||[]).length,7);
 assert.equal((markup.match(/aria-current="page"/g)||[]).length,1);
 assert.match(markup,/FuelTrack\+/);
 assert.match(markup,/Read-only dashboard/);
});

test('empty database stays empty and never borrows the 271 screenshot requests',()=>{
 const model=fuelTrackDashboardModel(fixture());
 assert.equal(model.count,0);
 assert.equal(model.volume,0);
 assert.deepEqual(model.status,{done:0,approved:0,pending:0,rejected:0,other:0});
 assert.deepEqual(model.recent,[]);
 const html=renderFuelTrackV3Application({detail:fixture()});
 assert.match(html,/No transactions on this board yet/);
 assert.match(html,/Vehicle rankings unavailable/);
 assert.match(html,/Financial ledger not connected/);
 assert.doesNotMatch(html,/41,074\.46|457\.08|271 total requests|257 total/i);
});

test('summary and recents use authorized rows, typed numeric quantities and date values',()=>{
 const d=fixture([item(ITEM_A,'AFA 2382','Done'),item(ITEM_B,'GAN 8289','Rejected')]);
 d.values=[
  {item_id:ITEM_A,column_id:DATE,value:'2026-11-08'},
  {item_id:ITEM_B,column_id:DATE,value:{date:'2026-11-09'}},
  {item_id:ITEM_A,column_id:VOLUME,value:'18.5'},
  {item_id:ITEM_B,column_id:VOLUME,value:{number:2}},
  {item_id:'55555555-5555-4555-8555-555555555555',column_id:VOLUME,value:99999}
 ];
 const model=fuelTrackDashboardModel(d);
 assert.equal(model.count,2);
 assert.equal(model.volume,20.5);
 assert.equal(model.status.done,1);
 assert.equal(model.status.rejected,1);
 assert.equal(model.recent[0].title,'GAN 8289');
 const html=renderFuelTrackV3Application({detail:d});
 assert.match(html,/20\.5 L/);
 assert.match(html,/AFA 2382/);
 assert.match(html,/GAN 8289/);
 assert.doesNotMatch(html,/99999/);
});

test('invalid or incomplete quantities must not produce fabricated aggregate totals',()=>{
 const d=fixture([item(ITEM_A,'One','Working'),item(ITEM_B,'Two','Approved')]);
 d.values=[{item_id:ITEM_A,column_id:VOLUME,value:'8.3'}];
 assert.equal(fuelTrackDashboardModel(d).volume,null);
 d.values.push({item_id:ITEM_B,column_id:VOLUME,value:'not-a-number'});
 assert.equal(fuelTrackDashboardModel(d).volume,null);
 assert.equal(fuelTrackDashboardModel(d).status.pending,1);
 assert.equal(fuelTrackDashboardModel(d).status.approved,1);
});

test('HTML and status from untrusted board records are escaped',()=>{
 const d=fixture([item(ITEM_A,'<img src=x onerror=alert(1)>','<script>')]);
 const html=renderFuelTrackV3Application({detail:d,actorName:'<Admin>'});
 assert.doesNotMatch(html,/<script>|<img src=x|<Admin>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;Admin&gt;/);
});

test('unfinished tabs are navigation-ready without offering unauthorized writes',()=>{
 for(const section of FUELTRACK_TABS.filter(section=>!['dashboard','analytics','requests'].includes(section.key))){
  const html=renderFuelTrackV3Application({detail:fixture(),section:section.key});
  assert.match(html,/not enabled|not yet integrated|will be connected|require|need verified/i);
  assert.doesNotMatch(html,/<form\b|type="submit"/i);
  assert.match(html,/Return to Dashboard/);
 }
});
test('APSYNTRA board routes preserve existing Board items while adding FuelTrack app',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert.match(app,/key:'fueltrack',href:fuelTrackHref\('dashboard'\)/);
 assert.match(app,/renderFuelTrackV3Application\(\{detail:state\.board/);
 assert.match(app,/parts\[2\]==='fueltrack'/);
 assert.match(app,/state\.fuelTrackSection=requested==='fueltrack'/);
 assert.match(app,/boardGrid\(state\.board/);
 assert.match(index,/fueltrack-v3-application\.css/);
});

test('Analytics is rendered by the signed application integration, not fabricated fallback data',async()=>{
 const {renderFuelTrackAnalytics}=await import('../fueltrack-v3-analytics.js');
 const html=renderFuelTrackV3Application({
  detail:fixture(),section:'analytics',analyticsRenderer:renderFuelTrackAnalytics,
  analyticsView:'odometer',analyticsRange:'week',analyticsMetric:'volume'
 });
 assert.match(html,/Odometer Monitoring/);
 assert.match(html,/No verified vehicle rankings/);
 assert.doesNotMatch(html,/NEXT FRONTEND MILESTONE/);
});

test('All Requests is mounted inside the signed FuelTrack application shell',async()=>{
 const {renderFuelTrackRequests}=await import('../fueltrack-v3-requests.js');
 const html=renderFuelTrackV3Application({
  detail:fixture(),section:'requests',
  requestsRenderer:renderFuelTrackRequests,requestsFilters:{status:'done'}
 });
 assert.match(html,/All Requests/);
 assert.match(html,/Request Log/);
 assert.match(html,/ft3-request-filter/);
 assert.doesNotMatch(html,/NEXT FRONTEND MILESTONE/);
 assert.equal((html.match(/class="ft3-app-tab(?: is-active)?"/g)||[]).length,7);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/requestsRenderer:renderFuelTrackRequests/);
 assert.match(app,/fuelTrackRequestReady\(\)/);
 assert.match(app,/case 'ft3-request-expand'/);
 assert.match(app,/db\.allowed\(boardId,'view'\)/);
});
