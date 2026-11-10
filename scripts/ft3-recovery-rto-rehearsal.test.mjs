import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRecoveryEvidence,runRecoveryRehearsal} from './ft3-recovery-rto-rehearsal.mjs';

const counts=Object.freeze({profiles:41,workspaces:4,memberships:42,authUsers:42,storageMetadata:5});
test('genuine local restore evidence cannot establish hosted recovery guarantees',()=>{
 const result=classifyRecoveryEvidence(4.87,counts,5);
 assert.equal(result.status,'LOCAL_LOGICAL_DB_AND_STORAGE_RESTORE_PASS');
 assert.equal(result.localRestoreUnder24Hours,true);
 assert.equal(result.providerPhysicalBackupRestore,'UNVERIFIED');
 assert.equal(result.hostedRto,'UNVERIFIED');
 assert.equal(result.rollingDatabaseRpo,'UNVERIFIED');
 assert.equal(result.rollingStorageRpo,'UNVERIFIED');
 assert.equal(result.productionActivation,'NO_GO');
});
test('unexpected record counts fail the archive-integrity acceptance',()=>{
 assert.throws(()=>classifyRecoveryEvidence(3,{...counts,authUsers:41},5),/database differs/);
 assert.throws(()=>classifyRecoveryEvidence(3,{...counts,storageMetadata:4},5),/database differs/);
});
test('invalid recovery duration and missing storage cannot pass',()=>{
 assert.throws(()=>classifyRecoveryEvidence(0,counts,5),/Invalid elapsed/);
 assert.throws(()=>classifyRecoveryEvidence(-1,counts,5),/Invalid elapsed/);
 assert.throws(()=>classifyRecoveryEvidence(NaN,counts,5),/Invalid elapsed/);
 assert.throws(()=>classifyRecoveryEvidence(2,counts,0),/Invalid elapsed/);
});
test('slow local restoration does not pass even local 24-hour duration check',()=>{
 const result=classifyRecoveryEvidence(86401,counts,5);
 assert.equal(result.localRestoreUnder24Hours,false);
 assert.equal(result.productionActivation,'NO_GO');
});
test('explicit offline source and evidence required before Docker process',async()=>{
 await assert.rejects(runRecoveryRehearsal({}),/Explicit archive, manifest and evidence directory/);
});
