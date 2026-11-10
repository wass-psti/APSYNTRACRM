#!/usr/bin/env node
/**
 * Stage an ALREADY VERIFIED local logical-SQL + private Storage archive as
 * a complete, independently checked, atomic on-disk recovery SET.
 * Deliberately NOT a production backup capture, schedule, offsite transfer,
 * immutable retention service, or provider physical-backup substitute.
 *
 * Usage:
 * node scripts/ft3-recovery-set-stage.mjs --source /private/archive \
 *    --source-manifest /private/manifest.json --destination /private/staging-root \
 *    --set-id 20261110-test
 *
 * The destination must be owner-only, outside the source. A complete set is
 * published by renaming a temporary sibling directory after re-hashing every
 * source and copied file. Refuses to overwrite existing sets.
 */
import {randomBytes,createHash} from 'node:crypto';
import {createReadStream, constants as fsConstants, promises as fs} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';

const PROJECT='jtlusodorfnyzgyuewkz';
const SET_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,63}$/;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const inside=(root,point)=>point===root||point.startsWith(root+sep);
const sha=async file=>{
 const hash=createHash('sha256');
 for await(const block of createReadStream(file))hash.update(block);
 return hash.digest('hex');
};
async function privateDir(dir){
 const st=await fs.lstat(dir);
 assert(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0,
  'Archive destination must be a real owner-only directory.');
 return await fs.realpath(dir);
}
async function makePrivateFile(full,content){
 const h=await fs.open(full,'wx',0o600);
 try{await h.writeFile(content);await h.sync();}finally{await h.close();}
}
export async function stageRecoverySet({source,sourceManifest,destination,setId}){
 assert(source&&sourceManifest&&destination&&SET_ID.test(setId||''),
  'Explicit source, source manifest, destination, and safe unique set ID required.');
 const src=await privateDir(source);
 const dest=await privateDir(destination);
 assert(!inside(src,dest)&&!inside(dest,src),
  'Source and destination must be separate directory trees.');
 const mf=resolve(sourceManifest);
 assert(!inside(src,mf),'Source manifest must not be inside the archive.');
 const mst=await fs.lstat(mf);
 assert(mst.isFile()&&!mst.isSymbolicLink()&&(mst.mode&0o077)===0,
  'Source manifest must be a private regular file.');
 const manifestBytes=await fs.readFile(mf);
 const manifest=JSON.parse(manifestBytes.toString());
 assert(manifest?.project===PROJECT,'Wrong existing project in source manifest.');
 const actual=await inventoryRecoveryArchive(src);
 compareRecoveryManifest(manifest,actual);

 const final=join(dest,'set-'+setId);
 try{await fs.lstat(final);throw new Error('Recovery set already exists; overwrite denied.');}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=join(dest,'.stage-'+setId+'-'+randomBytes(8).toString('hex'));
 await fs.mkdir(temp,{mode:0o700});
 let published=false;
 try{
  const copyRoot=join(temp,'archive');
  await fs.mkdir(copyRoot,{mode:0o700});
  for(const entry of manifest.files){
   assert(typeof entry.path==='string'&&
    !entry.path.startsWith('/')&&!entry.path.split('/').includes('..'),
    'Unsafe archive manifest path.');
   const to=resolve(copyRoot,entry.path.split('/').join(sep));
   assert(inside(copyRoot,to)&&to!==copyRoot,'Manifest path escapes archive.');
   await fs.mkdir(dirname(to),{recursive:true,mode:0o700});
   const srcFile=resolve(src,entry.path.split('/').join(sep));
   const original=await fs.lstat(srcFile);
   assert(original.isFile()&&!original.isSymbolicLink()&&(original.mode&0o077)===0,
     'Archive source changed during staging.');
   await fs.copyFile(srcFile,to,fsConstants.COPYFILE_EXCL);
   await fs.chmod(to,0o600);
   // Source might change during copy; both hashes must still match the original manifest.
   assert(await sha(srcFile)===entry.sha256&&await sha(to)===entry.sha256,
    'Source/copy integrity changed during staging.');
  }
  const copied=await inventoryRecoveryArchive(copyRoot);
  compareRecoveryManifest(manifest,copied);
  await makePrivateFile(join(temp,'manifest.json'),manifestBytes);
  const provenance={
   schemaVersion:1,project:PROJECT,
   classification:'LOCAL_COPY_OF_PREEXISTING_SNAPSHOT',
   setId,
   copiedAt:new Date().toISOString(),
   sourceCaptureTime:'UNATTESTED',
   independentBackupCapture:false,
   offsiteRetention:false,
   immutableRetention:false,
   sourceManifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),
   files:copied.files.length,storageObjects:copied.summary.storageObjects,
   productionRelease:'NO_GO'
  };
  await makePrivateFile(join(temp,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  // An atomic directory rename publishes all checked bytes together.
  // This function never intentionally removes an existing recovery set.
  await fs.rename(temp,final);
  published=true;
  return {status:'LOCAL_RECOVERY_SET_STAGED',setId,verifiedObjects:provenance.storageObjects,
    independentCapture:false,offsiteRetention:false,immutableRetention:false,
    providerPhysicalRestore:'UNVERIFIED',productionRelease:'NO_GO'};
 }finally{
  await fs.rm(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const argv=process.argv.slice(2),options={};
  for(let i=0;i<argv.length;i+=2){
   assert(['--source','--source-manifest','--destination','--set-id'].includes(argv[i])&&argv[i+1]&&!Object.hasOwn(options,argv[i]),
    'Invalid staging arguments.');
   options[argv[i]]=argv[i+1];
  }
  const result=await stageRecoverySet({source:options['--source'],
   sourceManifest:options['--source-manifest'],destination:options['--destination'],setId:options['--set-id']});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write('RECOVERY_SET_STAGE_BLOCKED: '+e.message+'\n');process.exitCode=2;}
}
