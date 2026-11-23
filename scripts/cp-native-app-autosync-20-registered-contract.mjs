#!/usr/bin/env node
// CP20: read-only registered-module readiness. No invented roles or grants.
import {execFileSync} from 'node:child_process';
import {realpathSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {uiRoleMatrix} from './cp-native-app-autosync-19-contract-parity.mjs';

export function assessRegisteredModuleContract(registrations,existingRoles){
 if(!Array.isArray(registrations))
  return {status:'BLOCKED',reason:'Missing authoritative registration records'};
 const newModules=registrations.filter(module=>
  typeof module?.moduleId==='string' &&
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(module.moduleId) &&
  !Object.hasOwn(existingRoles,module.moduleId));
 if(!newModules.length)
  return {status:'BLOCKED',reason:'No genuinely new registered module'};
 return {status:'CONTRACT_REVIEW_REQUIRED',
         reason:'New registered module needs explicit role vocabulary and server writer',
         count:newModules.length};
}

function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const ui=uiRoleMatrix(readFileSync(resolve(root,'frontend/user-role-management.js'),'utf8'));
 const sql=`SELECT COALESCE(json_agg(json_build_object(
    'moduleId',substring(description FROM E'^\\\\[APSYNTRA:MODULE:([a-z][a-z0-9-]*):v1\\\\]')
  )),'[]'::json)::text FROM public.work_boards
  WHERE status='active' AND archived_at IS NULL AND trashed_at IS NULL
    AND description LIKE '[APSYNTRA:MODULE:%'`;
 const data=execFileSync('docker',[
   'exec','supabase_db_cp16019-disposable-local','psql',
   '-X','-U','postgres','-d','postgres','-Atqc',sql
 ],{encoding:'utf8'}).trim();
 const outcome=assessRegisteredModuleContract(JSON.parse(data),ui);
 console.log('CP20_NEW_REGISTRATION_STATUS='+outcome.status);
 console.log('CP20_NEW_REGISTRATION_REASON='+outcome.reason);
 console.log('NOT VERIFIED: newly registered module-specific writer/readback or signed acceptance');
}

if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))
 main();
