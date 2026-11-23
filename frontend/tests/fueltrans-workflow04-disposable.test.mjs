import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChange,canClaim,canTransition} from '../fueltrans/workflow-domain.js';
import {buildSourceTicketRecord,validateSourceTicketDraft,IMPACTS,CHANNELS,SYSTEM_TYPES} from '../fueltrans/ticket-create16.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const reporterId='22222222-2222-4222-8222-222222222222';
const l1Id='33333333-3333-4333-8333-333333333333';
const l2Id='44444444-4444-4444-8444-444444444444';
const id='55555555-5555-4555-8555-555555555555';
const timestamp='2026-11-23T02:00:00.000Z';
const actor=(userId,role)=>({
 user:{id:userId,email:role+'@example.test'},
 member:{workspace_id:workspaceId,user_id:userId,role,status:'active',enabled:true,display_name:role}
});

function startTicket(){
 const reporter=actor(reporterId,'unioil');
 const draft=validateSourceTicketDraft({
  client:'UNIOIL',title:'Reproducible POS terminal failure',
  description:'POS terminal cannot finish station transactions after an application restart.',
  priority:'High',stationId:'1013C',stationName:'UNIOIL AIRPORT ROAD',
  systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],
  reportingChannel:CHANNELS[0],handoverFlag:false
 },reporter.member);
 return buildSourceTicketRecord(draft,reporter.member,reporter.user,
  {id,now:timestamp,ticketId:'UNI-2026-DISPOSABLE'});
}

// The repository emulator checks compare-and-swap and JSON readback; it is deliberately
// not described as a live Supabase/RLS or multi-account browser acceptance.
function disposableRepository(original){
 let row=structuredClone(original),writes=0;
 return {
  read:()=>structuredClone(row),
  count:()=>writes,
  save:(next,expectedUpdatedAt)=>{
   if(row.updated_at!==expectedUpdatedAt)throw Error('Concurrent ticket revision detected.');
   row=JSON.parse(JSON.stringify({...row,...next}));
   writes++;
   return structuredClone(row);
  }
 };
}

function apply(repo,identity,action,now){
 const previous=repo.read();
 const change=buildChange(previous,identity.member,identity.user,action,{now});
 return repo.save(change,previous.updated_at);
}

test('disposable two-actor lifecycle creation → claim L1 → escalate → claim L2 → resolve and readback',()=>{
 const repo=disposableRepository(startTicket());
 const l1=actor(l1Id,'global_l1_support'),l2=actor(l2Id,'local_l2_support');
 assert.equal(repo.read().status,'Open');
 const claimed=apply(repo,l1,'claim-l1','2026-11-23T02:01:00.000Z');
 assert.equal(claimed.status,'Under L1 Review');
 assert.equal(claimed.assigned_l1,l1Id);
 const escalated=apply(repo,l1,'status:Escalated to L2','2026-11-23T02:02:00.000Z');
 assert.equal(escalated.status,'Escalated to L2');
 const accepted=apply(repo,l2,'claim-l2','2026-11-23T02:03:00.000Z');
 assert.equal(accepted.status,'Under L2 Review');
 assert.equal(accepted.assigned_l2,l2Id);
 const finished=apply(repo,l2,'status:Resolved','2026-11-23T02:04:00.000Z');
 assert.equal(finished.status,'Resolved');
 assert.equal(finished.payload.closureDate,'2026-11-23T02:04:00.000Z');
 assert.equal(finished.payload.activity.length,5);
 assert.equal(repo.count(),4);
 assert.deepEqual(JSON.parse(JSON.stringify(repo.read())),finished);
 assert.equal(canClaim(l1.member,finished,'L1'),false);
});

test('invalid direct resolution, premature L2 claim and wrong workspace are denied by existing contract',()=>{
 const opened=startTicket(),l1=actor(l1Id,'global_l1_support'),l2=actor(l2Id,'local_l2_support');
 assert.equal(canTransition(l1.member,opened,'Resolved'),false);
 assert.throws(()=>buildChange(opened,l1.member,l1.user,'status:Resolved',{now:timestamp}),/transition/);
 assert.throws(()=>buildChange(opened,l2.member,l2.user,'claim-l2',{now:timestamp}),/claim/);
 const foreign={...l1.member,workspace_id:'99999999-9999-4999-8999-999999999999'};
 assert.throws(()=>buildChange(opened,foreign,l1.user,'claim-l1',{now:timestamp}),/mismatch/);
});

test('same revision cannot be written twice in the disposable repository',()=>{
 const repo=disposableRepository(startTicket());
 const l1=actor(l1Id,'global_l1_support');
 const old=repo.read();
 const next=buildChange(old,l1.member,l1.user,'claim-l1',{now:'2026-11-23T02:01:00.000Z'});
 repo.save(next,old.updated_at);
 assert.throws(()=>repo.save(next,old.updated_at),/Concurrent/);
 assert.equal(repo.count(),1);
});
