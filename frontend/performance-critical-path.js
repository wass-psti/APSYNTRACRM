/** Priority 5C: fixed-phase, memory-only startup timing; no payloads or telemetry.
 * Phase boundaries represent sequential application awaits AFTER the app entry
 * module executes. They do not imply browser navigation or server-only latency.
 */
const PHASES=Object.freeze(['session-restore','workspace-authorization','authorized-route']);
const round=number=>Number.isFinite(number)?Math.round(number*100)/100:null;
export function createStartupCriticalPath({clock=()=>globalThis.performance?.now?.()}={}){
 let previous=null,current=null,entry=null,active=false,complete=false;
 const steps=[];
 const now=()=>{const value=clock();return Number.isFinite(value)&&value>=0?value:null;};
 const record=boundary=>{
  const end=now();
  if(active&&current&&previous!==null&&end!==null&&end>=previous)
   steps.push(Object.freeze({phase:current,durationMs:round(end-previous)}));
  previous=end;current=boundary;
 };
 return Object.freeze({
  begin(){steps.length=0;previous=now();entry=previous;current=PHASES[0];active=previous!==null;complete=false;},
  phase(phase){
   if(!active||complete||!PHASES.includes(phase)||
      PHASES.indexOf(phase)!==PHASES.indexOf(current)+1)return;
   record(phase);
  },
  end({authenticated=false}={}){
   if(!active||complete)return;
   record(null);complete=true;active=false;
   if(!authenticated)steps.length=0;
  },
  clear(){steps.length=0;active=false;complete=false;previous=null;current=null;entry=null;},
  snapshot(){
   if(!complete||!steps.length)return null;
   const phases=steps.map(step=>({...step}));
   const totalMs=round(phases.reduce((sum,x)=>sum+x.durationMs,0));
   return {phases,totalMs,entryFromNavigationMs:round(entry),
    signedReadyFromNavigationMs:round(previous)};
  }
 });
}

/** Aggregate just the Long Tasks API's numeric durations during an opt-in
 * sample. Do not access attribution, name, URL, timing origin or entry detail.
 */
export function summarizeLongTasks(durations){
 const values=durations.filter(v=>Number.isFinite(v)&&v>=50&&v<=10000).slice(0,128);
 return {count:values.length,totalMs:round(values.reduce((a,b)=>a+b,0)),
  maxMs:values.length?round(Math.max(...values)):0};
}
