import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingTracker} from '../material-sourcing-tracker.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';
const base={
 board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'},
 groups:[MATERIAL_SOURCING_GROUP],columns:[],
 values:[],items:[{id:'material-a',board_id:MATERIAL_SOURCING_BOARD_ID,
   group_id:MATERIAL_SOURCING_GROUP.id,title:'PART-A',
   created_at:'2026-11-10T09:30:00Z'}]
};
const render=(options={})=>renderMaterialSourcingTracker(base,{},new Date('2026-11-11T12:00:00Z'),options);
test('reference visual hierarchy is implemented without copying Monday production data',()=>{
 const html=render();
 for(const section of ['mrh-tracker-head','mrh-tracker-identity','mrh-tracker-body',
   'mrh-section-heading','mrh-tracker-stats','mrh-breakdown',
   'mrh-tracker-ratebar','mrh-tracker-viewtabs','mrh-table-panel','mrh-group-row'])
  assert.match(html,new RegExp(section),section);
 for(const label of ['Material Sourcing','Procurement tracking','Key metrics','Total materials',
   'Total buying','Materials by source','All items','Part number','Created',
   'Source Type','RFQ Ref No','Main group','Nov 10, 2026'])
  assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/₱152\.9M|₱64\.89|₱72\.20|ENGINEERING SERVICES|LRD10|Chris Emmanuel/);
});
test('metrics never synthesize financial totals, supplier values or exchange rates',()=>{
 const html=render();
 assert.match(html,/Total buying/);
 assert.match(html,/Restricted/);
 assert.match(html,/Protected financial data/);
 assert.match(html,/1 of 1 loaded/);
 assert.match(html,/Unspecified/);
 assert.match(html,/Main group \(unchanged\)/);
 assert.doesNotMatch(html,/Selling price|Cost by source|USD Rate|EUR Rate/);
});
test('Add Material action only appears when authorized editor option is explicit',()=>{
 assert.doesNotMatch(render(),/data-action="mrh-add-view"/);
 assert.doesNotMatch(render({canCreate:false}),/data-action="mrh-add-view"/);
 assert.match(render({canCreate:true}),/data-action="mrh-add-view"/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/renderMaterialSourcingTracker\(state\.board,state\.mrhTrackerFilters,new Date\(\),\{canCreate:state\.edit===true,view:state\.mrhAddView\?'add':'list'\}\)/);
});
test('part number remains actionable; group and column headings keep table semantics',()=>{
 const html=render();
 assert.match(html,/data-action="board-item-detail" data-id="material-a"/);
 assert.match(html,/scope="rowgroup" colspan="9"/);
 assert.equal((html.match(/scope="col"/g)||[]).length,9);
 assert.match(html,/role="region" aria-label="Horizontally scrollable materials table" tabindex="0"/);
 assert.match(html,/aria-label="Material Tracker views"/);
 assert.match(html,/aria-label="Loaded materials summary"/);
});
test('CSS adapts the procurement workspace and preserves scrollable dense table',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/\.mrh-tracker-body\{/);
 assert.match(css,/\.mrh-breakdown-ring\{/);
 assert.match(css,/\.mrh-group-row th\{/);
 assert.match(css,/\.mrh-tracker-table-scroll\{[^}]*overflow:auto/);
 assert.match(css,/@media\(max-width:780px\)/);
 assert.match(css,/@media\(max-width:420px\)/);
});
