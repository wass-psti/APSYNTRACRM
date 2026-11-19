/**
 * Crash/reload recovery marker for one signed TimeTracker clock action.
 * Contains only operation identity, never GPS, credentials, notes or raw attendance.
 * PostgreSQL remains the only authoritative attendance record.
 */
const PREFIX='apsyntra.tt.clock-pending.v1:';
const MAX_AGE_MS=24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=150;
const keyFor=({userId,workspaceId,boardId}={})=>
 [userId,workspaceId,boardId].every(value=>UUID.test(value||''))?
  PREFIX+[userId,workspaceId,boardId].join(':'):null;
const sameScope=(candidate,scope)=>
 candidate?.userId===scope?.userId&&candidate?.workspaceId===scope?.workspaceId&&
 candidate?.boardId===scope?.boardId;
const validPending=(p,scope,now)=>{
 if(!p||p.version!==1||!sameScope(p,scope)||
   !['clock-in','clock-out'].includes(p.action)||
   !Number.isSafeInteger(p.createdAt)||p.createdAt>now+60000||
   now-p.createdAt>MAX_AGE_MS||!Number.isSafeInteger(p.baselineRevision)||
   p.baselineRevision<0||!Array.isArray(p.previousRecordIds)||
   p.previousRecordIds.length>5000||
   !p.previousRecordIds.every(validId)||typeof p.location!=='string'||
   p.location.length>100||typeof p.department!=='string'||p.department.length>100||
   typeof p.receiptVerified!=='boolean')return false;
 if(p.action==='clock-in'&&p.recordId!==null&&!validId(p.recordId))return false;
 if(p.action==='clock-out'&&!validId(p.recordId))return false;
 return true;
};

/** Compare storage changes to the exact signed identity/workspace/board scope. */
export function timeTrackerPendingKeyMatches(key,scope){
 return key!==null&&key===keyFor(scope);
}

/** Storage is injected for deterministic testing and private-window fallback. */
export function createTimeTrackerPendingRecovery(storage,{now=()=>Date.now()}={}){
 const safe=(operation,fallback)=>{try{return operation();}catch{return fallback;}};
 function clear(scope){
  const key=keyFor(scope);
  if(key)safe(()=>storage?.removeItem(key),undefined);
 }
 function read(scope){
  const key=keyFor(scope);
  if(!key)return null;
  const raw=safe(()=>storage?.getItem(key),null);
  if(!raw)return null;
  let pending=null;
  try{pending=JSON.parse(raw);}catch{/* malformed marker is discarded */}
  if(!validPending(pending,scope,now())){clear(scope);return null;}
  const {version,createdAt,...context}=pending;
  return context;
 }
 function save(context){
  const key=keyFor(context);
  const instant=now();
  if(!key||!validPending({...context,version:1,createdAt:instant},context,instant))
   return false;
  return safe(()=>{
   const clean={version:1,createdAt:instant,
    userId:context.userId,workspaceId:context.workspaceId,boardId:context.boardId,
    action:context.action,recordId:context.recordId,baselineRevision:context.baselineRevision,
    previousRecordIds:[...context.previousRecordIds],location:context.location,
    department:context.department,receiptVerified:context.receiptVerified};
   storage?.setItem(key,JSON.stringify(clean));
   return Boolean(storage);
  },false);
 }
 return Object.freeze({read,save,clear});
}
