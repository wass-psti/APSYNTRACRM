import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConfirmation,calculateConfirmationItems,CONFIRMATION_ENTITIES,CONFIRMATION_CURRENCIES,confirmationEntity} from '../order-intake-confirmation.js';
import {confirmationFields} from '../order-intake-confirmation-ui.js';
import {confirmationDefinition,createConfirmationPdf,confirmationDigest,confirmationFilename} from '../order-intake-confirmation-pdf.js';
import {readFileSync} from 'node:fs';
const row={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',revision:1,record_kind:'native',po_number:'PO/001',client_name:'Fixture client',po_date:'2026-11-24',delivery_date:'2026-12-01',company:'WASS',currency:'PHP',po_amount:'112.00',vat_rate:'12'};
const input={entity:'watchdog-sales',currency:'PHP',quotation:'Q-001',payment:'30 days from delivery',warranty:'12 months, as agreed',signatory:'Alex P. Señagan',items:[{description:'Test equipment',quantity:'2',unit:'pc',unitPrice:'56.00'}]};
test('exact line rounding and native financial reconciliation',()=>{
 const doc=buildConfirmation(row,input);
 assert.equal(doc.total,'112.00');assert.equal(doc.vatExclusiveAmount,'100.00');assert.equal(doc.vatAmount,'12.00');
 assert.equal(calculateConfirmationItems([{description:'Part',unit:'pc',quantity:'0.125',unitPrice:'10.04'}]).total,'1.26');
 assert.throws(()=>buildConfirmation(row,{...input,items:[{...input.items[0],unitPrice:'55.99'}]}),/recorded VAT-inclusive/);
 assert.throws(()=>buildConfirmation(row,{...input,entity:'plc-systems'}),/differs/);
 assert.throws(()=>buildConfirmation(row,{...input,currency:'USD'}),/match/);
 assert.throws(()=>buildConfirmation(row,{...input,signatory:'Unknown'}),/signatory/);
});
test('historical missing fields require explicit verification; no guessed client or currency',()=>{
 const legacy={...row,record_kind:'legacy',company:null,client_name:null,po_date:null,vat_rate:null,currency:null};
 const draft={...input,client:'Confirmed client',poDate:'2026-11-24',vatRate:'0',currency:'JPY',confirmEntity:true};
 assert.throws(()=>buildConfirmation(legacy,draft),/Verify missing/);
 const doc=buildConfirmation(legacy,{...draft,confirmHistorical:true});
 assert.equal(doc.client,'Confirmed client');assert.equal(doc.currency,'JPY');assert.equal(doc.vatAmount,'0.00');
 assert.throws(()=>buildConfirmation({...legacy,po_amount:'112.001'},{...draft,confirmHistorical:true}),/exactly/);
});
test('three configured entity headers, eight currencies, escaping and unsigned designation',()=>{
 assert.equal(CONFIRMATION_ENTITIES.length,3);assert.equal(CONFIRMATION_CURRENCIES.length,8);
 assert.equal(confirmationEntity({company:'Mesopelagic Anglers'}),'');
 assert.match(confirmationFields({...row,po_number:'<script>'}),/&lt;script&gt;/);
 const doc=buildConfirmation(row,input);
 assert.equal(confirmationFilename(doc),'PO-Confirmation-PO-001.pdf');
 const def=JSON.stringify(confirmationDefinition(doc));
 assert.match(def,/211-258-356-00000/);assert.match(def,/signature not applied/);
 assert.doesNotMatch(def,/procurement_expenses|gross_profit/);
});
test('real PDFMake bytes and digest; all three logos embedded',async()=>{
 for(const entity of CONFIRMATION_ENTITIES){
  const doc=buildConfirmation({...row,company:entity.name},{...input,entity:entity.id});
  const logo='data:image/png;base64,'+readFileSync(new URL('../assets/tradelink/'+entity.logoAsset,import.meta.url)).toString('base64');
  const blob=await createConfirmationPdf(doc,logo);
  const bytes=Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>10000);
  assert.match(await confirmationDigest(blob),/^[0-9a-f]{64}$/);
 }
});
