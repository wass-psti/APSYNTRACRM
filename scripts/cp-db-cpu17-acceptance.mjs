/** CP-DB-CPU-17: offline comparison of comparable production CPU/workload evidence.
 * Never accesses credentials, the production database, or external services.
 */
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const validNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const rpcNames=['wm_list_boards','wm_auth_access_context','work_board_access',
 'apsyntra_crm_my_effective_access','wm_get_board'];

function parseSnapshot(snapshot,label){
 if(!snapshot||typeof snapshot!=='object')throw Error(label+': snapshot is required');
 const start=Date.parse(snapshot.window_start),end=Date.parse(snapshot.window_end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
  throw Error(label+': a valid positive measurement interval is required');
 const minutes=(end-start)/60000;
 if(!snapshot.rpc_requests||typeof snapshot.rpc_requests!=='object')
  throw Error(label+': RPC request counts are required');
 const requests={};
 for(const name of rpcNames){
  const value=snapshot.rpc_requests[name]??0;
  if(!Number.isSafeInteger(value)||value<0)throw Error(label+': invalid '+name+' count');
  requests[name]={count:value,per_minute:value/minutes};
 }
 const cpu=snapshot.cpu_samples_pct;
 if(cpu!==undefined&&(!Array.isArray(cpu)||!cpu.every(value=>validNumber(value)&&value<=100)))
  throw Error(label+': CPU samples must be percentages between 0 and 100');
 const population=['active_users','active_windows','workflow_events'];
 for(const key of population){
  const value=snapshot[key];
  if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))
   throw Error(label+': invalid '+key);
 }
 const errors=snapshot.rpc_errors??0;
 if(!Number.isSafeInteger(errors)||errors<0)throw Error(label+': invalid RPC error count');
 return {minutes,requests,errors,cpu_samples:cpu??[],
  cpu_mean:cpu?.length?average(cpu):null,
  active_users:snapshot.active_users,active_windows:snapshot.active_windows,
  workflow_events:snapshot.workflow_events,cohort:snapshot.cohort,
  signed_regression_passed:snapshot.signed_regression_passed,
  integrity_verified:snapshot.integrity_verified};
}

export function compareCpuEvidence(baseline,after){
 const before=parseSnapshot(baseline,'baseline');
 const current=parseSnapshot(after,'after');
 const normalized={};
 for(const name of rpcNames){
  const b=before.requests[name],c=current.requests[name];
  normalized[name]={before_per_minute:+b.per_minute.toFixed(3),
   after_per_minute:+c.per_minute.toFixed(3),
   change_percent:b.per_minute===0?null:+(100*(c.per_minute/b.per_minute-1)).toFixed(1)};
 }
 const blockers=[];
 if(before.minutes<15||current.minutes<15)blockers.push('At least 15 minutes per CPU/workload window is required');
 if(Math.abs(before.minutes-current.minutes)>Math.max(before.minutes,current.minutes)*0.1)
  blockers.push('Measurement window durations differ by over 10%');
 if(before.cpu_samples.length<3||current.cpu_samples.length<3)
  blockers.push('At least three CPU samples per measurement window are required');
 if(!before.cohort||before.cohort!==current.cohort)
  blockers.push('Same signed-user/workspace workload cohort is not established');
 for(const name of ['active_users','active_windows']){
  if(before[name]===undefined||current[name]===undefined||before[name]!==current[name])
   blockers.push(name+' counts are missing or differ');
 }
 if(!before.workflow_events||current.workflow_events===undefined||
    Math.abs(current.workflow_events/before.workflow_events-1)>0.2)
  blockers.push('Comparable application workflow volume (within 20%) is not established');
 if(current.signed_regression_passed!==true||current.integrity_verified!==true)
  blockers.push('Signed runtime and data-integrity regression acceptance remains unverified');
 if(current.errors>before.errors)blockers.push('RPC errors increased');
 const delta=before.cpu_mean===null||current.cpu_mean===null?null:
  +(current.cpu_mean-before.cpu_mean).toFixed(2);
 if(delta!==null&&delta>=0)blockers.push('Average CPU reduction is not demonstrated');
 return {status:blockers.length?'INDETERMINATE':'VERIFIED',
  baseline_cpu_mean_pct:before.cpu_mean===null?null:+before.cpu_mean.toFixed(2),
  after_cpu_mean_pct:current.cpu_mean===null?null:+current.cpu_mean.toFixed(2),
  cpu_percentage_point_change:delta,rpc_rates:normalized,blockers};
}

if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 if(process.argv.length!==4){
  console.error('Usage: node scripts/cp-db-cpu17-acceptance.mjs baseline.json after.json');
  process.exitCode=2;
 }else{
  try{
   const before=JSON.parse(readFileSync(process.argv[2],'utf8'));
   const after=JSON.parse(readFileSync(process.argv[3],'utf8'));
   const result=compareCpuEvidence(before,after);
   console.log(JSON.stringify(result,null,2));
   if(result.status!=='VERIFIED')process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=2;}
 }
}
