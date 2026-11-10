#!/usr/bin/env node
/**
 * Isolated offline logical-DB and Storage-byte recovery timing.
 * No production or external network access. No hosted restore or RPO certification.
 */
import {spawn} from 'node:child_process';
import {createReadStream, promises as fs} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {randomBytes} from 'node:crypto';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveGate,inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';
const IMAGE='public.ecr.aws/supabase/postgres:17.11.0.004';
const SQL=['local-roles.sql','full-schema.sql','data.sql','remaining-data.sql'];
const EXPECTED={profiles:41,workspaces:4,memberships:42,authUsers:42,storageMetadata:5};
const COUNTS="select json_build_object('profiles',(select count(*) from public.profiles),'workspaces',(select count(*) from public.workspaces),'memberships',(select count(*) from public.workspace_members),'authUsers',(select count(*) from auth.users),'storageMetadata',(select count(*) from storage.objects))::text";
async function execute(bin,args,{input=null,timeout=90000}={}){
 return new Promise((resolvePromise,reject)=>{
  let output='',closed=false;
  const child=spawn(bin,args,{stdio:[input?'pipe':'ignore','pipe','pipe']});
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  child.stdout.on('data',b=>{if(output.length<10000)output+=b.toString().slice(0,10000-output.length);});
  // Avoid printing database SQL or stderr; it can contain private records.
  child.stderr.resume();
  child.on('error',e=>{if(!closed){closed=true;clearTimeout(timer);reject(new Error(bin+' could not start: '+e.code));}});
  child.on('close',(code)=>{
   if(closed)return;closed=true;clearTimeout(timer);
   if(code===0)resolvePromise(output.trim());
   else reject(new Error(bin+' exited nonzero (private output suppressed)'));
  });
  if(input){
   const stream=createReadStream(input);
   stream.on('error',()=>child.kill('SIGKILL'));
   stream.pipe(child.stdin);
  }
 });
}
const pg=(container,sql)=>execute('docker',['exec',container,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','ft3rehearsal','-c',sql]);
const fileSql=(container,path)=>execute('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','ft3rehearsal'],{input:path,timeout:240000});
export function classifyRecoveryEvidence(seconds,counts,objects){
 if(!Number.isFinite(seconds)||seconds<=0||!Number.isInteger(objects)||objects<1)
  throw Error('Invalid elapsed recovery metrics');
 for(const [key,count] of Object.entries(EXPECTED))
  if(counts?.[key]!==count)throw Error('Restored database differs from archived snapshot: '+key);
 return {status:'LOCAL_LOGICAL_DB_AND_STORAGE_RESTORE_PASS',
  elapsedSeconds:Math.round(seconds*100)/100,
  archivedSnapshotDate:'2026-11-09',
  restoredCounts:counts,storageObjectsVerified:objects,
  localRestoreUnder24Hours:seconds<=86400,
  providerPhysicalBackupRestore:'UNVERIFIED',hostedRto:'UNVERIFIED',
  rollingDatabaseRpo:'UNVERIFIED',rollingStorageRpo:'UNVERIFIED',
  productionActivation:'NO_GO'};
}
export async function runRecoveryRehearsal({archive,manifest,evidenceDir}){
 if(!archive||!manifest||!evidenceDir)throw Error('Explicit archive, manifest and evidence directory required');
 const base=await fs.realpath(archive),out=await fs.realpath(evidenceDir);
 if(((await fs.stat(out)).mode&0o077)!==0)throw Error('Evidence directory permissions not owner-only');
 const integrity=await archiveGate({archive:base,verifyManifest:manifest});
 if(integrity.status!=='ARCHIVE_INTEGRITY_PASS')throw Error('Archive integrity failed');
 const expected=JSON.parse(await fs.readFile(manifest,'utf8'));
 const start=performance.now();
 const name='ft3-rehearsal-'+process.pid+'-'+randomBytes(4).toString('hex');
 let running=false,copyDir=null;
 try{
  process.stderr.write('LOCAL_RECOVERY_STAGE=container_start\n');
  await execute('docker',['run','-d','--rm','--network','none','--name',name,
   '-e','POSTGRES_PASSWORD=isolated','-e','POSTGRES_DB=ft3rehearsal',IMAGE],{timeout:90000});
  running=true;
  // Supabase's image starts an initialization server and can restart it.
  // Require several successive successful probes rather than one transient response.
  let consecutive=0;
  for(let i=0;i<60&&consecutive<4;i++){
   try{await execute('docker',['exec',name,'psql','-X','-At','-U','supabase_admin','-d','ft3rehearsal','-c','select 1'],{timeout:3000});consecutive++;}
   catch{consecutive=0;}
   await new Promise(r=>setTimeout(r,600));
  }
  if(consecutive<4)throw Error('Ephemeral database stable startup failed');
  process.stderr.write('LOCAL_RECOVERY_STAGE=bootstrap_roles\n');
  await execute('docker',['exec',name,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-c',
    "DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_realtime_admin') THEN CREATE ROLE supabase_realtime_admin NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_functions_admin') THEN CREATE ROLE supabase_functions_admin NOLOGIN; END IF; END$$;"]);
  // The Supabase container bootstrap preloads internal schemas in its default
  // database. Recreate ONLY this ephemeral network-disabled test database to
  // ensure a fresh restore target (never an existing project/database).
  process.stderr.write('LOCAL_RECOVERY_STAGE=drop_ephemeral_target\n');
  await execute('docker',['exec',name,'dropdb','--if-exists','--force','-U','supabase_admin','ft3rehearsal']);
  process.stderr.write('LOCAL_RECOVERY_STAGE=create_ephemeral_target\n');
  await execute('docker',['exec',name,'createdb','-U','supabase_admin','ft3rehearsal']);
  for(const file of SQL){process.stderr.write('LOCAL_RECOVERY_STAGE='+file+'\n');await fileSql(name,join(base,file));}
  process.stderr.write('LOCAL_RECOVERY_STAGE=database_integrity\n');
  const counts=JSON.parse(await pg(name,COUNTS));
  copyDir=await fs.mkdtemp(join(out,'restore-rehearsal-'));
  await fs.chmod(copyDir,0o700);
  const restored=join(copyDir,'archive');
  await fs.mkdir(restored,{mode:0o700});
  for(const f of expected.files){
   const path=join(restored,f.path);
   if(!path.startsWith(restored+sep))throw Error('Untrusted Storage archive path');
   await fs.mkdir(dirname(path),{recursive:true,mode:0o700});
   await fs.copyFile(join(base,f.path),path);
   await fs.chmod(path,0o600);
  }
  process.stderr.write('LOCAL_RECOVERY_STAGE=storage_integrity\n');
  const copied=await inventoryRecoveryArchive(restored);
  compareRecoveryManifest(expected,copied);
  return classifyRecoveryEvidence((performance.now()-start)/1000,counts,copied.summary.storageObjects);
 }finally{
  if(running)await execute('docker',['rm','-f',name],{timeout:30000}).catch(()=>{});
  if(copyDir)await fs.rm(copyDir,{recursive:true,force:true});
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const result=await runRecoveryRehearsal({
   archive:process.env.FT3_RECOVERY_ARCHIVE,
   manifest:process.env.FT3_RECOVERY_MANIFEST,
   evidenceDir:process.env.FT3_RECOVERY_EVIDENCE_DIR});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){process.stderr.write('LOCAL_RECOVERY_BLOCKED: '+error.message+'\n');process.exitCode=2;}
}
