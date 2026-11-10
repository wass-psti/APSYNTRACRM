import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 renderMaterialSourcingPublicOverview,
 renderMaterialSourcingUnavailableDetails
} from '../material-sourcing-detail-tabs.js';
import {renderProtectedSourcingEditor} from '../material-sourcing-application.js';

test('public details always have reference identification and schedule fields',()=>{
 const html=renderMaterialSourcingPublicOverview({
  partNumber:'001',source:'Local',rfq:'RFQ-10',description:'Test part',
  brand:'Brand',quantity:'7',created:'2026-11-11',due:'2026-11-12',lead:'2'
 });
 for(const text of ['Identification','Supplier & Schedule','Part number',
  'Source type','Material description','RFQ Ref No','Quantity',
  'Created','Date required','Leadtime (weeks)','Main group']){
  assert.ok(html.includes(text),text);
 }
 assert.match(html,/2026-11-11/);
});

test('ordinary viewer sees complete detail structure without protected values or controls',()=>{
 const html=renderMaterialSourcingUnavailableDetails();
 for(const label of ['Pricing &amp; Cost','Calculated Totals','Logistics',
  'Buying price','Currency','Shipping cost','Shipping currency',
  'Landed cost','Vendor details','Not available']){
  assert.ok(html.includes(label),label);
 }
 assert.doesNotMatch(html,/data-mrh-private-field|name="value"|SECRET_|role="alert"/);
 assert.match(html,/Public material details remain visible/);
 assert.ok(html.indexOf('Pricing &amp; Cost')<html.indexOf('Calculated Totals'));
 assert.ok(html.indexOf('Calculated Totals')<html.indexOf('Logistics'));
});

test('actual authorized data uses same reference order while retaining edit controls',()=>{
 const html=renderProtectedSourcingEditor({
  'Buying Price':{value:42,revision:1},
  'Currency':{value:'PHP',revision:1},
  'Shipping Cost':{value:3,revision:1}
 },{editing:true});
 assert.ok(html.indexOf('Pricing & Cost')<html.indexOf('Calculated totals'));
 assert.ok(html.indexOf('Calculated totals')<html.indexOf('Logistics'));
 assert.match(html,/data-mrh-private-field/);
 assert.match(html,/Shipping cost/);
});

test('item drawer falls back gracefully without adding authorization checkpoints',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const open=app.slice(app.indexOf('async function openBoardItemDetails('),
  app.indexOf('async function openBoardMembers('));
 assert.match(open,/renderMaterialSourcingUnavailableDetails\(\)/);
 assert.match(open,/readProtectedSourcingItem\(input\)/);
 assert.match(open,/renderMaterialBoardItemTasks/);
 assert.match(open,/renderMaterialSourcingItemActivity/);
 assert.doesNotMatch(open,/new.*authorization.*checkpoint/i);
});
