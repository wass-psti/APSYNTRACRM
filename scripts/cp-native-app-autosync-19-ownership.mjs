#!/usr/bin/env node
// CP19: immutable staged-clone ownership preflight. No GRANT, ALTER or writes.
import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

export function assessStagingAuthOwnerFidelity(observed){
 const issues=[];
 if(!observed||typeof observed!=='object')
  return {status:'BLOCKED',issues:['No Auth ownership evidence']};
 if(observed.auth_schema_owner!=='supabase_admin')
  issues.push('Auth schema owner differs from live staging');
 if(observed.auth_table_count!==27||observed.auth_tables_owned_by_auth_admin!==27)
  issues.push('Auth table owner or count differs from live staging');
 if(observed.auth_sequence_count!==1||observed.auth_sequences_owned_by_auth_admin!==1)
  issues.push('Auth sequence owner or count differs from live staging');
 // A mismatch cannot be repaired by silently widening privileges, and
 // pg_has_role is evidence only; never perform global GRANT ROLE.
 return {status:issues.length?'BLOCKED':'OWNER_TOPOLOGY_MATCH',
         issues,tableCount:observed.auth_table_count||0};
}

function main(){
 if(process.argv.length!==3||process.argv[2]!=='--clone-only')
  throw Error('CP19 probe requires isolated clone opt-in');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const sql=readFileSync(resolve(root,'sql/acceptance/cp-native-app-autosync-19-auth-ownership.sql'),'utf8');
 const result=execFileSync('docker',[
   'exec','-i','supabase_db_cp16019-disposable-local',
   'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres',
   '-d','cp_native15_staging_clone','-At','-f','/dev/stdin'
 ],{input:sql,encoding:'utf8'});
 const lines=result.trim().split('\n');
 const observed=JSON.parse(lines[lines.length-1]);
 const outcome=assessStagingAuthOwnerFidelity(observed);
 console.log('CP19_AUTH_OWNER_FIDELITY='+outcome.status);
 console.log('CP19_AUTH_OBJECTS='+observed.auth_table_count+' tables, '
   +observed.auth_sequence_count+' sequence; source ownership baseline=27 and 1');
 for(const issue of outcome.issues)console.log('CP19_BLOCKER='+issue);
 console.log('CP19_AUTH_ROLE_SWITCH='+(observed.postgres_can_assume_auth_admin?'available':'unavailable'));
 console.log('NOT VERIFIED: staging-compatible isolated GoTrue startup or signed role writer');
}

if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))
 main();
