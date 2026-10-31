/** CP-FRT-SEC09: paired signed-session, read-only acceptance evidence.
 * Never attempts a permission change or treats automated fixtures as real users.
 * The two existing authoritative SEC03 and SEC07 runners are reused verbatim.
 */
import {runFRTSec03SignedAcceptance} from './frt-sec03-signed-acceptance.js';
import {runFRTSec07ActivationGate} from './frt-sec07-signed-activation.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legalStatus=new Set(['PASS','FAIL','BLOCKED']);
const legalScenario=new Set(['BOOTSTRAP','NONBOOTSTRAP']);
const statuses=checks=>Array.isArray(checks)&&checks.length>0&&
 checks.every(c=>typeof c?.name==='string'&&c.status==='PASS');

function resultCheck(report,name,passed){
 report.checks.push({name,status:passed?'PASS':'FAIL'});
}
function safeChild(source){
 return {
  checkpoint:source?.checkpoint==='CP-FRT-SEC03'?'CP-FRT-SEC03':'CP-FRT-SEC07',
  status:legalStatus.has(source?.status)?source.status:'BLOCKED',
  scenario:legalScenario.has(source?.scenario)?source.scenario:'UNVERIFIED',
  checks:Array.isArray(source?.checks)?source.checks.map(x=>({
   // The check names originate in locally authored acceptance runners.
   name:typeof x?.name==='string'&&/^[a-z0-9-]{1,70}$/.test(x.name)?x.name:'invalid-check-name',
   status:legalStatus.has(x?.status)?x.status:'BLOCKED'
  })):[],
  writesAttempted:Number.isSafeInteger(source?.writesAttempted)&&source.writesAttempted>=0?source.writesAttempted:-1
 };
}
export async function runFRTSec09SignedAcceptance({auth,api}={}){
 const report={checkpoint:'CP-FRT-SEC09',status:'BLOCKED',
  scenario:'UNVERIFIED',checks:[],sources:[],writesAttempted:0,
  secretValuesIncluded:false,roleChangesAttempted:0};
 if(!auth||!api)return {...report,reason:'SIGNED_AUTH_AND_API_REQUIRED'};
 try{
  const first=await auth.getVerifiedUser();
  const original=await api.context();
  if(!uuid.test(first?.id||'')||first.id!==auth.userId||
      first.id!==original?.user_id||!uuid.test(original?.workspace_id||'')||
      original?.profile?.status!=='active'){
   report.reason='SIGNED_CONTEXT_INVALID';return report;
  }

  const sec03=safeChild(await runFRTSec03SignedAcceptance({auth,api}));
  const sec07=safeChild(await runFRTSec07ActivationGate({auth,api}));
  report.sources=[sec03,sec07];
  if(sec03.status==='BLOCKED'||sec07.status==='BLOCKED'){
   report.reason=sec03.status==='BLOCKED'?'SEC03_BASELINE_BLOCKED':'SEC07_ACTIVATION_BLOCKED';
   return report;
  }
  if(legalScenario.has(sec03.scenario)&&sec03.scenario===sec07.scenario)
   report.scenario=sec03.scenario;

  // Protect against an account/workspace switch while the two signed runners
  // are awaiting network responses; never copy identity details to evidence.
  const last=await auth.getVerifiedUser();
  const finalContext=await api.context();
  const bootstrapAgain=await api.rpc('apsyntra_role_is_bootstrap',{});
  const stable=last?.id===first.id&&auth.userId===first.id&&
    finalContext?.user_id===first.id&&
    finalContext?.workspace_id===original.workspace_id&&
    finalContext?.profile?.status==='active';
  const bootstrapMatch=typeof bootstrapAgain==='boolean'&&
    report.scenario===(bootstrapAgain?'BOOTSTRAP':'NONBOOTSTRAP');
  resultCheck(report,'same-signed-identity-and-workspace',stable);
  resultCheck(report,'consistent-bootstrap-classification',bootstrapMatch);
  resultCheck(report,'sec03-governance-baseline',
    sec03.status==='PASS'&&statuses(sec03.checks));
  resultCheck(report,'sec07-crm-platform-rbac',
    sec07.status==='PASS'&&statuses(sec07.checks));
  resultCheck(report,'read-only-no-role-mutations',
    sec03.writesAttempted===0&&sec07.writesAttempted===0);
  report.status=report.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';
 }catch{
  // Never include raw server errors, emails, user IDs, JWTs or API payloads.
  report.status='BLOCKED';report.reason='SIGNED_READ_ONLY_ACCEPTANCE_INCOMPLETE';
 }
 return report;
}

/** Only sanitized, fixed-shape evidence may enter clipboard/source control. */
export function sanitizeFRTSec09Report(report){
 const clean={
  checkpoint:'CP-FRT-SEC09',
  status:legalStatus.has(report?.status)?report.status:'BLOCKED',
  scenario:legalScenario.has(report?.scenario)?report.scenario:'UNVERIFIED',
  checks:Array.isArray(report?.checks)?report.checks.map(c=>({
   name:/^[a-z0-9-]{1,70}$/.test(c?.name||'')?c.name:'invalid-check-name',
   status:legalStatus.has(c?.status)?c.status:'BLOCKED'
  })):[],
  sources:Array.isArray(report?.sources)?report.sources.map(safeChild):[],
  writesAttempted:Number.isSafeInteger(report?.writesAttempted)?report.writesAttempted:-1,
  roleChangesAttempted:Number.isSafeInteger(report?.roleChangesAttempted)?report.roleChangesAttempted:-1
 };
 if(typeof report?.reason==='string'&&/^[A-Z0-9_]{1,60}$/.test(report.reason))
  clean.reason=report.reason;
 return JSON.stringify(clean,null,2);
}
