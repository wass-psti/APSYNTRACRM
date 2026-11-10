import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,stat,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventoryRecoveryArchive} from './ft3-recovery-archive-audit.mjs';
import {stageRecoverySet} from './ft3-recovery-set-stage.mjs';
import {bundleEncryptedRecoverySet} from './ft3-encrypted-recovery-bundle.mjs';
const fixture=async()=>{
 const root=await mkdtemp(join(tmpdir(),'ft3-bundle-'));await chmod(root,0o700);
 const original=join(root,'original'),destination=join(root,'sets'),out=join(root,'encrypted');
 for(const dir of [original,destination,out])await mkdir(dir,{mode:0o700});
 for(const file of ['full-schema.sql','data.sql','remaining-data.sql','local-roles.sql']){
  await writeFile(join(original,file),'-- fixture\n'+'select 1;\n'.repeat(18),{mode:0o600});
 }
 await mkdir(join(original,'storage'),{mode:0o700});
 await mkdir(join(original,'storage','account-avatars'),{mode:0o700});
 const stored=join(original,'storage','account-avatars','f.webp');
 await writeFile(stored,randomBytes(53),{mode:0o600});
 const manifest=join(root,'manifest.json');
 await writeFile(manifest,JSON.stringify(await inventoryRecoveryArchive(original)),{mode:0o600});
 await stageRecoverySet({source:original,sourceManifest:manifest,destination,setId:'synthetic-20261110'});
 const setDirectory=join(destination,'set-synthetic-20261110');
 const keyFile=join(root,'key.bin');await writeFile(keyFile,randomBytes(32),{mode:0o600});
 const output=join(out,'recovery.ft3enc');
 return{root,original,destination,out,keyFile,setDirectory,output,stored,clean:()=>rm(root,{recursive:true,force:true})};
};
test('a staged synthetic DB+private Storage archive encrypts and restores end to end',async()=>{
 const f=await fixture();
 try{
  const result=await bundleEncryptedRecoverySet(f);
  assert.equal(result.status,'ENCRYPTED_OFFLINE_RECOVERY_PACKAGE_VERIFIED');
  assert.equal(result.filesVerified,5);
  assert.equal(result.privateStorageObjectsVerified,1);
  assert.equal(result.independentBackupCapture,false);
  assert.equal(result.offsiteTransfer,false);
  assert.equal(result.productionRelease,'NO_GO');
  assert.equal((await stat(f.output)).mode&0o077,0);
  assert.deepEqual(await readdir(f.out),['recovery.ft3enc']);
 }finally{await f.clean();}
});
test('preexisting encrypted output is not replaced',async()=>{
 const f=await fixture();try{
  await writeFile(f.output,'preexisting',{mode:0o600});
  await assert.rejects(bundleEncryptedRecoverySet(f),{code:'EEXIST'});
  assert.equal(await readFile(f.output,'utf8'),'preexisting');
 }finally{await f.clean();}
});
test('invalid key fails without a published package',async()=>{
 const f=await fixture();try{
  await writeFile(f.keyFile,randomBytes(16),{mode:0o600});
  await assert.rejects(bundleEncryptedRecoverySet(f),/exactly 32/);
  await assert.rejects(stat(f.output),{code:'ENOENT'});
 }finally{await f.clean();}
});
test('altered staged source fails before any packaging output',async()=>{
 const f=await fixture();try{
  const file=join(f.setDirectory,'archive','storage','account-avatars','f.webp');
  await writeFile(file,randomBytes(53),{mode:0o600});
  await assert.rejects(bundleEncryptedRecoverySet(f),/checksum/);
  await assert.rejects(stat(f.output),{code:'ENOENT'});
 }finally{await f.clean();}
});
test('tampered provenance does not become a new independent capture',async()=>{
 const f=await fixture();try{
  const p=join(f.setDirectory,'provenance.json');
  const data=JSON.parse(await readFile(p,'utf8'));
  data.independentBackupCapture=true;
  await writeFile(p,JSON.stringify(data),{mode:0o600});
  await assert.rejects(bundleEncryptedRecoverySet(f),/Unsupported/);
  await assert.rejects(stat(f.output),{code:'ENOENT'});
 }finally{await f.clean();}
});
test('output directory nested within staged set is rejected',async()=>{
 const f=await fixture();try{
  const nested=join(f.setDirectory,'target');await mkdir(nested,{mode:0o700});
  await assert.rejects(bundleEncryptedRecoverySet({...f,output:join(nested,'bad.enc')}),/separated/);
 }finally{await f.clean();}
});
