import {recoveryScope,validateRecoverySnapshot} from './draft-recovery-state.js';
export const RECOVERY_DB='apsyntra-tradelink-recovery';
export const RECOVERY_LIMIT=20;
const STORE='inputs';
const requestResult=request=>new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error||new Error('Recovery request failed.'));
});
const transactionDone=transaction=>{
 const done=new Promise((resolve,reject)=>{
 transaction.oncomplete=resolve;
 transaction.onabort=()=>reject(transaction.error||new Error('Recovery transaction aborted.'));
 transaction.onerror=()=>reject(transaction.error||new Error('Recovery transaction failed.'));
 });
 // A request can reject before the transaction abort event. Observe both.
 void done.catch(()=>{});
 return done;
};
export class TradeLinkRecoveryStore{
 constructor({idb}={}){
  try{this.idb=idb===undefined?globalThis.indexedDB:idb;}catch{this.idb=null;}
  this.database=null;
 }
 async open(){
  if(!this.idb)throw new Error('Local recovery storage is unavailable.');
  if(!this.database){
   this.database=new Promise((resolve,reject)=>{
    const request=this.idb.open(RECOVERY_DB,1);
    request.onupgradeneeded=()=>{
     const store=request.result.createObjectStore(STORE,{keyPath:'key'});
     store.createIndex('scope','scope',{unique:false});
    };
    request.onsuccess=()=>{
     const database=request.result;
     database.onversionchange=()=>{database.close();this.database=null;};
     resolve(database);
    };
    request.onerror=()=>reject(request.error||new Error('Recovery storage unavailable.'));
    request.onblocked=()=>reject(new Error('Recovery storage upgrade blocked.'));
   }).catch(error=>{this.database=null;throw error;});
  }
  return this.database;
 }
 async list(userId,workspaceId,documentType){
  const scope=recoveryScope(userId,workspaceId,documentType);
  const database=await this.open();
  const transaction=database.transaction(STORE,'readonly');
  const done=transactionDone(transaction);
  const rows=await requestResult(transaction.objectStore(STORE).index('scope').getAll(scope));
  await done;
  return rows.filter(row=>{try{return validateRecoverySnapshot(row).scope===scope;}catch{return false;}})
   .sort((a,b)=>b.updatedAt-a.updatedAt||a.key.localeCompare(b.key));
 }
 async save(snapshot){
  validateRecoverySnapshot(snapshot);
  const database=await this.open();
  const transaction=database.transaction(STORE,'readwrite');
  const done=transactionDone(transaction);
  const store=transaction.objectStore(STORE);
  const current=await requestResult(store.get(snapshot.key));
  if((current&&current.version!==snapshot.version-1)||(!current&&snapshot.version!==1)){
   await done;throw new Error('Recovery snapshot version conflict.');
  }
  if(!current&&await requestResult(store.count())>=RECOVERY_LIMIT){
   await done;throw new Error('Local recovery storage is full. Discard an unfinished document first.');
  }
  await requestResult(store.put(snapshot));
  await done;
  return snapshot;
 }
 async remove(userId,workspaceId,documentType,instanceId,version){
  const scope=recoveryScope(userId,workspaceId,documentType);
  const database=await this.open();
  const transaction=database.transaction(STORE,'readwrite');
  const done=transactionDone(transaction);
  const store=transaction.objectStore(STORE);
  const key=scope+':'+String(instanceId).toLowerCase();
  const current=await requestResult(store.get(key));
  if(!current||current.version!==version){await done;return false;}
  await requestResult(store.delete(key));
  await done;return true;
 }
}
