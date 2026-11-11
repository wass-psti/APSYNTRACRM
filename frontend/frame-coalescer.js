/** Coalesce high-frequency input to at most one scheduled frame.
 * flush() applies the latest pending value synchronously; cancel() discards it.
 */
export function createFrameCoalescer({requestFrame,cancelFrame,apply}={}){
 if(typeof requestFrame!=='function'||typeof cancelFrame!=='function'||typeof apply!=='function')
  throw Error('Frame coalescer requires request, cancel and apply functions');
 let handle=null,pending=false,latest;
 const flush=()=>{
  if(handle!==null){cancelFrame(handle);handle=null;}
  if(!pending)return false;
  const value=latest;latest=undefined;pending=false;apply(value);return true;
 };
 const run=()=>{
  handle=null;
  if(!pending)return;
  const value=latest;latest=undefined;pending=false;apply(value);
 };
 return Object.freeze({
  schedule(value){latest=value;pending=true;if(handle===null)handle=requestFrame(run);},
  flush,
  cancel(){if(handle!==null)cancelFrame(handle);handle=null;latest=undefined;pending=false;},
  get pending(){return pending;}
 });
}
