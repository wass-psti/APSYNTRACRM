#!/usr/bin/env node
/**
 * CP12 credential-free, read-only staging migration prerequisite plan.
 * Verifies repository SQL provenance, NOT compatibility of remote staging.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const REQUIRED_MIGRATIONS=Object.freeze([
 '20260917142647_stage_g_m46_boards_backend_data_contract_recovery.sql',
 '20260919165239_stage_g_m47_boards_table_group_item_recovery.sql',
 '20261030070403_cp_rc011_install_bootstrap_role_configuration.sql',
 '20261030080046_cp_rc02_bootstrap_user_role_management.sql',
 '20261030080703_cp_rc02_preserve_explicit_user_role_assignments.sql',
 '20261110101331_cp_rc03_workspace_scoped_mrh_role_management.sql',
 '20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql',
 '20261122010413_cp_native_app_autosync_03_registry_projection.sql'
]);

export function assessNativeAppMigrationPlan({manifest,staging,contents}={}){
 if(!manifest||!staging||!contents||
  typeof staging!=='object'||staging.isolated!==true||
  !Number.isInteger(staging.migrationCount)||staging.migrationCount<0||
  !Number.isInteger(staging.authUserCount)||staging.authUserCount<0||
  !Number.isInteger(staging.signedSessionCount)||staging.signedSessionCount<0||
  typeof staging.baselineReconciled!=='boolean')
   throw Error('Explicit verified nonproduction inventory is required');
 const entries=[...(manifest.files||[]),...(manifest.forward_migrations||[])];
 const byName=new Map(entries.map(entry=>[entry.file,entry]));
 const migrationSequence=REQUIRED_MIGRATIONS.map(file=>{
  const entry=byName.get(file);
  const sql=contents[file];
  const checked=entry&&typeof sql==='string'&&
   createHash('sha256').update(sql).digest('hex')===entry.sha256&&
   Buffer.byteLength(sql,'utf8')===entry.bytes;
  return {file,sourceVerified:checked===true};
 });
 const sourcesVerified=migrationSequence.every(item=>item.sourceVerified);
 const missingBackend=['workBoards','moduleAssignments','roleAudit','scopeGuard',
  'roleSnapshot','assignmentWriter','catalogRpc'].filter(key=>staging[key]!==true);
 const missingSignedSessions=Math.max(0,3-staging.signedSessionCount);
 const contract=staging.moduleContract;
 const contractDefined=!!contract&&
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(contract.moduleId||'')&&
  Array.isArray(contract.roles)&&contract.roles.length>0&&
  contract.roles.every(role=>typeof role==='string'&&role.length>0)&&
  typeof contract.writerRpc==='string'&&contract.writerRpc.length>0&&
  typeof contract.readbackRpc==='string'&&contract.readbackRpc.length>0&&
  contract.serverVerified===true;
 const gates=[
  {id:'verified_repository_sql',pass:sourcesVerified},
  {id:'reconciled_existing_staging_baseline',pass:staging.baselineReconciled},
  {id:'complete_staging_role_backend',pass:missingBackend.length===0},
  {id:'three_genuine_signed_sessions',pass:missingSignedSessions===0&&staging.authUserCount>=3&&
   staging.signedSessionsVerified===true},
  {id:'actual_module_specific_role_contract',pass:contractDefined},
  {id:'signed_two_member_write_read_restore',pass:staging.signedReadbackRestored===true}
 ];
 return {
  state:gates.every(g=>g.pass)?'READY_FOR_SEPARATE_RELEASE_REVIEW':'BLOCKED',
  gates:gates.map(g=>({id:g.id,status:g.pass?'VERIFIED':'BLOCKED'})),
  migrationSequence,missingBackend,missingSignedSessions,
  stagingMigrationCount:staging.migrationCount,
  noAutomaticSchemaChanges:true,noAutomaticRoleChanges:true,
  productionActivationAllowed:false
 };
}
function main(){
 const manifest=JSON.parse(readFileSync(resolve(root,'supabase/migration-source-manifest.json'),'utf8'));
 const contents=Object.fromEntries(REQUIRED_MIGRATIONS.map(file=>[
  file,readFileSync(resolve(root,'supabase/migrations',file),'utf8')
 ]));
 // Observed from read-only staging inspection, not inferred from a local fixture.
 const staging={
  isolated:true,migrationCount:0,authUserCount:2,signedSessionCount:0,
  baselineReconciled:false,workBoards:false,moduleAssignments:false,
  roleAudit:false,scopeGuard:false,roleSnapshot:false,
  assignmentWriter:false,catalogRpc:false,signedSessionsVerified:false,
  signedReadbackRestored:false,moduleContract:null
 };
 const result=assessNativeAppMigrationPlan({manifest,staging,contents});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.state==='BLOCKED')process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main();
