import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMaterialSourcingDetailTabs,selectMaterialSourcingDetailTab,
 materialSourcingItemAuditRows,renderMaterialSourcingItemActivity,
 renderMaterialSourcingTasksUnavailable} from '../material-sourcing-detail-tabs.js';
const id='33333333-3333-4333-8333-333333333333';
const foreign='44444444-4444-4444-8444-444444444444';
const app=()=>readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('details, tasks, activity tabs are semantic and private details remain isolated',()=>{
 const html=renderMaterialSourcingDetailTabs('<dl><div>Verified summary</div></dl>');
 assert.match(html,/role="tablist"/);
 assert.match(html,/data-mrh-detail-tab="details"/);
 assert.match(html,/data-mrh-detail-tab="tasks"/);
 assert.match(html,/data-mrh-detail-tab="activity"/);
 assert.match(html,/data-mrh-private-host/);
 assert.match(html,/Verified summary/);
 assert.match(html,/data-mrh-detail-panel="activity" hidden/);
 assert.match(html,/Select Tasks to load this item’s current task list./);
 assert.doesNotMatch(html,/data-action="create-task"|data-action="delete-task"/);
});
test('legacy task model cannot be presented as persisted board item tasks',()=>{
 const html=renderMaterialSourcingTasksUnavailable();
 assert.match(html,/Select Tasks to load this item’s current task list/);
 assert.doesNotMatch(html,/not activated|No verified mapping/);
 assert.doesNotMatch(html,/Task added|Task created successfully/);
});
test('audit is strict item-scoped; strips private values, messages and actors',()=>{
 const rows=materialSourcingItemAuditRows([
  {id:12,entity_id:id,event_type:'item.created',created_at:'2026-11-10T03:01:01Z',message:'SECRET_PRICE_700',actor_email:'private@example.test',payload:{cost:700}},
  {id:13,entity_id:foreign,event_type:'foreign',message:'FOREIGN_SECRET'},
  {id:14,entity_id:id,event_type:'<script>bad</script>',created_at:'2026-11-11T03:01:01Z'},
  {id:12,entity_id:id,event_type:'duplicate'}
 ],id);
 assert.equal(rows.length,2);
 const html=renderMaterialSourcingItemActivity(rows);
 assert.match(html,/item.created/);
 assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.doesNotMatch(JSON.stringify(rows)+html,/SECRET_PRICE_700|private@example.test|FOREIGN_SECRET|FOREIGN_SECRET|cost/);
 assert.match(html,/Only the latest 200 board events/);
 assert.deepEqual(materialSourcingItemAuditRows([{id:1,entity_id:id}],foreign),[]);
 assert.deepEqual(materialSourcingItemAuditRows([],id),[]);
 assert.deepEqual(materialSourcingItemAuditRows([{id:1,entity_id:id}],'wrong'),[]);
});
test('tabs toggle only among known controls, not arbitrary values',()=>{
 assert.equal(selectMaterialSourcingDetailTab(null,'activity'),false);
 assert.equal(selectMaterialSourcingDetailTab({querySelectorAll:()=>[]},'raw-records'),false);
});
test('app protects audit with same signed item dialog and revalidation',()=>{
 const s=app(),a=s.indexOf('async function openBoardItemDetails('),b=s.indexOf('async function openBoardMembers(',a);
 const section=s.slice(a,b);
 assert.match(section,/renderMaterialSourcingDetailTabs/);
 assert.match(section,/selectMaterialSourcingDetailTab/);
 assert.match(section,/db\.boardEvents\(snapshot\.boardId,200\)/);
 assert.match(section,/await db\.allowed\(snapshot\.boardId,'view'\)/);
 assert.match(section,/materialSourcingItemAuditRows\(rows,itemId\)/);
 assert.match(section,/if\(!current\(\)\)return;/);
 assert.match(section,/readProtectedSourcingItem\(input\)/);
 assert.match(section,/writeProtectedSourcingField\(/);
 assert.doesNotMatch(section,/material_tracker_(?:create|list|update)_task/);
});
test('material part created from either board or tracker only via existing signed RPC',()=>{
 const s=app();
 assert.match(s,/!\['items','sourcing'\]\.includes\(state\.tab\)/);
 assert.match(s,/db\.invalidateBoardCache\(\);\s*await loadBoard\(snapshot\.boardId,snapshot\.tab\)/);
 assert.match(s,/createMaterialSourcingPart\(\{/);
});
