import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {moveTabInOrder,reorderManagedTimeTrackerTabs} from '../board-tab-order.js';
import {publicBoardDescription} from '../board-public-copy.js';
import {boardGrid} from '../board-grid.js';
import {renderGroupAddRow} from '../board-inline-items.js';
import {MANAGED_TT_GROUP_DELETE_ENABLED} from '../managed-time-tracker-groups.js';

const BID='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
const WID='11111111-1111-4111-8111-111111111111';
const UID='22222222-2222-4222-8222-222222222222';
const board={id:BID,workspace_id:WID,status:'active',name:'TimeTracker Attendance',
 description:'[APSYNTRA:MODULE:timetracker:v1] Attendance summaries under restricted domain authorization.'};
const context={user_id:UID,workspace_id:WID};
const tabs=[
 {key:'items',label:'My work',visible:true},
 {key:'issues',label:'Issues',visible:true},
 {key:'attendance',label:'Attendance',visible:true}
];
const settings={status:'VERIFIED_READ',boardId:BID,revision:7,primaryLabel:'Record',
 schemaMode:'legacy',hiddenVirtual:[],columnOrder:[],columnLabels:{},tabs};
function harness({manager=true,revision=7,foreign=false,actor=UID,readTabs=tabs}={}){
 const calls=[];
 const auth={userId:UID,async getVerifiedUser(){calls.push('actor');return {id:actor};}};
 const api={async allowed(id,mode){calls.push('allowed');
  assert.equal(id,BID);assert.equal(mode,'manage');return manager;}};
 const structure={
  async read(id){calls.push('read');assert.equal(id,BID);
   return {...settings,revision,tabs:readTabs};},
  async save(detail,updated){calls.push('save');
   assert.equal(detail.board.id,BID);
   return {...updated,revision:revision+1};
  }
 };
 return {calls,auth,api,structure,board,
  context:foreign?{...context,workspace_id:'33333333-3333-4333-8333-333333333333'}:context,
  settings,from:'attendance',to:'items'};
}

test('tab drag and arrow movement put selected tab at correct target position',()=>{
 assert.deepEqual(moveTabInOrder(['items','issues','attendance'],'attendance','items'),
  ['attendance','items','issues']);
 assert.deepEqual(moveTabInOrder(['items','issues','attendance'],'items','issues'),
  ['issues','items','attendance']);
 assert.deepEqual(moveTabInOrder(['items','issues','attendance'],'items','attendance'),
  ['issues','attendance','items']);
 assert.deepEqual(moveTabInOrder(['items','issues'],'items','other'),['items','issues']);
});

test('authorized TimeTracker manager saves authoritative tab order without changing identities',async()=>{
 const h=harness();
 const saved=await reorderManagedTimeTrackerTabs(h);
 assert.deepEqual(saved.tabs.map(t=>t.key),['attendance','items','issues']);
 assert.deepEqual(saved.tabs.map(t=>t.label),['Attendance','My work','Issues']);
 assert.deepEqual(h.calls,['actor','allowed','read','save']);
 assert.equal(saved.revision,8);
 assert.equal(saved.primaryLabel,'Record');
});

test('fresh unconfigured board can reorder including attendance and preserve permanent items tab',async()=>{
 const h=harness({revision:0,readTabs:[]});
 h.settings={...h.settings,revision:0,tabs:[]};
 const result=await reorderManagedTimeTrackerTabs(h);
 assert.deepEqual(result.tabs.map(t=>t.key),['attendance','items','issues']);
 assert.equal(result.tabs.find(t=>t.key==='items').visible,true);
 assert.equal(result.revision,1);
});

test('only signed manager in the same workspace can reorder; denials cause zero writes',async()=>{
 for(const override of [
  {manager:false},{foreign:true},{actor:'44444444-4444-4444-8444-444444444444'},
  {revision:8}
 ]){
  const h=harness(override);
  await assert.rejects(()=>reorderManagedTimeTrackerTabs(h),ApiError);
  assert.equal(h.calls.includes('save'),false);
 }
 const h=harness();h.board={...board,name:'Contacts'};
 await assert.rejects(()=>reorderManagedTimeTrackerTabs(h),ApiError);
 assert.deepEqual(h.calls,[]);
});

test('invalid target and concurrent board revision cannot silently overwrite settings',async()=>{
 const h=harness();h.from='attendance';h.to='finance';
 await assert.rejects(()=>reorderManagedTimeTrackerTabs(h),/distinct available views/);
 assert.equal(h.calls.includes('save'),false);
 const changed=harness({revision:9});
 await assert.rejects(()=>reorderManagedTimeTrackerTabs(changed),/order changed/);
 assert.equal(changed.calls.includes('save'),false);
});

test('custom view labels and hidden view visibility survive reordering',async()=>{
 const custom=[
  {key:'items',label:'Items',visible:true},
  {key:'issues',label:'Hidden issues',visible:false},
  {key:'attendance',label:'Clock',visible:true}
 ];
 const h=harness({readTabs:custom});h.settings={...h.settings,tabs:custom};
 const saved=await reorderManagedTimeTrackerTabs(h);
 assert.deepEqual(saved.tabs.map(t=>t.key),['attendance','items','issues']);
 assert.equal(saved.tabs.find(t=>t.key==='issues').visible,false);
 assert.equal(saved.tabs.find(t=>t.key==='attendance').label,'Clock');
});

test('technical application descriptions are replaced only for display',()=>{
 assert.equal(publicBoardDescription(board),'View attendance activity and team updates.');
 assert.equal(board.description.startsWith('[APSYNTRA:MODULE:'),true);
 assert.equal(publicBoardDescription({name:'Contacts',description:'Sales contacts'}),'Sales contacts');
 assert.equal(publicBoardDescription({name:'Contacts',description:'<b>Example</b>'}),'<b>Example</b>');
 assert.equal(publicBoardDescription({name:'Materials',description:'[APSYNTRA:MODULE:materials:v1] Technical details'}),
  'Organize and track work in this board.');
});

test('managed board grid removes developer explanations and retains required columns',()=>{
 const detail={board,items:[],values:[],columns:[]};
 const html=boardGrid(detail,{groupId:'77777777-7777-4777-8777-777777777777'});
 assert.doesNotMatch(html,/Operational records will appear here|corresponding APSYNTRA domain|authorized backend/);
 assert.match(html,/No items in this group yet/);
 assert.match(html,/Status/);
 assert.match(html,/Record/);
 assert.equal(renderGroupAddRow({groupId:BID,domain:true}), '');
});

test('group removal is reversible and permanent production deletion remains approval-gated',()=>{
 assert.equal(MANAGED_TT_GROUP_DELETE_ENABLED,false);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/Remove empty group from view \(reversible\)/);
 assert.match(app,/Permanent deletion — approval required/);
 assert.match(app,/data-action="group-hide-empty"/);
 assert.match(app,/case 'group-hide-empty'/);
 assert.match(app,/case 'group-show-hidden'/);
 assert.match(app,/MANAGED_TT_GROUP_DELETE_ENABLED&&state\.boardManage/);
 assert.match(app,/deleteEmptyManagedTimeTrackerGroup\(/);
 assert.match(app,/canSafelyHideEmptyTimeTrackerGroup\(/);
});

test('tab ordering is server-authoritative for TimeTracker only; other board routes retain layout',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/applyBoardViewSettings\(moduleKey==='timetracker'\?tabSpecs:/);
 assert.match(app,/reorderManagedTimeTrackerTabs\(/);
 assert.match(app,/boardStructureClient/);
 assert.match(app,/state\.boardUi=saved/);
 assert.match(app,/state\.boardManage/);
 assert.match(app,/board-tab-move/);
 assert.match(app,/draggable="'\+\(canReorderTabs/);
 assert.match(app,/kind==='tab'&&isManagedTimeTrackerBoard/);
 assert.match(app,/state\.boardUi\?\.status!=='VERIFIED_READ'/);
 assert.match(app,/state\.tabMoveBusy/);
 assert.match(app,/publicBoardDescription\(b\)/);
 assert.match(app,/publicBoardDescription\(board\)/);
 const grid=readFileSync('frontend/board-grid.js','utf8');
 const inline=readFileSync('frontend/board-inline-items.js','utf8');
 assert.doesNotMatch(grid,/Operational records will appear here/);
 assert.doesNotMatch(inline,/Application-managed records are created through their authorized module workflow/);
});
