import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRollingRpo,observeRpoFromArchive} from './ft3-rpo-observation.mjs';
const now='2026-11-09T18:00:00Z';
const hour=3600000;
const time=delta=>Date.parse(now)-delta*hour;
const backups=times=>times.map(iso=>({status:'COMPLETED',is_physical_backup:true,inserted_at:iso}));
const sample=extra=>({
 now,
 backups:backups(['2026-11-07T17:17:15Z','2026-11-08T17:17:15Z','2026-11-09T17:17:15Z']),
 storageSnapshotCaptureTimes:[time(5),time(4.9)],
 sqlSnapshotCaptureTimes:[time(4.7),time(4.5)],
 archivedStorageCount:5,archivedStorageBytes:114010,
 liveStorageCount:5,liveStorageBytes:114010,archivedSnapshotCount:1,
 ...extra
});
test('even fresh physical backup and matching Storage metadata are not proof of rolling RPO',()=>{
 const r=evaluateRollingRpo(sample());
 assert.equal(r.completedPhysicalBackupsObserved,3);
 assert.equal(r.observedPhysicalCadenceWithin24h,true);
 assert.equal(r.archiveStorageObjects,5);
 assert.equal(r.liveStorageCountBytesMatch,true);
 assert.equal(r.liveStorageContentsVerifiedAgainstArchive,false);
 assert.equal(r.sustainedIndependentStorageRpoVerified,false);
 assert.equal(r.sustainedIndependentDatabaseRpoVerified,false);
 assert.equal(r.actualProviderPhysicalRestore,'UNVERIFIED');
 assert.equal(r.productionRelease,'NO_GO');
});
test('missing live inventory never becomes a Storage match',()=>{
 const r=evaluateRollingRpo(sample({liveStorageCount:null,liveStorageBytes:null}));
 assert.equal(r.liveStorageMetadataCompared,false);
 assert.equal(r.liveStorageCountBytesMatch,null);
});
test('Storage live count mismatch is visible without exposing identities',()=>{
 const r=evaluateRollingRpo(sample({liveStorageCount:6,liveStorageBytes:114010}));
 assert.equal(r.liveStorageCountBytesMatch,false);
});
test('physical backup cadence over 24 hours is flagged as observation failure',()=>{
 const r=evaluateRollingRpo(sample({
  backups:backups(['2026-11-07T12:00:00Z','2026-11-09T17:17:15Z'])
 }));
 assert.equal(r.observedPhysicalCadenceWithin24h,false);
 assert.ok(r.maximumObservedPhysicalBackupGapHours>24);
});
test('stale latest provider backup fails observed freshness',()=>{
 const r=evaluateRollingRpo(sample({backups:backups(['2026-11-06T00:00:00Z','2026-11-07T17:00:00Z'])}));
 assert.equal(r.observedPhysicalCadenceWithin24h,false);
 assert.ok(r.newestPhysicalBackupAgeHours>24);
});
test('incomplete and future-dated backup entries cannot improve history',()=>{
 const r=evaluateRollingRpo(sample({backups:[
  ...backups(['2026-11-08T17:17:15Z']),
  {status:'FAILED',is_physical_backup:true,inserted_at:'2026-11-09T17:17:15Z'},
  {status:'COMPLETED',is_physical_backup:true,inserted_at:'2026-11-11T17:17:15Z'}
 ]}));
 assert.equal(r.completedPhysicalBackupsObserved,1);
 assert.equal(r.observedPhysicalCadenceWithin24h,false);
});
test('future local capture timestamp cannot be accepted',()=>{
 assert.throws(()=>evaluateRollingRpo(sample({storageSnapshotCaptureTimes:[time(-1)]})),/capture evidence/);
});
test('empty Storage backup does not establish recovery',()=>{
 assert.throws(()=>evaluateRollingRpo(sample({archivedStorageCount:0,archivedStorageBytes:0})),/Missing real private/);
});
test('no independently retained second snapshot means rolling assertion always false',()=>{
 const r=evaluateRollingRpo(sample({archivedSnapshotCount:1}));
 assert.equal(r.independentSnapshotCount,1);
 assert.equal(r.sustainedIndependentStorageRpoVerified,false);
});
test('real archive observation fails closed for missing local paths',async()=>{
 await assert.rejects(observeRpoFromArchive({archive:'',manifest:'',providerInventory:{backups:[]}}),/Private archive/);
});
