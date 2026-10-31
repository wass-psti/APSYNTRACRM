/** CI05: only on an ephemeral GitHub-hosted Supabase stack.
 * Signed session reconciliation for FRT domain RPCs + naturally expired GoTrue JWT.
 * Does not deploy or change the production FRT role resolver.
 */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeCI04} from './cp-frt-sec10-ci04.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';

const WORKSPACE='00000000-0000-4000-8000-000000000001';
const ok=(value,reason)=>{if(!value)throw Error(reason);};
export function requireCI05(env){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.SEC10_CI05!=='EPHEMERAL_ONLY')
  throw Error('CI05_NOT_ISOLATED');
 return true;
}
function query(db,sql){
 try{return execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-c',sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();}
 catch{throw Error('CI05_INDEPENDENT_DATABASE_CHECK_FAILED');}
}
function counts(db){
 return JSON.parse(query(db,String.raw`SELECT json_build_object(
 'requests',(SELECT count(*) FROM public.frt_requests),
 'financeAudits',(SELECT count(*) FROM public.frt_audit_logs),
 'vouchers',(SELECT count(*) FROM public.frt_voucher_counters),
 'liquidations',(SELECT count(*) FROM public.frt_liquidations),
 'roleOverrides',(SELECT count(*) FROM public.apsyntra_crm_platform_roles),
 'activeSessionGuardHidden',NOT has_function_privilege('authenticated',
  'private.frt_signed_session_active()','EXECUTE')
)::text`));
}
function apply(db,body){
 const dir=mkdtempSync(join(tmpdir(),'sec10-ci05-'));
 try{
  const path=join(dir,'candidate.sql');writeFileSync(path,body,{mode:0o600});
  execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',db,'-f',path],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});
 }catch{throw Error('CI05_SESSION_GUARD_INSTALL_FAILED');}
 finally{rmSync(dir,{recursive:true,force:true});}
}
async function withToken(config,fetcher,token,rpc,body){
 const response=await fetcher(config.url+'/rest/v1/rpc/'+rpc,{
  method:'POST',redirect:'error',cache:'no-store',headers:{
   apikey:config.publishableKey,Authorization:'Bearer '+token,
   'Content-Type':'application/json'},
  body:JSON.stringify(body)});
 return response.status;
}
async function expectAccessDenied(config,fetcher,token,rpc,body){
 const status=await withToken(config,fetcher,token,rpc,body);
 ok(status===401||status===403||status===400,'REVOKED_SESSION_ACCEPTED_'+rpc.toUpperCase()+'_'+status);
 return status;
}
async function ci05Core({config,db,fetcher,actorIds,requestId,
 oldAccessToken,oldJwtAcceptedByBasicRPC,oldJwtExpiresAt}){
 ok(typeof oldAccessToken==='string'&&oldAccessToken.split('.').length===3&&
  oldJwtAcceptedByBasicRPC===true,'CI04_REVOKED_BEARER_PRECONDITION_MISSING');
 ok(Number.isInteger(oldJwtExpiresAt)&&oldJwtExpiresAt*1000>Date.now(),
  'CI04_OLD_BEARER_ALREADY_EXPIRED');
 const source=readFileSync('sql/tests/cp-frt-sec10-ci05-session-guard-candidate.sql','utf8');
 ok(source.includes('CANDIDATE ONLY')&&
  source.includes('private.frt_signed_session_active()')&&
  source.includes('auth.sessions')&&source.includes('AND (SELECT private.frt_signed_session_active())'),
  'UNAPPROVED_SESSION_GUARD_SOURCE');
 apply(db,source);
 const initial=counts(db);
 ok(initial.activeSessionGuardHidden===true&&initial.roleOverrides===0,
  'SESSION_GUARD_VISIBILITY_OR_ROLE_BASELINE_FAILURE');

 // This JWT is still cryptographically accepted by PostgREST: revoke it
 // at the domain gate by checking whether its session still exists.
 const deniedPayload={company:'WAO',title:'Must not write after logout',
  department:'Finance',fundSource:'CI only',description:'No active session',
  dateNeeded:'2026-11-15',items:[{category:'CI',amount:1}]};
 await expectAccessDenied(config,fetcher,oldAccessToken,'frt_create_request',
  {p_workspace_id:WORKSPACE,p_payload:deniedPayload});
 for(const [rpc,body] of [
  ['frt_update_request',{p_workspace_id:WORKSPACE,p_request_id:requestId,
   p_payload:{title:'Forbidden after logout'}}],
  ['frt_request_action',{p_workspace_id:WORKSPACE,p_request_id:requestId,
   p_action:'archive',p_payload:{}}],
  ['frt_submit_liquidation',{p_workspace_id:WORKSPACE,p_request_id:requestId,
   p_payload:{items:[{description:'Denied',amount:1}]}}]
 ]){
  await expectAccessDenied(config,fetcher,oldAccessToken,rpc,body);
 }
 const deniedState=counts(db);
 ok(initial.requests===deniedState.requests&&initial.financeAudits===deniedState.financeAudits&&
  initial.vouchers===deniedState.vouchers&&initial.liquidations===deniedState.liquidations,
  'POST_LOGOUT_BEARER_MUTATED_FINANCIAL_DATA');

 // A newly signed, genuinely live session must retain original Finance Manager access.
 const member=new IsolatedSignedClient(config,fetcher);
 const other=new IsolatedSignedClient(config,fetcher);
 let verifiedExpiry=false,sessionStillPresent=false;
 try{
  const signed=await member.signIn(config.memberEmail,config.memberPassword);
  ok(signed.id===actorIds.member,'CI05_SIGNED_USER_CHANGED');
  ok(member.sessionProof.expiresAt-member.sessionProof.issuedAt>=55&&
    member.sessionProof.expiresAt-member.sessionProof.issuedAt<=130,
    'CI05_SHORT_LIVED_AUTH_TOKEN_NOT_CONFIGURED');
  const activeSessionCount=()=>Number(query(db,
   "SELECT count(*) FROM auth.sessions WHERE id='"+member.sessionProof.sessionId+"'::uuid"));
  ok(activeSessionCount()===1,'CI05_LIVE_SESSION_RECORD_MISSING');
  const postGuard=await member.rpc('frt_create_request',{p_workspace_id:WORKSPACE,
   p_payload:{company:'WAO',title:'CI05 Live Finance Record',
    department:'Finance',fundSource:'Operations',description:'Session-alive authorization',
    dateNeeded:'2026-11-15',items:[{category:'CI ledger',amount:17}]}});
  ok(postGuard?.status==='PENDING_APPROVAL'&&postGuard?.total_amount===17,
   'LIVE_SIGNED_FINANCE_TRANSACTION_FAILED');
  await other.signIn(config.outsiderEmail,config.outsiderPassword);
  let crossWorkspaceBlocked=false;
  try{await other.rpc('frt_create_request',{p_workspace_id:WORKSPACE,
    p_payload:deniedPayload});}
  catch(e){crossWorkspaceBlocked=e instanceof HttpStatusError&&e.status>=400&&e.status<500;}
  ok(crossWorkspaceBlocked,'CROSS_WORKSPACE_SESSION_BYPASS');

  // This JWT was actually issued by local GoTrue. Do not mint, edit, or forge a token.
  // Wait only until the independently signed exp claim has passed.
  const expireAt=member.sessionProof.expiresAt*1000+2500;
  const delay=expireAt-Date.now();
  ok(delay>=0&&delay<=140000,'JWT_EXPIRY_WAIT_OUT_OF_BOUNDS');
  if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
  ok(Date.now()>=expireAt-100,'LOCAL_TOKEN_EXPIRY_NOT_REACHED');
  sessionStillPresent=activeSessionCount()===1;
  ok(sessionStillPresent,'TOKEN_SESSION_REMOVED_BEFORE_NATURAL_EXPIRY');
  const expiredStatus=await withToken(config,fetcher,member.accessToken,
   'frt_create_request',{p_workspace_id:WORKSPACE,p_payload:deniedPayload});
  ok(expiredStatus===401||expiredStatus===403,'NATURALLY_EXPIRED_GOTRUE_JWT_STILL_AUTHORIZED');
  verifiedExpiry=true;
 }finally{
  await Promise.allSettled([member.endSession(),other.endSession()]);
 }
 const final=counts(db);
 ok(final.requests===initial.requests+1&&final.financeAudits===initial.financeAudits+1&&
  final.vouchers===initial.vouchers&&final.roleOverrides===0&&
  final.activeSessionGuardHidden===true,
  'CI05_FINANCE_AUDIT_OR_GRANT_INTEGRITY_FAILURE');
 return {checkpoint:'CP-FRT-SEC10-CI05',status:'PASS',
  nativeAuthSessionGuard:true,revokedOldJwtDeniedByFinanceRPCs:4,
  sameSignedJwtPreGuardAdmitted:true,newSignedFinanceRequestAllowed:true,
  crossWorkspaceSignedDenial:true,realExpiredGoTrueJwtRejected:verifiedExpiry,
  expiredTokenSessionRowStillPresent:sessionStillPresent,
  productionDeployed:false,productionTouched:false};
}
export async function executeCI05(source,env=process.env,fetcher=globalThis.fetch){
 requireCI05(env);
 let result;
 const prior=await executeCI04(source,{...env,SEC10_CI04:'EPHEMERAL_ONLY'},
  fetcher,async ctx=>{result=await ci05Core(ctx);});
 ok(prior.status==='PASS'&&result?.status==='PASS','CI04_OR_CI05_PREREQUISITE_FAILED');
 return {...result,ci04Prerequisite:'PASS'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const i=process.argv.indexOf('--env-file');
  ok(i>=0&&process.argv[i+1],'CI05_LOCAL_STATUS_REQUIRED');
  const result=await executeCI05(readFileSync(process.argv[i+1],'utf8'));
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  const reason=e?.message&&/^[A-Z0-9_]{3,100}$/.test(e.message)?
   e.message:'CI05_INTEGRATION_FAILED';
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-SEC10-CI05',
   status:'FAILED',reason,productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
