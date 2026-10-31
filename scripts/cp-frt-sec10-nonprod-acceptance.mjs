import {liveConfig,requireUuid,sanitizedResult} from './cp-frt-sec10-live-guards.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';
import {pathToFileURL} from 'node:url';

const expected={
 VIEWER:{view:true,edit:false,manage:false,frt:false,explicit:'viewer',effective:'viewer'},
 SUPERVISOR:{view:true,edit:true,manage:false,frt:true,explicit:'supervisor',effective:'supervisor'}
};
function insist(ok,reason){if(!ok)throw Error(reason);}
function roleRow(snapshot,userId,workspaceId){
 insist(snapshot?.bootstrapVerified===true&&snapshot.workspaceId===workspaceId&&
  Array.isArray(snapshot.roles),'INVALID_ADMIN_ROLE_SNAPSHOT');
 const rows=snapshot.roles.filter(r=>r.userId===userId);
 insist(rows.length===1,'TARGET_NOT_IN_AUTHORIZED_WORKSPACE');
 return rows[0];
}
async function setRole(admin,config,target,role,revision){
 const ack=await admin.rpc('apsyntra_crm_platform_role_set',{
  p_workspace_id:config.workspaceId,p_target_user_id:target,
  p_role:role,p_expected_updated_at:revision});
 insist(ack?.scope==='crm-platform'&&ack?.effective===true&&
  ack.workspaceId===config.workspaceId&&ack.targetUserId===target&&
  requireUuid(ack.changeId,'CHANGE')&&
  (role===null?ack.after===null:typeof ack.currentRevision==='string'),
  'INVALID_ROLE_CHANGE_ACK');
 return ack;
}
async function signedPhase(config,fetcher,target,phase,seenSessions,steps){
 const client=new IsolatedSignedClient(config,fetcher);
 try{
  const session=await client.signIn(config.memberEmail,config.memberPassword);
  insist(session.id===target,'SIGNED_TARGET_CHANGED');
  insist(!seenSessions.has(session.sessionId),'NOT_A_DISTINCT_GOTRUE_SESSION');
  seenSessions.add(session.sessionId);
  await client.context();
  const self=await client.self();
  const board=self.boards.find(b=>b.id===config.boardId);
  insist(self.bootstrap===false&&board&&board.view===true,
    'SIGNED_BOARD_PREREQUISITE_MISSING');
  const e=expected[phase]||{view:true,edit:true,manage:true,frt:true,
    explicit:null,effective:'RESTORED'};
  insist(self.explicitPlatformRole===e.explicit,'EXPLICIT_STAGE_NOT_CONFIRMED');
  if(phase!=='RESTORED')insist(self.effectivePlatformRole===e.effective,'EFFECTIVE_STAGE_NOT_CONFIRMED');
  const results=await Promise.all(['view','edit','manage'].map(p=>client.boardAllowed(p)));
  const frt=await client.frtAllowed();
  insist(results[0]===e.view&&results[1]===e.edit&&
   results[2]===e.manage&&frt===e.frt,'AUTHORITATIVE_PERMISSIONS_MISMATCH');
  const m=self.modules.find(x=>x.moduleId==='fund-released-tracker');
  insist(m?.allowed===e.frt,'SELF_FRT_CAPABILITY_MISMATCH');
  if(phase==='RESTORED')insist(board.memberRole==='owner'&&frt,
    'ORIGINAL_OWNER_OR_FRT_NOT_RESTORED');
  let denied=false;
  try{await client.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:config.workspaceId});}
  catch(err){denied=err instanceof HttpStatusError&&err.status===403;}
  insist(denied,'NONBOOTSTRAP_ADMIN_SNAPSHOT_NOT_DENIED');
  const ctx=await client.context();
  insist(ctx.user_id===target,'SIGNED_CONTEXT_CHANGED');
  steps.push({name:phase.toLowerCase()+'-real-signed-access',status:'PASS'});
 }finally{await client.endSession();}
}
/** Only an explicitly designated nonproduction project may mutate roles.
 * Outcomes are never final acceptance until independently correlated DB audit.
 */
export async function runIsolatedSEC10(env,fetcher=globalThis.fetch){
 const result={status:'BLOCKED',reason:'NOT_EXECUTED',steps:[],
  transitionCount:0,mutationAttempts:0,verifiedSessionCount:0};
 let config;
 try{config=liveConfig(env);}
 catch{result.reason='NONPRODUCTION_CONFIG_NOT_VERIFIED';return result;}
 const admin=new IsolatedSignedClient(config,fetcher);
 const member=new IsolatedSignedClient(config,fetcher);
 let target=null,latestRevision=null,activeRole=null,initialRole=null,mutated=false,pendingReceipt=false;
 try{
  const adminAuth=await admin.signIn(config.bootstrapEmail,config.bootstrapPassword);
  await admin.context();
  insist(await admin.rpc('apsyntra_role_is_bootstrap',{})===true,'BOOTSTRAP_NOT_VERIFIED');
  const signed=await member.signIn(config.memberEmail,config.memberPassword);
  target=signed.id;
  insist(target!==adminAuth.id,'PROTECTED_ADMIN_TARGET');
  await member.context();
  const initial=await member.self();
  insist(initial.bootstrap===false&&initial.platformRole!=='admin_general_manager'&&
   initial.explicitPlatformRole===null,'EXISTING_OVERRIDE_OR_BOOTSTRAP_TARGET');
  const board=initial.boards.find(b=>b.id===config.boardId);
  const frtGrant=initial.modules.find(m=>m.moduleId==='fund-released-tracker');
  insist(board?.memberRole==='owner'&&board.manage===true&&
   frtGrant?.allowed===true&&typeof frtGrant?.role==='string'&&frtGrant.role.length>0,
   'ORIGINAL_BOARD_OWNER_AND_FRT_GRANT_REQUIRED');
  const before=roleRow(await admin.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:config.workspaceId}),target,config.workspaceId);
  insist(before.assignedRole===null,'INITIAL_OVERRIDE_NOT_NULL');
  initialRole=before.effectiveRole;
  insist(['employee','supervisor','viewer'].includes(initialRole),'UNSAFE_ORIGINAL_ROLE');
  result.steps.push({name:'existing-owner-and-frt-prerequisites',status:'PASS'});
  const seen=new Set([signed.sessionId]);
  await member.endSession();
  result.mutationAttempts++;pendingReceipt=true;
  const viewer=await setRole(admin,config,target,'viewer',null);
  pendingReceipt=false;mutated=true;activeRole='viewer';latestRevision=viewer.currentRevision;result.transitionCount++;
  await signedPhase(config,fetcher,target,'VIEWER',seen,result.steps);
  result.verifiedSessionCount++;
  let rejected=false;
  result.mutationAttempts++;pendingReceipt=true;
  try{await setRole(admin,config,target,'supervisor','2000-01-01T00:00:00.000Z');}
  catch(e){rejected=e instanceof HttpStatusError&&e.status===409;}
  if(rejected)pendingReceipt=false;
  insist(rejected,'STALE_REVISION_NOT_REJECTED');
  const afterStale=roleRow(await admin.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:config.workspaceId}),target,config.workspaceId);
  insist(afterStale.assignedRole==='viewer'&&afterStale.updatedAt===latestRevision,
   'STALE_REVISION_CHANGED_ROLE');
  result.steps.push({name:'stale-cas-rejected-without-role-change',status:'PASS'});
  result.mutationAttempts++;pendingReceipt=true;
  const supervisor=await setRole(admin,config,target,'supervisor',latestRevision);
  pendingReceipt=false;activeRole='supervisor';latestRevision=supervisor.currentRevision;result.transitionCount++;
  await signedPhase(config,fetcher,target,'SUPERVISOR',seen,result.steps);
  result.verifiedSessionCount++;
  result.mutationAttempts++;pendingReceipt=true;
  const revoked=await setRole(admin,config,target,null,latestRevision);
  pendingReceipt=false;activeRole=null;latestRevision=null;result.transitionCount++;
  insist(revoked.effectiveRole===initialRole,'INHERITED_ROLE_NOT_RESTORED');
  await signedPhase(config,fetcher,target,'RESTORED',seen,result.steps);
  result.verifiedSessionCount++;
  const after=roleRow(await admin.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:config.workspaceId}),target,config.workspaceId);
  insist(after.assignedRole===null&&after.effectiveRole===initialRole,
   'FINAL_ROLE_BASELINE_MISMATCH');
  result.status='CAPABILITY_PASS_AUDIT_PENDING';result.reason=null;
 }catch(e){
  result.reason=e?.message&&/^[A-Z0-9_]{3,80}$/.test(e.message)?
   e.message:'ISOLATED_ACCEPTANCE_INCOMPLETE';
 }finally{
  // Only revoke our own last acknowledged override. Never overwrite a concurrent
  // external mutation or delete an unknown role revision on network uncertainty.
  if(pendingReceipt){
   result.status='BLOCKED';result.reason='MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED';
  }else if(mutated&&activeRole!==null&&target&&latestRevision){
   try{
    const row=roleRow(await admin.rpc('apsyntra_crm_platform_role_snapshot',{
     p_workspace_id:config.workspaceId}),target,config.workspaceId);
    if(row.assignedRole!==activeRole||row.updatedAt!==latestRevision)
     throw Error('UNSAFE_CONCURRENT_ROLE_CHANGE');
    result.mutationAttempts++;
    await setRole(admin,config,target,null,latestRevision);
    result.transitionCount++;
    result.steps.push({name:'failure-path-override-revoked',status:'PASS'});
   }catch{
    result.status='BLOCKED';result.reason='MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED';
   }
  }
  await Promise.allSettled([member.endSession(),admin.endSession()]);
 }
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=await runIsolatedSEC10(process.env);
 process.stdout.write(sanitizedResult(r)+'\n');
 if(r.status!=='CAPABILITY_PASS_AUDIT_PENDING')process.exitCode=1;
}
