/** CP-BOARD-COL-DELETE — QA-only recoverable column acceptance adapter.
 * B5: default-off after signed QA acceptance and controlled deactivation.
 * Backend signed actor, board-manager rights, RLS and expiry remain authoritative.
 * Activity is an audit feed; private recovery RPCs own restoration.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {columnStoredValueCount} from './board-inline-context.js';

// Phase B5: previous time-limited QA recovery window is complete.
// Preserve the historical acceptance guard; no production UI recovery is enabled.
export const BOARD_COLUMN_RECOVERY_ENABLED=false;
export const B4_QA_BOARD_ID='8491b933-8aa7-4b10-816c-46b6758531f3';
export const B4_QA_BOARD_NAME='CP-BOARD-COL-DELETE QA Signed Fixture';
export const B4_QA_COLUMN_NAME='Recovery Status';
export const B4_QA_EXPIRES_AT=Date.parse('2026-11-06T04:07:34Z');
export function isQaBoardRecoveryInterfaceAllowed(detail,{
 enabled=BOARD_COLUMN_RECOVERY_ENABLED,now=Date.now()
}={}){
 const board=detail?.board;
 return enabled===true&&Number.isFinite(now)&&now<B4_QA_EXPIRES_AT&&
  board?.id===B4_QA_BOARD_ID&&board.name===B4_QA_BOARD_NAME&&
  board.status==='active';
}
export function canStartB4QaRecoveryDeletion(detail,column,{
 now=Date.now(),enabled=BOARD_COLUMN_RECOVERY_ENABLED
}={}){
 return isQaBoardRecoveryInterfaceAllowed(detail,{enabled,now})&&
  column?.name===B4_QA_COLUMN_NAME&&now<B4_QA_EXPIRES_AT-600000;
}
const fail=(message,status=403,code='')=>{throw new ApiError(message,status,code);};
const safeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const ensureReady=async(api,id,enabled,now)=>{
 if(enabled!==true||!Number.isFinite(now)||now>=B4_QA_EXPIRES_AT)
  fail('The time-limited QA recovery window is unavailable. No data changed.',503,'COL_RECOVERY_DISABLED');
 if(id!==B4_QA_BOARD_ID||typeof api?.rpc!=='function'||typeof api?.allowed!=='function')
  fail('Recovery is restricted to the approved QA fixture.',403,'COL_RECOVERY_DENIED');
 if(await api.allowed(id,'manage')!==true)
  fail('Only authorized board managers may recover columns.',403,'COL_RECOVERY_DENIED');
};
const currentRevision=detail=>{
 const revision=detail?.board?.updated_at;
 if(typeof revision!=='string'||!Number.isFinite(Date.parse(revision)))
  fail('Board revision is missing. Refresh the board before continuing.',409);
 return revision;
};
export function explainColumnDeleteError(error){
 const code=String(error?.code||'');
 const message=String(error?.message||'');
 // Server emits stable SQLSTATE plus domain-specific reason. Distinguish
 // protected objects, unavailable snapshots and true authorization denial.
 if(/COL_QA_SCOPE_DENIED/.test(message))
  return new ApiError('Column recovery is restricted to the approved time-limited QA board and signed actor. No changes were made.',403,code);
 if(/COL_(DELETE|RESTORE)_NOT_ACTIVATED|COL_RECOVERY_LIST_NOT_ACTIVATED/.test(message))
  return new ApiError('Recoverable column operations are not activated on the server. No stored values were removed.',503,code);
 if(/COL_(DELETE|RESTORE)_PROTECTED_BOARD/.test(message))
  return new ApiError('This archived or application-protected board cannot change or restore columns.',403,code);
 if(/COL_DELETE_PROTECTED_COLUMN|COL_RESTORE_SNAPSHOT_INTEGRITY/.test(message))
  return new ApiError('The required Item or application-owned column is protected and cannot be removed.',403,code);
 if(/COL_RESTORE_SNAPSHOT_UNAVAILABLE/.test(message))
  return new ApiError('This deleted column has no pending recovery snapshot or has already been restored.',409,code);
 if(/COL_(DELETE|RESTORE)_BOARD_NOT_FOUND/.test(message))
  return new ApiError('Board is unavailable in the current workspace. Refresh before continuing.',404,code);
 if(/COL_DELETE_FOREIGN_ITEM_BOUNDARY/.test(message))
  return new ApiError('Column values have invalid board relationships. Deletion was safely denied.',409,code);
 if(/COL_DELETE_CONFIRMATION_REQUIRED/.test(message))
  return new ApiError('The confirmation did not match the current column name. Refresh and retype it.',400,code);
 if(code==='42501'||error?.status===401||error?.status===403)
  return new ApiError('Column action denied. Verify your signed session and board-manager permissions.',403,code);
 if(code==='40001'||/COL_(DELETE|RESTORE)_STALE/.test(message))
  return new ApiError('Board or column values changed. Refresh and review before trying again.',409,code);
 if(/Column contains values/i.test(message))
  return new ApiError('This column now contains stored cell rows. Empty-only deletion was safely denied; refresh and use recoverable deletion when activated.',409,code);
 if(code==='23503'||/COL_RESTORE_ITEM_DEPENDENCY_MISSING/.test(message))
  return new ApiError('Column recovery requires existing item relationships. Restore missing items first.',409,code);
 if(code==='23505')
  return new ApiError('A conflicting column now exists or the board is full. Resolve it before restoring.',409,code);
 if(code==='22023')
  return new ApiError('The column confirmation or request was invalid. Review and retry.',400,code);
 return error;
}
function requireReceipt(result,{boardId,action,columnId=null,count=null}){
 if(!result||result.board_id!==boardId||result.action!==action||
  !validUuid(result.column_id)||!validUuid(result.deletion_id)||
  (columnId!==null&&result.column_id!==columnId)||
  (count!==null&&result.value_rows!==count)||
  typeof result.updated_at!=='string'||!Number.isFinite(Date.parse(result.updated_at))){
  const e=new ApiError('Recovery response was lost or invalid. Do not retry; refresh and inspect Activity.',409);
  e.schemaOutcomeUncertain=true;
  throw e;
 }
 return Object.freeze({
  boardId,action,columnId:result.column_id,deletionId:result.deletion_id,
  valueRows:result.value_rows,updatedAt:result.updated_at
 });
}
const request=async(api,name,args,expect)=>{
 let result;
 try{result=await api.rpc(name,args);}
 catch(error){
  if(!Number.isInteger(Number(error?.status))||Number(error?.status)<400||
    Number(error?.status)>=500){
   const uncertain=new ApiError(
    'The server may have completed this column operation. Do not retry; refresh the board and inspect Activity.',409);
   uncertain.schemaOutcomeUncertain=true;throw uncertain;
  }
  throw explainColumnDeleteError(error);
 }
 return requireReceipt(result,expect);
};
export class BoardColumnRecoveryClient{
 constructor(api){this.api=api;}
 async delete(detail,column,confirmation,{enabled=BOARD_COLUMN_RECOVERY_ENABLED,now=Date.now()}={}){
  const boardId=detail?.board?.id;
  await ensureReady(this.api,boardId,enabled,now);
  if(!isQaBoardRecoveryInterfaceAllowed(detail,{enabled,now})||
     column?.name!==B4_QA_COLUMN_NAME||now>=B4_QA_EXPIRES_AT-600000)
   fail('Only the verified Recovery Status fixture may be deleted with sufficient restoration time.',403);
  if(!column?.deletable||column.immutable||!validUuid(column.id)||
   typeof column.name!=='string')
   fail('The required Item and application-owned columns cannot be deleted.',403);
  if(confirmation!=='DELETE '+column.name)
   fail('Type DELETE '+column.name+' exactly to confirm.',400);
  const valueRows=columnStoredValueCount(detail,column.id);
  if(valueRows===0)fail('Use Delete Empty Column for columns without stored values.',400);
  return request(this.api,'wm_delete_board_column_recoverable',{
   p_board_id:boardId,p_column_id:column.id,
   p_expected_updated_at:currentRevision(detail),
   p_expected_value_count:valueRows,p_confirmation:confirmation
  },{boardId,action:'delete-recoverable',columnId:column.id,count:valueRows});
 }
 async list(boardId,{enabled=BOARD_COLUMN_RECOVERY_ENABLED,now=Date.now()}={}){
  await ensureReady(this.api,boardId,enabled,now);
  let result;
  try{result=await this.api.rpc('wm_list_recoverable_board_columns',{p_board_id:boardId});}
  catch(error){throw explainColumnDeleteError(error);}
  if(!Array.isArray(result)||result.length>100||result.some(x=>
    !validUuid(x?.deletion_id)||!validUuid(x?.column_id)||
    typeof x?.name!=='string'||x.name.length>80||
    !Number.isSafeInteger(x.value_rows)||x.value_rows<0||
    typeof x.deleted_at!=='string'||!Number.isFinite(Date.parse(x.deleted_at))||
    typeof x.restorable!=='boolean'))
   fail('Recovery list from server was invalid. No changes were made.',409);
  return result.map(x=>Object.freeze({
   deletionId:x.deletion_id,columnId:x.column_id,name:x.name,
   valueRows:x.value_rows,deletedAt:x.deleted_at,restorable:x.restorable
  }));
 }
 async restore(detail,entry,{enabled=BOARD_COLUMN_RECOVERY_ENABLED,now=Date.now()}={}){
  const boardId=detail?.board?.id;
  await ensureReady(this.api,boardId,enabled,now);
  if(!isQaBoardRecoveryInterfaceAllowed(detail,{enabled,now})||entry?.name!==B4_QA_COLUMN_NAME)
   fail('Only the verified QA fixture column may be restored.',403);
  if(!validUuid(entry?.deletionId)||!validUuid(entry?.columnId)||
   entry.restorable!==true)
   fail('This recovery snapshot is not ready to restore.',409);
  return request(this.api,'wm_restore_board_column_recoverable',{
   p_board_id:boardId,p_deletion_id:entry.deletionId,
   p_expected_updated_at:currentRevision(detail)
  },{boardId,action:'restore-recoverable',columnId:entry.columnId,count:entry.valueRows});
 }
}
export function renderBoardColumnRecoveryList(entries){
 if(!Array.isArray(entries)||entries.length===0)return '';
 return '<section class="panel" aria-labelledby="board-column-recovery-title">'+
  '<h3 id="board-column-recovery-title">Recoverable deleted columns</h3>'+
  '<p class="muted">Private snapshots preserve the original column and cell values. '+
  'Restoration requires active board-manager access and unchanged board revision.</p>'+
  '<ul>'+entries.map(e=>'<li><strong>'+safeHtml(e.name)+'</strong> · '+
    e.valueRows+' stored value'+(e.valueRows===1?'':'s')+' · '+
    safeHtml(new Date(e.deletedAt).toLocaleString('en-PH'))+
    '<button type="button" class="secondary" data-board-history-action="restore-column"'+
    ' data-id="'+safeHtml(e.deletionId)+'"'+(e.restorable?'':' disabled')+'>'+
    (e.restorable?'Restore column':'Restore items first')+'</button></li>').join('')+'</ul></section>';
}
