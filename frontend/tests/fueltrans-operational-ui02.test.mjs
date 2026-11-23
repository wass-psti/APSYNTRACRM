import assert from 'node:assert/strict';
import test from 'node:test';
import {QUEUE_SHORTCUTS,ticketCardData,pageTicketSummary} from '../fueltrans/ticket-presentation02.js';

const openTicket={
 id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
 ticket_number:'UNI-2026-087',
 client_code:'UNIOIL',
 status:'Open',
 archived:false,
 assigned_l1:null,
 assigned_l2:null,
 updated_at:'2026-11-23T09:00:00Z',
 payload:{
  title:'Station POS assistance',
  stationName:'UNIOIL AIRPORT ROAD',
  stationId:'1013C',
  impactLevel:'Partial Service Interruption',
  systemType:'POS',
  priorityLevel:'High',
  handoverFlag:true
 }
};
const resolvedTicket={
 ...openTicket,id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
 status:'Resolved',assigned_l1:'cccccccc-cccc-4ccc-cccc-cccccccccccc',
 payload:{...openTicket.payload,handoverFlag:false,priorityLevel:'Medium'}
};

test('status shortcuts map only to actual server-filtered queue values',()=>{
 assert.deepEqual(QUEUE_SHORTCUTS.map(tab=>tab.value),['all','Open','Resolved']);
 assert.ok(QUEUE_SHORTCUTS.every(tab=>typeof tab.label==='string'&&tab.label.length));
});
test('ticket card preserves source ticket, client, station, impact, and priority',()=>{
 const view=ticketCardData(openTicket);
 assert.equal(view.id,openTicket.id);
 assert.equal(view.number,'UNI-2026-087');
 assert.equal(view.client,'UNIOIL');
 assert.equal(view.station,'UNIOIL AIRPORT ROAD');
 assert.equal(view.stationId,'1013C');
 assert.equal(view.priority,'High');
 assert.equal(view.priorityClass,'high');
 assert.equal(view.system,'POS');
 assert.equal(view.impact,'Partial Service Interruption');
 assert.equal(view.handover,true);
 assert.equal(view.status,'Open');
});
test('ticket card uses honest source fallbacks and does not invent station or identity',()=>{
 const view=ticketCardData({id:'test',status:'Open',payload:{}});
 assert.equal(view.station,'Not specified');
 assert.equal(view.stationId,'—');
 assert.equal(view.client,'—');
 assert.equal(view.impact,'Not recorded');
 assert.equal(view.system,'Not recorded');
 assert.equal(view.handover,false);
});
test('page summary is explicitly scoped to visible ticket rows',()=>{
 assert.deepEqual(pageTicketSummary([openTicket,resolvedTicket]),{visible:2,flagged:1,unassigned:1});
 assert.deepEqual(pageTicketSummary([]),{visible:0,flagged:0,unassigned:0});
 assert.throws(()=>pageTicketSummary(null),/unavailable/);
});
test('resolved tickets do not count as unassigned work',()=>{
 const resolved={...resolvedTicket,assigned_l1:null};
 assert.equal(pageTicketSummary([resolved]).unassigned,0);
});
