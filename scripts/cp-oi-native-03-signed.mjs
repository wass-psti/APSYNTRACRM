import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {OrderIntakeRegistryClient} from '../frontend/order-intake-registry-client.js';
import {orderEditorDraft,createOrderEditorSave} from '../frontend/order-intake-editor.js';
import {renderOrderIntake} from '../frontend/order-intake-ui.js';
import {parseOrderIntakeRoute} from '../frontend/order-intake-route.js';

export async function verifyOrderEditorSigned({client,api,auth,sql,workspace}) {
 const mutations=new OrderIntakeRegistryClient({auth,api,workspaceId:workspace});
 const id=randomUUID();
 const draft={...orderEditorDraft(),poNumber:'CP03-'+id,clientName:'Disposable client',company:'Fixture',
  industry:'Water',poDate:'2026-11-24',dateReceived:'2026-11-24',deliveryDate:'2026-12-01',
  poAmount:'112.00',procurementExpenses:'5.00'};
 const save=createOrderEditorSave({client:mutations,newId:()=>id});
 const created=await save(draft);
 assert.equal(created.record_kind,'native');assert.equal(created.revision,1);assert.equal(created.gross_profit,'95.00');
 assert.equal((await mutations.create(draft,id)).id,created.id);
 await assert.rejects(mutations.create({...draft,notes:'changed key payload'},id),/IDEMPOTENCY_KEY_REUSED/);
 await assert.rejects(mutations.create({...draft,poNumber:draft.poNumber.toLowerCase()},randomUUID()),/23505|duplicate/);
 const edited=await createOrderEditorSave({client:mutations,row:created})({...orderEditorDraft(created),poAmount:'224.00',notes:'Updated'});
 assert.equal(edited.revision,2);assert.equal(edited.gross_profit,'195.00');
 await assert.rejects(mutations.update(created.id,1,{notes:'stale'}),/REVISION_CONFLICT/);
 assert.deepEqual(await mutations.detail(created.id),edited);
 const detail=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/all-orders/record/'+created.id),snapshot:{rows:[edited],hasMore:false},record:{row:edited}});
 assert.match(detail,/Edit purchase order/);assert.match(detail,/195.00/);
 assert.equal(sql("select count(*) from order_intake_activity where order_id='"+created.id+"'"),'2');
 assert.equal(sql("select count(*) from order_intake_legacy_orders"),'909');
 assert.equal((await client.list({limit:1})).items[0].id,created.id);
 console.log('PASS: actual signed create, exact financial readback, idempotent replay, key conflict, duplicate PO, edit, stale revision rejection, two activity rows, legacy count preserved');
}
