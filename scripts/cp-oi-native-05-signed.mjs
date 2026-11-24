import assert from 'node:assert/strict';
import {verifyLifecycleBrowser} from './cp-oi-native-05-browser.mjs';
import {randomUUID} from 'node:crypto';
import {OrderIntakeRegistryClient} from '../frontend/order-intake-registry-client.js';
import {orderEditorDraft,createOrderEditorSave} from '../frontend/order-intake-editor.js';
import {saveLifecycle} from '../frontend/order-intake-lifecycle.js';
import {renderOrderIntake} from '../frontend/order-intake-ui.js';
import {parseOrderIntakeRoute} from '../frontend/order-intake-route.js';

export async function verifyLifecycleSigned({auth,api,workspace,sql}){
 const client=new OrderIntakeRegistryClient({auth,api,workspaceId:workspace});
 const draft={...orderEditorDraft(),poNumber:'CP05-'+randomUUID(),clientName:'Disposable lifecycle',company:'Fixture',
  industry:'Water',poDate:'2026-11-24',dateReceived:'2026-11-24',deliveryDate:'2026-12-01',poAmount:'112.00',procurementExpenses:'5.00'};
 const initial=await createOrderEditorSave({client})(draft);
 let row=initial;
 const move=async target=>{row=await saveLifecycle({client,row,action:'status',target});assert.equal(row.status,target);};
 for(const status of ['Processed','Delayed','Delivered','Collected','Closed'])await move(status);
 assert.equal(row.revision,6);
 assert.equal(row.gross_profit,initial.gross_profit);
 await assert.rejects(client.updateStatus(row.id,1,'Processed'),/REVISION_CONFLICT/);
 await assert.rejects(client.updateStatus(row.id,row.revision,'Processed'),/TERMINAL_STATUS/);
 row=await saveLifecycle({client,row,action:'archive'});
 assert.equal(row.archived,true);assert.equal(row.revision,7);
 await assert.rejects(client.detail(row.id),/unavailable/);
 assert.ok((await client.list({archived:true,limit:100})).items.some(item=>item.id===row.id));
 row=await saveLifecycle({client,row,action:'restore'});
 assert.equal(row.archived,false);assert.equal(row.revision,8);assert.equal(row.status,'Closed');
 assert.ok(!(await client.list({archived:true,limit:100})).items.some(item=>item.id===row.id));
 assert.deepEqual(await client.detail(row.id),row);
 const activity=await client.activity(row.id);
 assert.equal(activity.rows.length,8);
 assert.deepEqual(activity.rows.map(entry=>entry.type),['RESTORED','ARCHIVED',...Array(5).fill('STATUS_UPDATED'),'ORDER_CREATED']);
 const html=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/all-orders/record/'+row.id),snapshot:{rows:[row],hasMore:false},record:{row,activity}});
 assert.match(html,/Order activity/);assert.match(html,/Status changed from Collected to Closed/);
 assert.equal(sql('select count(*) from order_intake_legacy_orders'),'909');
 console.log('PASS: signed lifecycle 5 status transitions, terminal and stale revision rejection, archive and restore, eight activity entries, financial and historical preservation');
 const browserRow=await createOrderEditorSave({client})({...draft,poNumber:'CP05-BROWSER-'+randomUUID()});
 await verifyLifecycleBrowser({auth,api,workspace,rowId:browserRow.id});
}
