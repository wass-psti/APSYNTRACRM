#!/usr/bin/env node
/**
 * Assess remaining FuelTrack release acceptance obligations after authorized
 * project-wide recovery policy retirement. Input is UNATTESTED operator
 * evidence; this cannot apply production migrations or certify deployment.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const readPolicy=()=>JSON.parse(readFileSync(new URL('../config/production-release-policy.json',import.meta.url),'utf8'));
const FIELDS=[
 ['liveBoardAndWorkspaceVerified','Real Board/workspace identity, approved project and scope'],
 ['twoMigrationsDeployedInOrder','Both authorized migrations deployed in sequence and independently inventoried'],
 ['rlsAndRoleDenialsVerified','Signed RBAC/RLS, cross-workspace, wrong-Board and revoked-session denials'],
 ['realAdminAndUserFlowsVerified','Genuine signed Admin/User lifecycle, approval/refueling and stale write denial'],
 ['receiptOptionAVerified','Receipt Option A privacy and actual private Storage read/upload/delete controls'],
 ['auditAndPersistenceVerified','Audit log, request/receipt persistence after refresh and session transitions'],
 ['ciAndDeploymentVerified','Protected branch checks, deployment bundle and real browser acceptance']
];
export function evaluateFuelTrackReleaseEvidence(evidence={},policy=readPolicy()){
 if(!policy||policy.schemaVersion!==1||
   policy.recovery?.mandatoryRpoHours!==null||
   policy.recovery?.mandatoryRtoHours!==null||
   policy.recovery?.mandatoryRecoveryRehearsal!==false||
   policy.recovery?.awsInfrastructureRequired!==false||
   policy.recovery?.existingSupabaseBackupsPreserved!==true||
   policy.recovery?.noBackupDeletionAuthorized!==true)
  throw Error('Current approved release policy is inconsistent or weakens backup preservation');
 const pending=FIELDS.filter(([k])=>evidence[k]!==true).map(([,description])=>description);
 return {
  policyEffectiveDate:policy.effectiveDate,
  recoveryObjectivesRetired:true,
  awsDeploymentNotRequired:true,
  existingSupabaseBackupsPreserved:true,
  checkedRequirements:FIELDS.length,
  requirementsEvidenceReported:FIELDS.length-pending.length,
  pending,
  // A self-declared JSON file cannot establish verified live credentials
  // or prove a real production release. A human/connector review is required.
  evidenceAttested:false,
  signedRuntimeVerifiedByThisTool:false,
  productionReadiness:pending.length===0?'EVIDENCE_REVIEW_REQUIRED':'NO_GO',
  productionDeployed:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error('This script accepts no production-changing arguments');
  const result=evaluateFuelTrackReleaseEvidence();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){process.stderr.write('FT3_RELEASE_READINESS_BLOCKED: '+error.message+'\n');process.exitCode=2;}
}
