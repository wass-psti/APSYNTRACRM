#!/usr/bin/env node
/** Compose the production-only aggregate ceiling after the specialized
 * FuelTrack migration. Disposable fixture generation intentionally retains
 * its own original-source sequencing. No SQL is applied by this command.
 */
import {readFileSync} from 'node:fs';
const source=readFileSync('sql/cp-ws02d-b3-remaining-domain-ceiling-candidate.sql','utf8');
const oldHash='2dc777a252161222a3d2e316dd458eb6';
const hardenedHash='6c6767c6982e908b1bfe4e2464d976a8';
const signature="md5(pg_get_functiondef(to_regprocedure('public.import_fueltrack_activity_backup(jsonb)')))";
const first='-- WS02D_B3_SOURCE_BEGIN:import_fueltrack_activity_backup';
const last='-- WS02D_B3_SOURCE_END:import_fueltrack_activity_backup';
const count=(source,text)=>source.split(text).length-1;
if(count(source,signature)!==1||count(source,oldHash)!==1||
   count(source,first)!==1||count(source,last)!==1||
   source.indexOf(last)<source.indexOf(first))
 throw Error('WS02D source fingerprints or section markers changed: re-review required');
let sql=source.replace(oldHash,hardenedHash);
const begin=sql.indexOf(first);
const end=sql.indexOf(last,begin)+last.length;
sql=sql.slice(0,begin)+
 '-- Dedicated FuelTrack import ceiling was applied first.\n'+
 '-- Preserve its hardened function and require the fingerprint above.\n'+
 sql.slice(end);
const specialized=readFileSync('sql/cp-ws02d-b3-fueltrack-import-ceiling-candidate.sql','utf8');
if(!specialized.includes("private.ws02d_workspace_ceiling(ws,caller,'edit')"))
 throw Error('Dedicated FuelTrack ceiling not found');
if(sql.includes('CREATE OR REPLACE FUNCTION public.import_fueltrack_activity_backup('))
 throw Error('Duplicate privileged function rewrite');
if(process.argv.includes('--check')){
 process.stdout.write('PASS: production ceiling release composition preserves the prior FuelTrack guard\n');
}else{
 process.stdout.write(sql);
}
