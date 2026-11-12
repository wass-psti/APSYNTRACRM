/** CP-URM-02: presentation-only signed CRM role projection.
 * The existing self-only RPC is authoritative; this NEVER feeds access checks.
 */
const ROLES=new Set(['admin','supervisor','employee','viewer']);
export function parseSignedCrmRole(raw,{userId,workspaceId,identityRole}={}){
 if(!userId||!workspaceId||!identityRole||raw?.schemaVersion!==1||
    raw.workspaceId!==workspaceId||raw.platformRole!==identityRole||
    !ROLES.has(raw.effectivePlatformRole)||
    (raw.explicitPlatformRole!==null&&!ROLES.has(raw.explicitPlatformRole))||
    (raw.explicitPlatformRole!==null&&raw.explicitPlatformRole!==raw.effectivePlatformRole))
  throw Error('Signed CRM role response does not match the active account and workspace');
 return {userId,workspaceId,identityRole,
  effectiveRole:raw.effectivePlatformRole,explicitRole:raw.explicitPlatformRole};
}
export function currentSignedCrmRole(snapshot,context){
 if(!context?.user_id||!context?.workspace_id||
    snapshot?.userId!==context.user_id||snapshot.workspaceId!==context.workspace_id||
    snapshot.identityRole!==context.profile?.platform_role)return null;
 return snapshot;
}
export function signedCrmRoleLabel(snapshot,context){
 const valid=currentSignedCrmRole(snapshot,context);
 return valid?'CRM '+valid.effectiveRole:'CRM role unverified';
}
export function signedCrmIdentityLabel(context){
 return 'Identity: '+(context?.profile?.platform_role||'unverified');
}
