// CP-FT-UI-08: reviewer handoff only. This never certifies a source or activates a registry.
const FINGERPRINT=/^[a-f0-9]{64}$/;
function field(value,label,max){
 const text=String(value??'').trim();
 if(text.length<3||text.length>max||/[\x00-\x1f\x7f]/.test(text)){
  throw Error(label+' must contain 3–'+max+' printable characters.');
 }
 return text;
}
export function buildStationOwnerReviewPacket(evidence,details,preparedAt){
 if(!evidence||evidence.schema!=='fueltrans-station-candidate-review-v1'||
  evidence.verificationStatus!=='UNVERIFIED_CANDIDATE'||
  evidence.registryActivated!==false||evidence.authorityVerified!==false||
  evidence.storage!=='none'||!FINGERPRINT.test(evidence.fingerprint?.value||'')){
  throw Error('A validated, unverified station-candidate manifest is required.');
 }
 if(!details||typeof details!=='object')throw Error('Source review details are required.');
 if(!Number.isFinite(Date.parse(preparedAt))||new Date(preparedAt).toISOString()!==preparedAt){
  throw Error('Invalid packet preparation timestamp.');
 }
 return Object.freeze({
  schema:'fueltrans-station-owner-review-v1',
  reviewStatus:'AWAITING_INDEPENDENT_OWNER_CONFIRMATION',
  registryActivated:false,authorityVerified:false,sourceImported:false,
  proposedSource:{
   owner:field(details.owner,'Proposed data owner',140),
   sourceReference:field(details.sourceReference,'Source reference',220),
   revision:field(details.revision,'Source version/date',80),
   approvalReference:details.approvalReference?field(details.approvalReference,'Approval reference',160):null
  },
  fingerprint:{algorithm:'SHA-256',value:evidence.fingerprint.value,
   scope:'client + station ID + station name; sorted metadata projection only'},
  scope:{dataRows:evidence.source.dataRows,uniqueStations:evidence.source.uniqueStations,
   identicalDuplicates:evidence.source.identicalDuplicates,extraColumnsIgnored:evidence.source.extraColumnsIgnored,
   validationIssues:evidence.source.validationIssues},
  comparison:{scope:'visible-ticket-page-only',ticketPage:evidence.comparison.ticketPage,
   ticketCount:evidence.comparison.ticketCount,observed:{
    matched_on_visible_page:evidence.comparison.observed.matched_on_visible_page,
    name_difference_on_visible_page:evidence.comparison.observed.name_difference_on_visible_page,
    not_on_visible_page:evidence.comparison.observed.not_on_visible_page}},
  preparedAt,
  nextAction:'Obtain independent confirmation that the named owner controls the referenced source and approves this exact SHA-256 metadata snapshot; verify the approval outside this browser before any server import.',
  disclaimer:'Typed owner/approval references are user-supplied claims, NOT independently verified. No station rows, access credentials, deployment data or ticket history are imported or persisted.'
 });
}
