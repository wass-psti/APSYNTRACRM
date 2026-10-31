import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {localStackConfig} from './cp-frt-sec10-ci-auth-smoke.mjs';
import {runIsolatedSEC10} from './cp-frt-sec10-nonprod-acceptance.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';

const ids={admin:'00000000-0000-4000-8000-00000000000a',
 member:'00000000-0000-4000-8000-00000000000b',
 outsider:'00000000-0000-4000-8000-00000000000c'};
const workspace='00000000-0000-4000-8000-000000000001';
const board='00000000-0000-4000-8000-00000000000d';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const insist=(value,reason)=>{if(!value)throw Error(reason);};
export function dbUrlFromStatus(source,env){
 localStackConfig(source,env);
 const match=source.match(/^DB_URL=(?:"([^"]+)"|'([^']+)'|([^\s]+))$/m);
 if(!match)throw Error('LOCAL_DB_URL_REQUIRED');
 let url;
 try{url=new URL(match[1]||match[2]||match[3]);}
 catch{throw Error('INVALID_LOCAL_DB_URL');}
 if(!['postgresql:','postgres:'].includes(url.protocol)||
   !['127.0.0.1','localhost'].includes(url.hostname)||!url.port||
   url.pathname!=='/postgres'||url.search||url.hash||!url.username||!url.password)
  throw Error('NONLOOPBACK_DB_REJECTED');
 return url.href;
}
export function adaptDisposableFixture(source,accounts){
 for(const label of Object.keys(ids))
  insist(uuid.test(accounts[label]),'INVALID_EPHEMERAL_USER');
 const marker='CREATE TABLE public.workspaces(id uuid PRIMARY KEY);';
 const idx=source.indexOf(marker);
 insist(idx>0&&source.startsWith('-- Disposable PostgreSQL 17 fixture ONLY'),
  'FIXTURE_SOURCE_UNEXPECTED');
 let adapted='CREATE SCHEMA IF NOT EXISTS private;\n'+source.slice(idx);
 const insert=/INSERT INTO auth\.users\(id\) VALUES\n[\s\S]*?;\n/;
 insist(insert.test(adapted),'FIXTURE_USER_INSERT_UNEXPECTED');
 adapted=adapted.replace(insert,'');
 for(const label of Object.keys(ids)){
  insist(adapted.includes(ids[label]),'FIXTURE_ID_NOT_PRESENT');
  adapted=adapted.replaceAll(ids[label],accounts[label]);
 }
 insist(!adapted.includes('CREATE SCHEMA auth')&&
  !adapted.includes('CREATE ROLE authenticated')&&
  !adapted.includes('INSERT INTO auth.users'),'NATIVE_AUTH_SCHEMA_GUARD');
 return adapted;
}
const helpers=`
ALTER TABLE public.work_boards ADD COLUMN name text NOT NULL DEFAULT 'SEC10 Board',
 ADD COLUMN status text NOT NULL DEFAULT 'active';
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
 JOIN public.profiles p ON p.id=b.user_id WHERE b.user_id=auth.uid()
 AND p.status='active' AND p.platform_role='admin_general_manager'); $$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_bootstrap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_bootstrap() TO authenticated;
CREATE OR REPLACE FUNCTION public.wm_auth_access_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE a uuid:=auth.uid(); w uuid; host text; active_status text;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Signed identity required' USING ERRCODE='42501'; END IF;
 SELECT status,platform_role INTO active_status,host FROM public.profiles WHERE id=a;
 w:=public.current_workspace_id(a);
 IF w IS NULL OR active_status IS DISTINCT FROM 'active'
 THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('user_id',a,'workspace_id',w,
   'profile',jsonb_build_object('status',active_status,'platform_role',host));
END;$fn$;
REVOKE ALL ON FUNCTION public.wm_auth_access_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_auth_access_context() TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
NOTIFY pgrst,'reload schema';
`;
function psql(db,args){
 return execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,...args],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();
}
const auditSQL=`
SELECT json_build_object(
 'audits',(SELECT count(*) FROM public.apsyntra_role_change_audit),
 'requests',(SELECT count(*) FROM public.apsyntra_role_change_requests),
 'linked',(SELECT count(*) FROM public.apsyntra_role_change_audit a
  JOIN public.apsyntra_role_change_requests r ON r.id=a.change_id
  WHERE a.event='applied' AND r.status='applied' AND a.actor_id=r.proposed_by
    AND a.workspace_id=r.workspace_id AND r.payload->>'scope'='crm-platform'),
 'overrideCount',(SELECT count(*) FROM public.apsyntra_crm_platform_roles),
 'moduleCount',(SELECT count(*) FROM public.module_role_assignments),
 'boardCount',(SELECT count(*) FROM public.work_board_members),
 'bootstrapCount',(SELECT count(*) FROM public.apsyntra_role_bootstrap_identities),
 'userCount',(SELECT count(*) FROM public.profiles),
 'viewerEvent',(SELECT count(*) FROM public.apsyntra_role_change_audit WHERE detail#>>'{after,role}'='viewer'),
 'supervisorEvent',(SELECT count(*) FROM public.apsyntra_role_change_audit WHERE detail#>>'{after,role}'='supervisor'),
 'revokeEvent',(SELECT count(*) FROM public.apsyntra_role_change_audit
  WHERE detail->>'scope'='crm-platform' AND detail->'after'='null'::jsonb))::text;
`;
function audited(db){return JSON.parse(psql(db,['-c',auditSQL]));}
async function addUser(local,label,pw,nonce,fetcher){
 const email='sec10-ci02-'+label+'-'+nonce+'@example.invalid';
 const response=await fetcher(local.api+'/auth/v1/admin/users',{
  method:'POST',cache:'no-store',redirect:'error',
  headers:{apikey:local.serviceKey,Authorization:'Bearer '+local.serviceKey,
   'Content-Type':'application/json'},
  body:JSON.stringify({email,password:pw,email_confirm:true})});
 if(!response.ok)throw Error('CI_AUTH_USER_SETUP_FAILED');
 const record=await response.json();
 insist(uuid.test(record?.id),'CI_AUTH_USER_INVALID');
 return {id:record.id,email};
}
async function verifyOtherWorkspace(c,fetcher){
 const user=new IsolatedSignedClient(c,fetcher);
 try{
  await user.signIn(c.outsiderEmail,c.outsiderPassword);
  insist(await user.boardAllowed('view')===false,'CROSS_WORKSPACE_BOARD_LEAK');
  let denied=false;
  try{await user.rpc('apsyntra_crm_platform_role_snapshot',{
    p_workspace_id:c.workspaceId});}
  catch(e){denied=e instanceof HttpStatusError&&e.status===403;}
  insist(denied,'CROSS_WORKSPACE_ADMIN_LEAK');
 }finally{await user.endSession();}
}
export async function executeCI02(source,env=process.env,fetcher=globalThis.fetch){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.SEC10_CI02!=='EPHEMERAL_ONLY')
  throw Error('CI02_ENVIRONMENT_DENIED');
 const guardEnv={...env,SEC10_CI_AUTH_SMOKE:'EPHEMERAL_ONLY'};
 const local=localStackConfig(source,guardEnv);
 const db=dbUrlFromStatus(source,guardEnv);
 const nonce=randomBytes(6).toString('hex');
 const password=randomBytes(27).toString('base64url')+'A7!';
 let dir;
 try{
  const [admin,member,outsider]=await Promise.all([
   addUser(local,'administrator',password,nonce,fetcher),
   addUser(local,'member',password,nonce,fetcher),
   addUser(local,'outsider',password,nonce,fetcher)
  ]);
  dir=mkdtempSync(join(tmpdir(),'sec10-ci02-'));
  const fixture=adaptDisposableFixture(
   readFileSync('sql/tests/cp-frt-sec06-disposable-setup.sql','utf8'),
   {admin:admin.id,member:member.id,outsider:outsider.id});
  const sqls=[fixture,
   readFileSync('sql/cp-frt-sec06-crm-platform-role-cap.sql','utf8'),
   readFileSync('sql/cp-frt-sec06-domain-role-ceiling.sql','utf8'),
   helpers,readFileSync('sql/cp-frt-sec11-signed-effective-access.sql','utf8')];
  for(let i=0;i<sqls.length;i++){
   const file=join(dir,'fixture-'+i+'.sql');
   writeFileSync(file,sqls[i],{mode:0o600});
   psql(db,['-q','-f',file]);
  }
  const before=audited(db);
  insist(before.audits===0&&before.requests===0&&before.overrideCount===0&&
   before.moduleCount===1&&before.boardCount===1&&
   before.bootstrapCount===1&&before.userCount===3,'CI02_BASELINE_INVALID');
  const c={url:local.api,publishableKey:local.anonKey,
   workspaceId:workspace,boardId:board,
   bootstrapEmail:admin.email,bootstrapPassword:password,
   memberEmail:member.email,memberPassword:password,
   outsiderEmail:outsider.email,outsiderPassword:password};
  const outcome=await runIsolatedSEC10(env,fetcher,c);
  insist(outcome.status==='CAPABILITY_PASS_AUDIT_PENDING',
    outcome.reason||'CI02_AUTHORIZATION_INCOMPLETE');
  await verifyOtherWorkspace(c,fetcher);
  const after=audited(db);
  insist(after.audits===3&&after.requests===3&&after.linked===3&&
   after.viewerEvent===1&&after.supervisorEvent===1&&after.revokeEvent===1&&
   after.overrideCount===0&&after.moduleCount===before.moduleCount&&
   after.boardCount===before.boardCount&&after.bootstrapCount===before.bootstrapCount&&
   after.userCount===before.userCount,'CI02_LEDGER_OR_RESTORE_FAILED');
  return {checkpoint:'CP-FRT-SEC10-CI02',status:'PASS',
   realMemberSessionsVerified:outcome.verifiedSessionCount,
   appliedRoleTransitions:outcome.transitionCount,
   staleCasRejected:true,correlatedAuditEntries:after.linked,
   originalPermissionsRestored:true,crossWorkspaceDenied:true,
   productionTouched:false};
 }finally{if(dir)rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const n=process.argv.indexOf('--env-file');
  insist(n>=0&&process.argv[n+1],'LOCAL_STATUS_REQUIRED');
  const result=await executeCI02(readFileSync(process.argv[n+1],'utf8'));
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  const reason=e?.message&&/^[A-Z0-9_]{3,85}$/.test(e.message)?
    e.message:'CI02_INTEGRATION_FAILED';
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-SEC10-CI02',
   status:'FAILED',reason,productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
