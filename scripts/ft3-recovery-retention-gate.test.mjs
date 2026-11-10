import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRetentionPolicy,auditRetentionIndex} from './ft3-recovery-retention-gate.mjs';

const now='2026-11-10T00:00:00.000Z';
const daysAgo=n=>new Date(Date.parse(now)-n*86400000).toISOString();
const capture=(n)=>({
 captureId:'capture-'+n+'-unique',
 archiveIdentity:'archive-'+n,
 manifestSha256:(n+1).toString(16).padStart(64,'0'),
 integrityVerified:true,sqlFiles:4,storageObjects:5,storageBytes:114010,
 completedAt:daysAgo(n),databaseSnapshotAt:daysAgo(n),
 storageSnapshotAt:daysAgo(n)
});
test('a single checked archive is not rolling retention',()=>{
 const r=evaluateRetentionPolicy([capture(0)],{now});
 assert.equal(r.verifiedIndependentSets,1);
 assert.equal(r.retainedHistorySufficient,false);
 assert.equal(r.allObservedGapsWithin24Hours,false);
 assert.equal(r.productionRelease,'NO_GO');
});
test('seven daily independently verified captures satisfy only observed local evidence',()=>{
 const r=evaluateRetentionPolicy(Array.from({length:7},(_,n)=>capture(n)),{now});
 assert.equal(r.localSnapshotPolicyObserved,true);
 assert.equal(r.retainedHistorySufficient,true);
 assert.equal(r.maximumConsecutiveSnapshotGapHours,24);
 assert.equal(r.captureTimestampsAttested,false);
 assert.equal(r.backupsImmutableOrOffsiteVerified,false);
 assert.equal(r.recurringCaptureEnforced,false);
 assert.equal(r.providerPhysicalRestore,'UNVERIFIED');
 assert.equal(r.productionRelease,'NO_GO');
});
test('one gap exceeding 24 hours fails despite recent last snapshot',()=>{
 const r=evaluateRetentionPolicy([capture(7),capture(5),capture(4),capture(3),capture(2),capture(1),capture(0)],{now});
 assert.equal(r.allObservedGapsWithin24Hours,false);
 assert.equal(r.localSnapshotPolicyObserved,false);
});
test('stale most recent combined data point fails freshness',()=>{
 const r=evaluateRetentionPolicy(Array.from({length:7},(_,n)=>capture(n+2)),{now});
 assert.equal(r.freshnessWithin24Hours,false);
 assert.equal(r.localSnapshotPolicyObserved,false);
});
test('the oldest data point is taken across database and Storage',()=>{
 const all=Array.from({length:7},(_,n)=>capture(n));
 all[0].storageSnapshotAt=daysAgo(1.5);
 const r=evaluateRetentionPolicy(all,{now});
 assert.equal(r.newestCombinedSnapshotAgeHours,24);
 assert.equal(r.newestStorageSnapshotAgeHours,24);
 assert.equal(r.localSnapshotPolicyObserved,false);
 // The most recent storage set is still the prior-day snapshot.
 // Seven capture IDs alone do not establish seven full days of coverage.
});
test('duplicated capture ID or manifest cannot inflate history',()=>{
 const all=[capture(0),capture(1)];
 all[1].captureId=all[0].captureId;
 assert.throws(()=>evaluateRetentionPolicy(all,{now}),/Duplicate independent/);
 const another=[capture(0),capture(1)];another[1].manifestSha256=another[0].manifestSha256;
 assert.throws(()=>evaluateRetentionPolicy(another,{now}),/Duplicate independent/);
});
test('capture with no private Storage or no SQL verification is denied',()=>{
 assert.throws(()=>evaluateRetentionPolicy([{...capture(0),storageObjects:0}],{now}),/Incomplete/);
 assert.throws(()=>evaluateRetentionPolicy([{...capture(0),sqlFiles:0}],{now}),/Incomplete/);
 assert.throws(()=>evaluateRetentionPolicy([{...capture(0),integrityVerified:false}],{now}),/Incomplete/);
});
test('a future timestamp or capture completion before Storage capture fails',()=>{
 assert.throws(()=>evaluateRetentionPolicy([{...capture(0),databaseSnapshotAt:daysAgo(-1)}],{now}),/timestamp ordering/);
 assert.throws(()=>evaluateRetentionPolicy([{...capture(0),storageSnapshotAt:daysAgo(-1)}],{now}),/timestamp ordering/);
});
test('a different project or missing index is rejected before filesystem reads',async()=>{
 await assert.rejects(auditRetentionIndex({schemaVersion:1,project:'another',sets:[]}),/Invalid existing-project/);
 await assert.rejects(auditRetentionIndex(null),/Invalid existing-project/);
});
test('timestamps cannot be treated as provider certified time',()=>{
 const r=evaluateRetentionPolicy([capture(1),capture(0)],{now,minRetainedDays:2});
 assert.equal(r.captureTimestampsAttested,false);
 assert.equal(r.productionRelease,'NO_GO');
});
