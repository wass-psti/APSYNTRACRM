import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderNativeMaterialSourcing,nativeColumns} from '../apps/MaterialSourcing/native-screen.js';
import {fixture,workspaceId,id} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
const render=(detail=fixture(),filters={},options={})=>renderNativeMaterialSourcing(detail,filters,new Date('2026-11-27T12:00:00Z'),{workspaceId,canCreate:true,...options});
test('native route uses reconciled UUID records and approved wide-table field order',()=>{
 const html=render();
 assert.match(html,/ms-native-sourcing/);assert.equal(nativeColumns.length,24);
 assert.equal((html.match(/scope="col"/g)||[]).length,24);
 assert.match(html,/data-action="board-item-detail" data-id="33333333-3333-4333-8333-000000000200"/);
 assert.match(html,/Main group/);assert.match(html,/data-ms-col="quantity" data-ms-sort="0"/);
 assert.match(html,/Selling price \(VAT-ex, stored\)/);
 assert.match(html,/Calculation pending/);assert.match(html,/No current FX snapshot/);
 assert.doesNotMatch(html,/64\.45|71\.00|demo-0|Engineering Services/);
});
test('existing filter and public CSV actions remain compatible',()=>{
 const html=render(fixture(),{source:'Import',search:'Synthetic Brand'});
 assert.match(html,/SYNTHETIC-A/);assert.doesNotMatch(html,/SYNTHETIC-B|SYNTHETIC-C/);
 assert.match(html,/1 of 3 loaded/);assert.match(html,/data-action="mrh-export-csv"/);
 assert.match(html,/id="mrh-tracker-search"/);assert.match(html,/id="mrh-tracker-source"/);
 assert.match(html,/id="mrh-tracker-overdue"/);
});
test('partial and wrong-scope projections never imply complete data',()=>{
 const detail=fixture();detail.pagination={has_more:true,total_count:100,next_cursor:'synthetic'};
 assert.match(render(detail),/Partial board page/);assert.match(render(detail),/Loaded items/);
 const html=render(detail,{}, {workspaceId:id(999)});assert.match(html,/data is unavailable/);assert.doesNotMatch(html,/SYNTHETIC/);
});
test('existing Add Material form and viewer behavior are reused',()=>{
 assert.match(render(fixture(),{}, {view:'add'}),/id="mrh-add-material-form"/);
 const viewer=render(fixture(),{}, {view:'add',canCreate:false});
 assert.match(viewer,/material creation is not enabled/);assert.doesNotMatch(viewer,/id="mrh-add-material-form"/);
});
test('ordinary markup never trusts injected protected cells or renders arbitrary HTML',()=>{
 const detail=fixture();detail.items[0].title='<img src=x onerror=alert(1)>';
 detail.values.push({item_id:detail.items[0].id,column_id:id(999),value:'PROTECTED_LEAK_TEST'});
 const html=render(detail);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|PROTECTED_LEAK_TEST/);
 assert.match(html,/data-ms-commercial="buyingPrice"[^>]*>—/);
});
test('production entry connects native screen and keeps existing route and handlers',()=>{
 const app=readFileSync('frontend/app.js','utf8'),index=readFileSync('index.html','utf8');
 assert.match(app,/renderNativeMaterialSourcing\(detail,filters,now,\{\.\.\.options,workspaceId\}\)/);
 assert.match(app,/case 'mrh-native-commercial':[\s\S]*?loadNativeCommercialRow\(button,\{api:db,auth,/);
 assert.match(app,/case 'mrh-native-sort'/);
 assert.match(app,/parts\[2\]==='sourcing'&&parts\[1\]===MATERIAL_SOURCING_BOARD_ID/);
 assert.match(app,/createMaterialSourcingAtomic\(/);assert.match(app,/readMaterialBoardItemTasks\(/);
 assert.equal((index.match(/<link rel="stylesheet"/g)||[]).length,1);
 assert.match(app,/ensureNativeMaterialSourcingStyles\(document\)/);
 assert.match(index,/frontend\/app\.js\?v=[^"]*cp-ms-crm-03/);
});
