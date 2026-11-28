// Historical supplier and PO references are not a supplier master or verified
// material links. Read the existing source board with its own signed access.
import {authorizeMaterialSourcingViewer,revalidateMaterialSourcingSession} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID} from '../../material-sourcing-schema-plan.js';
import {validUuid} from '../../data.js';

export const SUPPLIER_PO_BOARD_ID='aa0d8acb-5f0e-4628-b0b4-76ef369b9f51';
const SOURCE_NAME='Supplier PO Procurement';
const normalize=value=>String(value??'').trim().toLowerCase();
const fail=message=>{throw Error(message);};
const FIELDS=Object.freeze({
 supplier:'Supplier Name',date:'Supplier PO Date',clientReference:'Client Purchase Orders',
 legacyMaterialReference:'link to Material Sourcing Requests'
});

export function projectProcurementReferences(detail,workspaceId){
 if(detail?.board?.id!==SUPPLIER_PO_BOARD_ID||detail.board.name!==SOURCE_NAME||
    detail.board.workspace_id!==workspaceId||detail.board.status!=='active'||
    !Array.isArray(detail.items)||!Array.isArray(detail.columns)||!Array.isArray(detail.values)||
    detail.pagination?.loaded!==true||detail.pagination.has_more!==false)
  fail('Complete signed Supplier PO Procurement data is unavailable.');
 const columns={};
 for(const [key,name] of Object.entries(FIELDS)){
  const matches=detail.columns.filter(c=>c.name===name);
  if(matches.length!==1||!validUuid(matches[0].id))fail('Procurement reference columns changed. Refresh the source board.');
  columns[key]=matches[0].id;
 }
 const seen=new Set(),byItem=new Map();
 for(const value of detail.values){
  if(!Object.values(columns).includes(value.column_id))continue;
  const key=value.item_id+':'+value.column_id;
  if(seen.has(key))fail('Procurement source contains duplicate reference cells.');
  seen.add(key);
  const values=byItem.get(value.item_id)||{};
  const name=Object.keys(columns).find(k=>columns[k]===value.column_id);
  // Source references are legacy strings. Do not infer links from text.
  if(value.value!==null&&typeof value.value!=='string')fail('Procurement source reference format changed.');
  values[name]=String(value.value??'').trim();byItem.set(value.item_id,values);
 }
 const ids=new Set(),records=[];
 for(const item of detail.items){
  if(!validUuid(item.id)||item.board_id!==SUPPLIER_PO_BOARD_ID||ids.has(item.id)||typeof item.title!=='string')
   fail('Invalid procurement source identity.');
  ids.add(item.id);
  if(item.archived_at)continue;
  const values=byItem.get(item.id)||{};
  records.push({id:item.id,reference:item.title,supplier:values.supplier||'',date:values.date||'',
   clientReference:values.clientReference||'',legacyMaterialReference:values.legacyMaterialReference||''});
 }
 // Only exact names after whitespace/case normalization are grouped, never
 // fuzzy-matched or treated as a canonical organization identity.
 const groups=new Map();
 for(const record of records){
  if(!record.supplier)continue;
  const key=normalize(record.supplier);
  if(!groups.has(key))groups.set(key,{name:record.supplier,count:0});
  groups.get(key).count++;
 }
 const suppliers=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
 return {records,suppliers,unnamed:records.filter(r=>!r.supplier).length};
}
export function filterProcurementReferences(records,search='',supplier=''){
 const term=normalize(search),name=normalize(supplier);
 return records.filter(r=>(!name||normalize(r.supplier)===name)&&
  (!term||[r.reference,r.supplier,r.clientReference,r.legacyMaterialReference,r.id]
   .some(value=>normalize(value).includes(term))));
}
export async function readProcurementReferences({api,auth,workspaceId,isCurrent=()=>true}){
 const actor=auth.userId,scope={api,auth,workspaceId,boardId:MATERIAL_SOURCING_BOARD_ID,
  itemId:'00000000-0000-4000-8000-000000000000'};
 await authorizeMaterialSourcingViewer(scope);
 if(!isCurrent())fail('Material Sourcing view changed.');
 if(await api.allowed(SUPPLIER_PO_BOARD_ID,'view')!==true)
  fail('Supplier PO Procurement is unavailable under your existing board access.');
 const detail=await api.board(SUPPLIER_PO_BOARD_ID,{complete:true});
 await revalidateMaterialSourcingSession(scope,actor);
 if(!isCurrent()||auth.userId!==actor)fail('Material Sourcing view changed.');
 return projectProcurementReferences(detail,workspaceId);
}
