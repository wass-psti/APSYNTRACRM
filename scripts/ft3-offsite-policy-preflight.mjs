#!/usr/bin/env node
/**
 * Offline planning/preflight for an independently configured offsite backup.
 * NEVER connects to a cloud account, reads keys, provisions, writes, or
 * activates backup capture. Submitted evidence is UNATTESTED metadata.
 */
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='jtlusodorfnyzgyuewkz';
const BLOCKED_PRIVILEGES=['DeleteObject','DeleteObjectVersion','PutBucketPolicy','PutBucketObjectLockConfiguration','BypassGovernanceRetention','PutObjectRetention','PutLifecycleConfiguration','CreateAccessKey','AdministratorAccess','*'];
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const unique=a=>Array.isArray(a)&&new Set(a).size===a.length;
const textValue=v=>typeof v==='string'&&v.length>=3&&v.length<=256;
const isSecretKey=k=>/secret|password|access[._-]?key|private[._-]?key|bearer|token([._-]?value)?|credentials/i.test(k);
export function evaluateOffsitePlan(plan){
 check(plan&&typeof plan==='object'&&!Array.isArray(plan),'Missing plan');
 check(plan.schemaVersion===1&&plan.project===PROJECT,'Wrong project/schema');
 check(['aws-s3-object-lock','cloudflare-r2-bucket-lock'].includes(plan.provider),'Unsupported provider');
 // Block accidental secret material in an otherwise reviewable local plan.
 const scan=(x)=>{
  if(Array.isArray(x)){for(const item of x)scan(item);return}
  if(x&&typeof x==='object'){
   for(const [key,value] of Object.entries(x)){
    check(!isSecretKey(key),'Never put credential material in a backup plan');
    scan(value);
   }
  }
 };
 scan(plan);
 const issues=[];
 const requireField=(yes,reason)=>{if(!yes)issues.push(reason)};
 requireField(textValue(plan.accountReference)&&textValue(plan.bucket)&&
   /^[a-z0-9][a-z0-9.-]{2,62}$/.test(plan.bucket),'Destination account/bucket not specified');
 requireField(plan.publicAccessBlocked===true,'Bucket public access not demonstrably blocked');
 requireField(plan.encryption?.clientSideAuthenticated===true,'Authenticated client-side backup encryption required');
 requireField(plan.encryption?.separateRecoverableKeyCustody===true,
  'Key escrow/recovery cannot depend solely on the backup account or Mac');
 requireField(plan.capture?.database===true&&plan.capture?.allPrivateStorageBytes===true&&
   plan.capture?.metadata===true&&plan.capture?.pointInTimeCoordinated===true,
   'Whole Workspace DB, Auth and private Storage coordinated capture missing');
 requireField(Number.isInteger(plan.capture?.intervalHours)&&plan.capture.intervalHours>0&&
   plan.capture.intervalHours<24,'Capture interval must be strictly less than 24h');
 requireField(Number.isInteger(plan.retentionDays)&&plan.retentionDays>=2&&plan.retentionDays<=3650,
   'Owner-approved retention duration missing');
 requireField(plan.retentionOwnerApproved===true,'Owner retention decision not recorded');
 requireField(plan.budgetOwnerApproved===true,'Owner operational cost decision not recorded');
 const writer=plan.roles?.writer,restore=plan.roles?.restore,administrator=plan.roles?.administrator;
 requireField([writer,restore,administrator].every(textValue)&&
   new Set([writer,restore,administrator]).size===3,'Distinct writer/restore/admin principals required');
 requireField(unique(plan.roles?.writerActions),'Writer allow-list must be explicit and unique');
 if(Array.isArray(plan.roles?.writerActions)){
  requireField(plan.roles.writerActions.length>0&&plan.roles.writerActions.every(x=>
    typeof x==='string'&&!BLOCKED_PRIVILEGES.some(block=>x===block||x.endsWith(':'+block))),
   'Writer may not delete, change retention or administer access');
  requireField(plan.roles.writerActions.every(x=>['s3:PutObject','s3:AbortMultipartUpload'].includes(x)),
   'Writer must use a strict append-only S3 API allow-list');
 }
 requireField(plan.roles?.writerCanDelete===false&&plan.roles?.writerCanChangeRetention===false&&
   plan.roles?.writerCanRead===false,'Writer role must not read, delete or change lock policies');
 requireField(plan.roles?.restoreCanDelete===false&&plan.roles?.restoreCanChangeRetention===false,
   'Recovery reader must not delete or alter retention');
 if(plan.provider==='aws-s3-object-lock'){
  requireField(plan.versioning==='Enabled'&&plan.objectLockEnabled===true,
    'S3 Object Lock and versioning are mandatory');
  requireField(plan.objectLockMode==='COMPLIANCE',
    'S3 compliance retention required for strict WORM protection');
  requireField(plan.objectLockDefaultDays===plan.retentionDays,
    'Bucket default compliance retention does not match approved duration');
  requireField(plan.bucketPolicyDeniesUnencryptedUploads===true,
    'Server-side encryption policy not evidenced');
 }else{
  requireField(plan.bucketLockEnabled===true&&plan.bucketLockRetentionDays===plan.retentionDays,
    'R2 bucket lock rule does not cover the approved duration');
  requireField(plan.bucketLockPrefix===''&&plan.bucketLockChangeRestricted===true,
    'R2 bucket lock must cover all objects and be restricted to administrators');
  issues.push('R2 bucket locks can be edited by authorized administrators; validate acceptable immutability threat model');
 }
 requireField(plan.providerVerifiedReadOnly===true,
   'Provider-backed read-only policy verification not attached');
 requireField(plan.independentRestoreTested===true,
   'Independent restore of encrypted DB and Storage not verified');
 requireField(plan.sustained24HourRpoMeasured===true&&plan.fullHosted24HourRtoMeasured===true,
   'Whole-Workspace 24-hour RPO/RTO not demonstrated');
 requireField(plan.providerPhysicalRestoreRequirementResolved===true,
   'Mandatory Supabase provider physical restore requirement unresolved');
 // This configuration is always untrusted; even an apparently complete
 // declarative plan cannot activate a backup or certify production.
 return {
  classification:'UNATTESTED_OFFSITE_POLICY_PREFLIGHT',
  provider:plan.provider,
  destinationDeclared:textValue(plan.bucket),
  requirementsChecked:issues.length===0,
  issues,
  externalPolicyAttested:false,
  credentialsProvisioned:false,
  immutableRetentionActivated:false,
  recurringBackupsActivated:false,
  productionRelease:'NO_GO'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  check(process.argv.length===4&&process.argv[2]==='--plan','Usage: --plan /private/path.json');
  const stat=await fs.lstat(process.argv[3]);
  check(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,
    'Plan file must be owner-only');
  const result=evaluateOffsitePlan(JSON.parse(await fs.readFile(process.argv[3],'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=2; // No actual external attestation or activation.
 }catch(error){process.stderr.write('OFFSITE_PREFLIGHT_BLOCKED: '+error.message+'\n');process.exitCode=2;}
}
