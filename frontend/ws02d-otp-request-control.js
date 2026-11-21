const STORAGE_KEY='apsyntra:ws02d:otp-send-cooldown:v1';
const BASE_COOLDOWN_MS=60_000;
const BACKOFF_MS=[60_000,120_000,240_000,480_000,900_000];

export function parseOtpRetryAfter(value,now=Date.now()){
 if(typeof value!=='string'||value.trim()==='')return 0;
 const raw=value.trim();
 if(/^\d+(?:\.\d+)?$/.test(raw)){
  const seconds=Number(raw);
  return Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds*1000):0;
 }
 const timestamp=Date.parse(raw);
 return Number.isFinite(timestamp)?Math.max(0,timestamp-now):0;
}

function resolveStorage(storage){
 if(storage!==undefined)return storage;
 try{return globalThis.localStorage}catch{return null}
}

function readState(storage,key,memory){
 try{
  const raw=storage?.getItem(key);
  if(typeof raw==='string'){
   const value=JSON.parse(raw);
   if(value&&Number.isFinite(value.notBefore)&&Number.isInteger(value.backoff)&&
      value.backoff>=0&&value.backoff<=BACKOFF_MS.length)
    return {notBefore:Math.max(0,value.notBefore),backoff:value.backoff,
     lockUntil:Number.isFinite(value.lockUntil)?Math.max(0,value.lockUntil):0,
     lockId:typeof value.lockId==='string'?value.lockId:''};
  }
 }catch{}
 return memory;
}

export function createOtpRequestControl({storage,now=()=>Date.now(),storageKey=STORAGE_KEY}={}){
 const target=resolveStorage(storage);
 let memory={notBefore:0,backoff:0,lockUntil:0,lockId:''};
 let inFlight=false,activeLockId='';
 const read=()=>readState(target,storageKey,memory);
 const write=value=>{
  memory=value;
  try{target?.setItem(storageKey,JSON.stringify(value))}catch{}
 };
 return Object.freeze({
  begin(){
   const current=read();
   if(inFlight||current.notBefore>now()||current.lockUntil>now())return false;
   const lockId=now().toString(36)+'-'+Math.random().toString(36).slice(2);
   write({...current,lockUntil:now()+60_000,lockId});
   if(read().lockId!==lockId)return false;
   activeLockId=lockId;inFlight=true;
   return true;
  },
  finish(){
   if(activeLockId){
    const current=read();
    if(current.lockId===activeLockId)write({...current,lockUntil:0,lockId:''});
   }
   activeLockId='';inFlight=false;
  },
  isInFlight(){return inFlight||read().lockUntil>now()},
  remaining(){const current=read();return Math.max(0,Math.max(current.notBefore,current.lockUntil)-now())},
  recordSuccess(){
   write({notBefore:now()+BASE_COOLDOWN_MS,backoff:0,lockUntil:0,lockId:''});
   activeLockId='';inFlight=false;
   return BASE_COOLDOWN_MS;
  },
  recordRateLimit(retryAfter){
   const current=read();
   const backoff=Math.min(BACKOFF_MS.length,current.backoff+1);
   const delay=Math.max(BACKOFF_MS[backoff-1],parseOtpRetryAfter(retryAfter,now()));
   write({notBefore:now()+delay,backoff,lockUntil:0,lockId:''});
   activeLockId='';inFlight=false;
   return delay;
  },
  recordUncertain(){
   const current=read();
   write({notBefore:now()+BASE_COOLDOWN_MS,backoff:current.backoff,lockUntil:0,lockId:''});
   activeLockId='';inFlight=false;
   return BASE_COOLDOWN_MS;
  }
 });
}
