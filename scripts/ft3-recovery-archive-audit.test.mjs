import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, chmod, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveGate,inventoryRecoveryArchive,compareRecoveryManifest} from './ft3-recovery-archive-audit.mjs';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'ft3-archive-fixture-'));
 await chmod(dir,0o700);
 const archive=join(dir,'archive');await mkdir(archive,{mode:0o700});
 for(const f of ['full-schema.sql','data.sql','remaining-data.sql','local-roles.sql'])
  await writeFile(join(archive,f),'-- recovery sample '+f+'\n'+'select 1;\n'.repeat(15),{mode:0o600});
 await mkdir(join(archive,'storage'),{mode:0o700});
 await mkdir(join(archive,'storage','account-avatars'),{mode:0o700});
 const object=join(archive,'storage','account-avatars','private.webp');
 await writeFile(object,Buffer.from([0x52,0x49,0x46,0x46]),{mode:0o600});
 return {archive,dir,object,manifest:join(dir,'manifest.json'),cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('creates private manifest and validates unchanged SQL and Storage bytes',async()=>{
 const f=await fixture();try{
  const created=await archiveGate({archive:f.archive,createManifest:f.manifest});
  assert.equal(created.status,'LOCAL_MANIFEST_CREATED');
  assert.equal(created.objects,1);
  const verified=await archiveGate({archive:f.archive,verifyManifest:f.manifest});
  assert.equal(verified.status,'ARCHIVE_INTEGRITY_PASS');
  assert.equal(verified.productionRelease,'NO_GO');
  assert.equal(verified.providerPhysicalRestore,'UNVERIFIED');
  const original=JSON.parse(await readFile(f.manifest,'utf8'));
  assert.ok(original.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 }finally{await f.cleanup();}
});
test('tampered Storage payload fails before a claimed pass',async()=>{
 const f=await fixture();try{
  await archiveGate({archive:f.archive,createManifest:f.manifest});
  await writeFile(f.object,Buffer.from([0x50,0x4e,0x47,0x21]));
  await assert.rejects(archiveGate({archive:f.archive,verifyManifest:f.manifest}),/checksum/);
 }finally{await f.cleanup();}
});
test('missing SQL export fails closed',async()=>{
 const f=await fixture();try{
  await rm(join(f.archive,'remaining-data.sql'));
  await assert.rejects(inventoryRecoveryArchive(f.archive));
 }finally{await f.cleanup();}
});
test('symlink into another directory is rejected',async()=>{
 const f=await fixture();try{
  const fake=join(f.archive,'storage','account-avatars','evil.webp');
  await symlink(f.object,fake);
  await assert.rejects(inventoryRecoveryArchive(f.archive),/symbolic link/);
 }finally{await f.cleanup();}
});
test('world-readable files or manifest rejected',async()=>{
 const f=await fixture();try{
  await chmod(f.object,0o644);
  await assert.rejects(inventoryRecoveryArchive(f.archive),/permissions/);
  await chmod(f.object,0o600);
  await archiveGate({archive:f.archive,createManifest:f.manifest});
  await chmod(f.manifest,0o644);
  await assert.rejects(archiveGate({archive:f.archive,verifyManifest:f.manifest}),/private regular/);
 }finally{await f.cleanup();}
});
test('manifest itself cannot be written into source archive',async()=>{
 const f=await fixture();try{
  await assert.rejects(archiveGate({
   archive:f.archive,createManifest:join(f.archive,'manifest.json')
  }),/inside the source archive/);
 }finally{await f.cleanup();}
});
test('an empty Storage archive is not proof of object-byte recovery',async()=>{
 const f=await fixture();try{
  await rm(f.object);
  await assert.rejects(inventoryRecoveryArchive(f.archive),/no private Storage object bytes/);
 }finally{await f.cleanup();}
});
test('logical integrity does not certify provider recovery even with matching manifest',async()=>{
 const f=await fixture();try{
  const actual=await inventoryRecoveryArchive(f.archive);
  const report=compareRecoveryManifest(actual,actual);
  assert.equal(report.hostedRto,'UNVERIFIED');
  assert.equal(report.rollingRpo,'UNVERIFIED');
  assert.equal(report.productionRelease,'NO_GO');
 }finally{await f.cleanup();}
});
