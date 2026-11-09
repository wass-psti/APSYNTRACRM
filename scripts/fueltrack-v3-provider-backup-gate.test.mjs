import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPhysicalBackupEvidence} from './fueltrack-v3-provider-backup-gate.mjs';
const now=new Date('2026-11-10T00:59:00+08:00');
const backup=inserted_at=>({id:3,is_physical_backup:true,status:'COMPLETED',inserted_at});
const inventory=(items,pitr=false)=>({region:'ap-southeast-2',walg_enabled:true,pitr_enabled:pitr,backups:items});
test('recent completed backup is not mistaken for certified recoverability',()=>{
 const r=assessPhysicalBackupEvidence(inventory([backup('2026-11-08T17:17:15.467Z')]),{now});
 assert.equal(r.inventoryFreshness,'WITHIN_24_HOURS');
 assert.equal(r.productionActivation,'NO_GO');
 assert.equal(r.providerPhysicalRestoreRehearsal,'UNVERIFIED');
 assert.equal(r.actualStorageByteRestore,'UNVERIFIED_FROM_PHYSICAL_BACKUP');
});
test('older backup is flagged as outside 24-hour window',()=>{
 const r=assessPhysicalBackupEvidence(inventory([backup('2026-11-08T00:00:00Z')]),{now});
 assert.equal(r.inventoryFreshness,'EXCEEDS_OR_MISSING_24_HOUR_WINDOW');
});
test('incomplete newer backup cannot shadow older completed backup',()=>{
 const r=assessPhysicalBackupEvidence(inventory([
  {...backup('2026-11-09T16:00:00Z'),status:'FAILED'},
  backup('2026-11-08T17:17:15.467Z')
 ]),{now});
 assert.equal(r.latestCompletedPhysicalBackup,'2026-11-08T17:17:15.467Z');
});
test('PITR enabled does not itself certify physical restoration',()=>{
 const r=assessPhysicalBackupEvidence(inventory([backup('2026-11-08T17:17:15.467Z')],true),{now});
 assert.equal(r.pitrEnabled,true);
 assert.equal(r.productionActivation,'NO_GO');
});
test('missing backups or malformed inventory fails closed',()=>{
 assert.equal(assessPhysicalBackupEvidence(inventory([]),{now}).productionActivation,'NO_GO');
 assert.throws(()=>assessPhysicalBackupEvidence({}),/Invalid Supabase backup inventory/);
});
