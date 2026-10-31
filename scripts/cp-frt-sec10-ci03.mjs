/** Genuine signed FRT financial RPC acceptance in the disposable Supabase CI03 stack.
 * Extends the existing verified CI02 session and fixture; never targets production.
 */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeCI02} from './cp-frt-sec10-ci02.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';

const w='00000000-0000-4000-8000-000000000001';
const insist=(ok,msg)=>{if(!ok)throw Error(msg);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const amount=125;
const requestPayload={company:'WAO',title:'CI03 Isolated Expense Request',
 department:'Finance',fundSource:'Operational',description:'Ephemeral integration verification',
 dateNeeded:'2026-11-15',items:[{category:'CI expense',amount}]};
const liquidationPayload={notes:'CI-only liquidation',
 items:[{description:'Ephemeral receipt',amount:85,vendor:'CI fixture'}]};
function sql(db,source){
 return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-A','-t','-d',db,'-c',source],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();
}
function financeState(db){
 const q=String.raw`
 SELECT json_build_object(
  'requests',(SELECT count(*) FROM public.frt_requests),
  'items',(SELECT count(*) FROM public.frt_request_items),
  'audits',(SELECT count(*) FROM public.frt_audit_logs),
  'companies',(SELECT count(*) FROM public.frt_companies),
  'vouchers',(SELECT count(*) FROM public.frt_voucher_counters),
  'liquidations',(SELECT count(*) FROM public.frt_liquidations),
  'liquidationItems',(SELECT count(*) FROM public.frt_liquidation_items),
  'crmOverrides',(SELECT count(*) FROM public.apsyntra_crm_platform_roles),
  'crmAudits',(SELECT count(*) FROM public.apsyntra_role_change_audit),
  'closed',(SELECT count(*) FROM public.frt_requests WHERE status='CLOSED'
             AND finance_approved_at IS NOT NULL AND transfer_confirmed_at IS NOT NULL
             AND liquidation_status='APPROVED' AND total_amount=125),
  'liquidationTotals',(SELECT count(*) FROM public.frt_liquidations
        WHERE total_spent=85 AND excess_or_deficit=40),
  'rlsEnabled',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN
    ('frt_companies','frt_voucher_counters','frt_requests','frt_request_items',
     'frt_audit_logs','frt_liquidations','frt_liquidation_items')
     AND c.relrowsecurity),
  'rlsPolicies',(SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND policyname='frt_member_select'
    AND tablename IN
    ('frt_companies','frt_voucher_counters','frt_requests','frt_request_items',
     'frt_audit_logs','frt_liquidations','frt_liquidation_items')),
  'signedDirectWrites',(SELECT count(*) FROM pg_class c JOIN pg_namespace n
    ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'frt_%'
    AND c.relkind='r' AND
    (has_table_privilege('authenticated',c.oid,'INSERT') OR
     has_table_privilege('authenticated',c.oid,'UPDATE') OR
     has_table_privilege('authenticated',c.oid,'DELETE')))
 )::text;
`;
 return JSON.parse(sql(db,q));
}
async function deny(task,name){
 let refused=false;
 try{await task();}
 catch(e){refused=e instanceof HttpStatusError&&e.status>=400&&e.status<500;}
 insist(refused,'UNEXPECTED_FRT_WRITE_ACCESS_'+name);
}
async function role(admin,user,role,revision){
 const ack=await admin.rpc('apsyntra_crm_platform_role_set',{
  p_workspace_id:w,p_target_user_id:user,p_role:role,p_expected_updated_at:revision});
 insist(ack?.effective===true&&ack?.scope==='crm-platform'&&
  ack.targetUserId===user&&ack.workspaceId===w,'CRM_ROLE_RECEIPT_INVALID');
 return ack;
}
function expectSame(a,b){
 insist(a.requests===b.requests&&a.items===b.items&&a.audits===b.audits&&
  a.vouchers===b.vouchers&&a.liquidations===b.liquidations&&
  a.liquidationItems===b.liquidationItems,'DENIED_FINANCE_OPERATION_CHANGED_DATA');
}
function action(client,id,name,payload={}){
 return client.rpc('frt_request_action',{p_workspace_id:w,p_request_id:id,
  p_action:name,p_payload:payload});
}
async function acceptance({config:c,db,fetcher,actorIds}){
 // The disposable fixture is installed first by CI02; it contains no finance rows.
 const source=readFileSync('sql/tests/cp-frt-sec10-ci03-native-finance.sql','utf8');
 insist(source.startsWith('-- CP-FRT-SEC10-CI03: source-aligned finance fixture'),
  'NONCANONICAL_FINANCE_FIXTURE');
 const dir=mkdtempSync(join(tmpdir(),'sec10-finance-'));
 try{
  const file=join(dir,'finance.sql');writeFileSync(file,source,{mode:0o600});
  execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',db,'-f',file],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});
 }finally{rmSync(dir,{recursive:true,force:true});}
 sql(db,"INSERT INTO public.frt_companies(workspace_id,code,name,display_order) VALUES ('"+w+"','WAO','CI-only company',1);");
 const initial=financeState(db);
 insist(initial.requests===0&&initial.audits===0&&initial.companies===1&&
  initial.rlsEnabled===7&&initial.rlsPolicies===7&&initial.signedDirectWrites===0,
  'FINANCE_SCHEMA_POLICY_BASELINE_INVALID');
 const admin=new IsolatedSignedClient(c,fetcher);
 const member=new IsolatedSignedClient(c,fetcher);
 const outsider=new IsolatedSignedClient(c,fetcher);
 let requestId,denials=0,roleTransitions=0;
 try{
  insist((await admin.signIn(c.bootstrapEmail,c.bootstrapPassword)).id===actorIds.bootstrap,
   'BOOTSTRAP_AUTH_MISMATCH');
  insist((await member.signIn(c.memberEmail,c.memberPassword)).id===actorIds.member,
   'FINANCE_MANAGER_AUTH_MISMATCH');
  insist((await outsider.signIn(c.outsiderEmail,c.outsiderPassword)).id===actorIds.outsider,
   'OTHER_WORKSPACE_AUTH_MISMATCH');
  insist(await member.frtAllowed()===true,'FINANCE_MANAGER_GRANT_MISSING');
  const created=await member.rpc('frt_create_request',{p_workspace_id:w,p_payload:requestPayload});
  insist(uuid.test(created?.id)&&created.total_amount===amount&&
   created.status==='PENDING_APPROVAL','REAL_FINANCE_REQUEST_CREATE_FAILED');
  requestId=created.id;
  const createdState=financeState(db);
  insist(createdState.requests===1&&createdState.items===1&&createdState.audits===1,
   'CREATE_TRANSACTION_NOT_ATOMIC');
  await deny(()=>member.call('/rest/v1/frt_requests?select=id',
   {method:'GET',authorized:true}),'DIRECT_SELECT');denials++;
  await deny(()=>member.call('/rest/v1/frt_requests',{method:'POST',authorized:true,
   body:{title:'unauthorized financial insert'}}),'DIRECT_INSERT');denials++;
  await deny(()=>outsider.rpc('frt_create_request',{p_workspace_id:w,
   p_payload:requestPayload}),'CROSS_WORKSPACE_CREATE');denials++;
  // Viewer is an explicit cap: genuine new session must lose all FRT domain writes.
  const assigned=await role(admin,actorIds.member,'viewer',null);
  insist(typeof assigned.currentRevision==='string','VIEWER_REVISION_MISSING');
  roleTransitions++;
  await member.endSession();
  await member.signIn(c.memberEmail,c.memberPassword);
  insist(await member.frtAllowed()===false,'VIEWER_FRT_MODULE_CEILING_FAILED');
  const beforeViewer=financeState(db);
  await deny(()=>member.rpc('frt_create_request',{p_workspace_id:w,
   p_payload:requestPayload}),'VIEWER_CREATE');denials++;
  await deny(()=>member.rpc('frt_update_request',{p_workspace_id:w,
   p_request_id:requestId,p_payload:{title:'Forbidden correction'}}),'VIEWER_UPDATE');denials++;
  await deny(()=>action(member,requestId,'approve'),'VIEWER_APPROVE');denials++;
  await deny(()=>member.rpc('frt_submit_liquidation',{p_workspace_id:w,
   p_request_id:requestId,p_payload:liquidationPayload}),'VIEWER_LIQUIDATION');denials++;
  expectSame(beforeViewer,financeState(db));
  const revoked=await role(admin,actorIds.member,null,assigned.currentRevision);
  insist(revoked.effectiveRole==='employee','INHERITED_ROLE_RECOVERY_FAILED');
  roleTransitions++;
  await member.endSession();
  await member.signIn(c.memberEmail,c.memberPassword);
  insist(await member.frtAllowed()===true,'ORIGINAL_FINANCE_ROLE_NOT_RESTORED');
  const beforeDenied=financeState(db);
  await deny(()=>action(member,requestId,'approve'),'MANAGER_APPROVE');denials++;
  await deny(()=>action(outsider,requestId,'approve'),'CROSS_WORKSPACE_APPROVE');denials++;
  expectSame(beforeDenied,financeState(db));
  insist((await action(admin,requestId,'approve'))?.ok===true,'GM_APPROVAL_FAILED');
  await deny(()=>action(member,requestId,'transfer'),'MANAGER_TRANSFER');denials++;
  insist((await action(admin,requestId,'transfer',
   {reference:'CI-only-transfer'}))?.ok===true,'GM_TRANSFER_FAILED');
  insist((await member.rpc('frt_submit_liquidation',{
   p_workspace_id:w,p_request_id:requestId,p_payload:liquidationPayload}))?.ok===true,
   'FINANCE_LIQUIDATION_FAILED');
  await deny(()=>action(member,requestId,'liquidation/approve'),
   'MANAGER_LIQUIDATION_APPROVE');denials++;
  insist((await action(admin,requestId,'liquidation/approve'))?.ok===true,
   'GM_LIQUIDATION_APPROVAL_FAILED');
  insist((await action(member,requestId,'close'))?.ok===true,
   'FINANCE_MANAGER_CLOSE_FAILED');
  const final=financeState(db);
  insist(final.requests===1&&final.items===1&&final.audits===6&&
   final.liquidations===1&&final.liquidationItems===1&&
   final.closed===1&&final.liquidationTotals===1&&
   final.crmOverrides===0&&final.crmAudits===initial.crmAudits+2&&
   final.signedDirectWrites===0,'FINAL_FINANCE_LEDGER_MISMATCH');
  return {checkpoint:'CP-FRT-SEC10-CI03',status:'PASS',
   signedFinanceDenials:denials,allowedFinanceOperations:6,
   financeAuditRecords:final.audits,verifiedRoleCaps:roleTransitions,
   rlsTablesVerified:final.rlsEnabled,readPoliciesVerified:final.rlsPolicies,
   directFinancialTableWritesGranted:false,
   originalPermissionsRestored:true,productionTouched:false};
 }finally{await Promise.allSettled([admin.endSession(),member.endSession(),outsider.endSession()]);}
}
export async function executeCI03(source,env=process.env,fetcher=globalThis.fetch){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.SEC10_CI03!=='EPHEMERAL_ONLY')
  throw Error('CI03_ENVIRONMENT_DENIED');
 let result=null;
 const ci02=await executeCI02(source,{...env,SEC10_CI02:'EPHEMERAL_ONLY'},
  fetcher,async ctx=>{result=await acceptance(ctx);});
 insist(ci02.status==='PASS'&&result?.status==='PASS','CI02_REUSE_OR_CI03_FAILED');
 return {...result,ci02Prerequisite:'PASS'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const pos=process.argv.indexOf('--env-file');
  insist(pos>=0&&process.argv[pos+1],'LOCAL_STATUS_REQUIRED');
  const result=await executeCI03(readFileSync(process.argv[pos+1],'utf8'));
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  const reason=e?.message&&/^[A-Z0-9_]{3,90}$/.test(e.message)?
   e.message:'CI03_INTEGRATION_FAILED';
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-SEC10-CI03',
   status:'FAILED',reason,productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
