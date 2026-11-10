import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingPublicOverview,renderMaterialSourcingDetailTabs} from '../material-sourcing-detail-tabs.js';
import {renderProtectedSourcingEditor} from '../material-sourcing-application.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('reference-like drawer groups verified public values, not fake financial figures',()=>{
 const html=renderMaterialSourcingPublicOverview({
  partNumber:'001',source:'Local',description:'A real item',rfq:'RFQ-14',
  brand:'Example brand',quantity:'2',due:'2026-11-13',lead:'3'
 },{groupTitle:'Main group'});
 for(const name of ['Identification','Supplier & Schedule','Source type','Part number',
  'RFQ Ref No','Material description','Brand','Quantity','Date required','Leadtime (weeks)','Main group'])
  assert.ok(html.includes(name),name);
 assert.match(html,/mrh-detail-source local/);
 assert.doesNotMatch(html,/Buying Price|Landed Cost|P152|Exchange Rate/);
 const wrapper=renderMaterialSourcingDetailTabs(html);
 for(const name of ['data-mrh-detail-panel="details"','data-mrh-detail-panel="tasks"','data-mrh-detail-panel="activity"'])
  assert.ok(wrapper.includes(name));
});
test('untrusted sourcing data is escaped in the drawer',()=>{
 const html=renderMaterialSourcingPublicOverview({
  partNumber:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>',
  brand:'" onfocus=alert(2)'
 });
 assert.doesNotMatch(html,/<script>|<img|onfocus="/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
});
test('protected fields default read-only with explicit edit control',()=>{
 const record={'Buying Price':{value:1005,revision:1},'Currency':{value:'PHP',revision:1},
  'Vendor Details':{value:'Supplier',revision:1}};
 const view=renderProtectedSourcingEditor(record);
 assert.match(view,/Pricing &amp; Cost|Pricing & Cost/);
 assert.match(view,/Supplier details/);
 assert.match(view,/Calculated totals/);
 assert.doesNotMatch(view,/data-mrh-private-field/);
 assert.match(view,/Not calculated/);
 const edit=renderProtectedSourcingEditor(record,{editing:true});
 assert.match(edit,/data-mrh-private-field="Buying Price"/);
 assert.match(edit,/data-mrh-private-field="Vendor Details"/);
 assert.doesNotMatch(edit,/data-mrh-private-field="Landed Cost"/);
});
test('scoped slide-over retains signed Tasks, Activity, protected CAS writes',()=>{
 const section=app.slice(app.indexOf('async function openBoardItemDetails('),
  app.indexOf('async function openBoardMembers('));
 assert.match(section,/mrh-detail-drawer/);
 assert.match(section,/mrh-detail-scroll/);
 assert.match(section,/mrh-detail-footer/);
 assert.match(section,/renderMaterialSourcingPublicOverview/);
 assert.match(section,/materialTrackerRows\(state\.board\)/);
 assert.match(section,/data-mrh-editor-toggle/);
 assert.match(section,/readMaterialBoardItemTasks\(input\)/);
 assert.match(section,/saveMaterialBoardItemTask\(input/);
 assert.match(section,/materialSourcingItemAuditRows\(rows,itemId\)/);
 assert.match(section,/readProtectedSourcingItem\(input\)/);
 assert.match(section,/writeProtectedSourcingField\(/);
});
test('drawer uses independent scroll, sticky tabs/footer, and mobile layout',()=>{
 assert.match(css,/\.mrh-detail-drawer\{/);
 assert.match(css,/\.mrh-detail-scroll\{[^}]*overflow-y:auto/s);
 assert.match(css,/\.mrh-detail-drawer \.mrh-detail-tabs\{[^}]*position:sticky/s);
 assert.match(css,/\.mrh-detail-footer\{/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
