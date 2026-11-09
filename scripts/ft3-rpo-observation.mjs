#!/usr/bin/env node
/**
 * One-shot READ-ONLY observation of physical-backup cadence and the age of a
 * separately verified local Storage and SQL archive.
 * No external requests, backups, persistence, background monitoring or GO decision.
 *
 * pipe Supabase CLI backups list --output-format json to stdin
 * --archive and --manifest must refer to existing local owner-only files.
 * --live-storage-count and --live-storage-bytes are optional read-only metadata
 * observations, NOT a cryptographic comparison of live bytes.
 */
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';
const PROJECT='jtlusodorfnyzgyuewkz';
const HOUR=3600000;
const validTime=x=>{const v=Date.parse(x);return Number.isFinite(v)?v:null};
const safeHours=(a,b)=>Math.round((a-b)/HOUR*100)/100;
const requireBool=(v,m)=>{if(!v)throw new Error(m)};
export function evaluateRollingRpo({
 now,backups,storageSnapshotCaptureTimes,sqlSnapshotCaptureTimes,
 archivedStorageCount,archivedStorageBytes,liveStorageCount=null,liveStorageBytes=null,
 archivedSnapshotCount=1
}){
 const reference=new Date(now).getTime();
 requireBool(Number.isFinite(reference),'Invalid evaluation timestamp');
 requireBool(Array.isArray(backups)&&Array.isArray(storageSnapshotCaptureTimes)&&
  Array.isArray(sqlSnapshotCaptureTimes),'Incomplete recovery evidence');
 requireBool(Number.isInteger(archivedStorageCount)&&archivedStorageCount>=1&&
  Number.isInteger(archivedStorageBytes)&&archivedStorageBytes>0,'Missing real private Storage archive');
 requireBool(Number.isInteger(archivedSnapshotCount)&&archivedSnapshotCount>=1,'Invalid snapshot count');
 const done=backups.filter(v=>v?.status==='COMPLETED'&&v?.is_physical_backup===true&&
  validTime(v.inserted_at)!==null&&validTime(v.inserted_at)<=reference)
  .sort((a,b)=>Date.parse(a.inserted_at)-Date.parse(b.inserted_at));
 const backupDates=done.map(x=>Date.parse(x.inserted_at));
 const backupGapHours=backupDates.slice(1).map((v,i)=>safeHours(v,backupDates[i]));
 const oldestAge=times=>{
  requireBool(times.length>0&&times.every(v=>Number.isFinite(v)&&v>0&&v<=reference),
   'Missing or future-dated archive capture evidence');
  return safeHours(reference,Math.min(...times));
 };
 const storageAge=oldestAge(storageSnapshotCaptureTimes);
 const sqlAge=oldestAge(sqlSnapshotCaptureTimes);
 const physicalAge=backupDates.length?safeHours(reference,backupDates.at(-1)):null;
 const gapMax=backupGapHours.length?Math.max(...backupGapHours):null;
 const comparable=Number.isInteger(liveStorageCount)&&liveStorageCount>=0&&
  Number.isInteger(liveStorageBytes)&&liveStorageBytes>=0;
 const matches=comparable&&liveStorageCount===archivedStorageCount&&
  liveStorageBytes===archivedStorageBytes;
 return {
  project:PROJECT,
  classification:'POINT_IN_TIME_RECOVERY_OBSERVATION',
  completedPhysicalBackupsObserved:done.length,
  newestPhysicalBackupAt:backupDates.length?new Date(backupDates.at(-1)).toISOString():null,
  newestPhysicalBackupAgeHours:physicalAge,
  maximumObservedPhysicalBackupGapHours:gapMax,
  backupIntervalSamples:backupGapHours.length,
  observedPhysicalCadenceWithin24h:backupDates.length>=2&&
   gapMax<=24&&physicalAge>=0&&physicalAge<=24,
  archiveSqlFileBirthAgeHours:sqlAge,
  archiveStorageFileBirthAgeHours:storageAge,
  archiveStorageObjects:archivedStorageCount,
  archiveStorageBytes:archivedStorageBytes,
  liveStorageMetadataCompared:comparable,
  liveStorageCountBytesMatch:comparable?matches:null,
  liveStorageContentsVerifiedAgainstArchive:false,
  independentSnapshotCount:archivedSnapshotCount,
  sustainedIndependentStorageRpoVerified:false,
  sustainedIndependentDatabaseRpoVerified:false,
  actualProviderPhysicalRestore:'UNVERIFIED',
  fullHostedRecoveryTime:'UNVERIFIED',
  productionRelease:'NO_GO'
 };
}
export async function observeRpoFromArchive({
 archive,manifest,providerInventory,now=new Date(),liveStorageCount=null,liveStorageBytes=null
}){
 requireBool(archive&&manifest,'Private archive and manifest required');
 requireBool(providerInventory?.backups&&Array.isArray(providerInventory.backups),
 'Valid Supabase backup inventory required');
 const actual=await inventoryRecoveryArchive(archive);
 const f=JSON.parse(await fs.readFile(manifest,'utf8'));
 compareRecoveryManifest(f,actual);
 const root=await fs.realpath(archive);
 const capture=async paths=>{
  const result=[];
  for(const path of paths){
   const stat=await fs.stat(root+'/'+path);
   requireBool(stat.isFile(),'Archive capture evidence is not a regular file');
   result.push(stat.birthtimeMs);
  }
  return result;
 };
 const storage=actual.files.filter(x=>x.path.startsWith('storage/'));
 const sql=actual.files.filter(x=>!x.path.startsWith('storage/'));
 return evaluateRollingRpo({
  now,backups:providerInventory.backups,
  storageSnapshotCaptureTimes:await capture(storage.map(x=>x.path)),
  sqlSnapshotCaptureTimes:await capture(sql.map(x=>x.path)),
  archivedStorageCount:storage.length,
  archivedStorageBytes:storage.reduce((total,x)=>total+x.bytes,0),
  liveStorageCount,liveStorageBytes,archivedSnapshotCount:1
 });
}
const positiveInteger=v=>{if(v===undefined)return null;const n=Number(v);if(!/^(0|[1-9]\d*)$/.test(v)||!Number.isSafeInteger(n))throw Error('Invalid Storage metadata number');return n;};
async function main(){
 const args=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--archive','--manifest','--live-storage-count','--live-storage-bytes'].includes(args[i])||
   !args[i+1]||Object.hasOwn(opts,args[i]))throw Error('Invalid or duplicate command argument');
  opts[args[i]]=args[i+1];
 }
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2000000)throw Error('Inventory input too large');}
 const result=await observeRpoFromArchive({
  archive:opts['--archive'],manifest:opts['--manifest'],
  providerInventory:JSON.parse(input),now:new Date(),
  liveStorageCount:positiveInteger(opts['--live-storage-count']),
  liveStorageBytes:positiveInteger(opts['--live-storage-bytes'])
 });
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 // An observation cannot certify rolling RPO or authorize production.
 process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{process.stderr.write('RPO_OBSERVATION_BLOCKED: '+e.message+'\n');process.exitCode=2;});
