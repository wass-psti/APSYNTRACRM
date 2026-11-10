import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingTracker,materialTrackerRows,filterMaterialTrackerRows,isMaterialTrackerBoard} from '../material-sourcing-tracker.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';
const board={id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'};
const cols=[
 ['Quantity','number','domain:qty'],['Source Type','dropdown','custom:source'],
 ['Brand','text','custom:brand'],['Material description','long_text','custom:description'],
 ['RFQ Ref No','text','custom:rfq'],['Date required','date','custom:due'],
 ['Buying Price','number','custom:private']
].map(([name,data_type,column_key],i)=>({id:'column'+i,name,data_type,column_key,visible:true,system_key:null}));
const items=[{id:'part-1',title:'LRD10',group_id:MATERIAL_SOURCING_GROUP.id},
 {id:'part-2',title:'SIEMENS',group_id:MATERIAL_SOURCING_GROUP.id},
 {id:'part-3',title:'OTHER',group_id:'another-group'},
 {id:'part-4',title:'ARCHIVED',group_id:MATERIAL_SOURCING_GROUP.id,archived_at:'2026-10-01'}];
const value=(item,column,value)=>({item_id:item,column_id:cols.find(c=>c.name===column).id,value});
const detail={board,groups:[MATERIAL_SOURCING_GROUP],columns:cols,items,
 values:[value('part-1','Quantity',5),value('part-1','Source Type','Local'),
 value('part-1','Brand','Schneider Electric'),value('part-1','Date required','2026-11-01'),
 value('part-1','Material description','Thermal relay'),
 value('part-1','Buying Price','SECRET_FINANCIAL_900'),
 value('part-2','Source Type','Import'),value('part-2','Brand','Siemens'),
 value('part-2','Date required','2026-12-01')]};
const today=new Date('2026-11-10T12:00:00');
test('tracker exact original group identity and no demo records',()=>{
 assert.equal(isMaterialTrackerBoard(detail),true);
 assert.equal(isMaterialTrackerBoard({...detail,groups:[{...MATERIAL_SOURCING_GROUP,title:'Engineering Services'}]}),false);
 assert.equal(materialTrackerRows(detail,{today}).length,2);
 assert.equal(renderMaterialSourcingTracker({...detail,groups:[]}),'<section class="panel" role="alert">Material Tracker cannot verify the original Main group. No records displayed.</section>');
});
test('public-only source and overdue filters are derived from signed board values',()=>{
 const rows=materialTrackerRows(detail,{today});
 assert.equal(rows[0].overdue,true);
 assert.equal(rows[1].overdue,false);
 assert.equal(filterMaterialTrackerRows(rows,{source:'Local',overdue:true}).length,1);
 assert.equal(filterMaterialTrackerRows(rows,{source:'Import',overdue:true}).length,0);
 assert.equal(filterMaterialTrackerRows(rows,{search:'relay'}).length,1);
 assert.equal(filterMaterialTrackerRows(rows,{search:'siemens'}).length,1);
 assert.equal(filterMaterialTrackerRows(rows,{source:'random'}).length,2);
});
test('sensitive prices, supplier and requester values never enter rendered markup',()=>{
 const html=renderMaterialSourcingTracker(detail,{},today);
 assert.match(html,/Material Tracker/);
 assert.match(html,/LRD10/);
 assert.match(html,/Overdue/);
 assert.match(html,/Schneider Electric/);
 assert.doesNotMatch(html,/SECRET_FINANCIAL_900|Buying Price|Selling Price|Vendor Details|Requestor/);
 assert.match(html,/data-action="board-item-detail"/);
 assert.match(html,/role="region" aria-label="Horizontally scrollable materials table"/);
 assert.match(html,/Main group \(unchanged\)/);
});
test('malicious item or field content is HTML-escaped',()=>{
 const attacked={...detail,items:[{...items[0],title:'<img src=x onerror=alert(1)>'}],
 values:[value('part-1','Brand','<script>evil</script>')]};
 const html=renderMaterialSourcingTracker(attacked,{},today);
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
});
test('empty verified board and partial paging avoid fabricated metric assertions',()=>{
 const empty={...detail,items:[],values:[]};
 const html=renderMaterialSourcingTracker(empty,{},today);
 assert.match(html,/Total materials<\/span><strong>0/);
 assert.match(html,/No matching materials/);
 assert.doesNotMatch(html,/LRD10/);
 const partial=renderMaterialSourcingTracker({...detail,has_more:true},{},today);
 assert.match(partial,/Partial board page/);
});
test('tracker is its own explicit signed board route, scoped to this board',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/parts\[2\]==='sourcing'&&parts\[1\]===MATERIAL_SOURCING_BOARD_ID/);
 assert.match(app,/key:'sourcing',href:'#\/boards\/'/);
 assert.match(app,/renderMaterialSourcingTracker\(state\.board,state\.mrhTrackerFilters\)/);
 assert.match(app,/state\.mrhTrackerScope!==mrhScope/);
 assert.doesNotMatch(app,/materialTrackerRows\(.*localStorage/);
});
