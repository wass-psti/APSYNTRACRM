/** CP-BIMP-15: durable recovery marker, never workbook contents or credentials.
 * The user must reselect the identical source and review the remaining mapping.
 * This does not retry unknown/uncertain writes or change backend authorization.
 */
import {buildImportPlan} from './board-import-core.js';
import {boardImportFingerprint} from './board-import-batches.js';
import {ApiError} from './session.js';

const VERSION=1;
const prefix='apsyntra:bimp15-recovery:';
const deny=message=>{throw new ApiError(message,409);};
export const durableRecoveryKey=(userId,boardId)=>prefix+userId+':'+boardId;
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function importDigest(value,crypt=globalThis.crypto){
 if(!crypt?.subtle?.digest)deny('Secure workbook recovery hashing is unavailable.');
 return hex(await crypt.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));
}
export async function sealImportRecovery({checkpoint,fullSheet,worksheetIndex=0,
 userId,matches,extendedReferences=false,completedOffset=0,
 sourceDigest,priorReceipt=null,storage=globalThis.localStorage,
 crypt=globalThis.crypto}={}){
 const completed=completedOffset+checkpoint?.completed;
 if(!checkpoint||!fullSheet?.rows||!Number.isSafeInteger(completed)||
   completed<=0||completed>=fullSheet.rows.length||!userId||!storage)
  deny('No verified import prefix is available for durable recovery.');
 if(checkpoint.approvedPlan?.payload?.rows?.length!==fullSheet.rows.length-completedOffset)
  deny('The reviewed import remainder no longer matches its source.');
 const remaining={...fullSheet,rows:fullSheet.rows.slice(completed),
  rowNumbers:fullSheet.rowNumbers?.slice(completed),
  omittedRowsConfirmed:true,formulaWarningsConfirmed:true};
 const plan=buildImportPlan({sheet:remaining,detail:checkpoint.detail,
  mappings:checkpoint.mappings,group:checkpoint.group,matches,
  allowColumns:false,extendedReferences});
 const expected=checkpoint.approvedPlan.readback.rows.slice(checkpoint.completed)
  .map(row=>row.outcome);
 if(JSON.stringify(plan.readback.rows.map(row=>row.outcome))!==JSON.stringify(expected))
  deny('Remaining import outcomes changed. Do not record an automatic recovery marker.');
 const marker={version:VERSION,userId,boardId:checkpoint.boardId,
  workspaceId:checkpoint.workspaceId,worksheetIndex,
  sourceDigest:sourceDigest||await importDigest(fullSheet,crypt),
  boardDigest:await importDigest(boardImportFingerprint(checkpoint.detail),crypt),
  remainingDigest:await importDigest(plan.payload,crypt),
  completed,rows:fullSheet.rows.length,batchSize:checkpoint.batchSize,
  receipt:priorReceipt?Object.fromEntries(
   ['created','updated','skipped','columnsCreated','groupsCreated'].map(k=>
    [k,(priorReceipt[k]||0)+(checkpoint.receipt[k]||0)])):{...checkpoint.receipt},
  groupId:checkpoint.group.groupId,
  behavior:matches.behavior,matchColumnId:matches.matchColumnId,
  extendedReferences};
 storage.setItem(durableRecoveryKey(userId,checkpoint.boardId),JSON.stringify(marker));
 return marker;
}
export function readImportRecovery({storage=globalThis.localStorage,userId,boardId}={}){
 if(!storage||!userId||!boardId)return null;
 let marker;
 try{marker=JSON.parse(storage.getItem(durableRecoveryKey(userId,boardId))||'null');}
 catch{return null;}
 return marker?.version===VERSION&&marker.userId===userId&&marker.boardId===boardId&&
  typeof marker.sourceDigest==='string'&&typeof marker.boardDigest==='string'&&
  typeof marker.remainingDigest==='string'&&Number.isInteger(marker.completed)&&
  marker.completed>0&&marker.completed<marker.rows?marker:null;
}
export function clearImportRecovery({storage=globalThis.localStorage,userId,boardId}={}){
 try{storage?.removeItem(durableRecoveryKey(userId,boardId));}
 catch{/* Browser storage can be unavailable; never mask a committed import. */}
}
export async function verifyImportRecovery({marker,fullSheet,worksheetIndex,
 detail,mappings,group,matches,userId,workspaceId,extendedReferences=false,
 crypt=globalThis.crypto}={}){
 if(!marker||marker.userId!==userId||marker.workspaceId!==workspaceId||
  marker.boardId!==detail?.board?.id||marker.worksheetIndex!==worksheetIndex||
  marker.rows!==fullSheet?.rows?.length||marker.groupId!==group?.groupId||
  group?.action!=='existing'||marker.behavior!==matches?.behavior||
  marker.matchColumnId!==matches?.matchColumnId||
  marker.extendedReferences!==extendedReferences)
  deny('Recovery metadata does not match this signed board, worksheet or import setup.');
 if(await importDigest(fullSheet,crypt)!==marker.sourceDigest)
  deny('The source worksheet differs from the previously verified import.');
 if(await importDigest(boardImportFingerprint(detail),crypt)!==marker.boardDigest)
  deny('The destination board has changed since the verified import prefix. Reconcile before importing.');
 const remainder={...fullSheet,rows:fullSheet.rows.slice(marker.completed),
  rowNumbers:fullSheet.rowNumbers?.slice(marker.completed),
  omittedRowsConfirmed:true,formulaWarningsConfirmed:true};
 const plan=buildImportPlan({sheet:remainder,detail,mappings,group,matches,
  allowColumns:false,extendedReferences});
 if(await importDigest(plan.payload,crypt)!==marker.remainingDigest)
  deny('The remaining import mapping, values or duplicate outcomes differ from the verified checkpoint.');
 return {remainder,plan};
}
