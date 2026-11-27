/** Numeric-only, test-runner performance helpers. */
import {summarizeSamples} from './crm-performance-baseline.mjs';

export function rpcSummary(rows){
 if(!Array.isArray(rows)||rows.some(r=>!Number.isInteger(r.status)||r.status<100||r.status>599||
  !Number.isFinite(r.ms)||r.ms<0||!Number.isSafeInteger(r.bytes)||r.bytes<0))
  throw Error('Invalid request observation');
 return {requests:rows.length,errors:rows.filter(r=>r.status<200||r.status>=300).length,
  responseBytes:rows.reduce((sum,r)=>sum+r.bytes,0),
  latency:rows.length?summarizeSamples(rows.map(r=>r.ms)):null};
}

export function cpuInterval(before,after){
 const total=after.total-before.total,idle=after.idle-before.idle;
 if(!Number.isFinite(total)||!Number.isFinite(idle)||total<=0||idle<0||idle>total)
  throw Error('Invalid host CPU counter interval');
 return +(100*(total-idle)/total).toFixed(2);
}

export function assertForegroundInteractionPage(visibilityState){
 if(visibilityState!=='visible')throw Error('Interaction timing requires a foreground browser page');
 return true;
}

export function workloadMode(mode){
 if(mode==='smoke')return {windows:2,phaseMs:35000,phases:['idle']};
 if(mode==='single'||mode==='dual')return {windows:mode==='single'?1:2,
  phaseMs:600000,phases:['idle','interaction','idle-recovery']};
 throw Error('Unknown signed performance mode');
}
