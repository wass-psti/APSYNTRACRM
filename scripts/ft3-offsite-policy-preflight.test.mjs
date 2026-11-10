import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOffsitePlan} from './ft3-offsite-policy-preflight.mjs';

const base={
 schemaVersion:1,project:'jtlusodorfnyzgyuewkz',
 provider:'aws-s3-object-lock',
 accountReference:'approved-aws-account',
 bucket:'approved-private-backups',
 publicAccessBlocked:true,
 encryption:{clientSideAuthenticated:true,separateRecoverableKeyCustody:true},
 capture:{database:true,allPrivateStorageBytes:true,metadata:true,pointInTimeCoordinated:true,intervalHours:12},
 retentionDays:30,retentionOwnerApproved:true,budgetOwnerApproved:true,
 roles:{writer:'backup-writer',restore:'restore-reader',administrator:'policy-admin',
  writerActions:['s3:PutObject'],writerCanDelete:false,writerCanChangeRetention:false,writerCanRead:false,
  restoreCanDelete:false,restoreCanChangeRetention:false},
 versioning:'Enabled',objectLockEnabled:true,objectLockMode:'COMPLIANCE',objectLockDefaultDays:30,
 bucketPolicyDeniesUnencryptedUploads:true,providerVerifiedReadOnly:true,
 independentRestoreTested:true,sustained24HourRpoMeasured:true,fullHosted24HourRtoMeasured:true,
 providerPhysicalRestoreRequirementResolved:true
};
const run=x=>evaluateOffsitePlan(structuredClone(x));
test('apparently complete untrusted plan can never certify activation',()=>{
 const result=run(base);
 assert.equal(result.requirementsChecked,true);
 assert.deepEqual(result.issues,[]);
 assert.equal(result.externalPolicyAttested,false);
 assert.equal(result.immutableRetentionActivated,false);
 assert.equal(result.recurringBackupsActivated,false);
 assert.equal(result.productionRelease,'NO_GO');
});
test('missing actual provider and account fails closed',()=>{
 assert.throws(()=>run({...base,provider:'unknown'}),/Unsupported provider/);
 const out=run({...base,accountReference:null,bucket:null});
 assert.equal(out.destinationDeclared,false);
 assert.match(out.issues.join(' '),/Destination/);
});
test('governance-mode object lock is not strict WORM compliance',()=>{
 const out=run({...base,objectLockMode:'GOVERNANCE'});
 assert.match(out.issues.join(' '),/compliance retention/);
});
test('retention decision and period must be approved and consistent',()=>{
 const out=run({...base,retentionOwnerApproved:false,retentionDays:90});
 assert.match(out.issues.join(' '),/retention decision/);
 assert.match(out.issues.join(' '),/does not match approved duration/);
});
test('writer cannot receive delete or bypass privileges',()=>{
 const x=structuredClone(base);
 x.roles.writerActions=['s3:PutObject','s3:DeleteObject','s3:BypassGovernanceRetention'];
 x.roles.writerCanDelete=true;
 const out=run(x);
 assert.match(out.issues.join(' '),/Writer may not delete/);
 assert.match(out.issues.join(' '),/Writer role/);
});
test('a 24 hour nominal cadence is insufficient to guarantee 24 hour RPO',()=>{
 const out=run({...base,capture:{...base.capture,intervalHours:24}});
 assert.match(out.issues.join(' '),/strictly less than 24h/);
});
test('missing coordinated Storage or full-service recovery denies readiness',()=>{
 const x=structuredClone(base);
 x.capture.allPrivateStorageBytes=false;
 x.fullHosted24HourRtoMeasured=false;
 x.providerPhysicalRestoreRequirementResolved=false;
 const out=run(x);
 assert.match(out.issues.join(' '),/Whole Workspace/);
 assert.match(out.issues.join(' '),/RPO\/RTO/);
 assert.match(out.issues.join(' '),/Supabase provider/);
});
test('duplicate principal or wildcard writer privilege fails',()=>{
 const x=structuredClone(base);
 x.roles.writer=x.roles.administrator;
 x.roles.writerActions=['*'];
 const out=run(x);
 assert.match(out.issues.join(' '),/Distinct/);
 assert.match(out.issues.join(' '),/Writer may not/);
});
test('Cloudflare bucket lock is configurable and requires threat-model approval',()=>{
 const x=structuredClone(base);
 x.provider='cloudflare-r2-bucket-lock';
 x.bucketLockEnabled=true;x.bucketLockRetentionDays=30;
 x.bucketLockPrefix='';x.bucketLockChangeRestricted=true;
 const out=run(x);
 assert.match(out.issues.join(' '),/threat model/);
 assert.equal(out.productionRelease,'NO_GO');
});
test('R2 insufficient coverage is explicitly rejected',()=>{
 const x=structuredClone(base);
 x.provider='cloudflare-r2-bucket-lock';
 x.bucketLockEnabled=true;x.bucketLockRetentionDays=30;
 x.bucketLockPrefix='test-only/';x.bucketLockChangeRestricted=false;
 const out=run(x);
 assert.match(out.issues.join(' '),/cover all objects/);
});
test('secret fields may not be embedded in the plan',()=>{
 const x=structuredClone(base);x.accessKey='abc';
 assert.throws(()=>run(x),/Never put credential/);
 const y=structuredClone(base);y.encryption.secretKey='123';
 assert.throws(()=>run(y),/Never put credential/);
});
test('public bucket access and lack of independent key custody fail closed',()=>{
 const x=structuredClone(base);
 x.publicAccessBlocked=false;x.encryption.separateRecoverableKeyCustody=false;
 const out=run(x);
 assert.match(out.issues.join(' '),/public access/);
 assert.match(out.issues.join(' '),/Key escrow/);
});
