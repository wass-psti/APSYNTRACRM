import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {OrderIntakeOperationalClient} from '../frontend/order-intake-operational-client.js';
import {buildConfirmation} from '../frontend/order-intake-confirmation.js';
import {createConfirmationPdf,confirmationDigest} from '../frontend/order-intake-confirmation-pdf.js';
import {createOrderEditorSave,orderEditorDraft} from '../frontend/order-intake-editor.js';
import {verifyConfirmationBrowser} from './cp-oi-native-07-browser.mjs';

export async function verifyConfirmationSigned({auth,api,workspace,foreign,signin,sql}){
 const client=new OrderIntakeOperationalClient({auth,api,workspaceId:workspace});
 const row=await createOrderEditorSave({client})({...orderEditorDraft(),poNumber:'CP07-'+randomUUID(),clientName:'Fixture client',company:'WASS',industry:'Water',poDate:'2026-11-24',dateReceived:'2026-11-24',deliveryDate:'2026-12-01',poAmount:'112.00'});
 const input={entity:'watchdog-sales',currency:'PHP',quotation:'Q-001',payment:'30 days',warranty:'12 months',signatory:'Alex P. Señagan',items:[{description:'Fixture equipment',quantity:'2',unit:'pc',unitPrice:'56.00'}]};
 const doc=buildConfirmation(row,input);
 const logo='data:image/png;base64,'+readFileSync(new URL('../frontend/assets/tradelink/'+doc.entity.logoAsset,import.meta.url)).toString('base64');
 const blob=await createConfirmationPdf(doc,logo);
 const sha=await confirmationDigest(blob),id=randomUUID();
 assert.equal(sha,createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'));
 const receipt=await client.recordConfirmation(doc,id,sha);
 assert.equal((await client.recordConfirmation(doc,id,sha)).generatedAt,receipt.generatedAt);
 await assert.rejects(client.recordConfirmation(doc,id,'a'.repeat(64)),/RECEIPT_CONFLICT/);
 await assert.rejects(client.recordConfirmation({...doc,revision:row.revision+1},randomUUID(),sha),/row-level security|42501/);
 const outsider=await signin(foreign,true);
 const other=new OrderIntakeOperationalClient({auth:outsider.auth,api:outsider.api,workspaceId:foreign});
 await assert.rejects(other.recordConfirmation(doc,randomUUID(),sha),/row-level security|42501/);
 assert.equal((await outsider.auth.authorized('/rest/v1/order_intake_confirmation_audit')).length,0);
 assert.equal(sql('select count(*) from order_intake_confirmation_audit'),'1');
 assert.deepEqual(await client.detail(row.id),row);
 await verifyConfirmationBrowser({auth,api,row});
 assert.equal(sql('select count(*) from order_intake_confirmation_audit'),'2');
 assert.deepEqual(await client.detail(row.id),row);
 console.log('PASS: signed PDF generation, exact digest, idempotent audit, stale/cross-workspace denial, real browser download, source order unchanged');
}
