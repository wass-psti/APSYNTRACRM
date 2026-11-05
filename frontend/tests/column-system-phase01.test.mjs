import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_STANDARD_COLUMN_CATALOG,SUPPORTED_COLUMN_TYPE_IDS,
 searchStandardColumns,findStandardColumnType,resolveColumnTypeSelection,
 renderColumnTypeOptions,renderColumnCenterCards} from '../board-column-catalog.js';
import {parseChoiceConfig} from '../board-structure-admin.js';
import {BOARD_STRUCTURE_TYPES,renderBoardStructureAdmin} from '../board-structure-admin.js';
import {detectMondayCheckboxMarkers,mondayCheckboxCell} from '../monday-import-compat.js';
import {buildImportPlan} from '../board-import-core.js';

const bid='11111111-1111-4111-8111-111111111111';
const wid='22222222-2222-4222-8222-222222222222';
const group='33333333-3333-4333-8333-333333333333';
const now='2026-11-05T07:00:00Z';
const detail={board:{id:bid,workspace_id:wid,name:'Contacts',status:'active',updated_at:now},
 columns:[],groups:[{id:group,title:'New import'}],items:[],values:[]};
const destination={action:'existing',groupId:group};

test('only eleven server-supported standard columns appear in searchable Column Center',()=>{
 const actual=new Set(BOARD_STANDARD_COLUMN_CATALOG.map(x=>x.type));
 assert.equal(actual.size,11);
 assert.deepEqual([...actual].sort(),[...BOARD_STRUCTURE_TYPES].sort());
 assert.deepEqual([...actual].sort(),[...SUPPORTED_COLUMN_TYPE_IDS].sort());
 const html=renderColumnCenterCards();
 const select=renderColumnTypeOptions();
 for(const type of actual){
  assert.match(html,new RegExp('data-column-type="'+type+'"'));
  assert.match(select,new RegExp('value="'+type+'"'));
 }
 assert.doesNotMatch(html,/AI-powered|Marketplace apps|monday Doc/i);
 assert.doesNotMatch(select,/AI-powered|Marketplace apps|monday Doc/i);
});
test('column search uses descriptions, categories and priority as a Status keyword only',()=>{
 assert.deepEqual(searchStandardColumns('priority').map(x=>x.type),['status']);
 assert.deepEqual(searchStandardColumns('email').map(x=>x.type),['email']);
 assert.deepEqual(searchStandardColumns('Super useful').map(x=>x.type),
  ['timeline','email','url']);
 assert.deepEqual(searchStandardColumns('No such operational type'),[]);
 assert.equal(findStandardColumnType('phone'),null);
});
test('authorized board structure exposes searchable type cards without changing Item-only default',()=>{
 const settings={status:'VERIFIED_READ',schemaMode:'item_only_v1',boardId:bid,
  revision:0,primaryLabel:'Item',tabs:[{key:'items',label:'Board items',visible:true}],
  columnLabels:{},hiddenVirtual:[],columnOrder:[]};
 const html=renderBoardStructureAdmin(detail,settings,{canManage:true,
  availableTabs:[{key:'items',title:'Board items'}]});
 assert.match(html,/structure-new-type/);
 assert.match(html,/structure-column-search/);
 assert.match(html,/data-column-type="status"/);
 assert.match(html,/data-structure-choice-options hidden/);
 assert.match(html,/value="status"/);
 assert.match(html,/name="primaryLabel"/);
 assert.doesNotMatch(html,/data-column-type="formula"/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const syncColumnPicker=/);
 assert.match(app,/data-column-catalog-search/);
 assert.match(app,/data-column-type/);
});
test('Priority is a functioning configured Status preset, never a fake backend type',()=>{
 const preset=resolveColumnTypeSelection('priority_preset');
 assert.equal(preset.type,'status');
 assert.equal(preset.preset,'priority');
 const labels=parseChoiceConfig(preset.type,preset.options).options;
 assert.deepEqual(labels,['Critical','High','Medium','Low']);
 assert.match(renderColumnCenterCards(),/data-column-type="priority_preset"/);
 assert.match(renderColumnTypeOptions(),/value="priority_preset"/);
 assert.equal(findStandardColumnType('priority_preset'),null);
 assert.throws(()=>resolveColumnTypeSelection('fake_remote_ai'),/Unsupported/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/resolveColumnTypeSelection\(String\(fd\.get\('type'\)/);
 assert.match(app,/if\(select\.value==='priority_preset'\)/);
});
test('monday Checkbox text marker v with blanks is an explicit boolean convention',()=>{
 const sheet={headers:['Name','Checkbox'],rows:[['A','v'],['B',''],['C','V']]};
 assert.equal(detectMondayCheckboxMarkers(sheet,'Checkbox'),true);
 assert.equal(mondayCheckboxCell('v'),true);
 assert.equal(mondayCheckboxCell(' V '),true);
 assert.equal(mondayCheckboxCell(''),false);
 assert.throws(()=>mondayCheckboxCell('yes'),/Expected monday.com/);
 assert.equal(detectMondayCheckboxMarkers({...sheet,rows:[['A','yes'],['B','']]},'Checkbox'),false);
 assert.equal(detectMondayCheckboxMarkers({...sheet,rows:[['A','v'],['B','yes']]},'Checkbox'),false);
});
test('monday checkbox conversion preserves checked and unchecked across typed planned rows',()=>{
 const sheet={headers:['Name','Checkbox'],rows:[['A','v'],['B',''],['C','V']]};
 const mappings=[{source:'Name',action:'item'},
  {source:'Checkbox',action:'create',type:'checkbox',
   name:'Checkbox',columnType:'checkbox'}];
 const plan=buildImportPlan({sheet,detail,mappings,group:destination,allowColumns:true});
 assert.deepEqual(plan.payload.rows.map(r=>r.values.Checkbox),[true,false,true]);
 assert.equal(plan.payload.newColumns[0].type,'checkbox');
});
test('generic blank checkbox does not silently convert into false',()=>{
 const sheet={headers:['Name','Checkbox'],rows:[['A','yes'],['B',''],['C','no']]};
 const mappings=[{source:'Name',action:'item'},
  {source:'Checkbox',action:'create',type:'checkbox',
   name:'Checkbox',columnType:'checkbox'}];
 const plan=buildImportPlan({sheet,detail,mappings,group:destination,allowColumns:true});
 assert.deepEqual(plan.payload.rows.map(r=>r.values.Checkbox),[true,undefined,false]);
});
