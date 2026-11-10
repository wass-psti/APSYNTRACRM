import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,stat,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptBackupFile,decryptBackupFile} from './ft3-backup-crypto.mjs';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'ft3-crypto-'));
 await chmod(dir,0o700);
 const input=join(dir,'source.tar'),encrypted=join(dir,'source.ft3enc'),decrypted=join(dir,'restored.tar'),keyFile=join(dir,'key');
 const bytes=randomBytes(24567);
 await writeFile(input,bytes,{mode:0o600});
 await writeFile(keyFile,randomBytes(32),{mode:0o600});
 return{dir,input,encrypted,decrypted,keyFile,bytes,clean:()=>rm(dir,{recursive:true,force:true})};
}
test('AES-256-GCM encrypted backup roundtrips and keeps 0600 output',async()=>{
 const f=await fixture();try{
  const enc=await encryptBackupFile({...f,output:f.encrypted});
  assert.equal(enc.status,'LOCAL_ENCRYPTION_PASS');
  assert.equal(enc.offsiteTransfer,false);
  assert.equal(enc.productionRelease,'NO_GO');
  assert.equal((await stat(f.encrypted)).mode&0o077,0);
  const d=await decryptBackupFile({...f,input:f.encrypted,output:f.decrypted});
  assert.equal(d.status,'LOCAL_DECRYPTION_PASS');
  assert.deepEqual(await readFile(f.decrypted),f.bytes);
 }finally{await f.clean();}
});
test('authentication failure does not publish plaintext',async()=>{
 const f=await fixture();try{
  await encryptBackupFile({...f,output:f.encrypted});
  const data=await readFile(f.encrypted);
  data[40]^=0xff;
  await writeFile(f.encrypted,data,{mode:0o600});
  await assert.rejects(decryptBackupFile({...f,input:f.encrypted,output:f.decrypted}));
  await assert.rejects(stat(f.decrypted),{code:'ENOENT'});
 }finally{await f.clean();}
});
test('wrong key does not publish plaintext',async()=>{
 const f=await fixture();try{
  await encryptBackupFile({...f,output:f.encrypted});
  await writeFile(f.keyFile,randomBytes(32),{mode:0o600});
  await assert.rejects(decryptBackupFile({...f,input:f.encrypted,output:f.decrypted}));
  await assert.rejects(stat(f.decrypted),{code:'ENOENT'});
 }finally{await f.clean();}
});
test('preexisting destination is never overwritten',async()=>{
 const f=await fixture();try{
  await writeFile(f.encrypted,'existing',{mode:0o600});
  await assert.rejects(encryptBackupFile({...f,output:f.encrypted}),{code:'EEXIST'});
  assert.equal((await readFile(f.encrypted,'utf8')),'existing');
 }finally{await f.clean();}
});
test('rejects insecure key and destination directory',async()=>{
 const f=await fixture();try{
  await chmod(f.keyFile,0o644);
  await assert.rejects(encryptBackupFile({...f,output:f.encrypted}),/owner-only/);
  await chmod(f.keyFile,0o600);
  await chmod(f.dir,0o755);
  await assert.rejects(encryptBackupFile({...f,output:f.encrypted}),/Output directory/);
 }finally{await f.clean();}
});
test('rejects truncated ciphertext and unsupported magic',async()=>{
 const f=await fixture();try{
  await writeFile(f.encrypted,Buffer.from('too-short'),{mode:0o600});
  await assert.rejects(decryptBackupFile({...f,input:f.encrypted,output:f.decrypted}),/truncated/);
  await rm(f.encrypted);
  await encryptBackupFile({...f,output:f.encrypted});
  const payload=await readFile(f.encrypted);
  payload[0]=0x42;
  await writeFile(f.encrypted,payload,{mode:0o600});
  await assert.rejects(decryptBackupFile({...f,input:f.encrypted,output:f.decrypted}),/envelope/);
 }finally{await f.clean();}
});
test('invalid key length and same-path operation fail closed',async()=>{
 const f=await fixture();try{
  await writeFile(f.keyFile,Buffer.alloc(16),{mode:0o600});
  await assert.rejects(encryptBackupFile({...f,output:f.encrypted}),/exactly 32/);
  await assert.rejects(encryptBackupFile({...f,output:f.input}),/Separate input/);
 }finally{await f.clean();}
});
