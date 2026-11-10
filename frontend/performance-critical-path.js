/** Priority 5C: fixed-phase, memory-only startup timing; no payloads or telemetry.
 * Phase boundaries represent sequential application awaits AFTER the app entry
 * module executes. They do not imply browser navigation or server-only latency.
 */
const PHASES=Object.freeze(['session-restore','workspace-authorization','authorized-route']);
const OPERATIONS=Object.freeze(['workspace-context','board-list','bootstrap-role']);
const round=number=>Number.isFinite(number)?Math.round(number*100)/100:null;
export function createStartupCriticalPath({clock=()=>globalThis.performance?.now?.()}={}){
 let previous=null,current=null,entry=null,active=false,complete=false,epoch=0;
 const steps=[],operations=new Map();
 const now=()=>{const value=clock();return Number.isFinite(value)&&value>=0?value:null;};
 const record=boundary=>{
  const end=now();
  if(active&&current&&previous!==null&&end!==null&&end>=previous)
   steps.push(Object.freeze({phase:current,durationMs:round(end-previous)}));
  previous=end;current=boundary;
 };
 return Object.freeze({
  begin(){epoch++;steps.length=0;operations.clear();previous=now();entry=previous;current=PHASES[0];active=previous!==null;complete=false;},
  async measure(operation,action){
   if(typeof action!=='function')throw Error('Invalid signed startup read');
   // Unknown operations still execute, but never enter diagnostic records.
   const shouldMeasure=active&&!complete&&current==='workspace-authorization'&&
    OPERATIONS.includes(operation)&&!operations.has(operation);
   const generation=epoch,start=shouldMeasure?now():null;
   if(shouldMeasure)operations.set(operation,null);
   try{return await action();}
   finally{
    if(shouldMeasure&&generation===epoch&&active&&!complete){
     const end=now();
     operations.set(operation,start!==null&&end!==null&&end>=start?
      Object.freeze({operation,durationMs:round(end-start),
       startMs:round(start-entry),endMs:round(end-entry)}):null);
    }
   }
  },
  phase(phase){
   if(!active||complete||!PHASES.includes(phase)||
      PHASES.indexOf(phase)!==PHASES.indexOf(current)+1)return;
   record(phase);
  },
  end({authenticated=false}={}){
   if(!active||complete)return;
   record(null);complete=true;active=false;
   if(!authenticated){steps.length=0;operations.clear();}
  },
  clear(){epoch++;steps.length=0;operations.clear();active=false;complete=false;previous=null;current=null;entry=null;},
  snapshot(){
   if(!complete||!steps.length)return null;
   const phases=steps.map(step=>({...step}));
   const totalMs=round(phases.reduce((sum,x)=>sum+x.durationMs,0));
   const reads=OPERATIONS.map(operation=>operations.get(operation)).filter(Boolean)
    .map(read=>({...read}));
   return {phases,totalMs,entryFromNavigationMs:round(entry),
    signedReadyFromNavigationMs:round(previous),reads};
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
