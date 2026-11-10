#!/usr/bin/env node
/**
 * One-shot OFFLINE packaging of an existing verified recovery set. No live
 * capture, AWS requests, recurring schedule, offsite transfer or production GO.
 * Only tested on synthetic data before any authorized operational deployment.
 */
import {promises as fs} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {dirname,basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptBackupFile,decryptBackupFile} from './ft3-backup-crypto.mjs';
import {inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';

const fail=reason=>{throw Error(reason)};
async function privateFolder(path,label){
 const st=await fs.lstat(path);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail(label+' must be an owner-only real directory');
 return fs.realpath(path);
}
async function exec(bin,args){
 return new Promise((good,bad)=>{
  const p=spawn(bin,args,{stdio:['ignore','ignore','ignore']});
  let settled=false;
  p.once('error',e=>{if(!settled){settled=true;bad(Error(bin+' unavailable: '+e.code))}});
  p.once('close',code=>{if(settled)return;settled=true;code===0?good():bad(Error(bin+' exited '+code))});
 });
}
export async function bundleEncryptedRecoverySet({setDirectory,output,keyFile}){
 if(!setDirectory||!output||!keyFile)fail('Explicit local recovery set, output, and key required');
 const set=await privateFolder(setDirectory,'Staged recovery set');
 const requested=resolve(output);
 const outDir=await privateFolder(dirname(requested),'Encrypted output directory');
 const destination=join(outDir,basename(requested));
 if(set.startsWith(outDir+'/')||outDir.startsWith(set+'/')||set===outDir)
  fail('Encrypted output must be separated from source set');
 const manifestPath=join(set,'manifest.json'),provPath=join(set,'provenance.json');
 for(const path of [manifestPath,provPath]){
  const st=await fs.lstat(path);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)fail('Private set metadata is required');
 }
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 const provenance=JSON.parse(await fs.readFile(provPath,'utf8'));
 if(provenance.classification!=='LOCAL_COPY_OF_PREEXISTING_SNAPSHOT'||
   provenance.independentBackupCapture!==false||
   provenance.offsiteRetention!==false||
   provenance.productionRelease!=='NO_GO')fail('Unsupported or unverified provenance');
 const source=await inventoryRecoveryArchive(join(set,'archive'));
 compareRecoveryManifest(manifest,source);
 const work=await fs.mkdtemp(join(outDir,'.ft3-package-'));
 await fs.chmod(work,0o700);
 try{
  const tar=join(work,'set.tar'), encryptedVerification=join(work,'set.tar.ft3enc');
  const decrypted=join(work,'roundtrip.tar'), restored=join(work,'restored');
  await exec('tar',['-cf',tar,'-C',set,'archive','manifest.json','provenance.json']);
  await fs.chmod(tar,0o600);
  // The completed output is created exclusively; existing bytes are never replaced.
  await encryptBackupFile({input:tar,output:destination,keyFile});
  try{
   // Verify the actual completed output, not merely the encryption stream.
   await decryptBackupFile({input:destination,output:decrypted,keyFile});
   await fs.mkdir(restored,{mode:0o700});
   await exec('tar',['-xf',decrypted,'-C',restored,'--no-same-owner','--no-same-permissions']);
   const reconstructed=await inventoryRecoveryArchive(join(restored,'archive'));
   compareRecoveryManifest(manifest,reconstructed);
   const recoveredProv=JSON.parse(await fs.readFile(join(restored,'provenance.json'),'utf8'));
   if(recoveredProv.setId!==provenance.setId||
    recoveredProv.sourceManifestSha256!==provenance.sourceManifestSha256)
    fail('Recovered provenance does not match the original');
  }catch(error){
   // Do not leave a completed-looking encrypted file if roundtrip validation fails.
   await fs.rm(destination,{force:true});
   throw error;
  }
  return {status:'ENCRYPTED_OFFLINE_RECOVERY_PACKAGE_VERIFIED',
   originalSetId:provenance.setId,filesVerified:source.files.length,
   privateStorageObjectsVerified:source.summary.storageObjects,
   independentBackupCapture:false,offsiteTransfer:false,
   immutableRetention:false,providerPhysicalRestore:'UNVERIFIED',
   productionRelease:'NO_GO'};
 }finally{
  await fs.rm(work,{recursive:true,force:true});
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==5)fail('Usage: SET_DIRECTORY ENCRYPTED_OUTPUT KEY_FILE');
  const result=await bundleEncryptedRecoverySet({setDirectory:process.argv[2],output:process.argv[3],keyFile:process.argv[4]});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){process.stderr.write('BACKUP_BUNDLE_BLOCKED: '+error.message+'\n');process.exitCode=2;}
}
