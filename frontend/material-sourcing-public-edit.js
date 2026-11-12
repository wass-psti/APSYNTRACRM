/** Existing signed board CAS contract for ordinary Material Sourcing fields. */
import {ApiError} from './session.js';
import {materialAddPublicColumns} from './material-sourcing-add-material.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP} from './material-sourcing-schema-plan.js';
const fail=message=>{throw new ApiError(message,400)};
const MAPPING=Object.freeze({source:'sourceType',rfq:'rfq',description:'description',
 brand:'brand',quantity:'quantity',due:'due',lead:'lead'});
const numberFields=new Set(['quantity','lead']);
function parsed(key,raw){
 const value=String(raw??'').trim();
 if(key==='partNumber'){
  if(!value||value.length>240)fail('Part number must contain 1–240 characters.');
  return value;
 }
 if(key==='source'){
  if(value&&!['Local','Import'].includes(value))fail('Select Local or Import.');
  return value||null;
 }
 if(numberFields.has(key)){
  if(!value)return null;
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)||value.length>20||
   !Number.isFinite(Number(value))||Number(value)>1e12)fail('Enter a nonnegative number.');
  return Number(value);
 }
 if(key==='due'){
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||
   Number.isNaN(Date.parse(value+'T00:00:00Z'))||
   new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)
   fail('Enter a valid required date.');
  return value;
 }
 if(value.length>(key==='description'?2000:240))fail('Material value is too long.');
 return value||null;
}
export function planMaterialSourcingPublicChanges(detail,itemId,draft){
 if(detail?.board?.id!==MATERIAL_SOURCING_BOARD_ID)fail('Material board unavailable.');
 const item=detail.items?.find(row=>row.id===itemId&&
  row.group_id===MATERIAL_SOURCING_GROUP.id&&!row.archived_at);
 if(!item)fail('Material is not in Main group.');
 const columns=materialAddPublicColumns(detail),changes=[];
 for(const [key,raw] of Object.entries(draft||{})){
  if(key!=='partNumber'&&!Object.hasOwn(MAPPING,key))fail('Unknown material field.');
  const columnId=key==='partNumber'?null:columns[MAPPING[key]];
  if(key!=='partNumber'&&!columnId)fail('The material column is unavailable.');
  const existing=columnId===null?item.title:
   (detail.values||[]).find(cell=>cell.item_id===itemId&&cell.column_id===columnId)?.value??null;
  const value=parsed(key,raw);
  if(value===existing)continue;
  changes.push(Object.freeze({key,columnId,value,expectedValue:existing}));
 }
 return Object.freeze(changes);
}
export async function saveMaterialSourcingPublicChange({api,itemId,change}){
 await api.setBoardCellCas(itemId,change.columnId,change.value,change.expectedValue);
}
export function verifyMaterialSourcingPublicChanges(detail,itemId,changes){
 const columns=materialAddPublicColumns(detail),item=detail?.items?.find(i=>i.id===itemId);
 if(!item||item.group_id!==MATERIAL_SOURCING_GROUP.id)return false;
 return changes.every(change=>{
  const id=change.columnId;
  if(id===null)return item.title===change.value;
  if(!Object.values(columns).includes(id))return false;
  const current=(detail.values||[]).find(v=>v.item_id===itemId&&v.column_id===id)?.value??null;
  return current===change.value;
 });
}
