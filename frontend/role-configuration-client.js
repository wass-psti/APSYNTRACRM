/** Bootstrap-only role configuration client. Server authorization is mandatory.
 * Proposal persistence is NOT active authorization or a grant.
 */
const VALID_OPERATIONS=new Set(['role.create','role.edit','role.activate','role.deactivate',
 'assignment.assign','assignment.revoke','permission.configure','workspace.configure']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RoleConfigurationClient {
 constructor(api){this.api=api;}
 async bootstrapVerified(){
  const value=await this.api.rpc('apsyntra_role_is_bootstrap');
  return value===true;
 }
 async snapshot(workspaceId){
  if(!uuid.test(workspaceId||''))throw Error('Invalid workspace identifier');
  const result=await this.api.rpc('apsyntra_role_configuration_snapshot',{p_workspace_id:workspaceId});
  if(result?.bootstrapVerified!==true||result.workspaceId!==workspaceId||result.mode!=='staged_only'||
     !['roles','users','assignments','boards','proposals','audit'].every(k=>Array.isArray(result[k])))
   throw Error('Unexpected verified role configuration response');
  return result;
 }
 async propose(workspaceId,operation,payload){
  if(!uuid.test(workspaceId||'')||!VALID_OPERATIONS.has(operation)||
     payload===null||typeof payload!=='object'||Array.isArray(payload))
   throw Error('Invalid role change request');
  // Caller confirmation is handled in UI, but the backend separately enforces
  // immutable bootstrap identity, workspace scope and protected account IDs.
  const id=await this.api.rpc('apsyntra_role_configuration_propose',
   {p_workspace_id:workspaceId,p_operation:operation,p_payload:payload});
  if(!uuid.test(id||''))throw Error('Server did not return a role proposal ID');
  return id;
 }
}
