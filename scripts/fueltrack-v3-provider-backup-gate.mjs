#!/usr/bin/env node
/**
 * Read-only physical-backup preflight for existing WatchdogWorkspace only.
 * Consume JSON from "supabase backups list --project-ref jtlusodorfnyzgyuewkz
 * --output-format json" via stdin; do not invoke any restore endpoint.
 * Freshness is NOT proof of restore availability or a 24h RPO guarantee.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const PROJECT='jtlusodorfnyzgyuewkz';
export function assessPhysicalBackupEvidence(raw,{now=new Date(),maxAgeHours=24}={}){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.backups))
  throw new TypeError('Invalid Supabase backup inventory');
 if(!Number.isFinite(new Date(now).getTime())||maxAgeHours!==24)
  throw new TypeError('Invalid recovery evaluation parameters');
 const completed=raw.backups.filter(x=>x?.is_physical_backup===true&&
   x.status==='COMPLETED'&&Number.isFinite(Date.parse(x.inserted_at||'')))
  .sort((a,b)=>Date.parse(b.inserted_at)-Date.parse(a.inserted_at));
 const latest=completed[0]||null;
 const ageHours=latest?(new Date(now).getTime()-Date.parse(latest.inserted_at))/3600000:null;
 const recent=ageHours!==null&&ageHours>=0&&ageHours<=24;
 return Object.freeze({
  project:PROJECT,
  region:typeof raw.region==='string'?raw.region:null,
  pitrEnabled:raw.pitr_enabled===true,
  walGEnabled:raw.walg_enabled===true,
  latestCompletedPhysicalBackup:latest?.inserted_at||null,
  backupAgeHours:ageHours===null?null:Math.round(ageHours*100)/100,
  inventoryFreshness:recent?'WITHIN_24_HOURS':'EXCEEDS_OR_MISSING_24_HOUR_WINDOW',
  providerPhysicalRestoreRehearsal:'UNVERIFIED',
  hostedRecoveryTimeObjective:'UNVERIFIED',
  actualStorageByteRestore:'UNVERIFIED_FROM_PHYSICAL_BACKUP',
  productionActivation:'NO_GO'
 });
}
async function main(){
 try{
  let source='';
  for await (const chunk of process.stdin)source+=chunk;
  const evidence=assessPhysicalBackupEvidence(JSON.parse(source));
  process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
  // Passing inventory freshness alone must never establish a production GO.
  process.exitCode=2;
 }catch(err){
  process.stderr.write('BACKUP_PREFLIGHT_BLOCKED: '+err.message+'\n');
  process.exitCode=2;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
 await main();
