import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardGrid,prepareBoardGrid} from '../board-grid.js';

const detail={
 board:{id:'board-a',name:'FuelTrans Standalone'},
 columns:[
  {id:'public-col',name:'Transaction Ref',visible:true,system_key:null},
  {id:'restricted-col',name:'Driver identity',visible:true,system_key:null}
 ],
 items:[
  {id:'item-1',title:'<Dispatch A>',group_id:'group-a',status:'done'},
  {id:'item-2',title:'Dispatch B',group_id:'group-b',status:'in_progress'}
 ],
 values:[
  {item_id:'item-1',column_id:'public-col',value:'REF-001'},
  {item_id:'item-2',column_id:'public-col',value:'REF-002'},
  {item_id:'item-1',column_id:'restricted-col',value:'PRIVATE VALUE'}
 ]
};

test('render-local prepared data preserves each group HTML exactly',()=>{
 const prepared=prepareBoardGrid(detail);
 for(const groupId of ['group-a','group-b','group-missing']){
  const options={groupId,selection:{enabled:true,selected:new Set(['item-1'])}};
  assert.equal(boardGrid(detail,{...options,prepared}),boardGrid(detail,options));
 }
 assert.equal(prepared.lookup.size,3);
});

test('prepared view never exposes restricted fields or raw HTML',()=>{
 const html=boardGrid(detail,{groupId:'group-a',prepared:prepareBoardGrid(detail)});
 assert.match(html,/REF-001/);
 assert.match(html,/&lt;Dispatch A&gt;/);
 assert.doesNotMatch(html,/PRIVATE VALUE|restricted-col|Driver identity/);
 assert.doesNotMatch(html,/<Dispatch A>/);
});

test('fresh render preparation reflects updated values without cross-render caching',()=>{
 const first=prepareBoardGrid(detail);
 const updated={...detail,values:detail.values.map(value=>value.column_id==='public-col'?
  {...value,value:'NEW-REFERENCE'}:value)};
 const next=prepareBoardGrid(updated);
 assert.notEqual(next.lookup,first.lookup);
 assert.match(boardGrid(updated,{groupId:'group-a',prepared:next}),/NEW-REFERENCE/);
 assert.doesNotMatch(boardGrid(updated,{groupId:'group-a',prepared:next}),/REF-001/);
});

test('board page shares one prepared lookup without changing signed UI shell',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const board=app.slice(app.indexOf('function boardPage(){'),app.indexOf('function settingsPage(){'));
 assert.match(board,/const preparedGrid=moduleKey&&state\.tab==='items'\?/);
 assert.match(board,/prepareBoardGrid\(state\.board,\{primaryTitle,columnLabels,allowCustom\}\)/);
 assert.equal((board.match(/prepared:preparedGrid/g)||[]).length,2);
 assert.match(app,/function shell\(body\)\{/);
 assert.match(app,/void mountSignedTimeTrackerMaps\(\);\s*\}/);
});

test('partitioned group rows preserve exact group presentation and ordering',()=>{
 const prepared=prepareBoardGrid(detail);
 for(const groupId of ['group-a','group-b','group-missing']){
  const groupItems=detail.items.filter(item=>item.group_id===groupId);
  assert.equal(
   boardGrid(detail,{groupId,prepared,groupItems}),
   boardGrid(detail,{groupId,prepared})
  );
 }
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const groupedItems=new Map\(groups\.map\(group=>\[group\.id,\[\]\]\)\)/);
 assert.match(app,/if\(state\.tab==='items'\)for\(const item of items\)/);
 assert.match(app,/groupItems:groupedItems\.get\(g\.id\)\|\|\[\]/);
 assert.match(app,/ungroupedItems\.length\?/);
});
