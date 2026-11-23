import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStationSourceCsv,reconcileStationSource} from '../fueltrans/station-source04.js';
import {stationCandidateEvidence} from '../fueltrans/station-evidence07.js';
import {buildStationOwnerReviewPacket} from '../fueltrans/station-owner-review08.js';
import {stageStationRegistryLocally} from '../fueltrans/station-staging08.js';

const source='Client,Station ID,Station Name,Remote Password\nARAMCO,1071B,SYNTHETIC ARAMCO STATION,SECRET_B\nUNIOIL,1013C,SYNTHETIC UNIOIL STATION,SECRET_A\n';
const time='2026-11-23T04:55:00.000Z';
async function review(){
 const parsed=parseStationSourceCsv(source);
 const evidence=await stationCandidateEvidence({parsed,compared:reconcileStationSource(parsed.rows,[]),
  ticketPage:1,ticketCount:0,reviewedAt:time});
 return buildStationOwnerReviewPacket(evidence,{owner:'Station Operations',sourceReference:'Internal Registry',
  revision:'2026-11-23',approvalReference:'REVIEW-123'},time);
}
test('staging stores only the three approved station fields, and never grants authority',async()=>{
 const staged=await stageStationRegistryLocally(source,await review());
 assert.equal(staged.status,'STAGED_NOT_IMPORTED_NOT_VERIFIED');
 assert.equal(staged.registryActivated,false);
 assert.equal(staged.sourceImported,false);
 assert.equal(staged.authorityVerified,false);
 assert.equal(staged.rows.length,2);
 assert.deepEqual(Object.keys(staged.rows[0]),['client','stationId','stationName']);
 assert.equal(staged.ownerClaim.owner,'Station Operations');
 assert.ok(!JSON.stringify(staged).includes('SECRET_A'));
 assert.ok(!JSON.stringify(staged).includes('SECRET_B'));
 assert.ok(!JSON.stringify(staged).includes('Remote Password'));
});
test('staging is stable when the approved metadata order or ignored secrets change',async()=>{
 const reviewed=await review();
 const reversed='Client,Station ID,Station Name,Remote Password\nUNIOIL,1013C,SYNTHETIC UNIOIL STATION,DIFFERENT_SECRET\nARAMCO,1071B,SYNTHETIC ARAMCO STATION,ANOTHER_SECRET\n';
 const one=await stageStationRegistryLocally(source,reviewed);
 const two=await stageStationRegistryLocally(reversed,reviewed);
 assert.deepEqual(one.rows,two.rows);
 assert.equal(one.fingerprint.value,two.fingerprint.value);
});
test('changed names, row totals, conflicting IDs and forged review authority cannot stage',async()=>{
 const reviewed=await review();
 await assert.rejects(()=>stageStationRegistryLocally(source.replace('SYNTHETIC ARAMCO STATION','CHANGED STATION'),reviewed),/no longer matches/);
 await assert.rejects(()=>stageStationRegistryLocally(source+'UNIOIL,1013C,OTHER NAME,EXTRA\n',reviewed),/validation issues/);
 await assert.rejects(()=>stageStationRegistryLocally(source,{...reviewed,authorityVerified:true}),/non-authoritative owner-review/);
 await assert.rejects(()=>stageStationRegistryLocally('Client,Station ID,Station Name',reviewed),/validation issues/);
});
