#!/usr/bin/env node
/** Credential-free evidence classification. No login, database writes, or network calls.
 * Caller supplies verified environment metadata, not tokens or secrets.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function assessNativeApplicationAcceptance(evidence){
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))
  throw Error('Verified nonproduction evidence required');
 const checks=[
  ['isolated_environment',evidence.isolated===true],
  ['canonical_board_store',evidence.workBoards===true],
  ['module_assignment_store',evidence.moduleAssignments===true],
  ['role_audit_store',evidence.roleAudit===true],
  ['signed_scope_guard',evidence.scopeGuard===true],
  ['signed_role_snapshot',evidence.roleSnapshot===true],
  ['existing_assignment_writer',evidence.assignmentWriter===true],
  ['registered_module_catalog',evidence.catalogRpc===true],
  ['three_distinct_signed_profiles',evidence.signedAdmin===true&&
    Number.isInteger(evidence.signedMembers)&&evidence.signedMembers>=2],
  ['target_module_role_vocabulary',evidence.moduleRoleVocabulary===true],
  ['target_module_writer_and_readback',evidence.moduleWriterReadback===true],
  ['separate_session_assignment_readback',evidence.separateSessionReadback===true],
  ['reversible_qa_restoration',evidence.restorationVerified===true]
 ];
 const results=checks.map(([id,ok])=>({id,status:ok?'VERIFIED':'BLOCKED'}));
 const blocked=results.filter(x=>x.status==='BLOCKED').map(x=>x.id);
 return {status:blocked.length?'BLOCKED':'READY_FOR_RELEASE_REVIEW',
  verified:results.length-blocked.length,total:results.length,
  checks:results,blocked,productionActivationAllowed:false};
}

async function main(){
 const file=process.argv[2];
 if(!file||process.argv.length!==3)throw Error('Usage: node scripts/cp-native-app-autosync-08-readiness.mjs <verified-evidence.json>');
 const raw=JSON.parse(readFileSync(file,'utf8'));
 const result=assessNativeApplicationAcceptance(raw);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.status==='BLOCKED')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('BLOCKED: '+e.message);process.exitCode=2});
