import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path=new URL('../infra/fueltrack-recovery/s3-object-lock.template.json',import.meta.url);
const get=async()=>JSON.parse(await readFile(path,'utf8'));
const copy=o=>structuredClone(o);
const inspect=(tpl)=>{
 const r=tpl.Resources, p=tpl.Parameters, bucket=r.RecoveryBucket;
 if(bucket?.Type!=='AWS::S3::Bucket'||bucket.DeletionPolicy!=='Retain'||bucket.UpdateReplacePolicy!=='Retain')throw Error('Missing Retain bucket');
 const x=bucket.Properties;
 if(x.VersioningConfiguration?.Status!=='Enabled'||x.ObjectLockEnabled!==true||
  x.ObjectLockConfiguration?.ObjectLockEnabled!=='Enabled'||x.ObjectLockConfiguration?.Rule?.DefaultRetention?.Mode!=='COMPLIANCE')throw Error('Missing strict compliance lock');
 if(JSON.stringify(x.ObjectLockConfiguration.Rule.DefaultRetention.Days)!==JSON.stringify({Ref:'ApprovedRetentionDays'}))throw Error('Missing approval-bound retention parameter');
 if(p.ApprovedRetentionDays?.Default!==undefined||p.ApprovedBucketName?.Default!==undefined||
    p.ApprovedWriterPrincipalArn?.Default!==undefined||p.ApprovedRestorePrincipalArn?.Default!==undefined)throw Error('Approval parameters must have no defaults');
 if(!Object.values(x.PublicAccessBlockConfiguration||{}).every(v=>v===true)||
   Object.keys(x.PublicAccessBlockConfiguration||{}).length!==4)throw Error('Public access must be blocked');
 if(x.BucketEncryption?.ServerSideEncryptionConfiguration?.[0]?.ServerSideEncryptionByDefault?.SSEAlgorithm!=='AES256')throw Error('Encryption required');
 const deny=r.RecoveryBucketPolicy?.Properties?.PolicyDocument?.Statement||[];
 if(!deny.some(s=>s.Effect==='Deny'&&s.Condition?.Bool?.['aws:SecureTransport']==='false'&&s.Action==='s3:*'))throw Error('TLS deny required');
 const writer=r.UploadRole,reader=r.RestoreRole;
 if(writer.Type!=='AWS::IAM::Role'||reader.Type!=='AWS::IAM::Role')throw Error('Dedicated roles required');
 const a=writer.Properties.Policies.flatMap(v=>v.PolicyDocument.Statement).flatMap(v=>v.Action);
 const b=reader.Properties.Policies.flatMap(v=>v.PolicyDocument.Statement).flatMap(v=>v.Action);
 if(a.length!==2||!a.includes('s3:PutObject')||!a.includes('s3:AbortMultipartUpload')||
    a.some(v=>/Delete|Get|List|Retention|Lock|Policy|\*/i.test(v)))throw Error('Writer can do more than append');
 if(b.length!==3||!['s3:GetObject','s3:GetObjectVersion','s3:ListBucketVersions'].every(v=>b.includes(v))||
    b.some(v=>/Delete|Put|Retention|Lock|Policy|\*/i.test(v)))throw Error('Reader is not read-only');
 if(JSON.stringify(writer.Properties.AssumeRolePolicyDocument.Statement[0].Principal.AWS)!==JSON.stringify({Ref:'ApprovedWriterPrincipalArn'})||
    JSON.stringify(reader.Properties.AssumeRolePolicyDocument.Statement[0].Principal.AWS)!==JSON.stringify({Ref:'ApprovedRestorePrincipalArn'}))throw Error('Trust principals must be explicit');
 return true;
};
test('nondeployed CloudFormation resource template meets baseline',async()=>{
 assert.equal(inspect(await get()),true);
});
test('no default approved account, bucket, retention or IAM principals',async()=>{
 const x=await get();
 for(const p of Object.keys(x.Parameters)) assert.equal(x.Parameters[p].Default,undefined);
 assert.equal(x.Resources.RecoveryBucket.Properties.BucketName.Ref,'ApprovedBucketName');
});
test('Compliance versioning cannot be downgraded by a template edit',async()=>{
 const x=await get();x.Resources.RecoveryBucket.Properties.ObjectLockConfiguration.Rule.DefaultRetention.Mode='GOVERNANCE';
 assert.throws(()=>inspect(x),/strict compliance/);
 const y=await get();y.Resources.RecoveryBucket.Properties.VersioningConfiguration.Status='Suspended';
 assert.throws(()=>inspect(y),/strict compliance/);
});
test('unapproved retention defaults are rejected',async()=>{
 const x=await get();x.Parameters.ApprovedRetentionDays.Default=30;
 assert.throws(()=>inspect(x),/no defaults/);
});
test('public exposure and missing TLS deny are rejected',async()=>{
 const x=await get();x.Resources.RecoveryBucket.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy=false;
 assert.throws(()=>inspect(x),/Public access/);
 const y=await get();y.Resources.RecoveryBucketPolicy.Properties.PolicyDocument.Statement=[];
 assert.throws(()=>inspect(y),/TLS deny/);
});
test('upload role is append-only with no read, deletion, or lock mutation',async()=>{
 const x=await get();
 x.Resources.UploadRole.Properties.Policies[0].PolicyDocument.Statement[0].Action.push('s3:DeleteObject');
 assert.throws(()=>inspect(x),/Writer/);
});
test('restore principal cannot mutate backup data',async()=>{
 const x=await get();
 x.Resources.RestoreRole.Properties.Policies[0].PolicyDocument.Statement[0].Action.push('s3:PutObject');
 assert.throws(()=>inspect(x),/Reader/);
});
test('IAM trust policy cannot be replaced with wildcard',async()=>{
 const x=await get();x.Resources.UploadRole.Properties.AssumeRolePolicyDocument.Statement[0].Principal.AWS='*';
 assert.throws(()=>inspect(x),/Trust principals/);
});
test('CloudFormation has no destructive lifecycle resources',async()=>{
 const x=await get();
 assert.deepEqual(Object.values(x.Resources).map(v=>v.Type).sort(),
  ['AWS::IAM::Role','AWS::IAM::Role','AWS::S3::Bucket','AWS::S3::BucketPolicy'].sort());
 assert.ok(Object.values(x.Resources).every(v=>JSON.stringify(v).indexOf('DeleteObject')===-1));
});
