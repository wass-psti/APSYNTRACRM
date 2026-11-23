#!/usr/bin/env node
// Read-only runtime-contract inspection. Never repoint, start or mutate services.
import {execFileSync} from 'node:child_process';
import {realpathSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessRegisteredModuleContract}
 from './cp-native-app-autosync-20-registered-contract.mjs';
import {uiRoleMatrix} from './cp-native-app-autosync-19-contract-parity.mjs';

const AUTH='supabase_auth_cp16019-disposable-local';
const REST='supabase_rest_cp16019-disposable-local';
const DATABASE='supabase_db_cp16019-disposable-local';

function docker(...args){
 return execFileSync('docker',args,{encoding:'utf8'});
}

export function assessRuntimeIntegration({
 authImage,restImage,authDatabase,restDatabase,targetDatabase,
 localMigrations,expectedStagingMigrations,
 registrations,knownRoles,moduleContractVerified=false,
 authHealthVerified=false,restHealthVerified=false
}={}){
 const issues=[];
 if(authImage!=='public.ecr.aws/supabase/gotrue:v2.197.0')
  issues.push('Installed GoTrue image not verified');
 if(restImage!=='public.ecr.aws/supabase/postgrest:v16.4')
  issues.push('Installed PostgREST image not verified');
 if(!targetDatabase||authDatabase!==targetDatabase||restDatabase!==targetDatabase)
  issues.push('GoTrue and Data API do not target the same isolated database');
 if(localMigrations!==expectedStagingMigrations)
  issues.push('Installed Auth migration history differs from staging evidence');
 if(!authHealthVerified||!restHealthVerified)
  issues.push('Same-backend signed Auth and Data API health not verified');
 const module=assessRegisteredModuleContract(registrations,knownRoles||{});
 if(module.status!=='CONTRACT_REVIEW_REQUIRED')
  issues.push('No actual newly registered module contract');
 else if(!moduleContractVerified)
  issues.push('Registered module role vocabulary and domain writer not verified');
 return {status:issues.length?'BLOCKED':'RUNTIME_READY_FOR_SIGNED_TEST',
         issues,registrationStatus:module.status};
}

function readOnlySql(sql){
 return docker('exec',DATABASE,'psql','-X','-v','ON_ERROR_STOP=1',
               '-U','postgres','-d','postgres','-Atqc',sql).trim();
}

function inspectContainer(name){
 return JSON.parse(docker('inspect',name))[0];
}

function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const existing=uiRoleMatrix(readFileSync(resolve(root,'frontend/user-role-management.js'),'utf8'));
 const auth=inspectContainer(AUTH);
 const rest=inspectContainer(REST);
 const registrations=JSON.parse(readOnlySql(`SELECT COALESCE(json_agg(json_build_object(
   'moduleId',substring(description FROM E'^\\\\[APSYNTRA:MODULE:([a-z][a-z0-9-]*):v1\\\\]')
 )),'[]'::json)::text FROM public.work_boards WHERE status='active' AND
 archived_at IS NULL AND trashed_at IS NULL AND description LIKE '[APSYNTRA:MODULE:%'`));
 const migrationCount=Number(readOnlySql('SELECT count(*) FROM auth.schema_migrations'));
 // Container image and migration counts are public metadata. Never output
 // service DB URIs, JWT secrets, API keys, passwords or bearer tokens.
 const result=assessRuntimeIntegration({
  authImage:auth.Config.Image,restImage:rest.Config.Image,
  authDatabase:'existing-local-postgres',restDatabase:'existing-local-postgres',
  targetDatabase:'cp_native20_owner_clone', // standalone DB is destroyed on exit
  localMigrations:migrationCount,expectedStagingMigrations:84,
  registrations,knownRoles:existing
 });
 console.log('CP22_RUNTIME_INTEGRATION='+result.status);
 console.log('CP22_SOURCE_AUTH_MIGRATIONS='+migrationCount);
 console.log('CP22_REGISTRATION='+result.registrationStatus);
 for(const issue of result.issues)console.log('CP22_BLOCKER='+issue);
 console.log('NOT VERIFIED: actual signed role writer or same-backend GoTrue/Data API');
}

if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))
 main();
