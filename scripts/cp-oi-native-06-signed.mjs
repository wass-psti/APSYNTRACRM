import assert from 'node:assert/strict';
import {runOrderBulk} from '../frontend/order-intake-bulk.js';
import {filterOrderIntakeRows} from '../frontend/order-intake-read-state.js';
import {orderTablePage,orderExportCsv} from '../frontend/order-intake-search.js';

export async function verifyBulkSigned({client,sql,legacy,native}){
 const rows=[];let more=true;
 while(more){const page=await client.list({offset:rows.length,limit:100});rows.push(...page.items);more=page.hasMore;}
 const historical=rows.filter(row=>row.record_kind==='legacy');
 assert.equal(historical.length,909);
 assert.equal(orderTablePage(historical,36).rows.length,9);
 const match=filterOrderIntakeRows(rows,{kind:'legacy',q:legacy.source_key});
 assert.equal(match.length,1);assert.equal(match[0].id,legacy.id);
 assert.ok(orderExportCsv(match).includes(legacy.source_key));
 const before=sql("select md5(string_agg(id::text||':'||md5(payload::text),',' order by id)) from order_intake_legacy_orders");
 const status=await runOrderBulk({client,rows:[legacy,native],action:'status',values:{status:'Delayed'}});
 assert.deepEqual(status.map(r=>r.state),['verified','verified']);
 legacy=await client.detail(legacy.id);native=await client.detail(native.id);
 assert.equal(legacy.status,'Delayed');assert.equal(native.status,'Delayed');
 const patch=await runOrderBulk({client,rows:[legacy,native],action:'details',values:{company:'Bulk company',industry:'Bulk industry',procurementExpenses:'10.00',currency:'PHP'}});
 assert.deepEqual(patch.map(r=>r.state),['skipped','verified']);
 native=await client.detail(native.id);
 assert.equal(native.company,'Bulk company');assert.equal(native.industry,'Bulk industry');assert.equal(native.gross_profit,'90.00');
 const stale={...native,revision:native.revision-1};
 const conflict=await runOrderBulk({client,rows:[stale,legacy],action:'archive',values:{}});
 assert.deepEqual(conflict.map(r=>r.state),['unconfirmed','not attempted']);
 const archived=await runOrderBulk({client,rows:[legacy,native],action:'archive',values:{}});
 assert.deepEqual(archived.map(r=>r.state),['verified','verified']);
 legacy=await client.detail(legacy.id,{includeArchived:true});native=await client.detail(native.id,{includeArchived:true});
 assert.equal(legacy.archived,true);assert.equal(native.archived,true);
 const restored=await runOrderBulk({client,rows:[legacy,native],action:'restore',values:{}});
 assert.deepEqual(restored.map(r=>r.state),['verified','verified']);
 assert.equal((await client.detail(legacy.id)).archived,false);assert.equal((await client.detail(native.id)).archived,false);
 assert.equal(sql("select md5(string_agg(id::text||':'||md5(payload::text),',' order by id)) from order_intake_legacy_orders"),before);
 console.log('PASS: full historical search, mixed bulk status/archive/restore, native details and exact profit, stale conflict stops batch, 909 immutable payloads');
}
