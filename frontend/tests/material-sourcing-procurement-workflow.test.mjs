import test from 'node:test';
import assert from 'node:assert/strict';
import {id,userId,workspaceId,fixture} from '../../scripts/fixtures/cp-ms-crm-03-fixture.mjs';
import {rfqPayload,quotationPayload,matchingSupplierSources,eligibleClientPo,verifiedPoPayload,lookupClientPo} from '../apps/MaterialSourcing/procurement-workflow-ui.js';
import {renderNativeMaterialSourcing} from '../apps/MaterialSourcing/native-screen.js';

const source={id:id(650),supplier:' Synthetic Supplier ',reference:'PO-QA'};
const other={id:id(651),supplier:'Another Supplier',reference:'PO-OTHER'};
const client={id:id(800),workspace_id:workspaceId,record_kind:'native',archived:false,revision:1,po_number:'QA-PO',source_key:null};
const legacy={...client,id:id(801),record_kind:'legacy',archived:null,revision:1,source_key:'legacy-qa',po_number:'QA-LEGACY'};
const fields={supplier:'Synthetic Supplier',supplier_source_id:source.id,reference:'Q-001',issued_on:'2026-11-28',valid_until:'2026-12-31',
 quantity:'5.25',unit_price:'99.1234',currency:'USD',shipping_total:'10',shipping_currency:'USD',tax_basis:'tax_exclusive',lead_weeks:'2.5',notes:'<literal>'};

test('native RFQ payload validates actual dates and explicit due date',()=>{
 assert.deepEqual(rfqPayload({reference:' RFQ-QA ',issued_on:'2026-11-28',due_on:'2026-12-01'}),{reference:'RFQ-QA',issued_on:'2026-11-28',due_on:'2026-12-01'});
 for(const due_on of ['2026-11-27','2026-02-31','not a date'])
  assert.throws(()=>rfqPayload({reference:'QA',issued_on:'2026-11-28',due_on}));
});
test('quotation form preserves verified source, revision identity, decimal terms and literal notes',()=>{
 const p=quotationPayload(fields,id(703),[source,other]);
 assert.equal(p.quote_id,id(703));assert.equal(p.supplier_source_id,source.id);assert.equal(p.unit_price,99.1234);
 assert.equal(p.quantity,5.25);assert.equal(p.lead_weeks,2.5);assert.equal(p.notes,'<literal>');
 assert.equal(quotationPayload({...fields,supplier_source_id:''},id(703)).supplier_source_id,null);
});
test('malformed terms and mismatched sources cannot become quotation commands',()=>{
 for(const patch of [{quantity:'0'},{unit_price:'1.00001'},{shipping_total:'-1'},{currency:'GBP'},
  {tax_basis:'invalid'},{valid_until:'2026-11-27'},{supplier_source_id:other.id},{notes:'x'.repeat(2001)}])
  assert.throws(()=>quotationPayload({...fields,...patch},id(703),[source,other]));
});
test('supplier PO linkage uses only matching verified source and explicit eligible client selection',()=>{
 assert.deepEqual(matchingSupplierSources([source,other],'SYNTHETIC SUPPLIER'),[source]);
 assert.deepEqual(verifiedPoPayload(source.id,fields,[source,other],client.id,[client]),
  {supplier_po_id:source.id,client_po_id:client.id,client_po_kind:'native'});
 assert.deepEqual(verifiedPoPayload(source.id,fields,[source],'',[]),
  {supplier_po_id:source.id,client_po_id:null,client_po_kind:null});
 assert.throws(()=>verifiedPoPayload(other.id,fields,[source,other],null,[]),/supplier PO/);
 assert.throws(()=>verifiedPoPayload(source.id,fields,[source],client.id,[{...client,archived:null}]),/client PO/);
 assert.throws(()=>verifiedPoPayload(source.id,fields,[source],client.id,[]),/client PO/);
 assert.deepEqual(verifiedPoPayload(source.id,fields,[source],legacy.id,[legacy]),{supplier_po_id:source.id,client_po_id:legacy.id,client_po_kind:'legacy'});
 assert.equal(eligibleClientPo({...legacy,archived:false}),true);
 assert.equal(eligibleClientPo({...legacy,archived:true}),false);
 assert.equal(eligibleClientPo({...client,archived:null}),false);
 assert.equal(eligibleClientPo({...legacy,archived:undefined}),false);
 assert.equal(eligibleClientPo({...legacy,record_kind:'unknown'}),false);
});
test('signed client lookup reads exact registry identity and filters approved archive state',async()=>{
 const calls=[];
 const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId}),authorized:async(path,options)=>{calls.push([path,options]);return [client];}};
 const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}})};
 const scope={auth,api,workspaceId,isCurrent:()=>true};
 assert.deepEqual(await lookupClientPo(scope,'QA-PO'),[client]);
 const url=new URL(calls[0][0],'https://fixture.invalid');
 assert.equal(url.pathname,'/rest/v1/order_intake_operational_registry');assert.equal(url.searchParams.get('or'),'(archived.eq.false,and(record_kind.eq.legacy,archived.is.null))');
 assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspaceId);assert.equal(url.searchParams.get('po_number'),'eq.QA-PO');
 assert.equal(calls[0][1].retryableRead,true);
 await assert.rejects(lookupClientPo({...scope,isCurrent:()=>false},client.id),/view changed/);
 auth.authorized=async()=>[legacy];
 assert.deepEqual(await lookupClientPo(scope,'QA-LEGACY'),[legacy]);
 assert.deepEqual(await lookupClientPo(scope,legacy.id.toUpperCase()),[legacy]);
 for(const row of [{...legacy,archived:true},{...legacy,record_kind:'native',archived:null},{...legacy,po_number:'OTHER'}]){
  auth.authorized=async()=>[row];
  await assert.rejects(lookupClientPo(scope,'QA-LEGACY'),/Invalid client PO/);
 }
 auth.authorized=async()=>[{...legacy,workspace_id:id(999)}];
 await assert.rejects(lookupClientPo(scope,'QA-LEGACY'),/Invalid operational historical order/);
 auth.authorized=async()=>[{...legacy,revision:null}];
 await assert.rejects(lookupClientPo(scope,'QA-LEGACY'),/Invalid operational historical order/);
});
test('native per-item workflow is available to both signed viewer and editor, not Add Material',()=>{
 for(const canCreate of [false,true]){
  const html=renderNativeMaterialSourcing(fixture(),{},new Date(),{workspaceId,canCreate});
  assert.match(html,/data-action="mrh-native-procurement"/);assert.match(html,/data-ms-procurement-workflow hidden/);
 }
 assert.doesNotMatch(renderNativeMaterialSourcing(fixture(),{},new Date(),{workspaceId,canCreate:true,view:'add'}),/data-ms-procurement-workflow/);
});
