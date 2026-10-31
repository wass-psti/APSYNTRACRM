/** CI04: real local GoTrue session lifecycle and comprehensive FRT RLS checks.
 * All mutations are restricted to the disposable GitHub-hosted native stack.
 */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {executeCI03} from './cp-frt-sec10-ci03.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';
import {jwtSessionId} from './cp-frt-sec10-live-guards.mjs';

const w='00000000-0000-4000-8000-000000000001';
const tables=['frt_attachments','frt_audit_logs','frt_comments','frt_companies',
 'frt_liquidation_items','frt_liquidations','frt_memberships','frt_request_items',
 'frt_requests','frt_voucher_counters'];
const check=(yes,code)=>{if(!yes)throw Error(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
export function requireCI04(env){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.SEC10_CI04!=='EPHEMERAL_ONLY')
  throw Error('CI04_NOT_EPHEMERAL');
 return true;
}
function sql(db,query){
 return execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-c',query],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();
}
function apply(db,body){
 const dir=mkdtempSync(join(tmpdir(),'sec10-ci04-'));
 try{
  const file=join(dir,'fixture.sql');writeFileSync(file,body,{mode:0o600});
  execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',db,'-f',file],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function snapshot(db){
 const quoted=tables.map(t=>"'"+t+"'").join(',');
 const q=`SELECT json_build_object(
  'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${quoted}) AND c.relkind='r' AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN (${quoted}) AND cmd='SELECT'),
  'reads',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${quoted})
    AND has_table_privilege('authenticated',c.oid,'SELECT')),
  'writes',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (${quoted}) AND
    (has_table_privilege('authenticated',c.oid,'INSERT') OR
     has_table_privilege('authenticated',c.oid,'UPDATE') OR
     has_table_privilege('authenticated',c.oid,'DELETE'))),
  'financeAudits',(SELECT count(*) FROM public.frt_audit_logs),
  'requests',(SELECT count(*) FROM public.frt_requests),
  'overrides',(SELECT count(*) FROM public.apsyntra_crm_platform_roles),
  'roleAudits',(SELECT count(*) FROM public.apsyntra_role_change_audit))::text`;
 return JSON.parse(sql(db,q));
}
function grant(db,allow){
 apply(db,tables.map(t=>allow?
  'GRANT SELECT ON TABLE public.'+t+' TO authenticated;':
  'REVOKE SELECT ON TABLE public.'+t+' FROM authenticated;').join('\n')+
  "\nNOTIFY pgrst,'reload schema';");
}
async function counts(client){
 const result={};
 for(const table of tables){
  const response=await client.call('/rest/v1/'+table+'?select=*',
   {method:'GET',authorized:true});
  check(Array.isArray(response),'RLS_READ_RESPONSE_INVALID');
  result[table]=response.length;
 }
 return result;
}
async function raw(url,key,fetcher,path,opts={}){
 const response=await fetcher(url+path,{method:opts.method||'POST',
  redirect:'error',cache:'no-store',
  headers:{apikey:key,'Content-Type':'application/json',
   ...(opts.token?{Authorization:'Bearer '+opts.token}:{})},
  ...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)})});
 const result={status:response.status};
 if(response.ok&&response.status!==204)result.data=await response.json();
 return result;
}
async function inspect({config:c,db,fetcher,actorIds,requestId,financeBaseline}){
 check(uuid.test(requestId),'CI04_REQUEST_ID_INVALID');
 check(uuid.test(actorIds.member),'CI04_MEMBER_ID_INVALID');
 check(uuid.test(actorIds.bootstrap),'CI04_BOOTSTRAP_ID_INVALID');
 const fixture=readFileSync('sql/tests/cp-frt-sec10-ci04-remaining-rls.sql','utf8');
 check(fixture.includes('DISPOSABLE CI ONLY')&&fixture.includes('frt_membership_self_or_gm_select'),
  'RLS_FIXTURE_UNEXPECTED');
 apply(db,fixture);
 const initial=snapshot(db);
 check(initial.tables===10&&initial.policies===10&&initial.reads===0&&
  initial.writes===0&&initial.financeAudits===financeBaseline.audits&&
  initial.overrides===0,'RLS_BASELINE_NOT_PRODUCTION_EQUIVALENT');
 sql(db,`INSERT INTO public.frt_attachments
 (workspace_id,fund_request_id,uploaded_by,object_path,file_name,mime_type,file_size)
 VALUES ('${w}','${requestId}','${actorIds.member}',
 'ci04-only/placeholder','placeholder.pdf','application/pdf',8)`);
 sql(db,`INSERT INTO public.frt_comments
 (workspace_id,fund_request_id,user_id,body)
 VALUES ('${w}','${requestId}','${actorIds.member}','CI04-only comment')`);
 sql(db,`INSERT INTO public.frt_memberships(workspace_id,user_id,role)
 VALUES ('${w}','${actorIds.member}','FINANCE_MANAGER'),
 ('${w}','${actorIds.bootstrap}','GENERAL_MANAGER')`);
 const admin=new IsolatedSignedClient(c,fetcher),member=new IsolatedSignedClient(c,fetcher),
  outsider=new IsolatedSignedClient(c,fetcher);
 let restored=false;
 try{
  await admin.signIn(c.bootstrapEmail,c.bootstrapPassword);
  await member.signIn(c.memberEmail,c.memberPassword);
  await outsider.signIn(c.outsiderEmail,c.outsiderPassword);
  check(member.identity===actorIds.member&&admin.identity===actorIds.bootstrap,
   'SIGNED_IDENTITY_INVALID');
  grant(db,true); // transient diagnostic SELECT rights only, CI-only.
  const own=await counts(member);
  const foreign=await counts(outsider);
  check(tables.every(t=>own[t]>0&&foreign[t]===0),'WORKSPACE_RLS_READ_FAILURE');
  check(own.frt_memberships===1,'FRT_MEMBER_SELF_ONLY_POLICY_FAILURE');
  const gm=await counts(admin);
  check(gm.frt_memberships===2,'FRT_GM_ROSTER_POLICY_FAILURE');
  const session=member.sessionProof.sessionId;
  const beforeCap=snapshot(db);
  const assigned=await admin.rpc('apsyntra_crm_platform_role_set',{
   p_workspace_id:w,p_target_user_id:member.identity,
   p_role:'viewer',p_expected_updated_at:null});
  check(typeof assigned?.currentRevision==='string','ROLE_CAS_RECEIPT_MISSING');
  try{
   check(member.sessionProof.sessionId===session,'SESSION_ROTATED_UNEXPECTEDLY');
   const denied=await counts(member);
   check(tables.every(t=>denied[t]===0),'SAME_JWT_CRM_VIEWER_RLS_BYPASS');
   check(await member.frtAllowed()===false,'SAME_JWT_FRT_ROLE_BYPASS');
   let blocked=false;
   try{await member.rpc('frt_create_request',{p_workspace_id:w,p_payload:{
    company:'WAO',title:'CI04 forbidden expense',department:'Finance',
    fundSource:'CI only',description:'Must be denied by CRM Viewer',
    dateNeeded:'2026-11-15',items:[{category:'CI',amount:1}]}});}
   catch(e){blocked=e instanceof HttpStatusError&&e.status>=400&&e.status<500;}
   check(blocked,'CAPPED_FINANCE_WRITE_NOT_DENIED');
   const afterCap=snapshot(db);
   check(afterCap.requests===beforeCap.requests&&afterCap.financeAudits===beforeCap.financeAudits,
    'DENIED_FINANCE_OPERATION_MUTATED_DATA');
  }finally{
   const revoked=await admin.rpc('apsyntra_crm_platform_role_set',{
    p_workspace_id:w,p_target_user_id:member.identity,p_role:null,
    p_expected_updated_at:assigned.currentRevision});
   check(revoked?.effectiveRole==='employee','ORIGINAL_PLATFORM_ROLE_NOT_RESTORED');
   restored=true;
  }
  const restoredRows=await counts(member);
  check(tables.every(t=>restoredRows[t]>0),'SAME_JWT_RESTORED_ACCESS_MISSING');
 }finally{
  try{grant(db,false);}finally{
   await Promise.allSettled([admin.endSession(),member.endSession(),outsider.endSession()]);
  }
 }
 const beforeLogout=snapshot(db);
 check(restored&&beforeLogout.reads===0&&beforeLogout.writes===0&&
  beforeLogout.overrides===0&&beforeLogout.roleAudits===initial.roleAudits+2,
  'RLS_GRANT_OR_ROLE_CLEANUP_FAILED');
 const login=await raw(c.url,c.publishableKey,fetcher,
  '/auth/v1/token?grant_type=password',{body:{email:c.memberEmail,password:c.memberPassword}});
 check(login.status===200&&typeof login.data?.access_token==='string'&&
  typeof login.data?.refresh_token==='string','AUTH_SESSION_SIGNIN_FAILED');
 const token=login.data.access_token,refresh=login.data.refresh_token;
 const proof=jwtSessionId(token);
 const countSession=()=>Number(sql(db,`SELECT count(*) FROM auth.sessions
 WHERE id='${proof.sessionId}'::uuid`));
 check(countSession()===1,'AUTH_SESSION_NOT_STORED');
 const logout=await raw(c.url,c.publishableKey,fetcher,'/auth/v1/logout?scope=local',{token});
 check(logout.status>=200&&logout.status<300,'AUTH_LOGOUT_REJECTED');
 const rejected=await raw(c.url,c.publishableKey,fetcher,
  '/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:refresh}});
 check(rejected.status>=400&&rejected.status<500,'REFRESH_TOKEN_STILL_VALID_AFTER_LOGOUT');
 check(countSession()===0,'SIGNED_OUT_SESSION_STILL_PERSISTED');
 const oldJwt=await raw(c.url,c.publishableKey,fetcher,
  '/rest/v1/rpc/has_module_access',{token,body:{
   p_module_id:'fund-released-tracker',p_user_id:actorIds.member}});
 const jwtStillValid=oldJwt.status>=200&&oldJwt.status<300;
 const tampered=await raw(c.url,c.publishableKey,fetcher,
  '/rest/v1/rpc/has_module_access',{token:'invalid.jwt.value',body:{
   p_module_id:'fund-released-tracker',p_user_id:actorIds.member}});
 check(tampered.status===401||tampered.status===403,'INVALID_JWT_NOT_REJECTED');
 const final=snapshot(db);
 check(final.overrides===0&&final.requests===beforeLogout.requests&&
  final.financeAudits===beforeLogout.financeAudits&&final.reads===0&&final.writes===0,
  'POST_LOGOUT_FINANCE_DATA_INTEGRITY_FAILED');
 return {checkpoint:'CP-FRT-SEC10-CI04',status:'PASS',
  rlsTablesVerified:10,rlsReadPoliciesVerified:10,
  outsiderReadPoliciesDenied:10,memberSelfOnly:true,
  sameJwtRoleChangeEnforced:true,sameJwtRoleRestored:true,
  refreshTokenRevoked:true,authSessionRemoved:true,invalidJwtRejected:true,
  expiredAuthJwtTested:false,oldAccessJwtAcceptedAfterLogout:jwtStillValid,
  immediateAccessJwtRevocationVerified:!jwtStillValid,
  temporarySelectGrantsRevoked:true,productionTouched:false};
}
export async function executeCI04(source,env=process.env,fetcher=globalThis.fetch){
 requireCI04(env);
 let outcome;
 const prior=await executeCI03(source,{...env,SEC10_CI03:'EPHEMERAL_ONLY'},
  fetcher,async ctx=>{outcome=await inspect(ctx);});
 check(prior.status==='PASS'&&outcome?.status==='PASS','CI04_PREREQUISITE_FAILED');
 return {...outcome,ci03Prerequisite:'PASS'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const n=process.argv.indexOf('--env-file');
  check(n>=0&&process.argv[n+1],'CI04_STATUS_FILE_REQUIRED');
  const output=await executeCI04(readFileSync(process.argv[n+1],'utf8'));
  process.stdout.write(JSON.stringify(output)+'\n');
 }catch(e){
  const reason=e?.message&&/^[A-Z0-9_]{3,100}$/.test(e.message)?
   e.message:'CI04_INTEGRATION_FAILED';
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-SEC10-CI04',
   status:'FAILED',reason,productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
