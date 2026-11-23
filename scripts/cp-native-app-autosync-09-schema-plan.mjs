#!/usr/bin/env node
/**
 * Read-only staging recovery inventory.
 * Prints an evidence-based ordered plan; never issues SQL or mutates accounts.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const REQUIRED_TABLES=Object.freeze([
 'public.profiles','public.workspaces','public.workspace_members',
 'public.work_boards','public.module_role_assignments',
 'public.apsyntra_role_change_audit'
]);
export const REQUIRED_FUNCTIONS=Object.freeze([
 'public.apsyntra_role_require_scope(uuid)',
 'public.apsyntra_role_user_management_snapshot(uuid)',
 'public.apsyntra_role_manage_user_access(uuid,uuid,text,text,text,boolean,timestamptz)',
 'public.apsyntra_native_application_registry(uuid)'
]);

export function planNativeAppSchemaRecovery(evidence){
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
  evidence.isolated!==true||!Array.isArray(evidence.tables)||
  !Array.isArray(evidence.functions)||!Number.isInteger(evidence.migrationCount)||
  evidence.migrationCount<0||!Number.isInteger(evidence.signedSessionCount)||
  evidence.signedSessionCount<0)
  throw Error('Verified isolated staging schema evidence required');

 const tables=new Set(evidence.tables);
 const functions=new Set(evidence.functions);
 const missingTables=REQUIRED_TABLES.filter(name=>!tables.has(name));
 const missingFunctions=REQUIRED_FUNCTIONS.filter(name=>!functions.has(name));
 const missingQaSessions=Math.max(0,3-evidence.signedSessionCount);
 const migrationProvenance=evidence.migrationCount===0?
  'UNKNOWN_BASELINE':'TRACKED_BASELINE_REQUIRES_RECONCILIATION';
 const activationBlocked=missingTables.length>0||missingFunctions.length>0||
  missingQaSessions>0||evidence.baselineReconciled!==true||
  evidence.targetModuleRoleContractVerified!==true;
 const steps=[
  {id:'reconcile_existing_baseline',status:evidence.baselineReconciled===true?'VERIFIED':'BLOCKED',
   note:'Compare existing staging DDL, migrations and owned data before schema operations'},
  {id:'restore_canonical_tables',status:missingTables.length?'BLOCKED':'VERIFIED',
   missing:missingTables},
  {id:'restore_signed_rpcs',status:missingFunctions.length?'BLOCKED':'VERIFIED',
   missing:missingFunctions},
  {id:'verify_three_signed_profiles',status:missingQaSessions?'BLOCKED':'VERIFIED',
   missingCount:missingQaSessions},
  {id:'verify_application_role_writer',status:evidence.targetModuleRoleContractVerified===true?'VERIFIED':'BLOCKED'}
 ];
 return {state:activationBlocked?'BLOCKED':'READY_FOR_CONTROLLED_NONPRODUCTION_ACCEPTANCE',
  migrationProvenance,steps,missingTables,missingFunctions,missingQaSessions,
  productionActivationAllowed:false,stagingMutationPerformed:false};
}

async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/cp-native-app-autosync-09-schema-plan.mjs <verified-staging-inventory.json>');
 const evidence=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const result=planNativeAppSchemaRecovery(evidence);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.state==='BLOCKED')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error('BLOCKED: '+error.message);process.exitCode=2});
