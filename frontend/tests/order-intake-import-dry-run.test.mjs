import test from 'node:test';
import assert from 'node:assert/strict';
import { dryRunOrderIntake } from '../../scripts/order-intake-import/dry-run.mjs';
import { mapMondayItem,SOURCE_COLUMNS } from '../../scripts/order-intake-import/monday-mapping.mjs';
import { WORK_MANAGEMENT_WORKSPACE_ID as workspace } from '../workspace-identity.js';
const row={sourceItemId:'fixture-1',sourceGroup:'FY 2026',poNumber:'0001',clientName:'Fixture client',
 company:'Fixture company',industry:'Water',status:'Processed',poDate:'2026-01-01',dateReceived:'2026-01-02',
 deliveryDate:'2026-02-01',currency:'PHP',poAmount:'112.00',vatRate:'12',procurementExpenses:'10.00',
 vatExclusiveAmount:'100.00',vatAmount:'12.00',grossProfit:'90.00',accountManager:'Fixture manager',archived:false};
const source=rows=>({kind:'fixture',reference:'synthetic',exportedAt:'2026-11-24T00:00:00Z',expectedCount:rows.length,rows});
const dest=(rows=[])=>({workspaceId:workspace,complete:true,expectedCount:rows.length,rows});
const run=(rows,existing=[])=>dryRunOrderIntake(source(rows),dest(existing));
test('complete synthetic records reconcile independently by currency',()=>{
 const r=run([row,{...row,sourceItemId:'fixture-2',poNumber:'0002',currency:'USD'}]);
 assert.equal(r.status,'FIXTURE_ONLY');assert.equal(r.candidateCount,2);
 assert.deepEqual(r.candidateTotals.map(x=>[x.currency,x.amount,x.calculatedGrossProfit]),[['PHP','112.00','90.00'],['USD','112.00','90.00']]);
 assert.equal(r.writesAttempted,0);assert.equal(r.productionImportAuthorized,false);
});
test('100 fixture records are all accounted for, without becoming production-ready',()=>{
 const rows=Array.from({length:100},(_,i)=>({...row,sourceItemId:'fixture-'+i,poNumber:String(i).padStart(6,'0'),currency:i%2?'USD':'PHP'}));
 rows[5].clientName='';rows[6].currency='JPY';rows[7].deliveryDate='';rows[8].grossProfit='112.00';
 const r=run(rows);
 assert.equal(r.sourceCount,100);assert.equal(r.candidateCount,96);assert.equal(r.heldCount,4);
 assert.equal(r.candidateTotals.reduce((n,v)=>n+v.count,0),96);
 assert.equal(r.sourceTotals.reduce((n,v)=>n+v.count,0),100);
});
test('duplicates on both sides of a source collision are held',()=>{
 const r=run([row,{...row,sourceItemId:'fixture-2',poNumber:' 0001 '}]);
 assert.equal(r.heldCount,2);assert.ok(r.results.every(x=>x.issues.includes('DUPLICATE_SOURCE_PO')));
});
test('archived and active destination records are preserved and never overwritten',()=>{
 for(const archived of [true,false]){
  const r=run([row],[{workspace_id:workspace,po_number:'0001',archived}]);
  assert.equal(r.heldCount,1);assert.ok(r.results[0].issues.includes(archived?'EXISTING_ARCHIVED_PO':'EXISTING_ACTIVE_PO'));
 }
});
test('missing inputs and original unsupported statuses are held, not defaulted',()=>{
 const r=run([{...row,clientName:'',poDate:'',deliveryDate:'',currency:'GBP',vatRate:'',procurementExpenses:'',status:'Please select'}]);
 assert.equal(r.heldCount,1);
 for(const reason of ['INVALID_clientName','INVALID_poDate','INVALID_deliveryDate','UNSUPPORTED_OR_MISSING_CURRENCY','INVALID_OR_MISSING_VAT_RATE','INVALID_PROCUREMENT_EXPENSES','UNSUPPORTED_STATUS'])assert.ok(r.results[0].issues.includes(reason));
});
test('financial mismatch, date invalidity, group conflicts and archive history are detected',()=>{
 const r=run([{...row,grossProfit:'112.00',dateReceived:'2026-02-30',archived:true},
 {...row,sourceItemId:'fixture-2',poNumber:'0002',sourceGroup:'FY 2025',deliveryDate:'2025-01-01'}]);
 assert.equal(r.heldCount,2);
 assert.ok(r.results[0].issues.includes('FINANCIAL_MISMATCH_grossProfit'));
 assert.ok(r.results[0].issues.includes('INVALID_dateReceived'));
 assert.ok(r.results[0].issues.includes('SOURCE_ARCHIVED_REQUIRES_HISTORY_PLAN'));
 assert.ok(r.results[1].issues.includes('FISCAL_GROUP_DATE_MISMATCH'));
 assert.ok(r.results[1].issues.includes('DELIVERY_BEFORE_PO'));
});
test('source and destination inventory mismatches stop the report',()=>{
 assert.throws(()=>dryRunOrderIntake({...source([row]),expectedCount:2},dest()),/source inventory/);
 assert.throws(()=>dryRunOrderIntake(source([row]),{...dest(),complete:false}),/destination snapshot/);
 assert.throws(()=>run([row],[{workspace_id:'other',po_number:'0001',archived:false}]),/destination identity/);
});
test('documented Monday column IDs map without inventing undocumented values',()=>{
 const item={id:'fixture-1',name:'0001',state:'active',group:{title:'FY 2026'},column_values:Object.entries(SOURCE_COLUMNS).map(([key,id])=>({id,text:row[key]}))};
 const mapped=mapMondayItem(item);
 assert.equal(mapped.poNumber,'0001');assert.equal(mapped.poAmount,'112.00');
 assert.equal(mapped.clientName,undefined);assert.equal(mapped.currency,undefined);
 const report=dryRunOrderIntake({...source([{item}]),kind:'monday-export',boardId:'3670228015'},dest());
 assert.equal(report.heldCount,1);
 assert.throws(()=>dryRunOrderIntake({...source([{item}]),kind:'monday-export',boardId:'wrong'},dest()),/source board/);
});
test('amounts retain decimal precision and leading-zero PO identity',()=>{
 const r=run([{...row,poAmount:'9999999999999999.99',vatRate:'0',procurementExpenses:'0',
  vatExclusiveAmount:'9999999999999999.99',vatAmount:'0',grossProfit:'9999999999999999.99'}]);
 assert.equal(r.candidateTotals[0].amount,'9999999999999999.99');
});
test('a fully mapped declared export still requires review, not production authorization',()=>{
 const item={id:'fixture-1',name:'0001',state:'active',group:{title:'FY 2026'},column_values:Object.entries(SOURCE_COLUMNS).map(([key,id])=>({id,text:row[key]}))};
 const supplemental={clientName:row.clientName,poDate:row.poDate,currency:row.currency,vatRate:row.vatRate,vatExclusiveAmount:row.vatExclusiveAmount,vatAmount:row.vatAmount};
 const r=dryRunOrderIntake({...source([{item,supplemental}]),kind:'monday-export',boardId:'3670228015'},dest());
 assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.candidateCount,1);assert.equal(r.productionImportAuthorized,false);
});

test('workbook row locations are retained and unknown financial totals are not reported as zero',()=>{
 const input={...row,sourceItemId:undefined,sourceLocator:'order intake!A4',vatRate:undefined};
 const report=dryRunOrderIntake({...source([input]),kind:'monday-workbook',boardId:'3670228015'},dest());
 assert.equal(report.status,'EXCEPTIONS_PENDING');
 assert.equal(report.results[0].sourceLocator,'order intake!A4');
 assert.equal(report.results[0].sourceItemId,null);
 assert.equal(report.sourceTotals[0].financialCount,0);
 assert.equal(report.sourceTotals[0].calculatedExpenses,null);
 assert.equal(report.sourceTotals[0].calculatedGrossProfit,null);
 assert.throws(()=>dryRunOrderIntake({...source([input]),kind:'monday-workbook',boardId:'wrong'},dest()),/source board/);
});
