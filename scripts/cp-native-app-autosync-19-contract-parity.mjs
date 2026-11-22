#!/usr/bin/env node
// Read-only comparison between shipped UI role choices and the existing
// canonical database writer. Mismatches are diagnostic, not role migrations.
import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const values=source=>[...source.matchAll(/'([^']+)'/g)].map(match=>match[1]);

export function uiRoleMatrix(source){
 const body=source.match(/export const MODULE_ROLE_OPTIONS=Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
 if(!body)return {};
 return Object.fromEntries([...body.matchAll(/'([^']+)'\s*:\s*\[([^\]]+)\]/g)]
   .map(match=>[match[1],values(match[2])]));
}

export function canonicalWriterRoleMatrix(source){
 const body=source.match(/allowed:=CASE p_module_id([\s\S]*?)ELSE NULL END;/)?.[1];
 if(!body)return {};
 return Object.fromEntries([...body.matchAll(/WHEN '([^']+)' THEN ARRAY\[([^\]]+)\]/g)]
   .map(match=>[match[1],values(match[2])]));
}

export function compareModuleContracts(ui,writer){
 const issues=[];
 for(const id of new Set([...Object.keys(ui),...Object.keys(writer)])){
  if(!ui[id]||!writer[id])
   issues.push({moduleId:id,reason:'missing-module-contract'});
  else if(JSON.stringify(ui[id])!==JSON.stringify(writer[id]))
   issues.push({moduleId:id,reason:'role-vocabulary-differs'});
 }
 return {status:issues.length?'CONTRACT_RECONCILIATION_REQUIRED':'MATCH',
   matched:Object.keys(ui).filter(id=>writer[id]&&JSON.stringify(ui[id])===JSON.stringify(writer[id])).length,
   issues};
}

function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const ui=uiRoleMatrix(readFileSync(resolve(root,'frontend/user-role-management.js'),'utf8'));
 const sql=execFileSync('docker',[
   'exec','supabase_db_cp16019-disposable-local','psql','-X','-U','postgres',
   '-d','postgres','-Atqc',
   "SELECT pg_get_functiondef('public.wm_admin_set_application_role(uuid,text,text,boolean)'::regprocedure)"
 ],{encoding:'utf8'});
 const writer=canonicalWriterRoleMatrix(sql);
 if(Object.keys(ui).length!==12||Object.keys(writer).length!==12)
  throw Error('Expected existing 12-module contracts not found');
 const compared=compareModuleContracts(ui,writer);
 console.log('CP19_EXISTING_MODULES='+Object.keys(writer).length);
 console.log('CP19_ROLE_CONTRACT_MATCHED='+compared.matched);
 console.log('CP19_ROLE_CONTRACT_STATUS='+compared.status);
 for(const issue of compared.issues)
  console.log('CP19_ROLE_CONTRACT_MISMATCH='+issue.moduleId+':'+issue.reason);
 console.log('NOT VERIFIED: any newly registered board-backed module or its new writer');
}

if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))
 main();
