#!/usr/bin/env node
// CP21: non-mutating prerequisite audit. Never initiate signed role writes to
// the shared developer database when role-audit history cannot be restored.
import {execFileSync} from 'node:child_process';
import {realpathSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {uiRoleMatrix} from './cp-native-app-autosync-19-contract-parity.mjs';
import {assessRegisteredModuleContract}
 from './cp-native-app-autosync-20-registered-contract.mjs';

export function assessSignedWriterReadiness({
 sourceName,sourceDatabase,activeRegistrations,knownRoles,
 auditTriggerName,auditTriggerEnabled,auditFunctionText,
 isolatedBackend,authBackendMatchesWriter,independentSignedProfiles,
 signedWriterAvailable,signedReaderAvailable,moduleContractVerified
}={}){
 const blockers=[];
 const allowedSources=new Set([
  'supabase_db_cp16019-disposable-local:postgres',
  'cp_native20_pg_owner_qa:cp_native20_owner_clone'
 ]);
 if(!allowedSources.has(sourceName+':'+sourceDatabase))
  blockers.push('Unrecognized read-only source database');
 if(auditTriggerName!=='wm_application_audit_immutable'||
    auditTriggerEnabled!==true ||
    !auditFunctionText?.includes('Application-role audit history is append-only'))
  blockers.push('Canonical append-only audit contract cannot be verified');
 const registry=assessRegisteredModuleContract(activeRegistrations,knownRoles||{});
 if(registry.status!=='CONTRACT_REVIEW_REQUIRED')
  blockers.push('No authoritative newly registered module contract');
 else if(!moduleContractVerified)
  blockers.push('Registered module writer/roles require explicit verification');
 if(!isolatedBackend)blockers.push('No disposable, one-backend write target');
 if(!authBackendMatchesWriter)blockers.push('GoTrue and role writer not connected to one database');
 if(independentSignedProfiles!==3)blockers.push('Three real signed identities not verified on target');
 if(!signedWriterAvailable||!signedReaderAvailable)
  blockers.push('Signed canonical writer/reader pair unavailable');
 return {status:blockers.length?'BLOCKED':'READY_FOR_ACCEPTANCE',blockers,
         registryStatus:registry.status};
}

function readOnlySql(query){
 return execFileSync('docker',[
   'exec','supabase_db_cp16019-disposable-local','psql','-X',
   '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-Atqc',query
 ],{encoding:'utf8'}).trim();
}

function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const ui=uiRoleMatrix(readFileSync(resolve(root,'frontend/user-role-management.js'),'utf8'));
 const observed=JSON.parse(readOnlySql(`
  SELECT json_build_object(
   'sourceDatabase',current_database(),
   'triggerName',(SELECT tgname FROM pg_trigger WHERE
      tgrelid='public.wm_application_role_audit'::regclass
      AND tgname='wm_application_audit_immutable' AND NOT tgisinternal),
   'triggerEnabled',(SELECT tgenabled='O' FROM pg_trigger WHERE
      tgrelid='public.wm_application_role_audit'::regclass
      AND tgname='wm_application_audit_immutable' AND NOT tgisinternal),
   'auditFunctionText',(SELECT pg_get_functiondef(
      'public.wm_reject_application_audit_mutation()'::regprocedure)),
   'registrations',(SELECT COALESCE(json_agg(json_build_object(
      'moduleId',substring(description FROM E'^\\\\[APSYNTRA:MODULE:([a-z][a-z0-9-]*):v1\\\\]'))),
      '[]'::json) FROM public.work_boards WHERE status='active' AND
      archived_at IS NULL AND trashed_at IS NULL AND description LIKE
      '[APSYNTRA:MODULE:%')
  )::text`));
 const readiness=assessSignedWriterReadiness({
   sourceName:'supabase_db_cp16019-disposable-local',
   sourceDatabase:observed.sourceDatabase,
   activeRegistrations:observed.registrations,
   knownRoles:ui,
   auditTriggerName:observed.triggerName,
   auditTriggerEnabled:observed.triggerEnabled,
   auditFunctionText:observed.auditFunctionText,
   // CP20 owner clone has no configured Auth/Data API. CP18's signed
   // identities use this DIFFERENT existing local source database.
   isolatedBackend:false,authBackendMatchesWriter:false,
   independentSignedProfiles:0,
   signedWriterAvailable:false,signedReaderAvailable:false,
   moduleContractVerified:false
 });
 console.log('CP21_SIGNED_WRITER_STATUS='+readiness.status);
 console.log('CP21_REGISTRATION_STATUS='+readiness.registryStatus);
 console.log('CP21_APPEND_ONLY_AUDIT='+
   (readiness.blockers.some(b=>b.startsWith('Canonical append'))?'UNVERIFIED':'VERIFIED'));
 for(const blocker of readiness.blockers)console.log('CP21_BLOCKER='+blocker);
 console.log('NOT VERIFIED: three independently signed profiles writing roles on staging-compatible clone');
}

if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))
 main();
