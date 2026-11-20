/** No network access, credentials, changes, or speculative readiness inference.
 * Caller supplies authoritative diagnostics and independent delivery evidence.
 */
const required = Object.freeze([
 'workspace membership model','signed session verification','native workspace scope',
 'workspace owner roles','digest extension','invitation schema and feature flag',
 'trusted issuance and acceptance','trusted invitation manager',
 'provider delivery ledger','native browser isolation'
]);
export function assessWorkspaceInvitationProductionReadiness({checks=[],evidence={}}={}){
 const known=new Map();
 for(const item of checks){
  if(typeof item?.dependency!=='string'||
     !['PRESENT','MISSING'].includes(item.verified_state)||
     known.has(item.dependency))throw new TypeError('Invalid or duplicated diagnostic');
  known.set(item.dependency,item.verified_state);
 }
 const core=required.slice(0,5).every(k=>known.get(k)==='PRESENT');
 const database=required.every(k=>known.get(k)==='PRESENT');
 const signed= evidence.twoIndependentSignedStagingUsers===true;
 const email=evidence.smtpAuthenticated===true&&evidence.inboxDeliveryVerified===true;
 const recipient=evidence.signedRecipientAcceptanceVerified===true&&
   evidence.crossSessionMembershipVerified===true;
 const ready=database&&signed&&email&&recipient&&
   evidence.trustedStagingEdgeVerified===true;
 return Object.freeze({
  state:ready?'STAGING_ACCEPTED':'BLOCKED',
  coreSchemaCompatible:core,
  databaseInstalled:database,
  productionActivationAuthorized:false,
  missing:Object.freeze([
   ...required.filter(k=>known.get(k)!=='PRESENT'),
   ...(!signed?['two independent signed staging users']:[]),
   ...(!email?['authenticated SMTP and verified delivered inbox email']:[]),
   ...(!recipient?['signed acceptance and cross-session membership readback']:[]),
   ...(evidence.trustedStagingEdgeVerified!==true?['trusted staging Edge execution']:[])
  ])
 });
}
