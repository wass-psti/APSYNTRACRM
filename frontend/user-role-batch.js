/** Batch role planning. Pure, non-mutating and based solely on an authorized snapshot.
 * The backend remains the final authorization authority for each individual write.
 */
import {MODULE_ROLE_OPTIONS} from './user-role-management.js';

export function planUserRoleBatch(data,{userIds=[],actorUserId=null,scope,resourceId,role,enabled=true}={}){
 if(!data||!Array.isArray(data.users)||!Array.isArray(data.boards)||
    !Array.isArray(data.moduleAssignments)||!Array.isArray(data.boardAssignments)||
    !Array.isArray(userIds)||!['module','board'].includes(scope)||typeof enabled!=='boolean')
  throw Error('Invalid batch configuration');
 const users=[...new Set(userIds)];
 if(!users.length)throw Error('Select at least one workspace member');
 if(scope==='module'){
  if(!Object.hasOwn(MODULE_ROLE_OPTIONS,resourceId)||
     !MODULE_ROLE_OPTIONS[resourceId].includes(role))throw Error('Unsupported application role');
 }else if(!data.boards.some(b=>b.id===resourceId)||!['viewer','editor'].includes(role))
  throw Error('Unsupported board role');
 const operations=[],unchanged=[];
 for(const userId of users){
  const user=data.users.find(u=>u.id===userId);
  if(!user||user.protected||user.id===actorUserId)
   throw Error('Batch contains a protected, self, or unavailable target');
  if(scope==='module'){
   if(!Number.isInteger(user.activeWorkspaceCount)||user.activeWorkspaceCount<1)
    throw Error('Unverified workspace membership for '+user.email);
   if(resourceId!=='material-request-hub'&&user.activeWorkspaceCount!==1)
    throw Error('Global application role is not workspace-isolated for '+user.email);
   if(resourceId==='material-request-hub'&&data.workspaceScopedMrhAvailable!==true)
    throw Error('Workspace-scoped Material Request Hub role management is unavailable');
  }
  const record=(scope==='module'?data.moduleAssignments:data.boardAssignments).find(a=>
   a.userId===userId&&(scope==='module'?a.moduleId:a.boardId)===resourceId);
  if(scope==='board'&&record?.role==='owner')
   throw Error('Protected board owner cannot be modified: '+user.email);
  if(scope==='module'&&resourceId==='toolbox-issues'&&enabled&&!record?.enabled)
   throw Error('Existing Toolbox Issues source membership required: '+user.email);
  const isActive=scope==='board'?Boolean(record):Boolean(record?.enabled);
  if(!enabled&&!isActive){unchanged.push(userId);continue;}
  if(enabled&&isActive&&record.role===role){unchanged.push(userId);continue;}
  operations.push(Object.freeze({userId,scope,resourceId,role:enabled?role:record.role,
   enabled,expectedUpdatedAt:record?.updatedAt||null}));
 }
 return Object.freeze({operations:Object.freeze(operations),unchanged:Object.freeze(unchanged),
  selectedCount:users.length});
}
