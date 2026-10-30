/** Existing APSYNTRA centralized assignment contracts. Backend decides authority. */
export type UserRoleScope='module'|'board';
export type ModuleRoleId=
 |'time-tracker'|'fueltrack-plus'|'tradelink'|'toolbox-issues'
 |'fund-released-tracker'|'fueltrans'|'order-intake'|'tool-traceability'
 |'material-request-hub'|'aps-aims'|'employee-eval'|'charter-navigator';
export type BoardMemberRole='viewer'|'editor';
export type UserRoleGrantRequest={
 workspaceId:string;userId:string;scope:UserRoleScope;resourceId:string;
 role:string;enabled:boolean;expectedUpdatedAt:string|null;
};
export type AuthoritativeRoleAssignment={
 userId:string;moduleId:string;role:string;enabled:boolean;updatedAt:string|null;
};
export type AuthoritativeBoardMembership={
 boardId:string;userId:string;role:'viewer'|'editor'|'owner';updatedAt:string|null;
};
export interface UserRoleManagementSnapshot{
 workspaceId:string;bootstrapVerified:true;
 users:Array<{id:string;name:string;email:string;platformRole:string;protected:boolean}>;
 modules:ModuleRoleId[];
 moduleAssignments:AuthoritativeRoleAssignment[];
 boards:Array<{id:string;name:string}>;
 boardAssignments:AuthoritativeBoardMembership[];
}
export const ROLE_MANAGEMENT_MODULES:readonly ModuleRoleId[]=[
 'fueltrans','tool-traceability','toolbox-issues','fund-released-tracker',
 'fueltrack-plus','tradelink','time-tracker','order-intake',
 'employee-eval','charter-navigator','aps-aims','material-request-hub'];
export function assertUserRoleManagementSnapshot(value:unknown):asserts value is UserRoleManagementSnapshot{
 const d=value as Partial<UserRoleManagementSnapshot>|null;
 if(!d||d.bootstrapVerified!==true||typeof d.workspaceId!=='string'||
 !['users','modules','moduleAssignments','boards','boardAssignments'].every(k=>
   Array.isArray((d as unknown as Record<string,unknown>)[k])))
 throw new TypeError('Signed bootstrap-only role snapshot required');
}
