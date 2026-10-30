/** CP-A12.2 genuine read-only negative access checks.
 * Must run in the tested user's own Supabase Auth session. No role spoofing,
 * service-role credentials, write operations or membership changes.
 */
import {TARGET_BOARDS,TARGET_WORKSPACE_ID} from './board-security-targets.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const checksPerBoard=6;
const denyCode=403;
export function identifySecurityScenario(context){
 if(!context?.workspace_id||!UUID.test(context.workspace_id)||context.profile?.status!=='active')
  return 'not_eligible';
 if(context.workspace_id!==TARGET_WORKSPACE_ID)return 'cross_workspace';
 return context.profile?.platform_role==='admin_general_manager'?'admin_not_eligible':'unassigned_nonadmin';
}
const status=(ok,summary)=>({ok:ok===true,summary});
function errorSummary(err){return err?.status?'HTTP '+err.status:'Request error';}
async function detailDenied(api,id){
 try{await api.board(id);return status(false,'Board detail was exposed');}
 catch(err){return status(err?.status===denyCode,
  err?.status===denyCode?'Denied with HTTP 403':errorSummary(err));}
}
async function eventsDenied(api,id){
 try{
  const data=await api.boardEvents(id,1);
  return status(Array.isArray(data)&&data.length===0,
   Array.isArray(data)?data.length+' event(s) returned': 'Invalid event response');
 }catch(err){return status(false,errorSummary(err));}
}
export async function runSignedNegativeBoardAcceptance(auth,api,{onBoard=()=>{}}={}){
 const result={status:'pending',scenario:null,passed:0,total:TARGET_BOARDS.length,results:[],
  startedAt:new Date().toISOString(),checksPerBoard};
 let subject,ctx,listing;
 try{
  subject=await auth.getVerifiedUser();
  ctx=await api.context();
  if(!UUID.test(subject?.id||'')||subject.id!==auth.userId||ctx.user_id!==subject.id)
   throw Error('Verified signed-user identity/context mismatch');
  result.scenario=identifySecurityScenario(ctx);
  if(result.scenario==='admin_not_eligible'||result.scenario==='not_eligible'){
   result.status='not_eligible';
   result.reason=result.scenario==='admin_not_eligible'?
    'Your current account is a platform administrator in the board workspace. Use an existing authorized nonadministrator account for member-denial evidence.':
    'The signed account has no supported authoritative active workspace.';
   return result;
  }
  listing=await api.boards('active');
  if(!Array.isArray(listing))throw Error('Authoritative board listing invalid');
 }catch(err){
  result.status='blocked';result.reason='Cannot verify signed identity, workspace and board listing ('+errorSummary(err)+')';
  return result;
 }
 const visible=new Set(listing.map(x=>x?.id));
 for(const board of TARGET_BOARDS){
  const checks={};
  const inList=visible.has(board.id);
  checks.list=status(!inList,inList?'Restricted board was included in the signed list':'Absent from authorized board list');
  // For a suspected unauthorized data leak, do not request detail/event payloads.
  const permissions=await Promise.allSettled(['view','edit','manage'].map(p=>api.allowed(board.id,p)));
  for(let i=0;i<3;i++){
   const required=['view','edit','manage'][i];
   const p=permissions[i];
   const denied=p.status==='fulfilled'&&p.value===false;
   checks[required]=status(denied,
    p.status==='rejected'?errorSummary(p.reason):
     denied?'Central RBAC denied '+required:'Central RBAC allowed '+required);
  }
  const sensitiveGate=checks.list.ok&&checks.view.ok&&checks.edit.ok&&checks.manage.ok;
  checks.detail=sensitiveGate?await detailDenied(api,board.id):
    status(false,'Not requested: unexpected access or permission result');
  checks.events=sensitiveGate?await eventsDenied(api,board.id):
    status(false,'Not requested: unexpected access or permission result');
  const passed=Object.values(checks).filter(x=>x.ok).length;
  const entry={key:board.key,name:board.name,passed,total:checksPerBoard,checks,status:passed===checksPerBoard?'pass':'fail'};
  result.results.push(entry);
  if(entry.status==='pass')result.passed++;
  onBoard(entry);
  if(entry.status!=='pass')break; // stop before other negative calls when security expectation fails
 }
 result.status=result.passed===TARGET_BOARDS.length?'pass':'fail';
 result.finishedAt=new Date().toISOString();
 result.scope=result.scenario==='cross_workspace'?
  'Real signed workspace outside the target board workspace':
  'Real signed nonadministrator with expected no target-board membership';
 return result;
}
/** Export only nonsecret proof. Never include user IDs, email, JWT or access token. */
export function sanitizeNegativeReport(report){
 const {status:state,scenario,passed,total,results=[],startedAt,finishedAt}=report??{};
 return JSON.stringify({checkpoint:'CP-A12.2',status:state,scenario,passed,total,
  startedAt,finishedAt,boards:results.map(({key,status,passed,total,checks})=>({key,status,passed,total,
   checks:Object.fromEntries(Object.entries(checks).map(([name,value])=>[name,value.ok?'PASS':'FAIL']))}))},null,2);
}
