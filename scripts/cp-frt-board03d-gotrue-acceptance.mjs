/** CP-FRT-BOARD-03D: genuine GoTrue signed QA round-trip in disposable stack only.
 * Never points at production, logs credentials, or creates production finance rows.
 */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeCI03} from './cp-frt-sec10-ci03.mjs';
import {IsolatedSignedClient,HttpStatusError} from './cp-frt-sec10-live-client.mjs';
const workspace='00000000-0000-4000-8000-000000000001';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireTrue=(value,code)=>{if(!value)throw Error(code);};
const query=(db,statement)=>execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1',
 '-d',db,'-c',statement],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000}).trim();
function installCandidate(db){
 const source=['sql/cp-frt-sec14-production-additive-read-activation.sql',
  'sql/tests/cp-frt-board03b-disposable-profile-compat.sql',
  'sql/cp-frt-board03-date-cas-CANDIDATE.sql',
  'sql/cp-frt-board03b-person-assignment-CANDIDATE.sql'];
 const dir=mkdtempSync(join(tmpdir(),'frt03d-'));
 try{
  const file=join(dir,'isolated-extension.sql');
  writeFileSync(file,source.map(name=>readFileSync(name,'utf8')).join('\n')+
   "\nNOTIFY pgrst,'reload schema';\n",{mode:0o600});
  execFileSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',db,'-f',file],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const payload={company:'WAO',title:'CP03D Disposable Signed QA Request',
 department:'Finance',fundSource:'Isolated CI',description:'Disposable signed integration',
 dateNeeded:'2026-11-15',items:[{category:'CI validation',amount:1}]};
async function denial(job,code){
 let denied=false;
 try{await job();}catch(error){denied=error instanceof HttpStatusError&&error.status>=400&&error.status<500;}
 requireTrue(denied,code);
}
async function signedAcceptance({config,db,fetcher,actorIds}){
 installCandidate(db);
 const member=new IsolatedSignedClient(config,fetcher);
 const outsider=new IsolatedSignedClient(config,fetcher);
 let qaId=null;
 try{
  const first=await member.signIn(config.memberEmail,config.memberPassword);
  const other=await outsider.signIn(config.outsiderEmail,config.outsiderPassword);
  requireTrue(first.id===actorIds.member&&other.id===actorIds.outsider,
   'GOTRUE_QA_IDENTITY_MISMATCH');
  const creation=await member.rpc('frt_create_request',{
   p_workspace_id:workspace,p_payload:payload});
  qaId=creation?.id;
  requireTrue(uuid.test(qaId||'')&&creation?.title===payload.title,
   'SIGNED_QA_CREATE_FAILED');
  const listed=await member.rpc('frt_board_list_safe',{
   p_workspace_id:workspace,p_company:'WAO',p_search:''});
  requireTrue(Array.isArray(listed)&&listed.some(r=>r.id===qaId),
   'QA_REQUEST_NOT_LISTED');
  const dateAck=await member.rpc('frt_update_request_date_cas',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_date:'2026-11-15',p_next_date:'2026-11-20'});
  requireTrue(dateAck?.ok===true&&dateAck.dateNeeded==='2026-11-20',
   'SIGNED_DATE_CAS_FAILED');
  const personAck=await member.rpc('frt_assign_request_person',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_assignee_id:null,p_assignee_id:actorIds.member});
  requireTrue(personAck?.ok===true&&personAck.assigneeId===actorIds.member,
   'SIGNED_PERSON_CAS_FAILED');
  await member.endSession();
  const reopened=await member.signIn(config.memberEmail,config.memberPassword);
  requireTrue(reopened.id===actorIds.member&&reopened.sessionId!==first.sessionId,
   'REFRESH_SIGNED_SESSION_NOT_INDEPENDENT');
  const detail=await member.rpc('frt_restricted_request_detail',{
   p_workspace_id:workspace,p_request_id:qaId});
  const assignee=await member.rpc('frt_request_assignment',{
   p_workspace_id:workspace,p_request_id:qaId});
  const refreshed=await member.rpc('frt_board_list_safe',{
   p_workspace_id:workspace,p_company:'WAO',p_search:''});
  requireTrue(detail?.date_needed==='2026-11-20'&&
   assignee?.assigneeId===actorIds.member&&
   refreshed.some(r=>r.id===qaId&&r.date_needed==='2026-11-20'),
   'GOTRUE_FRESH_LOGIN_PERSISTENCE_FAILED');
  await denial(()=>member.rpc('frt_update_request_date_cas',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_date:'2026-11-15',p_next_date:'2026-11-22'}),
   'SIGNED_STALE_DATE_ACCEPTED');
  await denial(()=>member.rpc('frt_assign_request_person',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_assignee_id:null,p_assignee_id:actorIds.member}),
   'SIGNED_STALE_PERSON_ACCEPTED');
  await denial(()=>outsider.rpc('frt_restricted_request_detail',{
   p_workspace_id:workspace,p_request_id:qaId}),
   'FOREIGN_WORKSPACE_DETAIL_ACCEPTED');
  await denial(()=>outsider.rpc('frt_request_assignment',{
   p_workspace_id:workspace,p_request_id:qaId}),
   'FOREIGN_WORKSPACE_PERSON_ACCEPTED');
  await denial(()=>outsider.rpc('frt_update_request_date_cas',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_date:'2026-11-20',p_next_date:'2026-11-23'}),
   'FOREIGN_WORKSPACE_DATE_WRITE_ACCEPTED');
  await denial(()=>outsider.rpc('frt_assign_request_person',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_assignee_id:actorIds.member,p_assignee_id:null}),
   'FOREIGN_WORKSPACE_PERSON_WRITE_ACCEPTED');
  const restoredPerson=await member.rpc('frt_assign_request_person',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_assignee_id:actorIds.member,p_assignee_id:null});
  const restoredDate=await member.rpc('frt_update_request_date_cas',{
   p_workspace_id:workspace,p_request_id:qaId,
   p_expected_date:'2026-11-20',p_next_date:'2026-11-15'});
  requireTrue(restoredPerson?.ok===true&&restoredDate?.ok===true,
   'QA_RESTORE_FAILED');
  const state=JSON.parse(query(db,`SELECT json_build_object(
   'qaRequests',(SELECT count(*) FROM public.frt_requests WHERE id='${qaId}'),
   'assigned',(SELECT count(*) FROM public.frt_requests WHERE id='${qaId}' AND assignee_id IS NOT NULL),
   'dateRestored',(SELECT count(*) FROM public.frt_requests WHERE id='${qaId}' AND date_needed='2026-11-15'),
   'dateAudit',(SELECT count(*) FROM public.frt_audit_logs WHERE fund_request_id='${qaId}' AND action='REQUEST_DATE_CORRECTED'),
   'personAudit',(SELECT count(*) FROM public.frt_audit_logs WHERE fund_request_id='${qaId}' AND action='REQUEST_PERSON_ASSIGNED'))::text;`));
  requireTrue(state.qaRequests===1&&state.assigned===0&&state.dateRestored===1&&
   state.dateAudit===2&&state.personAudit===2,'QA_FINAL_AUDIT_OR_RESTORE_INVALID');
  // CI-only hard cleanup with verified exact fixture identity; the entire
  // disposable Supabase stack is independently destroyed by the workflow.
  const cleaned=JSON.parse(query(db,`WITH fixture AS (
   SELECT id FROM public.frt_requests WHERE id='${qaId}'
    AND workspace_id='${workspace}' AND title='${payload.title}'
    AND requestor_id='${actorIds.member}'
  ), audit AS (DELETE FROM public.frt_audit_logs WHERE fund_request_id IN (SELECT id FROM fixture) RETURNING id),
  lines AS (DELETE FROM public.frt_request_items WHERE fund_request_id IN (SELECT id FROM fixture) RETURNING id),
  request AS (DELETE FROM public.frt_requests WHERE id IN (SELECT id FROM fixture) RETURNING id)
  SELECT json_build_object('requests',(SELECT count(*) FROM request),
   'lines',(SELECT count(*) FROM lines),'audits',(SELECT count(*) FROM audit))::text;`));
  requireTrue(cleaned.requests===1&&cleaned.lines===1&&cleaned.audits===5,
   'QA_FIXTURE_CLEANUP_INVALID');
  qaId=null;
  return {checkpoint:'CP-FRT-BOARD-03D',status:'PASS',
   realGoTrueSessions:3,signedCreate:1,updatedDate:1,updatedPerson:1,
   freshLoginPersistence:'PASS',staleWriteDenials:2,foreignWorkspaceDenials:4,
   restoredValues:'PASS',exactFixtureCleanup:'PASS',
   productionTouched:false,privateDataIncluded:false};
 }finally{await Promise.allSettled([member.endSession(),outsider.endSession()]);}
}
export async function executeFRT03D(source,env=process.env,fetcher=globalThis.fetch){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.SEC10_CI03!=='EPHEMERAL_ONLY'||
    env.FRT03D_EPHEMERAL!=='YES')throw Error('FRT03D_ISOLATED_ENV_REQUIRED');
 let outcome=null;
 const baseline=await executeCI03(source,env,fetcher,async ctx=>{
  outcome=await signedAcceptance(ctx);
 });
 requireTrue(baseline?.status==='PASS'&&outcome?.status==='PASS','FRT03D_BASELINE_FAILED');
 return outcome;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const index=process.argv.indexOf('--env-file');
  requireTrue(index>=0&&process.argv[index+1],'FRT03D_ENV_FILE_REQUIRED');
  const result=await executeFRT03D(readFileSync(process.argv[index+1],'utf8'));
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){
  const reason=/^[A-Z0-9_]{3,90}$/.test(error?.message||'')?
   error.message:'FRT03D_SIGNED_ACCEPTANCE_FAILED';
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-BOARD-03D',
   status:'FAILED',reason,productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
