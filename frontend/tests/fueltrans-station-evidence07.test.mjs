import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStationSourceCsv,reconcileStationSource} from '../fueltrans/station-source04.js';
import {stationCandidateSha256,stationCandidateEvidence} from '../fueltrans/station-evidence07.js';

const CSV='Client,Station ID,Station Name,Remote Password\nUNIOIL,1013C,UNIOIL AIRPORT ROAD,SECRET_NOT_FOR_EXPORT\nARAMCO,1071B,ARAMCO MARCELO GREEN,ANOTHER_SECRET\n';
const parsed=parseStationSourceCsv(CSV);
const compared=reconcileStationSource(parsed.rows,[{client:'UNIOIL',stationId:'1013C',stationName:'UNIOIL AIRPORT ROAD'}]);
const input={parsed,compared,ticketPage:3,ticketCount:17,reviewedAt:'2026-11-23T04:00:00Z'};

test('candidate evidence explicitly denies authority and registry activation',async()=>{
 const evidence=await stationCandidateEvidence(input);
 assert.equal(evidence.verificationStatus,'UNVERIFIED_CANDIDATE');
 assert.equal(evidence.registryActivated,false);
 assert.equal(evidence.authorityVerified,false);
 assert.equal(evidence.storage,'none');
 assert.equal(evidence.comparison.scope,'visible-ticket-page-only');
 assert.equal(evidence.comparison.ticketPage,3);
 assert.equal(evidence.comparison.ticketCount,17);
 assert.deepEqual(evidence.comparison.observed,{
  matched_on_visible_page:1,name_difference_on_visible_page:0,not_on_visible_page:1
 });
 assert.match(evidence.fingerprint.value,/^[a-f0-9]{64}$/);
 assert.equal(evidence.source.extraColumnsIgnored,1);
 assert.ok(Object.isFrozen(evidence));
});

test('projection digest ignores credentials and CSV source row order',async()=>{
 const reordered=parseStationSourceCsv('Client,Station ID,Station Name,Remote Password\nARAMCO,1071B,ARAMCO MARCELO GREEN,CHANGED_SECRET\nUNIOIL,1013C,UNIOIL AIRPORT ROAD,CHANGED_SECRET\n');
 assert.equal(await stationCandidateSha256(reordered.rows),await stationCandidateSha256(parsed.rows));
 const exported=JSON.stringify(await stationCandidateEvidence(input));
 assert.ok(!exported.includes('SECRET_NOT_FOR_EXPORT'));
 assert.ok(!exported.includes('ANOTHER_SECRET'));
 assert.ok(!exported.includes('Remote Password'));
 assert.ok(!exported.includes('1071B')); // Metadata stays in the existing, separately downloaded comparison CSV.
});

test('a changed station name changes the candidate fingerprint',async()=>{
 const changed=parseStationSourceCsv('Client,Station ID,Station Name\nUNIOIL,1013C,OTHER ROAD\nARAMCO,1071B,ARAMCO MARCELO GREEN\n');
 assert.notEqual(await stationCandidateSha256(changed.rows),await stationCandidateSha256(parsed.rows));
});

test('evidence fails closed on validation errors, mismatched comparisons, missing scope and invalid dates',async()=>{
 const invalid=parseStationSourceCsv('Client,Station ID,Station Name\nUNIOIL,1013C,Station Name\nUNIOIL,1013C,Conflicting Name');
 await assert.rejects(()=>stationCandidateEvidence({...input,parsed:invalid}),/validation issues/);
 await assert.rejects(()=>stationCandidateEvidence({...input,compared:compared.slice(0,1)}),/Comparison must cover/);
 await assert.rejects(()=>stationCandidateEvidence({...input,ticketCount:51}),/ticket-page scope/);
 await assert.rejects(()=>stationCandidateEvidence({...input,reviewedAt:'invalid'}),/timestamp/);
 await assert.rejects(()=>stationCandidateEvidence({...input,compared:[{...compared[0],client:'REPHIL'},compared[1]]}),/does not correspond/);
});

test('cannot digest malformed rows or export misleading statuses',async()=>{
 await assert.rejects(()=>stationCandidateSha256([{client:'UNIOIL',stationId:22,stationName:'Airport'}]),/metadata/);
 await assert.rejects(()=>stationCandidateEvidence({...input,compared:[{...compared[0],status:'totally_verified'},compared[1]]}),/does not correspond/);
});
