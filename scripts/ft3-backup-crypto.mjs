#!/usr/bin/env node
/**
 * One-shot local authenticated encryption of a PREEXISTING backup payload.
 * NO network/offsite transport, recurring backup, key generation, cloud config
 * or production data export. Read-only on input/key; output created exclusively.
 *
 * Envelope: 8-byte magic, 12-byte random AES-GCM IV, ciphertext, 16-byte tag.
 * Key: exactly 32 raw bytes in an owner-only (0600) regular local file.
 * Authenticated decryption refuses to publish any unauthenticated plaintext.
 */
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createReadStream,createWriteStream,promises as fs} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MAGIC=Buffer.from('FT3ENC01','ascii');
const IV_BYTES=12,TAG_BYTES=16;
const deny=message=>{throw new Error(message)};
async function privateRegular(path,label){
 const st=await fs.lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size===0)
  deny(label+' must be a nonempty owner-only regular file');
 return st;
}
async function keyFromFile(path){
 const st=await privateRegular(path,'Encryption key');
 if(st.size!==32)deny('Key must contain exactly 32 raw bytes');
 return fs.readFile(path);
}
async function outputDirectory(path){
 const st=await fs.lstat(dirname(path));
 if(!st.isDirectory()||(st.mode&0o077)!==0)deny('Output directory must be owner-only');
}
async function publishVerified(output,writer){
 const dest=resolve(output);
 await outputDirectory(dest);
 const temp=join(dirname(dest),'.'+basename(dest)+'.partial-'+randomBytes(10).toString('hex'));
 const h=await fs.open(temp,'wx',0o600);
 try{
  await h.close();
  await writer(temp);
  const f=await fs.open(temp,'r');
  try{await f.sync();}finally{await f.close();}
  // Exclusive hard link publishes completed file. EEXIST refuses overwrite
  // without replacing an unrelated user file.
  await fs.link(temp,dest);
  return dest;
 }finally{await fs.rm(temp,{force:true})}
}
export async function encryptBackupFile({input,output,keyFile}){
 if(!input||!output||!keyFile||resolve(input)===resolve(output))deny('Separate input/output and key required');
 await privateRegular(input,'Backup input');
 const key=await keyFromFile(keyFile);
 const iv=randomBytes(IV_BYTES);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(MAGIC);
 await publishVerified(output,async(temp)=>{
  const handle=await fs.open(temp,'r+');
  try{await handle.write(Buffer.concat([MAGIC,iv]),0,MAGIC.length+IV_BYTES,0);}
  finally{await handle.close();}
  const out=createWriteStream(temp,{flags:'a',mode:0o600});
  await pipeline(createReadStream(input),cipher,out);
  await fs.appendFile(temp,cipher.getAuthTag());
 });
 return {status:'LOCAL_ENCRYPTION_PASS',algorithm:'AES-256-GCM',authenticated:true,
  offsiteTransfer:false,immutableRetention:false,productionRelease:'NO_GO'};
}
export async function decryptBackupFile({input,output,keyFile}){
 if(!input||!output||!keyFile||resolve(input)===resolve(output))deny('Separate input/output and key required');
 const st=await privateRegular(input,'Encrypted input');
 if(st.size<MAGIC.length+IV_BYTES+TAG_BYTES+1)deny('Encrypted payload truncated');
 const key=await keyFromFile(keyFile);
 const h=await fs.open(input,'r');
 let header,tag;
 try{
  header=Buffer.alloc(MAGIC.length+IV_BYTES);
  tag=Buffer.alloc(TAG_BYTES);
  await h.read(header,0,header.length,0);
  await h.read(tag,0,TAG_BYTES,st.size-TAG_BYTES);
 }finally{await h.close();}
 if(!header.subarray(0,MAGIC.length).equals(MAGIC))deny('Unknown backup envelope format');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length));
 decipher.setAAD(MAGIC);
 decipher.setAuthTag(tag);
 await publishVerified(output,async(temp)=>{
  await pipeline(createReadStream(input,{start:header.length,end:st.size-TAG_BYTES-1}),
   decipher,createWriteStream(temp,{flags:'w',mode:0o600}));
 });
 return {status:'LOCAL_DECRYPTION_PASS',authenticated:true,
  providerPhysicalRestore:'UNVERIFIED',productionRelease:'NO_GO'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [action,input,output,keyFile]=process.argv.slice(2);
  if(process.argv.length!==6||!['encrypt','decrypt'].includes(action))
   deny('Usage: encrypt|decrypt INPUT OUTPUT RAW_KEY_FILE');
  const result=await (action==='encrypt'?encryptBackupFile:decryptBackupFile)({input,output,keyFile});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){
  process.stderr.write('BACKUP_CRYPTO_BLOCKED: '+error.message+'\n');
  process.exitCode=2;
 }
}
