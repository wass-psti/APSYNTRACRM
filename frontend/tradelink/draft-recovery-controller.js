import {createRecoverySnapshot,validateRecoverySnapshot} from './draft-recovery-state.js';
import {TradeLinkRecoveryStore} from './draft-recovery-store.js';

export class TradeLinkRecoveryController{
 constructor({store=new TradeLinkRecoveryStore(),now=Date.now,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),onStatus=()=>{}}={}){
  Object.assign(this,{store,now,schedule,cancel,onStatus});
  this.entries=new Map();
 }
 resume(snapshot){
  validateRecoverySnapshot(snapshot);
  const {instanceId,userId,workspaceId,documentType,version,fields,lines}=snapshot;
  const previous=this.entries.get(instanceId);
  if(previous&&(previous.running||previous.payload!==previous.saved))
   throw new Error('Finish preserving current inputs before resuming.');
  const payload=JSON.stringify({fields,lines,...(snapshot.pendingSave?{pendingSave:snapshot.pendingSave}:{})});
  const entry={identity:{instanceId,userId,workspaceId,documentType},version,
   dirtySince:null,timer:null,running:null,payload,saved:payload,status:'saved'};
  this.entries.set(instanceId,entry);
  this.report(entry,'saved');
 }
 capture(identity,fields,lines){
  const key=identity.instanceId;
  let entry=this.entries.get(key);
  const pendingSave=entry?.payload?JSON.parse(entry.payload).pendingSave:undefined;
  const payload=JSON.stringify({fields,lines,...(pendingSave?{pendingSave}:{})});
  if(entry?.payload===payload&&entry.status!=='failed')return;
  if(!entry){
   entry={identity:{...identity},version:0,dirtySince:null,timer:null,running:null,payload:null,saved:null,status:'pending'};
   this.entries.set(key,entry);
  }
  entry.payload=payload;
  entry.dirtySince??=this.now();
  this.report(entry,'pending');
  this.arm(entry);
 }
 async checkpointSave(id,pendingSave){
  const entry=this.entries.get(id);
  if(!entry)return false;
  const payload=JSON.parse(entry.payload);
  if(pendingSave)payload.pendingSave=pendingSave;
  else delete payload.pendingSave;
  entry.payload=JSON.stringify(payload);
  return this.flush(id);
 }
 report(entry,status){
  entry.status=status;
  this.onStatus(entry.identity.instanceId,status);
 }
 arm(entry){
  if(entry.timer!==null)this.cancel(entry.timer);
  entry.timer=this.schedule(()=>{entry.timer=null;void this.flush(entry.identity.instanceId);},
   Math.max(0,Math.min(750,3000-(this.now()-entry.dirtySince))));
 }
 async flush(id){
  const entry=this.entries.get(id);
  if(!entry)return false;
  if(entry.timer!==null){this.cancel(entry.timer);entry.timer=null;}
  if(entry.running){const ok=await entry.running;if(!ok)return false;return entry.payload===entry.saved?true:this.flush(id);}
  if(entry.payload===entry.saved)return true;
  const payload=entry.payload;
  entry.dirtySince=null;
  this.report(entry,'saving');
  entry.running=(async()=>{
   try{
    const snapshot=createRecoverySnapshot({...entry.identity,...JSON.parse(payload),version:entry.version+1,updatedAt:this.now()});
    await this.store.save(snapshot);
    entry.version=snapshot.version;entry.saved=payload;
    this.report(entry,entry.payload===payload?'saved':'pending');
    return true;
   }catch{
    this.report(entry,'failed');
    return false;
   }
  })();
  const success=await entry.running;
  entry.running=null;
  if(this.entries.get(id)===entry&&entry.payload!==payload&&entry.timer===null){entry.dirtySince??=this.now();this.arm(entry);}
  return success;
 }
 flushAll(){return Promise.all([...this.entries.keys()].map(id=>this.flush(id)));}
 async discard(id){
  const entry=this.entries.get(id);
  if(!entry)return true;
  if(entry.timer!==null)this.cancel(entry.timer);
  entry.timer=null;
  if(entry.running)await entry.running;
  const removed=!entry.version||await this.store.remove(entry.identity.userId,entry.identity.workspaceId,entry.identity.documentType,id,entry.version);
  if(removed&&this.entries.get(id)===entry)this.entries.delete(id);
  return removed;
 }
}
