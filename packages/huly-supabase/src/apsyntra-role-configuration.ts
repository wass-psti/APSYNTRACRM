/** Central APSYNTRA Role Configuration contract.
 * Actual authorization is enforced by existing WatchdogWorkspace Auth/board RPCs.
 * Staged proposals have no production effect; do not infer access from this type.
 */
export type BaseRole='admin'|'supervisor'|'employee'|'viewer';
export type RoleCapability='view'|'create'|'edit'|'delete'|'approve'|'export'|'administer';
export type RoleProposalOperation='role.create'|'role.edit'|'role.activate'|'role.deactivate'|
 'assignment.assign'|'assignment.revoke'|'permission.configure'|'workspace.configure';
export type RoleConfigState='reference'|'draft'|'inactive';
export interface ConfiguredRole {
 id:string;roleKey:string;displayName:string;kind:'system_reference'|'custom_draft';
 state:RoleConfigState;permissions:Record<string,unknown>;revision:number;
}
export interface RoleAssignmentReadOnly {
 userId:string;moduleId:string;role:string;enabled:boolean;updatedAt:string;
}
export interface RoleConfigurationSnapshot {
 workspaceId:string;bootstrapVerified:true;mode:'staged_only';
 roles:ConfiguredRole[];
 users:Array<{id:string;displayName:string;email:string;platformRole:string;status:string;bootstrapProtected:boolean}>;
 assignments:RoleAssignmentReadOnly[];
 boards:Array<{id:string;name:string;workspaceId:string}>;
 proposals:unknown[];audit:unknown[];
}
export const DEFAULT_ROLE_HIERARCHY:readonly BaseRole[]=['admin','supervisor','employee','viewer'];
export const CONFIGURABLE_ACTIONS:readonly RoleCapability[]=[
 'view','create','edit','delete','approve','export','administer'];
export const CENTRAL_MODULE_IDS:readonly string[]=[
 'fueltrans','tool-traceability','toolbox-issues','fund-released-tracker',
 'fueltrack-plus','tradelink','time-tracker','order-intake','employee-eval',
 'charter-navigator','aps-aims','material-request-hub'];
export function isRoleProposalOperation(value:unknown):value is RoleProposalOperation{
 return typeof value==='string'&&[
 'role.create','role.edit','role.activate','role.deactivate','assignment.assign',
 'assignment.revoke','permission.configure','workspace.configure'].includes(value);
}
export function assertRoleSnapshot(value:unknown):asserts value is RoleConfigurationSnapshot{
 if(!value||typeof value!=='object')throw new TypeError('Invalid role configuration');
 const d=value as Partial<RoleConfigurationSnapshot>;
 if(d.bootstrapVerified!==true||d.mode!=='staged_only'||
  !['roles','users','assignments','boards','proposals','audit'].every(k=>Array.isArray(
    (d as unknown as Record<string,unknown>)[k])))
  throw new TypeError('Server-authorized role configuration required');
}
