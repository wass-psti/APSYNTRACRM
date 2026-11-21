/** Batch role planning. Pure, non-mutating and based solely on an authorized snapshot.
 * The backend remains the final authorization authority for each individual write.
 */
import {MODULE_ROLE_OPTIONS,FUELTRANS_WORKSPACE_ROLES,SCOPED_SIX_MODULE_IDS} from './user-role-management.js';

export function planUserRoleBatch(data,{userIds=[],actorUserId=null,scope,resourceId,role,enabled=true}={}){
 if(!data||!Array.isArray(data.users)||!Array.isArray(data.boards)||
    !Array.isArray(data.moduleAssignments)||!Array.isArray(data.boardAssignments)||
    !Array.isArray(userIds)||!['module','board'].includes(scope)||typeof enabled!=='boolean')
  throw Error('Invalid batch configuration');
 const users=[...new Set(userIds)];
 if(!users.length)throw Error('Select at least one workspace member');
 if(scope==='module'){
  const valid=resourceId==='fueltrans'?
    data.fueltransWorkspaceAvailable===true&&FUELTRANS_WORKSPACE_ROLES.includes(role):
    Object.hasOwn(MODULE_ROLE_OPTIONS,resourceId)&&MODULE_ROLE_OPTIONS[resourceId].includes(role);
  if(!valid)throw Error('Unsupported application role');
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
   if(resourceId==='charter-navigator'&&data.charterWorkspaceAvailable!==true)
    throw Error('Workspace-scoped Charter role management is unavailable');
   if(SCOPED_SIX_MODULE_IDS.includes(resourceId)&&
     data.scopedSixAvailable!==true&&user.activeWorkspaceCount!==1)
    throw Error('Workspace-scoped application role management is unavailable');
   const isWorkspaceScoped=['material-request-hub','fueltrans','toolbox-issues',
     'tool-traceability','fund-released-tracker'].includes(resourceId)||
     (resourceId==='charter-navigator'&&data.charterWorkspaceAvailable===true)||
     (SCOPED_SIX_MODULE_IDS.includes(resourceId)&&data.scopedSixAvailable===true);
   if(!isWorkspaceScoped&&user.activeWorkspaceCount!==1)
    throw Error('Global application role is not workspace-isolated for '+user.email);
   if(resourceId==='fund-released-tracker'&&data.frtWorkspaceAvailable!==true)
    throw Error('Workspace-scoped Fund Tracker role management is unavailable');
   if(resourceId==='tool-traceability'&&data.toolTraceabilityWorkspaceAvailable!==true)
    throw Error('Workspace-scoped Tool Traceability role management is unavailable');
   if(resourceId==='material-request-hub'&&data.workspaceScopedMrhAvailable!==true)
    throw Error('Workspace-scoped Material Request Hub role management is unavailable');
   if(resourceId==='fueltrans'&&(data.fueltransWorkspaceAvailable!==true||
       data.moduleAssignments.some(a=>a.moduleId==='fueltrans'&&a.userId===userId&&a.clientManaged)))
    throw Error('FuelTrans workspace membership contract unavailable or client-managed');
  }
  const record=(scope==='module'?data.moduleAssignments:data.boardAssignments).find(a=>
   a.userId===userId&&(scope==='module'?a.moduleId:a.boardId)===resourceId);
  if(scope==='board'&&record?.role==='owner')
   throw Error('Protected board owner cannot be modified: '+user.email);
  const isActive=scope==='board'?Boolean(record):Boolean(record?.enabled);
  if(!enabled&&!isActive){unchanged.push(userId);continue;}
  if(enabled&&isActive&&record.role===role){unchanged.push(userId);continue;}
  operations.push(Object.freeze({userId,scope,resourceId,role:enabled?role:record.role,
   enabled,expectedUpdatedAt:record?.updatedAt||null}));
 }
 return Object.freeze({operations:Object.freeze(operations),unchanged:Object.freeze(unchanged),
  selectedCount:users.length});
}

/**
 * Plan a matrix of native application assignments for multiple members.
 * Each user/application pair is planned independently so one unavailable
 * legacy scope does not prevent other valid application changes from running.
 */
export function planNativeApplicationBatch(data,{
 userIds=[],actorUserId=null,applications=[],enabled=true
}={}){
 if(!data||!Array.isArray(data.users)||!Array.isArray(data.boards)||
  !Array.isArray(data.moduleAssignments)||!Array.isArray(data.boardAssignments)||
  !Array.isArray(userIds)||!Array.isArray(applications)||typeof enabled!=='boolean')
  throw Error('Invalid native application batch configuration');
 const targets=[...new Set(userIds)];
 if(!targets.length)throw Error('Select at least one workspace member');
 if(!applications.length)throw Error('Select at least one native application');
 const seen=new Set();
 for(const application of applications){
  const moduleId=application?.moduleId,role=application?.role;
  if(!Object.hasOwn(MODULE_ROLE_OPTIONS,moduleId)||seen.has(moduleId))
   throw Error('Select each supported native application only once');
  seen.add(moduleId);
  const roles=moduleId==='fueltrans'?
   (data.fueltransWorkspaceAvailable===true?FUELTRANS_WORKSPACE_ROLES:[]):
   MODULE_ROLE_OPTIONS[moduleId];
  if(!roles.includes(role))throw Error('Select a supported role for '+moduleId);
 }
 const operations=[],unchanged=[],skipped=[];
 for(const application of applications){
  for(const userId of targets){
   try{
    const result=planUserRoleBatch(data,{
     userIds:[userId],actorUserId,scope:'module',resourceId:application.moduleId,
     role:application.role,enabled
    });
    operations.push(...result.operations);
    unchanged.push(...result.unchanged.map(id=>({userId:id,moduleId:application.moduleId})));
   }catch(error){
    const user=data.users.find(item=>item.id===userId);
    skipped.push({userId,moduleId:application.moduleId,
     reason:String(error?.message||'Application assignment is unavailable').slice(0,240),
     email:user?.email||''});
   }
  }
 }
 return Object.freeze({
  operations:Object.freeze(operations),
  unchanged:Object.freeze(unchanged),
  skipped:Object.freeze(skipped),
  selectedCount:targets.length,
  applicationCount:applications.length
 });
}

/** Post-write receipt reconciliation; checks only authoritative snapshot records.
 * It does not infer effective permissions from a successful RPC acknowledgement.
 */
export function unverifiedBatchRoleAssignments(snapshot,operations){
 if(!snapshot||!Array.isArray(snapshot.moduleAssignments)||
   !Array.isArray(snapshot.boardAssignments)||!Array.isArray(operations))
  throw Error('Authoritative role readback unavailable');
 return operations.filter(op=>{
  const assignment=(op.scope==='module'?snapshot.moduleAssignments:snapshot.boardAssignments)
   .find(row=>row.userId===op.userId&&
     (op.scope==='module'?row.moduleId:row.boardId)===op.resourceId);
  return op.enabled?
   (!assignment||assignment.role!==op.role||
    (op.scope==='module'&&assignment.enabled!==true)):
   (op.scope==='board'?Boolean(assignment):Boolean(assignment?.enabled));
 }).map(op=>op.userId);
}
