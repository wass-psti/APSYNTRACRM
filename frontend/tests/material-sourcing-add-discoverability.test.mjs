import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingTracker} from '../material-sourcing-tracker.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from '../material-sourcing-schema-plan.js';
const detail={board:{id:MATERIAL_SOURCING_BOARD_ID,name:'Material Request Hub',status:'active'},
 groups:[MATERIAL_SOURCING_GROUP],columns:[],values:[],items:[]};
test('signed read-only board viewers see a visible Add Material tab',()=>{
 const overview=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:false,view:'list'});
 assert.match(overview,/data-action="mrh-add-view"/);
 const tab=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:false,view:'add'});
 assert.match(tab,/aria-current="page">Add Material/);
 assert.match(tab,/current board permissions/);
 assert.match(tab,/data-action="mrh-show-items"/);
 assert.doesNotMatch(tab,/id="mrh-add-material-form"/);
});
test('authorized editors can still access and submit the existing atomic material form',()=>{
 const html=renderMaterialSourcingTracker(detail,{},new Date(),{canCreate:true,view:'add'});
 assert.match(html,/id="mrh-add-material-form"/);
 assert.match(html,/data-mrh-add-submit/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'mrh-add-view'/);
 assert.doesNotMatch(app,/if\(name==='mrh-add-view'&&!state.edit\)break/);
 assert.match(app,/const created=await createMaterialSourcingAtomic\(/);
 assert.match(app,/state.mrhAddView&&state.edit&&auth.isSignedIn/);
});
test('read-only UI change never modifies the production write contract',()=>{
 const source=readFileSync(new URL('../material-sourcing-atomic-create.js',import.meta.url),'utf8');
 assert.match(source,/authorizeMaterialSourcingItem\(\{\.\.\.scope,edit:true\}\)/);
 assert.match(source,/mrh_create_material_atomic/);
 assert.match(source,/MATERIAL_SOURCING_GROUP/);
});
