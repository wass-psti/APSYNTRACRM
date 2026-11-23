import {stationCandidateSha256} from './station-evidence07.js';

// No database writes or bundled trust keys. Only externally vetted keys can verify a receipt.
const APPROVAL_SCHEMA='fueltrans-station-owner-attestation-v1';
const SOURCE_SCHEMA='fueltrans-station-staging-v1';
const DIGEST=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function requiredText(value,label,max=240){
 if(typeof value!=='string'||value.trim().length<3||value.length>max||/[\x00-\x1f\x7f]/.test(value)){
  throw Error('Invalid '+label);
 }
 return value.trim();
}
function dateIso(value){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value){
  throw Error('Invalid approval timestamp');
 }
 return value;
}
function decodeBase64url(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid signature/key encoding');
 const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
 return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}

// Stable explicit-field payload: unexpected receipt fields can never become grant inputs.
export function stationApprovalMessage(statement){
 if(!statement||statement.schema!==APPROVAL_SCHEMA)throw Error('Invalid approval statement schema');
 const payload={
  schema:APPROVAL_SCHEMA,
  workspaceId:statement.workspaceId,
  fingerprint:statement.fingerprint,
  owner:statement.owner,
  sourceReference:statement.sourceReference,
  revision:statement.revision,
  approvedAt:statement.approvedAt
 };
 if(!UUID.test(payload.workspaceId||''))throw Error('Invalid approval workspace');
 if(!DIGEST.test(payload.fingerprint||''))throw Error('Invalid source fingerprint');
 payload.owner=requiredText(payload.owner,'source owner',140);
 payload.sourceReference=requiredText(payload.sourceReference,'source reference',220);
 payload.revision=requiredText(payload.revision,'source revision',80);
 dateIso(payload.approvedAt);
 return new TextEncoder().encode(JSON.stringify(payload));
}
async function verifyReceipt(receipt,trustedKeys){
 if(!receipt||receipt.schema!=='fueltrans-station-approval-receipt-v1')throw Error('Invalid approval receipt');
 const signerId=requiredText(receipt.signerId,'signer ID',100);
 if(!Array.isArray(trustedKeys)||!trustedKeys.length)throw Error('No independently trusted owner key has been configured');
 const trusted=trustedKeys.find(key=>key.signerId===signerId);
 if(!trusted||typeof trusted.publicKey!=='string')throw Error('Unrecognized owner signing key');
 if(!globalThis.crypto?.subtle)throw Error('Approval verification requires Web Crypto');
 const publicKey=decodeBase64url(trusted.publicKey);
 if(publicKey.length!==32)throw Error('Invalid Ed25519 public key');
 const signature=decodeBase64url(receipt.signature);
 if(signature.length!==64)throw Error('Invalid Ed25519 signature');
 const key=await crypto.subtle.importKey('raw',publicKey,{name:'Ed25519'},false,['verify']);
 const valid=await crypto.subtle.verify({name:'Ed25519'},key,signature,stationApprovalMessage(receipt.statement));
 if(!valid)throw Error('Owner approval signature is not valid for this source');
 return signerId;
}
function validateStation(row){
 if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='client,stationId,stationName'){
  throw Error('Station row contains invalid or unapproved metadata');
 }
 return {
  client:requiredText(row.client,'station client',80),
  stationId:requiredText(row.stationId,'station ID',120),
  stationName:requiredText(row.stationName,'station name',160)
 };
}
// Generates a request only; it deliberately contains no signature or self-granted authority.
export function buildUnsignedStationApprovalRequest(ownerPacket,workspaceId){
 if(!ownerPacket||ownerPacket.schema!=='fueltrans-station-owner-review-v1'||
  ownerPacket.reviewStatus!=='AWAITING_INDEPENDENT_OWNER_CONFIRMATION'||
  ownerPacket.authorityVerified!==false||ownerPacket.registryActivated!==false||
  ownerPacket.sourceImported!==false||!DIGEST.test(ownerPacket.fingerprint?.value||'')||
  !UUID.test(workspaceId||''))throw Error('A valid unverified owner-review packet and workspace are required');
 return Object.freeze({
  schema:'fueltrans-station-owner-approval-request-v1',
  status:'UNSIGNED_REQUEST_NOT_VERIFIED',
  authorityVerified:false,registryActivated:false,sourceImported:false,
  statementTemplate:{
   schema:APPROVAL_SCHEMA,workspaceId,fingerprint:ownerPacket.fingerprint.value,
   owner:requiredText(ownerPacket.proposedSource?.owner,'source owner',140),
   sourceReference:requiredText(ownerPacket.proposedSource?.sourceReference,'source reference',220),
   revision:requiredText(ownerPacket.proposedSource?.revision,'source revision',80),
   approvedAt:null
  },
  nextAction:'Independent owner confirms this source digest and workspace, sets approvedAt to ISO UTC, and signs the canonical statement; a separately vetted public key must be configured for verification. This request is not an approval.'
 });
}

// Read-only dry run: does not invent a database endpoint, grant permissions, or delete records.
export async function prepareStationImportDryRun({staging,receipt,trustedKeys,workspaceId,existingStations=[]}={}){
 if(!staging||staging.schema!==SOURCE_SCHEMA||staging.status!=='STAGED_NOT_IMPORTED_NOT_VERIFIED'||
  staging.registryActivated!==false||staging.sourceImported!==false||staging.authorityVerified!==false||
  !Array.isArray(staging.rows)||staging.rows.length<1||staging.rows.length>5000||
  !Array.isArray(existingStations)||existingStations.length>5000)throw Error('Invalid unimported station staging artifact');
 if(!UUID.test(workspaceId||''))throw Error('Invalid target workspace');
 if(!DIGEST.test(staging.fingerprint?.value||'')||staging.recordCount!==staging.rows.length)throw Error('Invalid staging fingerprint or row count');
 const rows=staging.rows.map(validateStation);
 const sourceDigest=await stationCandidateSha256(rows);
 if(sourceDigest!==staging.fingerprint.value)throw Error('Staging rows do not match the recorded source fingerprint');
 const statement=receipt?.statement;
 if(!statement||statement.workspaceId!==workspaceId||statement.fingerprint!==sourceDigest||
  statement.owner!==staging.ownerClaim?.owner||statement.sourceReference!==staging.ownerClaim?.sourceReference||
  statement.revision!==staging.ownerClaim?.revision)throw Error('Approval does not match this exact workspace and source');
 const verifiedSigner=await verifyReceipt(receipt,trustedKeys);
 const existing=new Map();
 for(const item of existingStations){
  const row=validateStation(item),key=row.client+'\0'+row.stationId;
  if(existing.has(key))throw Error('Duplicate station in existing registry snapshot');
  existing.set(key,row);
 }
 const seen=new Set(),add=[],rename=[],unchanged=[];
 for(const row of rows){
  const key=row.client+'\0'+row.stationId;
  if(seen.has(key))throw Error('Duplicate station in staged source');
  seen.add(key);
  const previous=existing.get(key);
  if(!previous)add.push(row);
  else if(previous.stationName!==row.stationName)rename.push({before:previous,after:row});
  else unchanged.push(row);
 }
 const missingFromSource=[...existing.entries()].filter(([key])=>!seen.has(key)).map(([,row])=>row);
 const byKey=(a,b)=>((a.client+'\0'+a.stationId)<(b.client+'\0'+b.stationId)?-1:
  (a.client+'\0'+a.stationId)>(b.client+'\0'+b.stationId)?1:0);
 add.sort(byKey);rename.sort((a,b)=>byKey(a.after,b.after));
 unchanged.sort(byKey);missingFromSource.sort(byKey);
 return Object.freeze({
  schema:'fueltrans-station-import-dry-run-v1',
  status:'SIGNATURE_VERIFIED_PLAN_ONLY_NOT_IMPORTED',
  workspaceId,sourceFingerprint:sourceDigest,
  signerId:verifiedSigner,
  trust:'Signature verified using a caller-supplied trusted public key. Its owner provenance must be independently established.',
  registryActivated:false,sourceImported:false,
  summary:{add:add.length,rename:rename.length,unchanged:unchanged.length,missingFromSource:missingFromSource.length},
  actions:{add,rename,unchanged,missingFromSource},
  note:'This is a non-destructive dry run. Nothing is inserted, changed, removed, or authorized in Supabase.'
 });
}
