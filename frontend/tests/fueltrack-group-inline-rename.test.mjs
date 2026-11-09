import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fuelTrackGroupDisplay} from '../board-grid.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('function groupHeading(group,count){');
const end=source.indexOf('\nfunction row01AcceptancePanel(',begin);
const heading=source.slice(begin,end);

test('FuelTrack reference label is display-only; inline edit uses persisted group title',()=>{
 assert.ok(begin>=0&&end>begin,'groupHeading source must exist');
 assert.match(heading,/const title=e\(group\.title\|\|'Group'\)/);
 assert.match(heading,/const displayTitle=e\(fuelTrackGroupDisplay\(state\.board\?\.board,group\)\.title\|\|'Group'\)/);
 assert.match(heading,/if\(editing\)return[\s\S]*?value="'\+title\+'/);
 assert.match(heading,/return '<div class="group-heading"[\s\S]*?<h3>'\+displayTitle\+'/);
 assert.match(source,/groupHeading\(g,groupedItems\.get\(g\.id\)\?\.length\|\|0\)/);
 assert.doesNotMatch(source,/groupHeading\(fuelTrackGroupDisplay\(b,g\)/);
});

test('FuelTrack label projection never changes the authoritative group object',()=>{
 const board={id:'7af78b3f-67bf-4600-9aa1-9006d19d486e',name:'FuelTrack+ v3',
  description:'[APSYNTRA:MODULE:fueltrack:v1] Fuel operations and reconciliation records.'};
 const persisted={id:'180e7ed3-08e8-451a-bc46-fd5b9e54e366',title:'Main group',
  updated_at:'2026-11-09T00:00:00Z'};
 assert.equal(fuelTrackGroupDisplay(board,persisted).title,'Group Title');
 assert.equal(persisted.title,'Main group');
 const renamed={...persisted,title:'January deliveries'};
 assert.equal(fuelTrackGroupDisplay(board,renamed),renamed);
});

test('inline rename retains signed editing checks and authoritative server update',()=>{
 const start=source.indexOf("case 'group-inline-edit':{");
 const end=source.indexOf("case 'group-inline-cancel':",start);
 const openHandler=source.slice(start,end);
 assert.match(openHandler,/state\.edit/);
 assert.match(openHandler,/state\.groupEditId=groupId/);
 assert.match(openHandler,/render\(\)/);
 assert.doesNotMatch(openHandler,/await\s+db\.allowed/,
  'opening the editor must not await a second authorization RPC after menu dismissal');
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?db\.allowed\(boardId,'edit'\)/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?auth\.getVerifiedUser\(\),fresh=await db\.board\(boardId\)/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?original\.updated_at!==group\.updated_at/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?db\.updateGroup\(id,title\)/);
});

test('group action opens an inline editor on the same user gesture',async()=>{
 const begin=source.indexOf("case 'group-inline-edit':{");
 const end=source.indexOf("case 'group-inline-cancel':",begin);
 assert.ok(begin>=0&&end>begin);
 const caseSource=source.slice(begin,end);
 const actionBody=caseSource.slice(caseSource.indexOf('{')+1,caseSource.lastIndexOf('}'));
 const open=new Function('state','button','activeBoardLayout','render','root',
  'return (async()=>{'+actionBody+'})()');
 const groupId='180e7ed3-08e8-451a-bc46-fd5b9e54e366';
 const editor={focused:false,selected:false,focus(){this.focused=true;},
  select(){this.selected=true;}};
 const renderEvents=[];
 const root={querySelector:selector=>{
  assert.equal(selector,'[data-group-inline-form="'+groupId+'"] input');
  return editor;
 }};
 const state={edit:true,groupEditBusy:false,groupEditId:null,
  board:{groups:[{id:groupId,title:'Main group'}]}};
 const promise=open(state,{dataset:{id:groupId}},()=>true,
  ()=>renderEvents.push(state.groupEditId),root);
 assert.equal(state.groupEditId,groupId,'editor opens synchronously, without waiting for I/O');
 assert.deepEqual(renderEvents,[groupId]);
 assert.equal(editor.focused,true);
 assert.equal(editor.selected,true);
 await promise;
});

test('viewer and invalid group cannot enter the inline editor',async()=>{
 const begin=source.indexOf("case 'group-inline-edit':{");
 const end=source.indexOf("case 'group-inline-cancel':",begin);
 const caseSource=source.slice(begin,end);
 const actionBody=caseSource.slice(caseSource.indexOf('{')+1,caseSource.lastIndexOf('}'));
 const open=new Function('state','button','activeBoardLayout','render','root',
  'return (async()=>{'+actionBody+'})()');
 const groupId='180e7ed3-08e8-451a-bc46-fd5b9e54e366';
 const root={querySelector(){throw Error('Editor must not be mounted');}};
 for(const state of [
  {edit:false,groupEditBusy:false,board:{groups:[{id:groupId}]}},
  {edit:true,groupEditBusy:false,board:{groups:[]}},
  {edit:true,groupEditBusy:true,board:{groups:[{id:groupId}]}}
 ]){
  await open(state,{dataset:{id:groupId}},()=>true,()=>{throw Error('Must not render');},root);
  assert.equal(state.groupEditId,undefined);
 }
});
