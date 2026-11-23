import {parseStationSourceCsv} from './station-source04.js';
import {stationCandidateSha256} from './station-evidence07.js';

// Normalization only. Never posts or activates a registry.
export async function stageStationRegistryLocally(sourceCsv,ownerPacket){
 if(!ownerPacket||ownerPacket.schema!=='fueltrans-station-owner-review-v1'||
  ownerPacket.reviewStatus!=='AWAITING_INDEPENDENT_OWNER_CONFIRMATION'||
  ownerPacket.authorityVerified!==false||ownerPacket.registryActivated!==false||
  ownerPacket.sourceImported!==false||!ownerPacket.proposedSource?.owner||
  !ownerPacket.proposedSource.sourceReference||!ownerPacket.proposedSource.revision){
  throw Error('A non-authoritative owner-review packet is required.');
 }
 const parsed=parseStationSourceCsv(sourceCsv);
 if(!parsed.rows.length||parsed.issues.length){
  throw Error('Resolve station-source validation issues before creating a staging file.');
 }
 const actualDigest=await stationCandidateSha256(parsed.rows);
 if(ownerPacket.fingerprint?.value!==actualDigest||ownerPacket.scope?.uniqueStations!==parsed.rows.length||
  ownerPacket.scope?.dataRows!==parsed.totalDataRows){
  throw Error('The station source no longer matches the reviewed metadata fingerprint and row counts.');
 }
 const rows=parsed.rows.map(({client,stationId,stationName})=>({client,stationId,stationName}));
 rows.sort((a,b)=>{
  const first=a.client+'\u0000'+a.stationId,second=b.client+'\u0000'+b.stationId;
  return first<second?-1:first>second?1:0;
 });
 return Object.freeze({
  schema:'fueltrans-station-staging-v1',status:'STAGED_NOT_IMPORTED_NOT_VERIFIED',
  authorityVerified:false,registryActivated:false,sourceImported:false,
  ownerClaim:{owner:ownerPacket.proposedSource.owner,
   sourceReference:ownerPacket.proposedSource.sourceReference,
   revision:ownerPacket.proposedSource.revision,
   approvalReference:ownerPacket.proposedSource.approvalReference},
  fingerprint:{algorithm:'SHA-256',value:actualDigest},
  recordCount:rows.length,
  rows,
  nextAction:'Verify source owner approval independently, then activate using a separately reviewed server import contract. This file is not proof of source authority.',
  note:'Contains only station client, ID and name. No ticket history, remote access data or credentials were imported or saved to a database.'
 });
}
