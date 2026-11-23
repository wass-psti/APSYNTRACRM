import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChange} from '../fueltrans/workflow-domain.js';
import {CATEGORIES,IMPACTS,CHANNELS,SYSTEM_TYPES,validateSourceTicketDraft,buildSourceTicketRecord} from '../fueltrans/ticket-create16.js';
import {summarizeReports} from '../fueltrans/analytics-domain.js';
import {buildLifecycleExportRows,buildLifecycleExportWorkbook,LIFECYCLE_HEADERS} from '../fueltrans/lifecycle-export.js';
import {buildClientSummaryPdfDefinition} from '../fueltrans/report-pdf.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const l1Id='22222222-2222-4222-8222-222222222222';
const user={id:l1Id,email:'l1@example.test'};
const member={workspace_id:workspaceId,user_id:l1Id,role:'global_l1_support',status:'active',enabled:true};
const ticket=(overrides={})=>({
 id:'33333333-3333-4333-8333-333333333333',workspace_id:workspaceId,
 updated_at:'2026-11-23T02:00:00.000Z',created_at:'2026-11-23T02:00:00.000Z',
 ticket_number:'UNI-2026-100',client_code:'UNIOIL',status:'Under L1 Review',
 archived:false,assigned_l1:l1Id,assigned_l2:null,
 payload:{
  stationId:'U-1001',stationName:'UNIOIL TEST STATION',title:'POS terminal failure',
  priorityLevel:'High',systemType:'POS',impactLevel:'Major Service Interruption',
  reportingChannel:'Phone Call',operationalDate:'2026-11-23',
  l1ResponseDate:'2026-11-23T02:05:00.000Z',downtimeMinutes:15,
  issueDetails:'Terminal cannot complete station transactions.',category:'POS Software Issue'
 },
 ...overrides
});

test('ticket category is required and persists into the support ticket payload',()=>{
 const reporter={...user,email:'reporter@example.test'};
 const reporterMember={workspace_id:workspaceId,user_id:l1Id,role:'unioil',client_code:'UNIOIL',status:'active',enabled:true};
 const draft={
  client:'UNIOIL',title:'POS terminal cannot complete transactions',
  description:'Station POS terminal cannot complete transactions after the application restart.',
  priority:'High',stationId:'U-1001',stationName:'UNIOIL QA STATION',
  systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],reportingChannel:CHANNELS[0],handoverFlag:false
 };
 assert.equal(CATEGORIES.length,5);
 assert.throws(()=>validateSourceTicketDraft(draft,reporterMember),/category/);
 const valid=validateSourceTicketDraft({...draft,category:'POS Software Issue'},reporterMember);
 const record=buildSourceTicketRecord(valid,reporterMember,reporter,{
  id:'category-ticket-1',now:'2026-11-23T02:00:00.000Z',ticketId:'UNI-CATEGORY-001'
 });
 assert.equal(valid.category,'POS Software Issue');
 assert.equal(record.payload.category,'POS Software Issue');
});

test('resolution and escalation transitions require meaningful written details',()=>{
 const opened={...ticket(),status:'Open',assigned_l1:null};
 const claimed=buildChange(opened,member,user,'claim-l1',{now:'2026-11-23T02:01:00.000Z'});
 assert.throws(()=>buildChange(claimed,member,user,'status:Escalated to L2',{now:'2026-11-23T02:02:00.000Z'}),/3–500/);
 const escalated=buildChange(claimed,member,user,'status:Escalated to L2',{
  now:'2026-11-23T02:02:00.000Z',note:'Repeated POS service failure after terminal restart.'
 });
 assert.equal(escalated.payload.escalationReason,'Repeated POS service failure after terminal restart.');
 assert.throws(()=>buildChange(ticket(),member,user,'status:Resolved',{now:'2026-11-23T02:03:00.000Z',note:'fixed'}),/15–4,000/);
 const resolved=buildChange(ticket(),member,user,'status:Resolved',{
  now:'2026-11-23T02:03:00.000Z',
  note:'Replaced the faulty terminal cable and verified successful station transactions.'
 });
 assert.equal(resolved.status,'Resolved');
 assert.equal(resolved.payload.resolutionDetails,'Replaced the faulty terminal cable and verified successful station transactions.');
 assert.equal(resolved.payload.closureDate,'2026-11-23T02:03:00.000Z');
 assert.match(resolved.payload.activity.at(-1).message,/Resolution details recorded/);
});

test('lifecycle export requires and returns exactly one selected client',()=>{
 const unioil=ticket();
 const aramco=ticket({
  id:'44444444-4444-4444-8444-444444444444',
  ticket_number:'ARA-2026-101',client_code:'ARAMCO'
 });
 const matrix=buildLifecycleExportRows([unioil,aramco],{
  client:'UNIOIL',workspaceId,now:'2026-11-23T03:00:00.000Z'
 });
 assert.deepEqual(matrix[0],Array.from(LIFECYCLE_HEADERS));
 assert.equal(matrix.length,2);
 assert.equal(matrix[1][2],'UNIOIL');
 assert.equal(matrix[1][4],'UNIOIL TEST STATION');
 assert.equal(matrix[1][6],'POS Software Issue');
 assert.equal(matrix[1][16],15);
 assert.throws(()=>buildLifecycleExportRows([unioil],{client:'all',workspaceId}),/one client/);
 assert.throws(()=>buildLifecycleExportRows([unioil,{...unioil}],{client:'UNIOIL',workspaceId}),/duplicate/);
 assert.throws(()=>buildLifecycleExportRows([{...unioil,workspace_id:'99999999-9999-4999-8999-999999999999'}],{client:'UNIOIL',workspaceId}),/out-of-workspace/);
});

test('XLSX export is a valid uncompressed OOXML ZIP with escaped inline cell values',async()=>{
 const row=ticket({status:'Resolved',payload:{
  ...ticket().payload,resolutionDetails:'Replaced the POS <cable> & tested the station.'
 }});
 const blob=buildLifecycleExportWorkbook([row],{client:'UNIOIL',workspaceId,now:'2026-11-23T03:00:00.000Z'});
 assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 assert.equal(view.getUint32(0,true),0x04034b50);
 const decoder=new TextDecoder();
 const entries=new Map();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){
  const size=view.getUint32(offset+18,true);
  const nameLength=view.getUint16(offset+26,true);
  const extraLength=view.getUint16(offset+28,true);
  const nameStart=offset+30;
  const name=decoder.decode(bytes.slice(nameStart,nameStart+nameLength));
  const dataStart=nameStart+nameLength+extraLength;
  entries.set(name,decoder.decode(bytes.slice(dataStart,dataStart+size)));
  offset=dataStart+size;
 }
 assert.ok(entries.has('[Content_Types].xml'));
 assert.ok(entries.has('xl/workbook.xml'));
 assert.ok(entries.has('xl/worksheets/sheet1.xml'));
 const sheet=entries.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/Ticket ID/);
 assert.match(sheet,/&lt;cable&gt; &amp; tested/);
 assert.doesNotMatch(sheet,/<cable>/);
 assert.equal(view.getUint32(offset,true),0x02014b50);
});

test('client PDF definition contains a single-client summary and rejects mixed-client data',()=>{
 const own=ticket({status:'Resolved'});
 const summary=summarizeReports([own],{workspaceId});
 const definition=buildClientSummaryPdfDefinition({
  client:'UNIOIL',summary,generatedAt:'2026-11-23T03:00:00.000Z',range:'Operational dates 2026-11-23 through 2026-11-23'
 });
 const output=JSON.stringify(definition);
 assert.match(output,/UNIOIL/);
 assert.match(output,/Ticket status distribution/);
 assert.match(output,/POS Software Issue/);
 assert.match(output,/Resolution rate/);
 const mixed=summarizeReports([own,ticket({
  id:'55555555-5555-4555-8555-555555555555',client_code:'ARAMCO'
 })],{workspaceId});
 assert.throws(()=>buildClientSummaryPdfDefinition({client:'UNIOIL',summary:mixed}),/exactly one client/);
});
