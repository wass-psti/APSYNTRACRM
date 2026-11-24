import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleActions,lifecycleFields,saveLifecycle,renderOrderActivity} from '../order-intake-lifecycle.js';
import {renderOrderIntake} from '../order-intake-ui.js';
import {parseOrderIntakeRoute} from '../order-intake-route.js';
import {OrderIntakeRegistryClient} from '../order-intake-registry-client.js';
const row={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'w',record_kind:'native',revision:1,
 archived:false,status:'Processed',po_number:'001',po_amount:'112.00',procurement_expenses:'5.00',gross_profit:'95.00',currency:'PHP'};
test('existing lifecycle contract: native actions, terminal status, archive and restore',()=>{
 assert.deepEqual(lifecycleActions(row),{status:true,archive:true,restore:false});
 assert.deepEqual(lifecycleActions({...row,status:'Cancelled'}),{status:false,archive:true,restore:false});
 assert.deepEqual(lifecycleActions({...row,archived:true}),{status:false,archive:false,restore:true});
 assert.deepEqual(lifecycleActions({...row,record_kind:'legacy',revision:null}),{status:false,archive:false,restore:false});
 assert.match(lifecycleFields(row,'status','Delayed'),/value="Delayed" selected/);
 assert.doesNotMatch(lifecycleFields(row,'status'),/value="Processed"/);
});
test('status uses original revision and authoritative readback',async()=>{
 const updated={...row,status:'Delivered',revision:2};let writes=0;
 const client={updateStatus:async(...args)=>{writes++;assert.deepEqual(args,[row.id,1,'Delivered']);},
  detail:async(id,options)=>{assert.equal(id,row.id);assert.equal(options.includeArchived,true);return updated;}};
 assert.equal(await saveLifecycle({client,row,action:'status',target:'Delivered'}),updated);
 assert.equal(writes,1);
});
test('archive and restore preserve status, increment revision, and read archived records',async()=>{
 const archived={...row,archived:true,revision:2},restored={...row,revision:3};
 assert.equal(await saveLifecycle({client:{archive:async(id,rev)=>assert.deepEqual([id,rev],[row.id,1]),detail:async()=>archived},row,action:'archive'}),archived);
 assert.equal(await saveLifecycle({client:{restore:async(id,rev)=>assert.deepEqual([id,rev],[row.id,2]),detail:async()=>restored},row:archived,action:'restore'}),restored);
});
test('lost response reconciles once; stale or uncertain state never replays mutation',async()=>{
 let writes=0;const client={updateStatus:async()=>{writes++;throw Error('timeout');},detail:async()=>({...row,status:'Delayed',revision:2})};
 assert.equal((await saveLifecycle({client,row,action:'status',target:'Delayed'})).status,'Delayed');
 await assert.rejects(saveLifecycle({client:{...client,detail:async()=>({...row,status:'Closed',revision:3})},row,action:'status',target:'Delayed'}),/timeout/);
 assert.equal(writes,2);
 await assert.rejects(saveLifecycle({client:{updateStatus:async()=>{},detail:async()=>row},row,action:'status',target:'Delayed'}),/could not be confirmed/);
});
test('invalid action, same status, and context change prevent writes',async()=>{
 const client={updateStatus:async()=>assert.fail('unexpected write')};
 await assert.rejects(saveLifecycle({client,row,action:'status',target:'Processed'}),/different valid/);
 await assert.rejects(saveLifecycle({client,row:{...row,status:'Closed'},action:'status',target:'Delayed'}),/unavailable/);
 await assert.rejects(saveLifecycle({client,row,action:'status',target:'Delayed',isCurrent:()=>false}),/context changed/);
});
test('workflow drag and keyboard controls, archived routes and activity escape source data',()=>{
 const render=(section,record=null,rows=[row])=>renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/'+section),snapshot:{rows,hasMore:false},record});
 assert.match(render('workflow'),/draggable="true"/);
 assert.match(render('workflow'),/Change status/);
 assert.doesNotMatch(render('workflow',null,[{...row,record_kind:'legacy',revision:null}]),/draggable="true"/);
 const archived={...row,archived:true};
 assert.match(render('archived/record/'+row.id,{row:archived},[archived]),/Restore order/);
 assert.doesNotMatch(render('archived/record/'+row.id,{row:archived},[archived]),/Edit purchase order/);
 assert.match(renderOrderActivity({rows:[{type:'STATUS_UPDATED',message:'<script>',created_at:'2026-11-24'}]}),/&lt;script&gt;/);
});
test('signed registry archive read and bounded activity query scoped to record',async()=>{
 const calls=[];
 const auth={isSignedIn:true,userId:'u',authorized:async path=>{calls.push(path);return path.includes('order_intake_activity')?[{workspace_id:'w',order_id:row.id}]:[{...row,archived:true}];}};
 const client=new OrderIntakeRegistryClient({auth,api:{},workspaceId:'w'});
 assert.equal((await client.detail(row.id,{includeArchived:true})).archived,true);
 assert.equal((await client.activity(row.id)).rows.length,1);
 assert.doesNotMatch(calls[0],/archived/);assert.match(calls[1],/limit=51/);assert.match(calls[1],/workspace_id=eq.w/);
});
