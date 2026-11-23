import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {parseStationSourceCsv,reconcileStationSource} from '../fueltrans/station-source04.js';
import {stationCandidateEvidence} from '../fueltrans/station-evidence07.js';
import {buildStationOwnerReviewPacket} from '../fueltrans/station-owner-review08.js';
import {stageStationRegistryLocally} from '../fueltrans/station-staging08.js';
import {stationApprovalMessage,buildUnsignedStationApprovalRequest,prepareStationImportDryRun} from '../fueltrans/station-import-plan09.js';

const workspaceId='33333333-3333-4333-8333-333333333333';
const source='Client,Station ID,Station Name,AnyDesk Password\nARAMCO,1071B,SYNTHETIC ARAMCO STATION,NEVER_EXPORT_ME\nUNIOIL,1013C,SYNTHETIC UNIOIL STATION,NEVER_EXPORT_ME\n';
const stamp='2026-11-23T05:20:00.000Z';
const b64=bytes=>Buffer.from(bytes).toString('base64url');

async function fixture(){
 const parsed=parseStationSourceCsv(source);
 const evidence=await stationCandidateEvidence({parsed,compared:reconcileStationSource(parsed.rows,[]),
  ticketPage:1,ticketCount:0,reviewedAt:stamp});
 const owner=buildStationOwnerReviewPacket(evidence,{owner:'Test Station Data Owner',
  sourceReference:'Test Source Fixture',revision:'test-2026-11-23'},stamp);
 const staging=await stageStationRegistryLocally(source,owner);
 const keys=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const publicKey=b64(await webcrypto.subtle.exportKey('raw',keys.publicKey));
 const statement={
  schema:'fueltrans-station-owner-attestation-v1',workspaceId,
  fingerprint:staging.fingerprint.value,
  owner:staging.ownerClaim.owner,
  sourceReference:staging.ownerClaim.sourceReference,
  revision:staging.ownerClaim.revision,
  approvedAt:stamp
 };
 const signed=await webcrypto.subtle.sign({name:'Ed25519'},keys.privateKey,stationApprovalMessage(statement));
 return {staging,receipt:{schema:'fueltrans-station-approval-receipt-v1',
  signerId:'fixture-only-key',statement,signature:b64(signed)},
 trustedKeys:[{signerId:'fixture-only-key',publicKey}]};
}
test('test-key signature establishes a dry-run-only plan and produces no mutations',async()=>{
 const f=await fixture();
 const existingStations=[
  {client:'UNIOIL',stationId:'1013C',stationName:'OLD NAME'},
  {client:'REPHIL',stationId:'2001A',stationName:'UNRELATED EXISTING'}
 ];
 const plan=await prepareStationImportDryRun({...f,workspaceId,existingStations});
 assert.equal(plan.status,'SIGNATURE_VERIFIED_PLAN_ONLY_NOT_IMPORTED');
 assert.equal(plan.registryActivated,false);
 assert.equal(plan.sourceImported,false);
 assert.deepEqual(plan.summary,{add:1,rename:1,unchanged:0,missingFromSource:1});
 assert.equal(plan.actions.rename[0].after.stationName,'SYNTHETIC UNIOIL STATION');
 assert.equal(plan.actions.missingFromSource[0].client,'REPHIL');
 assert.ok(!JSON.stringify(plan).includes('NEVER_EXPORT_ME'));
 assert.ok(!JSON.stringify(plan).includes('privateKey'));
});
test('same staged data and snapshot produce a deterministic no-op plan',async()=>{
 const f=await fixture();
 const existingStations=f.staging.rows.map(row=>({...row}));
 const plan=await prepareStationImportDryRun({...f,workspaceId,existingStations});
 assert.deepEqual(plan.summary,{add:0,rename:0,unchanged:2,missingFromSource:0});
 assert.equal(plan.actions.add.length,0);
});
test('no trusted owner public key and wrong key cannot approve',async()=>{
 const f=await fixture();
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,trustedKeys:[]}),/No independently trusted/);
 const untrusted=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const wrongKey=b64(await webcrypto.subtle.exportKey('raw',untrusted.publicKey));
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  trustedKeys:[{signerId:'fixture-only-key',publicKey:wrongKey}]}),/signature is not valid/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  trustedKeys:[{signerId:'other',publicKey:f.trustedKeys[0].publicKey}]}),/Unrecognized owner/);
});
test('tampered signed fields, workspace and metadata are refused',async()=>{
 const f=await fixture();
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  receipt:{...f.receipt,statement:{...f.receipt.statement,approvedAt:'2026-11-23T05:21:00.000Z'}}}),/signature is not valid/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,
  workspaceId:'44444444-4444-4444-8444-444444444444'}),/Approval does not match/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  staging:{...f.staging,rows:[{...f.staging.rows[0],stationName:'TAMPERED'},f.staging.rows[1]]}}),/do not match/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  staging:{...f.staging,status:'IMPORTED'}}),/Invalid unimported/);
});
test('malformed rows, duplicates and unauthorized fields reject',async()=>{
 const f=await fixture();
 const row=f.staging.rows[0];
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  staging:{...f.staging,rows:[{...row,password:'s3cret'},f.staging.rows[1]]}}),/unapproved metadata/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  existingStations:[{...row},{...row}]}),/Duplicate station/);
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,
  staging:{...f.staging,rows:[row,row]}}),/do not match|Duplicate/);
});

test('offline CLI checks external public key and snapshot, returning only a dry-run plan',async()=>{
 const f=await fixture();
 const temp=await mkdtemp(join(tmpdir(),'cp-ft-ui09-'));
 try{
  const files=['stage.json','receipt.json','trusted.json','existing.json'];
  const values=[f.staging,f.receipt,f.trustedKeys,[]];
  for(let i=0;i<files.length;i++)await writeFile(join(temp,files[i]),JSON.stringify(values[i]));
  const script=fileURLToPath(new URL('../../scripts/cp-ft-ui09-station-import-dry-run.mjs',import.meta.url));
  const args=files.map(name=>join(temp,name));
  const output=execFileSync(process.execPath,[script,...args.slice(0,3),workspaceId,args[3]],{encoding:'utf8'});
  const plan=JSON.parse(output);
  assert.equal(plan.status,'SIGNATURE_VERIFIED_PLAN_ONLY_NOT_IMPORTED');
  assert.equal(plan.summary.add,2);
  assert.equal(plan.sourceImported,false);
  await writeFile(join(temp,files[2]),'[]');
  assert.throws(()=>execFileSync(process.execPath,[script,...args.slice(0,3),workspaceId,args[3]],
   {encoding:'utf8',stdio:['ignore','pipe','pipe']}),/Command failed/);
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('unsigned owner request is not a receipt and does not become a verified approval',async()=>{
 const parsed=parseStationSourceCsv(source);
 const evidence=await stationCandidateEvidence({parsed,compared:reconcileStationSource(parsed.rows,[]),
  ticketPage:1,ticketCount:0,reviewedAt:stamp});
 const owner=buildStationOwnerReviewPacket(evidence,{owner:'Test Station Data Owner',
  sourceReference:'Test Source Fixture',revision:'test-2026-11-23'},stamp);
 const request=buildUnsignedStationApprovalRequest(owner,workspaceId);
 assert.equal(request.status,'UNSIGNED_REQUEST_NOT_VERIFIED');
 assert.equal(request.authorityVerified,false);
 assert.equal(request.registryActivated,false);
 assert.equal(request.sourceImported,false);
 assert.equal(request.statementTemplate.fingerprint,evidence.fingerprint.value);
 assert.equal(request.statementTemplate.approvedAt,null);
 assert.ok(!JSON.stringify(request).includes('NEVER_EXPORT_ME'));
 assert.throws(()=>stationApprovalMessage(request.statementTemplate),/approval timestamp/);
 const f=await fixture();
 await assert.rejects(()=>prepareStationImportDryRun({...f,workspaceId,receipt:request}),/Approval does not match|Invalid approval receipt/);
});
