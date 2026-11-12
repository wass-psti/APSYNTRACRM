/** BIMP-13: bounded, sequential, readback-verified ordinary-board import.
 * Every batch continues to use m143-v1, never per-item mutations.
 */
import {buildImportPlan,executeBoardImport} from './board-import-core.js';
import {ApiError} from './session.js';

// Keep ordinary import transactions small enough for the existing signed
// HTTP request deadline. A 617-row file must not become one long ambiguous write.
export const IMPORT_BATCH_SIZE=200;
const fail=message=>{throw new ApiError(message,409);};
const sum=(a,b)=>({
 created:a.created+b.created,updated:a.updated+b.updated,
 skipped:a.skipped+b.skipped,columnsCreated:a.columnsCreated+b.columnsCreated,
 groupsCreated:a.groupsCreated+b.groupsCreated
});
const blank=()=>({created:0,updated:0,skipped:0,columnsCreated:0,groupsCreated:0});
// Checkpoint is deliberately in-memory only: it is bound to the exact reviewed
// workbook/plan and signed board snapshot. No source data or personal cells
// are copied into localStorage or an unaudited server-side queue.
export function boardImportFingerprint(detail){
 if(!detail?.board?.id||!detail?.board?.workspace_id)fail('Board readback is incomplete.');
 const sorted=(values,key)=>[...(values||[])].sort((a,b)=>key(a).localeCompare(key(b)));
 return JSON.stringify({board:detail.board,
  groups:sorted(detail.groups,x=>x.id),
  columns:sorted(detail.columns,x=>x.id),
  items:sorted(detail.items,x=>x.id),
  values:sorted(detail.values,x=>x.item_id+':'+x.column_id)});
}
function safeCheckpoint({approvedPlan,detail,mappings,group,completed,receipt,batchSize}){
 return {approvedPlan,boardId:detail.board.id,workspaceId:detail.board.workspace_id,
  fingerprint:boardImportFingerprint(detail),detail,mappings,group,
  completed,receipt:{...receipt},batchSize};
}

function nextMappings(mappings,before,after){
 const originalIds=new Set((before.columns||[]).map(column=>column.id));
 return mappings.map(mapping=>{
  if(mapping.action!=='create')return mapping;
  const matches=(after.columns||[]).filter(column=>
   !originalIds.has(column.id)&&column.name===mapping.name&&
   column.data_type===(mapping.columnType||mapping.type));
  if(matches.length!==1)fail('A created import column cannot be uniquely matched to its persisted destination.');
  return {...mapping,action:'existing',columnId:matches[0].id,requiresDecision:false};
 });
}
function nextGroup(group,before,after){
 if(group.action==='existing')return group;
 const originalIds=new Set((before.groups||[]).map(entry=>entry.id));
 const matches=(after.groups||[]).filter(entry=>
  !originalIds.has(entry.id)&&entry.title===group.name);
 if(matches.length!==1)fail('The new import group cannot be uniquely identified after commit.');
 return {action:'existing',groupId:matches[0].id};
}

export async function executeBoardImportBatched({api,auth,detail,sheet,mappings,
 group,matches,allowColumns=false,extendedReferences=false,approvedPlan,onProgress=()=>{},
 batchSize=IMPORT_BATCH_SIZE,resumeFrom=null,onCheckpoint=()=>{}}={}){
 if(!approvedPlan||!sheet?.rows?.length||!Array.isArray(mappings)||
    !Number.isInteger(batchSize)||batchSize<1||batchSize>5000)
  throw new ApiError('Reviewed import plan and a valid batch size are required.',400);
 const original=buildImportPlan({sheet,detail,mappings,group,matches,allowColumns,extendedReferences});
 if(original.boardId!==approvedPlan.boardId||
    original.boardRevision!==approvedPlan.boardRevision||
    JSON.stringify(original.payload)!==JSON.stringify(approvedPlan.payload))
  fail('Import mapping changed after final review. Review again before importing.');
 const total=Math.ceil(sheet.rows.length/batchSize);
 let currentDetail=detail,currentMappings=mappings,currentGroup=group;
 let receipt=blank(),completed=0;
 if(resumeFrom){
  if(resumeFrom.approvedPlan!==approvedPlan||
     resumeFrom.boardId!==approvedPlan.boardId||
     resumeFrom.workspaceId!==approvedPlan.workspaceId||
     resumeFrom.batchSize!==batchSize||
     !Number.isInteger(resumeFrom.completed)||
     resumeFrom.completed<=0||resumeFrom.completed>=sheet.rows.length||
     resumeFrom.completed%batchSize!==0)
   fail('This resume checkpoint does not match the original reviewed workbook or batch boundaries.');
  const signed=await auth?.getVerifiedUser?.(),ctx=await api?.context?.();
  if(signed?.id!==auth?.userId||ctx?.user_id!==signed.id||
     ctx?.workspace_id!==approvedPlan.workspaceId||ctx?.profile?.status!=='active')
   fail('The signed user or active workspace changed. Re-review the import.');
  const fresh=await api.board(approvedPlan.boardId);
  if(boardImportFingerprint(fresh)!==resumeFrom.fingerprint)
   fail('The board changed after the last verified batch. Re-review before resuming.');
  currentDetail=fresh;currentMappings=resumeFrom.mappings;
  currentGroup=resumeFrom.group;receipt={...resumeFrom.receipt};
  completed=resumeFrom.completed;
 }
 let checkpoint=resumeFrom;
 for(let batch=completed/batchSize;batch<total;batch++){
  const start=batch*batchSize,end=Math.min(sheet.rows.length,start+batchSize);
  try{
   const part={...sheet,rows:sheet.rows.slice(start,end),
    rowNumbers:sheet.rowNumbers?.slice(start,end),
    // The whole workbook was reviewed before the first write. Every batch
    // is a subset of those acknowledged source rows.
    omittedRows:[],formulaWarnings:[],omittedRowsConfirmed:true,
    formulaWarningsConfirmed:true};
   const plan=buildImportPlan({sheet:part,detail:currentDetail,
    mappings:currentMappings,group:currentGroup,matches,
    allowColumns:batch===0&&allowColumns,extendedReferences});
   // Cross-batch outcome must match what the user approved for the whole file.
   const expected=approvedPlan.readback.rows.slice(start,end).map(row=>row.outcome);
   const actual=plan.readback.rows.map(row=>row.outcome);
   if(JSON.stringify(expected)!==JSON.stringify(actual))
    fail('Import duplicate outcomes changed between batches. Stop and reconcile existing records.');
   const confirmed=await executeBoardImport({api,auth,plan});
   // executeBoardImport already verified the committed rows. Preserve that
   // evidence even if subsequent state retrieval is unavailable.
   receipt=sum(receipt,confirmed);completed=end;
   // A second read is only needed to resolve new group/column IDs for the
   // next transaction. A failed read here must never imply rollback.
   let after,updatedMappings,updatedGroup;
   try{
    after=await api.board(plan.boardId);
    if(after?.board?.workspace_id!==plan.workspaceId||
       after?.board?.id!==plan.boardId)fail('The committed board is no longer in the reviewed workspace.');
    updatedMappings=nextMappings(currentMappings,currentDetail,after);
    updatedGroup=nextGroup(currentGroup,currentDetail,after);
   }catch(cause){
    const error=new ApiError('A verified batch committed but its next-batch state could not be reconciled. Close the wizard and refresh the destination board before continuing.',409);
    error.importOutcomeUncertain=true;error.cause=cause;throw error;
   }
   currentMappings=updatedMappings;currentGroup=updatedGroup;currentDetail=after;
   checkpoint=completed<sheet.rows.length?safeCheckpoint({
    approvedPlan,detail:currentDetail,mappings:currentMappings,group:currentGroup,
    completed,receipt,batchSize}):null;
   // Recovery marker failure cannot undo a successfully verified batch.
   // A stale marker is rejected by the fresh-board fingerprint on reentry.
   if(checkpoint)try{await onCheckpoint(checkpoint);}catch{/* No silent retry. */}
   // Visual progress feedback must never turn a verified commit into a retry.
   try{onProgress({batch:batch+1,total,completed,rows:sheet.rows.length,receipt:{...receipt}});}
   catch{/* Rendering failure does not change the committed import state. */}
  }catch(error){
   error.importBatchProgress={completed,totalRows:sheet.rows.length,
    committedBatches:batch,receipt:{...receipt},
    outcomeUncertain:error.importOutcomeUncertain===true};
   // Only a definitively rejected batch can be resumed. A transport failure
   // may already have committed its entire transaction and is never retried.
   if(!error.importOutcomeUncertain&&checkpoint)
    error.importBatchResume=checkpoint;
   throw error;
  }
 }
 return {...receipt,batches:total,rowsProcessed:completed};
}
