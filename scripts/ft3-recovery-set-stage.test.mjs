import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,chmod,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventoryRecoveryArchive} from './ft3-recovery-archive-audit.mjs';
import {stageRecoverySet} from './ft3-recovery-set-stage.mjs';

async function setup(){
 const root=await mkdtemp(join(tmpdir(),'ft3-stage-fixture-'));
 await chmod(root,0o700);
 const src=join(root,'source'),dest=join(root,'destination');
 await mkdir(src,{mode:0o700});await mkdir(dest,{mode:0o700});
 for(const name of ['full-schema.sql','data.sql','remaining-data.sql','local-roles.sql']){
  await writeFile(join(src,name),'-- local disposable fixture\n'+'select 1;\n'.repeat(16),{mode:0o600});
 }
 await mkdir(join(src,'storage'),{mode:0o700});
 await mkdir(join(src,'storage','account-avatars'),{mode:0o700});
 const obj=join(src,'storage','account-avatars','avatar.webp');
 await writeFile(obj,Buffer.from([1,2,3,4,5]),{mode:0o600});
 const manifest=join(root,'manifest.json');
 await writeFile(manifest,JSON.stringify(await inventoryRecoveryArchive(src)),{mode:0o600});
 return {root,src,dest,manifest,obj,cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('offline stager atomically publishes revalidated SQL + actual Storage bytes',async()=>{
 const f=await setup();
 try{
  const result=await stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'sample-20261110'});
  assert.equal(result.status,'LOCAL_RECOVERY_SET_STAGED');
  assert.equal(result.verifiedObjects,1);
  assert.equal(result.independentCapture,false);
  assert.equal(result.productionRelease,'NO_GO');
  const dir=join(f.dest,'set-sample-20261110');
  const names=await readdir(dir);
  assert.deepEqual(names.sort(),['archive','manifest.json','provenance.json']);
  assert.equal((await stat(dir)).mode&0o077,0);
  assert.equal((await stat(join(dir,'manifest.json'))).mode&0o077,0);
  const p=JSON.parse(await readFile(join(dir,'provenance.json'),'utf8'));
  assert.equal(p.sourceCaptureTime,'UNATTESTED');
  assert.equal(p.offsiteRetention,false);
  const copied=await readFile(join(dir,'archive','storage','account-avatars','avatar.webp'));
  assert.deepEqual([...copied],[1,2,3,4,5]);
  assert.deepEqual(await readdir(f.dest),['set-sample-20261110']);
 }finally{await f.cleanup();}
});
test('existing finalized set is never overwritten',async()=>{
 const f=await setup();try{
  const options={source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'same-backup-set'};
  await stageRecoverySet(options);
  await assert.rejects(stageRecoverySet(options),/already exists/);
  assert.deepEqual(await readdir(f.dest),['set-same-backup-set']);
 }finally{await f.cleanup();}
});
test('tampered original must fail before any finalized set appears',async()=>{
 const f=await setup();try{
  await writeFile(f.obj,Buffer.from([5,4,3,2,1]));
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'tampered-set'}),/checksum/);
  assert.deepEqual(await readdir(f.dest),[]);
 }finally{await f.cleanup();}
});
test('path traversal in manifest is rejected by source manifest reconciliation',async()=>{
 const f=await setup();try{
  const m=JSON.parse(await readFile(f.manifest,'utf8'));
  const file=m.files.find(x=>x.path.startsWith('storage/'));
  file.path='../evil.webp';
  await writeFile(f.manifest,JSON.stringify(m));
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'evil-manifest'}));
  assert.deepEqual(await readdir(f.dest),[]);
 }finally{await f.cleanup();}
});
test('a destination inside the source cannot create a fake independent archive',async()=>{
 const f=await setup();try{
  const internal=join(f.src,'internal');
  await mkdir(internal,{mode:0o700});
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:internal,setId:'not-independent'}),/separate directory trees/);
 }finally{await f.cleanup();}
});
test('reject a world-accessible destination or symbolic-link archive source',async()=>{
 const f=await setup();try{
  await chmod(f.dest,0o755);
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'open-destination'}),/owner-only/);
  await chmod(f.dest,0o700);
  const link=join(f.root,'src-link');
  await symlink(f.src,link);
  await assert.rejects(stageRecoverySet({source:link,sourceManifest:f.manifest,destination:f.dest,setId:'symlink-source'}));
 }finally{await f.cleanup();}
});
test('missing or malformed input refuses staging',async()=>{
 const f=await setup();try{
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest,setId:'..'}),/safe unique set ID/);
  await assert.rejects(stageRecoverySet({source:f.src,sourceManifest:f.manifest,destination:f.dest}),/safe unique set ID/);
  assert.deepEqual(await readdir(f.dest),[]);
 }finally{await f.cleanup();}
});
