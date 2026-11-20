/**
 * Credential-free integration gate for a named *isolated* staging environment.
 * Input is explicit verified metadata, never Auth credentials, tokens or secrets.
 * A deployment name or Edge function status alone cannot imply readiness.
 */
export function assessInvitationStagingReadiness(snapshot){
  if(!snapshot || typeof snapshot!=='object' || Array.isArray(snapshot))
    throw new TypeError('Verified staging snapshot required');
  const prerequisites=[
    ['isolated_branch','Isolated nonproduction branch',snapshot.isolated===true],
    ['two_signed_accounts','Two actual distinct verified staging users',Number.isInteger(snapshot.verifiedUserCount)&&snapshot.verifiedUserCount>=2],
    ['workspace_core','Existing workspace, profile and membership schema',snapshot.workspaceSchema===true],
    ['invitation_private_sql','Private issue, accept and invitation schema',snapshot.privateInvitationSchema===true],
    ['delivery_ledger','Private provider reconciliation ledger',snapshot.deliveryLedger===true],
    ['manager_endpoint','Trusted manager listing/revocation route',snapshot.managerRoute==='trusted'],
    ['invite_endpoint','Trusted invite Edge source installed',snapshot.inviteRoute==='trusted'],
    ['accept_endpoint','Trusted accept Edge source installed',snapshot.acceptRoute==='trusted'],
    ['auth_session','Live JWT and GoTrue session verification tested',snapshot.signedSessionVerified===true],
    ['email_provider','Verified staging sender, provider, and test inbox',snapshot.emailDeliveryVerified===true],
  ];
  const checks=prerequisites.map(([id,label,pass])=>Object.freeze({id,label,status:pass?'VERIFIED':'BLOCKED'}));
  return Object.freeze({
    state:checks.every(c=>c.status==='VERIFIED')?'STAGING_READY':'BLOCKED',
    checks:Object.freeze(checks),
    verified:checks.filter(c=>c.status==='VERIFIED').length,
    total:checks.length,
    productionActivationAllowed:false,
  });
}
