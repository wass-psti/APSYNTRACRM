/** APSYNTRA CRM Priority 4: bounded, non-sensitive board-layout preferences only.
 * Data rows, credentials, documents, GPS, role grants and API payloads are forbidden.
 * The cache never authorizes a board view; hydrate only after signed view access.
 */
import {preferenceKey} from './board-presentation.js';
export const PREFERENCE_DB='apsyntra-public-ui-preferences';
export const PREFERENCE_SCHEMA=1;
export const PREFERENCE_STORE='board-layouts';
export const PREFERENCE_TTL_MS=30*24*60*60*1000;
export const PREFERENCE_ENTRY_LIMIT=48;
export const PREFERENCE_MAX_BYTES=4096;
const KEY=/^(?:record|status|actions|[a-z][a-z0-9_-]{0,63}|col:[0-9a-f-]{36})$/i;
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SCOPED_KEY=new RegExp('^apsyntra\\.board-layout\\.v1:'+UUID+':'+UUID+':'+UUID+'$','i');
const safeArray=(value)=>Array.isArray(value)&&value.length<=64&&
 value.every(key=>typeof key==='string'&&KEY.test(key));
const safeLayout=(layout)=>{
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||
  Object.keys(layout).length!==4||
  !Object.keys(layout).every(key=>['tabs','columns','hidden','widths'].includes(key))||
  !safeArray(layout.tabs)||!safeArray(layout.columns)||!safeArray(layout.hidden)||
  !layout.widths||typeof layout.widths!=='object'||Array.isArray(layout.widths))return false;
 const widths=Object.entries(layout.widths);
 return widths.length<=64&&widths.every(([key,value])=>KEY.test(key)&&
  Number.isInteger(value)&&value>=110&&value<=520);
};
const validatePayload=(raw)=>{
 if(typeof raw!=='string'||raw.length>PREFERENCE_MAX_BYTES)return null;
 try{
  const parsed=JSON.parse(raw);
  return safeLayout(parsed)?JSON.stringify(parsed):null;
 }catch{return null;}
};
const settled=request=>new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error||new Error('IndexedDB request failed'));
});
const transactionDone=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;
 tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));
 tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
});
export class BoardPreferenceStore{
 constructor({idb,now=()=>Date.now()}={}){
  try{this.idb=idb===undefined?globalThis.indexedDB:idb;}
  catch{this.idb=null;}
  this.now=now;this.memory=new Map();this.epoch=0;
  this.pending=new Map();this.dbPromise=null;
 }
 clearMemory(){this.epoch++;this.memory.clear();}
 getItem(key){return this.memory.get(key)??null;}
 setItem(key,value){
  if(!this.#validKey(key))return;
  const payload=validatePayload(value);
  if(payload===null)return;
  this.memory.set(key,payload);
  this.#queue(key,()=>this.#write(key,payload));
 }
 removeItem(key){
  if(!this.#validKey(key))return;
  this.memory.delete(key);
  this.#queue(key,()=>this.#delete(key));
 }
 #validKey(key){return typeof key==='string'&&SCOPED_KEY.test(key);}
 #queue(key,callback){
  const previous=this.pending.get(key)||Promise.resolve();
  const next=previous.catch(()=>{}).then(callback).catch(()=>false);
  this.pending.set(key,next);
  void next.finally(()=>{if(this.pending.get(key)===next)this.pending.delete(key);});
  return next;
 }
 async #open(){
  if(!this.idb?.open)return null;
  if(!this.dbPromise){
   this.dbPromise=new Promise((resolve,reject)=>{
    const request=this.idb.open(PREFERENCE_DB,PREFERENCE_SCHEMA);
    request.onupgradeneeded=()=>{
     const db=request.result;
     if(!db.objectStoreNames.contains(PREFERENCE_STORE))
      db.createObjectStore(PREFERENCE_STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>{
     const db=request.result;
     db.onversionchange=()=>{db.close();this.dbPromise=null;};
     resolve(db);
    };
    request.onerror=()=>reject(request.error||new Error('IndexedDB unavailable'));
    request.onblocked=()=>reject(new Error('IndexedDB version upgrade blocked'));
   }).catch(()=>null);
  }
  return this.dbPromise;
 }
 async #read(key){
  const db=await this.#open();if(!db)return null;
  const tx=db.transaction(PREFERENCE_STORE,'readonly');
  const result=await settled(tx.objectStore(PREFERENCE_STORE).get(key));
  await transactionDone(tx);
  return result;
 }
 async #delete(key){
  const db=await this.#open();if(!db)return false;
  const tx=db.transaction(PREFERENCE_STORE,'readwrite');
  tx.objectStore(PREFERENCE_STORE).delete(key);
  await transactionDone(tx);return true;
 }
 async #write(key,value){
  const db=await this.#open();if(!db)return false;
  const tx=db.transaction(PREFERENCE_STORE,'readwrite');
  const store=tx.objectStore(PREFERENCE_STORE);
  const current=await settled(store.getAll());
  const now=this.now();
  const keep=current.filter(row=>row&&typeof row.key==='string'&&
    row.expiresAt>now&&row.key!==key).sort((a,b)=>b.updatedAt-a.updatedAt)
   .slice(0,PREFERENCE_ENTRY_LIMIT-1);
  const allowed=new Set(keep.map(row=>row.key));
  for(const row of current)if(row&&row.key!==key&&!allowed.has(row.key))store.delete(row.key);
  store.put({key,value,schema:PREFERENCE_SCHEMA,updatedAt:now,
   expiresAt:now+PREFERENCE_TTL_MS});
  await transactionDone(tx);return true;
 }
 async hydrate(context,boardId,{legacyStorage}={}){
  const key=preferenceKey(context,boardId);
  if(!key)return false;
  // Storage getters themselves can throw when browser storage is restricted.
  let legacy=legacyStorage;
  if(legacy===undefined){try{legacy=globalThis.localStorage;}catch{legacy=null;}}
  const epoch=this.epoch;
  let live=true;
  // A broken or blocked IndexedDB transaction must never trap the board
  // loading screen. A timed-out result must never mutate the visible layout.
  const work=(async()=>{
   // Serialize against pending writes/reset in this tab. Another tab remains
   // scoped by the complete signed user/workspace/board key.
   await this.pending.get(key)?.catch(()=>{});
   if(!live||epoch!==this.epoch)return false;
   let previous=null;
   try{previous=legacy?.getItem(key)}catch{}
   const validLegacy=validatePayload(previous);
   if(validLegacy!==null){
    this.memory.set(key,validLegacy);
    const saved=await this.#queue(key,()=>this.#write(key,validLegacy));
    if(saved){try{legacy?.removeItem(key)}catch{}}
    return saved;
   }
   const row=await this.#read(key);
   if(!live||epoch!==this.epoch||!row)return false;
   if(row.schema!==PREFERENCE_SCHEMA||row.expiresAt<=this.now()||
      row.updatedAt>this.now()+60000||validatePayload(row.value)===null){
    await this.#queue(key,()=>this.#delete(key));return false;
   }
   this.memory.set(key,row.value);return true;
  })();
  let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>{live=false;resolve(false);},1200)});
  try{return await Promise.race([work,deadline]);}
  catch{return false;}
  finally{clearTimeout(timer);live=false;}
 }
 async flush(){await Promise.all([...this.pending.values()]);}
}
