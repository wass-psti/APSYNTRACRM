#!/usr/bin/env node
/**
 * One-shot, offline WatchdogWorkspace recovery archive integrity gate.
 * No networking, production writes, automatic backups or background process.
 * Archive inventory is retained only in user-selected local restricted files.
 *
 * Usage:
 * node scripts/ft3-recovery-archive-audit.mjs --archive /private/archive --create-manifest /private/manifest.json
 * node scripts/ft3-recovery-archive-audit.mjs --archive /private/archive --verify-manifest /private/manifest.json
 */
import {createHash} from 'node:crypto';
import {createReadStream, promises as fs} from 'node:fs';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const REQUIRED=['full-schema.sql','data.sql','remaining-data.sql','local-roles.sql'];
const EXT=/\.(jpg|jpeg|png|webp)$/i;
const digest=async file=>{
 const sha=createHash('sha256');
 for await(const chunk of createReadStream(file))sha.update(chunk);
 return sha.digest('hex');
};
const must=(condition,message)=>{if(!condition)throw new Error(message);};
const under=(root,target)=>{
 const rel=relative(root,target);
 must(rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!resolve(target).startsWith(root+sep+'..'),
 'Archive item is outside the selected directory.');
 return rel.split(sep).join('/');
};
const fileData=async(root,full)=>{
 const st=await fs.lstat(full);
 must(st.isFile()&&!st.isSymbolicLink(),'Archive contains a nonregular file.');
 must(st.size>0,'Archive contains an empty required payload.');
 must((st.mode&0o077)===0,'Archive payload permissions are not owner-only.');
 return {path:under(root,full),bytes:st.size,sha256:await digest(full)};
};
export async function inventoryRecoveryArchive(path){
 const root=await fs.realpath(path);
 const meta=await fs.lstat(root);
 must(meta.isDirectory()&&!meta.isSymbolicLink(),'Recovery directory must be a real directory.');
 must((meta.mode&0o007)===0,'Recovery archive directory is world-accessible.');
 const files=[];
 for(const name of REQUIRED){
  const full=join(root,name);
  const data=await fileData(root,full);
  must(data.bytes>=100,'Recovery SQL export unexpectedly small.');
  files.push(data);
 }
 const storageRoot=join(root,'storage');
 const storageInfo=await fs.lstat(storageRoot);
 must(storageInfo.isDirectory()&&!storageInfo.isSymbolicLink(),'Storage object archive missing.');
 const storage=[];
 const walk=async dir=>{
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const full=join(dir,entry.name);
   const st=await fs.lstat(full);
   must(!st.isSymbolicLink(),'Archive includes symbolic link.');
   if(st.isDirectory()){await walk(full);continue;}
   must(st.isFile(),'Archive includes unsupported item.');
   must(EXT.test(entry.name),'Storage archive includes unsupported object extension.');
   const f=await fileData(root,full);
   storage.push(f);
  }
 };
 await walk(storageRoot);
 must(storage.length>0,'Archive contains no private Storage object bytes.');
 files.push(...storage);
 files.sort((a,b)=>a.path.localeCompare(b.path));
 return {schemaVersion:1,project:'jtlusodorfnyzgyuewkz',
  archiveKind:'LOGICAL_SQL_AND_PRIVATE_STORAGE_BYTES',
  files,summary:{sqlFiles:REQUIRED.length,storageObjects:storage.length,
   storageBytes:storage.reduce((acc,f)=>acc+f.bytes,0),
   totalBytes:files.reduce((acc,f)=>acc+f.bytes,0)},
  certification:'NOT_PROVIDER_PHYSICAL_RECOVERY'};
}
export function compareRecoveryManifest(expected,actual){
 must(expected?.schemaVersion===1&&expected.project===actual.project&&
   expected.archiveKind===actual.archiveKind,'Recovery manifest project/type mismatch.');
 must(Array.isArray(expected.files)&&expected.files.length===actual.files.length,
   'Recovery archive file count changed.');
 for(let i=0;i<actual.files.length;i++){
  const old=expected.files[i],now=actual.files[i];
  must(old?.path===now.path&&old.bytes===now.bytes&&old.sha256===now.sha256,
    'Recovery file checksum, size or path mismatch: '+now.path);
 }
 return {status:'ARCHIVE_INTEGRITY_PASS',objects:actual.summary.storageObjects,
   bytes:actual.summary.totalBytes,providerPhysicalRestore:'UNVERIFIED',
   hostedRto:'UNVERIFIED',rollingRpo:'UNVERIFIED',
   productionRelease:'NO_GO'};
}
export async function archiveGate({archive,createManifest,verifyManifest}){
 must(archive&&!!createManifest!==!!verifyManifest,
   'Specify exactly one manifest operation and an archive.');
 const actual=await inventoryRecoveryArchive(archive);
 const manifestPath=resolve(createManifest||verifyManifest);
 const archiveRoot=await fs.realpath(archive);
 const manifestDir=await fs.realpath(dirname(manifestPath));
 const canonicalManifest=join(manifestDir,basename(manifestPath));
 must(canonicalManifest!==archiveRoot&&!canonicalManifest.startsWith(archiveRoot+sep),
   'Do not place the manifest inside the source archive.');
 if(createManifest){
  const dir=await fs.realpath(dirname(manifestPath));
  const st=await fs.stat(dir);
  must((st.mode&0o007)===0,'Manifest destination directory is world-accessible.');
  const handle=await fs.open(manifestPath,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(actual,null,2)+'\n');}
  finally{await handle.close();}
  return {status:'LOCAL_MANIFEST_CREATED',objects:actual.summary.storageObjects,
   bytes:actual.summary.totalBytes,providerPhysicalRestore:'UNVERIFIED',
   hostedRto:'UNVERIFIED',rollingRpo:'UNVERIFIED',productionRelease:'NO_GO'};
 }
 const manifestStat=await fs.lstat(manifestPath);
 must(manifestStat.isFile()&&!manifestStat.isSymbolicLink()&&
  (manifestStat.mode&0o077)===0,'Manifest must be a private regular file.');
 const expected=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 return compareRecoveryManifest(expected,actual);
}
function args(argv){
 const choices={};
 for(let i=0;i<argv.length;i+=2){
  must(['--archive','--create-manifest','--verify-manifest'].includes(argv[i])&&
   typeof argv[i+1]==='string','Invalid recovery audit command.');
  must(!Object.hasOwn(choices,argv[i]),'Duplicate argument.');
  choices[argv[i]]=argv[i+1];
 }
 return {archive:choices['--archive'],createManifest:choices['--create-manifest'],
  verifyManifest:choices['--verify-manifest']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await archiveGate(args(process.argv.slice(2)));
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(err){
  process.stderr.write('RECOVERY_ARCHIVE_BLOCKED: '+err.message+'\n');
  process.exitCode=2;
 }
}
