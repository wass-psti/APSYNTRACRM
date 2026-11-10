import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {materialTrackerPublicCsv,renderMaterialSourcingTracker}
 from '../material-sourcing-tracker.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP}
 from '../material-sourcing-schema-plan.js';
test('public CSV escapes formulas and quoted commas without protected columns',()=>{
 const csv=materialTrackerPublicCsv([{
  partNumber:'=HYPERLINK("https://x","bad")',created:'2026-11-10',
  source:'Local',rfq:'@SUM(A1)',description:'Part, "A"',brand:'-9',
  quantity:'5',due:'2026-12-10',lead:'4'
 }]);
 assert.match(csv,/^"Part number","Created"/);
 assert.match(csv,/"'=HYPERLINK\(""https:\/\/x"",""bad""\)"/);
 assert.match(csv,/"'@SUM\(A1\)"/);
 assert.match(csv,/"'-9"/);
 assert.match(csv,/"Part, ""A"""/);
 assert.match(csv,/\r\n/);
 assert.doesNotMatch(csv,/Buying Price|Vendor|Requester|Supplier|SECRET/);
});
test('working Export CSV is reachable through normal signed app event dispatch',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'mrh-export-csv':\{/);
 assert.match(app,/isMaterialTrackerBoard\(state.board\)/);
 assert.match(app,/filterMaterialTrackerRows\(materialTrackerRows\(state.board\),state.mrhTrackerFilters\)/);
 assert.match(app,/materialTrackerPublicCsv\(rows\)/);
 const detail={board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'},
  groups:[MATERIAL_SOURCING_GROUP],columns:[],values:[],items:[]};
 assert.match(renderMaterialSourcingTracker(detail),/data-action="mrh-export-csv"/);
});
