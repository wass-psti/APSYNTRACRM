import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStationSourceCsv,reconcileStationSource} from '../fueltrans/station-source04.js';
import {stationCandidateEvidence} from '../fueltrans/station-evidence07.js';
import {buildStationOwnerReviewPacket} from '../fueltrans/station-owner-review08.js';

const now='2026-11-23T04:50:00.000Z';
const details={owner:'Station Operations',sourceReference:'Internal station directory export',
 revision:'2026-11-23',approvalReference:'REVIEW-123'};
async function candidate(){
 const parsed=parseStationSourceCsv('Client,Station ID,Station Name,AnyDesk Password\nUNIOIL,1013C,SYNTHETIC STATION,PRIVATE_VALUE');
 return stationCandidateEvidence({parsed,compared:reconcileStationSource(parsed.rows,[]),
  ticketPage:1,ticketCount:0,reviewedAt:now});
}
test('owner packet remains a non-authoritative handoff even with an approval reference',async()=>{
 const packet=buildStationOwnerReviewPacket(await candidate(),details,now);
 assert.equal(packet.reviewStatus,'AWAITING_INDEPENDENT_OWNER_CONFIRMATION');
 assert.equal(packet.authorityVerified,false);
 assert.equal(packet.registryActivated,false);
 assert.equal(packet.sourceImported,false);
 assert.equal(packet.proposedSource.approvalReference,'REVIEW-123');
 assert.match(packet.fingerprint.value,/^[a-f0-9]{64}$/);
 assert.equal(packet.scope.uniqueStations,1);
 assert.equal(packet.comparison.observed.not_on_visible_page,1);
 assert.equal(JSON.stringify(packet).includes('PRIVATE_VALUE'),false);
 assert.equal(JSON.stringify(packet).includes('1013C'),false);
});
test('untrusted hidden fields cannot hitchhike into downloaded packet',async()=>{
 const evidence=await candidate();
 evidence.source.secret='HIDDEN_SOURCE_SECRET';
 evidence.comparison.secret='HIDDEN_COMPARISON_SECRET';
 evidence.fingerprint.secret='HIDDEN_FINGERPRINT_SECRET';
 const packet=buildStationOwnerReviewPacket(evidence,details,now);
 assert.equal(JSON.stringify(packet).includes('HIDDEN_'),false);
});
test('reject missing owner, source reference, revision, bad timestamps and invalid manifests',async()=>{
 const evidence=await candidate();
 for(const key of ['owner','sourceReference','revision']){
  assert.throws(()=>buildStationOwnerReviewPacket(evidence,{...details,[key]:''},now),/must contain/);
 }
 assert.throws(()=>buildStationOwnerReviewPacket(evidence,details,'not-a-date'),/timestamp/);
 assert.throws(()=>buildStationOwnerReviewPacket({...evidence,authorityVerified:true},details,now),/unverified station-candidate/);
 assert.throws(()=>buildStationOwnerReviewPacket({...evidence,fingerprint:{value:'a'.repeat(63)}},details,now),/unverified station-candidate/);
 assert.throws(()=>buildStationOwnerReviewPacket(evidence,{...details,owner:'Owner\nInjected'},now),/printable/);
});
test('packet does not self-certify user supplied approval details',async()=>{
 const p=buildStationOwnerReviewPacket(await candidate(),{...details,approvalReference:''},now);
 assert.equal(p.proposedSource.approvalReference,null);
 assert.match(p.nextAction,/independent confirmation/i);
 assert.match(p.disclaimer,/NOT independently verified/);
 assert.ok(Object.isFrozen(p));
});
