/** CP-BOARD-INLINE-01. Only ordinary custom columns are mutable inline.
 * These helpers never grant permission; the authoritative manager RPC checks
 * signed identity, workspace, CAS revision, and data-loss protections.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
import {describeBoardColumns,BOARD_STRUCTURE_TYPES} from './board-structure-admin.js';
import {canManuallyEditBoard} from './board-inline-items.js';
const fail=(message,status=403)=>{throw new ApiError(message,status);};
export function resolveInlineColumn(detail,key,{canManage=false}={}){
 if(!canManage||!canManuallyEditBoard(detail?.board,true))
  fail('Only authorized ordinary-board managers can change columns inline.');
 if(key==='record')return {kind:'primary',name:'Item',key};
 if(typeof key!=='string'||!key.startsWith('col:')||!validUuid(key.slice(4)))
  fail('Only an ordinary custom column is configurable here.');
 const column=describeBoardColumns(detail).find(c=>c.id===key.slice(4));
 if(!column?.deletable||column.immutable||column.kind!=='custom')
  fail('Primary and application-owned columns cannot be modified.');
 return column;
}
export function columnStoredValueCount(detail,columnId){
 if(!validUuid(columnId))return 0;
 // Match PostgreSQL count(*) for persisted cell rows, including SQL NULL.
 let count=0;
 for(const value of detail?.values||[]){
  if(value.column_id===columnId)count++;
 }
 return count;
}
export function prepareInlineColumnUpdate(detail,column,form){
 if(!column?.deletable||!validUuid(column.id)||!form)
  fail('Only authorized custom columns may be updated.');
 const name=String(form.get('name')||'').trim();
 const type=String(form.get('type')||'');
 if(!name||name.length>80||!BOARD_STRUCTURE_TYPES.includes(type))
  fail('A valid name and supported column type are required.',400);
 if(type!==column.type&&columnStoredValueCount(detail,column.id)>0)
  fail('This column contains persisted data. Clear or migrate values before changing its type.',409);
 return {name,type,visible:form.has('visible')};
}
export function confirmInlineColumnDelete(column,confirmation){
 if(!column?.deletable||!validUuid(column.id))
  fail('Only ordinary custom columns may be deleted.');
 const expected='DELETE '+column.name;
 if(confirmation!==expected)
  fail('Type '+expected+' exactly to confirm deletion.',400);
 return expected;
}

/** Project only a verified, committed name-only CAS receipt into the existing
 * signed board snapshot. A subsequent signed refresh remains authoritative.
 * Never use this for type, visibility, or option mutations.
 */
export function projectConfirmedColumnRename(detail,{columnId,name,receipt,expectedRevision}={}){
 if(!detail?.board||detail.board.updated_at!==expectedRevision||
    receipt?.action!=='update'||receipt.board_id!==detail.board.id||
    receipt.column_id!==columnId||!validUuid(columnId)||
    typeof receipt.updated_at!=='string'||!Number.isFinite(Date.parse(receipt.updated_at))||
    typeof name!=='string'||!name.trim()||name.length>80||
    !Array.isArray(detail.columns))return null;
 const index=detail.columns.findIndex(c=>c.id===columnId);
 if(index<0)return null;
 const columns=[...detail.columns];
 columns[index]={...columns[index],name};
 return {...detail,board:{...detail.board,updated_at:receipt.updated_at},columns};
}
