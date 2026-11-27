/** Report-only benchmark helpers; no runtime application imports or telemetry. */
import {WORK_MANAGEMENT_APPLICATIONS} from '../../frontend/workspace-application-ownership.js';

export function benchmarkInventory(){
 return WORK_MANAGEMENT_APPLICATIONS.map(app=>({
  id:app.id,label:app.label,kind:app.routeKind,
  route:app.route.replace(':boardId',app.boardId||'')
 }));
}

export function summarizeSamples(samples){
 if(!Array.isArray(samples)||!samples.length||samples.some(value=>!Number.isFinite(value)||value<0))
  throw new Error('A benchmark requires finite nonnegative samples');
 const sorted=[...samples].sort((a,b)=>a-b);
 const round=n=>Math.round(n*100)/100;
 const at=p=>round(sorted[Math.ceil(p*sorted.length)-1]);
 return {samples:sorted.length,min:round(sorted[0]),p50:at(.5),p95:at(.95),
  max:round(sorted.at(-1)),mean:round(sorted.reduce((a,b)=>a+b,0)/sorted.length)};
}

export function summarizeRows(rows,keys){
 return Object.fromEntries(keys.map(key=>[key,summarizeSamples(rows.map(row=>row[key]))]));
}
