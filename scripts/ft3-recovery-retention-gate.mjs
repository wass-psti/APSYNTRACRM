#!/usr/bin/env node
/**
 * Fail-closed, read-only backup SET retention audit. NO capture, delete,
 * modification, scheduler, network access, or automatic release decision.
 * Every set is independently integrity verified against an owner-only
 * archive manifest. Metadata-only or duplicated backups never qualify.
 * Input index is a private JSON file containing:
 * {schemaVersion:1,project:"jtlusodorfnyzgyuewkz",
 *  sets:[{archive:"/absolute/path",manifest:"/absolute/path",
 *         completedAt:"ISO timestamp",databaseSnapshotAt:"ISO timestamp",
 *         storageSnapshotAt:"ISO timestamp",captureId:"uuid"}]}
 * The timestamps are operator-provided, UNATTESTED capture metadata.
 */
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';

const PROJECT='jtlusodorfnyzgyuewkz';
const HOUR=3600000;
const fail=m=>{throw Error(m);};
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const sha=v=>createHash('sha256').update(v).digest('hex');
export function evaluateRetentionPolicy(snapshots,{now=new Date(),maxAgeHours=24,maxGapHours=24,minRetainedDays=7}={}){
 const nowMs=new Date(now).getTime();
 if(!Number.isFinite(nowMs)||maxAgeHours!==24||maxGapHours!==24||
   !Number.isInteger(minRetainedDays)||minRetainedDays<2||minRetainedDays>90)
  fail('Invalid fixed 24-hour retention evaluation policy');
 if(!Array.isArray(snapshots))fail('Snapshot evidence must be an array');
 const seenIds=new Set(),seenManifests=new Set(),seenArchives=new Set();
 const records=snapshots.map((s,i)=>{
  if(!s||!validDate(s.completedAt)||!validDate(s.databaseSnapshotAt)||
   !validDate(s.storageSnapshotAt)||typeof s.captureId!=='string'||s.captureId.length<8||
   typeof s.manifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(s.manifestSha256)||
   typeof s.archiveIdentity!=='string'||s.archiveIdentity.length<4||
   s.integrityVerified!==true||s.sqlFiles<4||s.storageObjects<1||s.storageBytes<1)
   fail('Incomplete or unverified database-and-Storage capture set '+i);
  const complete=Date.parse(s.completedAt),db=Date.parse(s.databaseSnapshotAt),
   storage=Date.parse(s.storageSnapshotAt);
  if(complete>nowMs||db>complete||storage>complete||db<=0||storage<=0)
   fail('Invalid capture timestamp ordering');
  if(seenIds.has(s.captureId)||seenManifests.has(s.manifestSha256)||seenArchives.has(s.archiveIdentity))
   fail('Duplicate independent capture evidence');
  seenIds.add(s.captureId);seenManifests.add(s.manifestSha256);
  seenArchives.add(s.archiveIdentity);
  return {completedAt:complete,effectivePoint:Math.min(db,storage),
    databasePoint:db,storagePoint:storage};
 }).sort((a,b)=>a.effectivePoint-b.effectivePoint);
 const ageHours=records.length?
  Math.round((nowMs-records.at(-1).effectivePoint)/HOUR*100)/100:null;
 const newestDbAge=records.length?Math.round((nowMs-Math.max(...records.map(x=>x.databasePoint)))/HOUR*100)/100:null;
 const newestStorageAge=records.length?Math.round((nowMs-Math.max(...records.map(x=>x.storagePoint)))/HOUR*100)/100:null;
 const gapHours=records.slice(1).map((x,i)=>(x.effectivePoint-records[i].effectivePoint)/HOUR);
 const largestGap=gapHours.length?Math.round(Math.max(...gapHours)*100)/100:null;
 const coverageDays=records.length?(records.at(-1).effectivePoint-records[0].effectivePoint)/86400000:0;
 const ageOK=ageHours!==null&&ageHours>=0&&ageHours<=maxAgeHours;
 const cadenceOK=gapHours.length>=1&&gapHours.every(v=>v>0&&v<=maxGapHours);
 const retentionOK=records.length>=minRetainedDays&&coverageDays>=minRetainedDays-1;
 const localEvidenceOK=ageOK&&cadenceOK&&retentionOK;
 return {
  classification:'OFFLINE_RETENTION_EVIDENCE_ONLY',
  verifiedIndependentSets:records.length,
  oldestToNewestCaptureDays:Math.round(coverageDays*100)/100,
  minimumRetainedDailySets:minRetainedDays,
  newestCombinedSnapshotAgeHours:ageHours,
  newestDatabaseSnapshotAgeHours:newestDbAge,
  newestStorageSnapshotAgeHours:newestStorageAge,
  maximumConsecutiveSnapshotGapHours:largestGap,
  freshnessWithin24Hours:ageOK,
  allObservedGapsWithin24Hours:cadenceOK,
  retainedHistorySufficient:retentionOK,
  localSnapshotPolicyObserved:localEvidenceOK,
  captureTimestampsAttested:false,
  backupsImmutableOrOffsiteVerified:false,
  recurringCaptureEnforced:false,
  actualRestoreAndRtoVerified:false,
  providerPhysicalRestore:'UNVERIFIED',
  productionRelease:'NO_GO'
 };
}
async function verifyCapture(indexSet){
 if(!indexSet||typeof indexSet.archive!=='string'||typeof indexSet.manifest!=='string'||
  !indexSet.archive.startsWith('/')||!indexSet.manifest.startsWith('/'))
  fail('Capture set needs absolute private paths');
 const archive=await fs.realpath(indexSet.archive);
 const manifest=await fs.realpath(indexSet.manifest);
 const ms=await fs.lstat(manifest);
 if(!ms.isFile()||ms.isSymbolicLink()||(ms.mode&0o077)!==0)
  fail('Manifest is not an owner-only regular file');
 const bytes=await fs.readFile(manifest);
 const data=JSON.parse(bytes.toString());
 const inventory=await inventoryRecoveryArchive(archive);
 compareRecoveryManifest(data,inventory);
 return {...indexSet,manifestSha256:sha(bytes),
  archiveIdentity:sha(archive),integrityVerified:true,
  sqlFiles:inventory.summary.sqlFiles,
  storageObjects:inventory.summary.storageObjects,
  storageBytes:inventory.summary.storageBytes};
}
export async function auditRetentionIndex(index,{now=new Date(),minRetainedDays=7}={}){
 if(!index||index.schemaVersion!==1||index.project!==PROJECT||
  !Array.isArray(index.sets)||index.sets.length>100)
  fail('Invalid existing-project retention index');
 const verified=[];
 for(const entry of index.sets)verified.push(await verifyCapture(entry));
 return evaluateRetentionPolicy(verified,{now,minRetainedDays});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--index')fail('Expected --index absolute-private-json-path');
  const path=resolve(process.argv[3]),stat=await fs.lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   fail('Index must be an owner-only regular file');
  const index=JSON.parse(await fs.readFile(path,'utf8'));
  const result=await auditRetentionIndex(index);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=2; // No approved destination, scheduler or physical restore.
 }catch(error){process.stderr.write('RETENTION_AUDIT_BLOCKED: '+error.message+'\n');process.exitCode=2;}
}
