import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateFuelTrackReleaseEvidence} from './ft3-release-readiness.mjs';
const policy=JSON.parse(readFileSync(new URL('../config/production-release-policy.json',import.meta.url),'utf8'));
const all={
 liveBoardAndWorkspaceVerified:true,twoMigrationsDeployedInOrder:true,
 rlsAndRoleDenialsVerified:true,realAdminAndUserFlowsVerified:true,
 receiptOptionAVerified:true,auditAndPersistenceVerified:true,
 ciAndDeploymentVerified:true
};
test('owner-approved retirement replaces RPO/RTO/AWS release requirements',()=>{
 const r=evaluateFuelTrackReleaseEvidence({},policy);
 assert.equal(r.recoveryObjectivesRetired,true);
 assert.equal(r.awsDeploymentNotRequired,true);
 assert.equal(r.existingSupabaseBackupsPreserved,true);
 assert.equal(r.productionReadiness,'NO_GO');
 assert.equal(r.pending.length,7);
 assert.equal(r.pending.some(x=>/rpo|rto|rehearsal|aws|backup/i.test(x)),false);
});
test('passing all supplied booleans cannot self-certify production',()=>{
 const r=evaluateFuelTrackReleaseEvidence(all,policy);
 assert.equal(r.productionReadiness,'EVIDENCE_REVIEW_REQUIRED');
 assert.equal(r.evidenceAttested,false);
 assert.equal(r.productionDeployed,false);
});
test('missing denied-action evidence prevents readiness',()=>{
 const r=evaluateFuelTrackReleaseEvidence({...all,rlsAndRoleDenialsVerified:false},policy);
 assert.equal(r.productionReadiness,'NO_GO');
 assert.match(r.pending.join(' '),/RBAC\/RLS/);
});
test('actual signed Admin and User acceptance remains essential',()=>{
 const r=evaluateFuelTrackReleaseEvidence({...all,realAdminAndUserFlowsVerified:undefined},policy);
 assert.equal(r.productionReadiness,'NO_GO');
 assert.match(r.pending.join(' '),/signed Admin\/User/);
});
test('old recovery requirement cannot be silently reintroduced',()=>{
 const x=structuredClone(policy);x.recovery.mandatoryRpoHours=24;
 assert.throws(()=>evaluateFuelTrackReleaseEvidence({},x),/inconsistent/);
});
test('existing backup preservation cannot be weakened',()=>{
 const x=structuredClone(policy);x.recovery.noBackupDeletionAuthorized=false;
 assert.throws(()=>evaluateFuelTrackReleaseEvidence({},x),/inconsistent/);
});
test('no production mutation or AWS operation is implied by evidence',()=>{
 const r=evaluateFuelTrackReleaseEvidence(all,policy);
 assert.equal(r.signedRuntimeVerifiedByThisTool,false);
 assert.equal(r.productionDeployed,false);
});
