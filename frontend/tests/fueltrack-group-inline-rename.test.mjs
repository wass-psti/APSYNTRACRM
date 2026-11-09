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
 assert.match(source,/case 'group-inline-edit':[\s\S]*?db\.allowed\(state\.boardId,'edit'\)/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?auth\.getVerifiedUser\(\),fresh=await db\.board\(boardId\)/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?original\.updated_at!==group\.updated_at/);
 assert.match(source,/async function saveGroupInline\(form\)[\s\S]*?db\.updateGroup\(id,title\)/);
});
