// CP-MS-CRM-05C: domain-specific import; each material uses the existing atomic
// create/receipt contract. No ordinary-board import writer or raw data storage.
import {parseMaterialAddForm,materialAddPublicColumns} from '../../material-sourcing-add-material.js';
import {createMaterialWithRecovery} from '../../material-sourcing-atomic-create.js';
import {authorizeMaterialSourcingItem,revalidateMaterialSourcingSession} from '../../material-sourcing-application.js';
import {MATERIAL_SOURCING_BOARD_ID as boardId,MATERIAL_SOURCING_GROUP as group} from '../../material-sourcing-schema-plan.js';
import {importDigest} from '../../board/import/import-durable.js';
import {validUuid} from '../../data.js';

export const IMPORT_LIMIT=50;
export const IMPORT_HEADERS=Object.freeze({
 'Part number':'partNumber','Source type':'sourceType','Brand':'brand',
 'Material description':'description','Quantity':'quantity','Buying price':'buying',
 'Currency':'currency','Shipping cost':'shipping','Shipping currency':'shippingCurrency',
 'Leadtime (weeks)':'lead','Vendor details':'vendor','Date required':'due','RFQ Ref No':'rfq'
});
const normalize=value=>String(value??'').trim().toLowerCase();
const fail=message=>{throw Error(message);};
const placeholder='00000000-0000-4000-8000-000000000000';
export function importRecoveryKey(userId,workspaceId){
 return 'apsyntra.mrh.import.v1:'+userId+':'+workspaceId;
}
function complete(detail,workspaceId){
 if(detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId||
    detail.board.name!=='Material Request Hub'||detail.board.status!=='active'||
    !detail.groups?.some(g=>g.id===group.id&&g.title===group.title)||
    !Array.isArray(detail.items)||detail.pagination?.has_more===true||
    detail.pagination?.loaded===false)fail('Complete signed Main group records are required for duplicate review.');
 return detail;
}
function names(detail){
 return new Set(detail.items.filter(i=>i.group_id===group.id).map(i=>normalize(i.title)));
}
export function reviewMaterialImport(sheet,detail,workspaceId){
 complete(detail,workspaceId);
 if(!Array.isArray(sheet?.headers)||!Array.isArray(sheet.rows)||!sheet.rows.length||sheet.rows.length>IMPORT_LIMIT)
  fail('Choose a worksheet containing 1–'+IMPORT_LIMIT+' material rows.');
 if(sheet.omittedRows?.length||sheet.formulaWarnings?.length)
  fail('Workbook contains omitted rows or unavailable formula values. Clean the worksheet before importing.');
 const lookup=new Map(Object.entries(IMPORT_HEADERS).map(([label,key])=>[normalize(label),key]));
 const keys=sheet.headers.map(h=>lookup.get(normalize(h)));
 if(keys.some(k=>!k)||new Set(keys).size!==keys.length)fail('Use the Material Sourcing template headers; unknown or repeated columns are not imported.');
 const cols=materialAddPublicColumns(detail);
 const required=['partNumber',...['sourceType','brand','description','quantity'].filter(k=>cols[k])];
 if(required.some(k=>!keys.includes(k)))fail('Required template columns are missing.');
 const existing=names(detail),counts=new Map(),partIndex=keys.indexOf('partNumber');
 for(const row of sheet.rows){const key=normalize(row[partIndex]);counts.set(key,(counts.get(key)||0)+1);}
 return sheet.rows.map((row,index)=>{
  const sourceRow=sheet.rowNumbers?.[index]??index+2;
  const values=Object.fromEntries(keys.map((key,i)=>[key,String(row[i]??'').trim()]));
  try{
   if(row.length>keys.length&&row.slice(keys.length).some(v=>String(v??'').trim()))fail('Unexpected extra cells.');
   if(required.some(k=>!values[k]))fail('Required material values are missing.');
   const plan=parseMaterialAddForm(detail,{get:key=>values[key]??''});
   const key=normalize(plan.partNumber);
   const reason=counts.get(key)>1?'Repeated part number within file':existing.has(key)?'Part number already exists (active or archived)':'';
   return {index,sourceRow,partNumber:plan.partNumber,plan,state:reason?'skipped':'ready',reason};
  }catch(error){return {index,sourceRow,partNumber:values.partNumber||'',plan:null,state:'rejected',reason:error.message};}
 });
}
export function readMaterialImportRecovery(storage,key){
 const raw=storage.getItem(key);
 if(raw===null)return null;
 let m;
 try{m=JSON.parse(raw);}catch{fail('Saved import checkpoint is invalid. Reconcile before importing.');}
 if(m?.version!==1||typeof m.digest!=='string'||!Array.isArray(m.rows)||!m.rows.length||m.rows.length>IMPORT_LIMIT||
    m.rows.some(r=>!Number.isInteger(r.index)||r.index<0||r.index>=IMPORT_LIMIT||!validUuid(r.requestId)||
     (r.itemId!==null&&!validUuid(r.itemId)))||
    new Set(m.rows.map(r=>r.index)).size!==m.rows.length||
    new Set(m.rows.map(r=>r.requestId)).size!==m.rows.length)
  fail('Saved import checkpoint is invalid. Reconcile before importing.');
 return m;
}
export async function importReviewDigest(review,crypt=globalThis.crypto){
 // Bind original validated payloads, order and source row numbers, not duplicate
 // outcomes (a previously committed row will now be an existing match).
 return importDigest(review.map(r=>({index:r.index,sourceRow:r.sourceRow,plan:r.plan,
  invalid:r.plan?null:r.reason})),crypt);
}
export async function executeMaterialImport({api,auth,workspaceId,review,approvedDigest,
 storage=globalThis.localStorage,locks=globalThis.navigator?.locks,crypt=globalThis.crypto,
 isCurrent=()=>true,onProgress=()=>{}}){
 const actor=auth.userId,key=importRecoveryKey(actor,workspaceId);
 const scope={api,auth,workspaceId,boardId,itemId:placeholder,edit:true};
 const ensureCurrent=()=>{if(!isCurrent()||auth.userId!==actor)fail('Material import view or session changed. Resume using the same worksheet.');};
 const persist=m=>{storage.setItem(key,JSON.stringify(m));if(storage.getItem(key)!==JSON.stringify(m))fail('Import checkpoint could not be persisted.');};
 const run=async()=>{
  ensureCurrent();await authorizeMaterialSourcingItem(scope);
  const digest=await importReviewDigest(review,crypt);
  if(digest!==approvedDigest)fail('Import preview changed. Review again.');
  let marker=readMaterialImportRecovery(storage,key);
  if(marker&&marker.digest!==digest)fail('Select the original reviewed worksheet to recover the pending import.');
  if(!marker){
   const rows=review.filter(r=>r.state==='ready').map(r=>({index:r.index,requestId:crypt.randomUUID(),itemId:null}));
   if(!rows.length)fail('No new valid materials to import.');
   marker={version:1,digest,rows};persist(marker);
  }
  const results=[];
  for(const entry of marker.rows){
   const row=review[entry.index];
   if(!row?.plan)fail('Recovery row no longer matches the original plan.');
   if(entry.itemId){results.push({sourceRow:row.sourceRow,itemId:entry.itemId,state:'verified'});continue;}
   ensureCurrent();
   // Read the existing signed receipt before duplicate review: a committed
   // interrupted row must not be mistaken for a different existing material.
   const receipt=await api.rpc('mrh_material_create_receipt',{p_request_id:entry.requestId});
   await revalidateMaterialSourcingSession(scope,actor);
   if(receipt?.request_id!==entry.requestId||!['committed','unresolved'].includes(receipt.status)||
      (receipt.status==='committed'&&!validUuid(receipt.item_id)))fail('Creation receipt unavailable; import stopped.');
   if(receipt.status==='unresolved'){
    api.invalidateBoardCache?.(boardId,{invalidateContext:false});
    const fresh=complete(await api.board(boardId,{complete:true}),workspaceId);
    await revalidateMaterialSourcingSession(scope,actor);
    if(names(fresh).has(normalize(row.partNumber)))fail('A new matching part number appeared. Import stopped; reconcile before retrying.');
   }
   ensureCurrent();
   // Same opaque request ID survives browser reload. Existing single-create
   // recovery serializes with normal Add Material and verifies server receipts.
   const result=await createMaterialWithRecovery({api,auth,workspaceId,form:{},
    formRequestId:entry.requestId,newRequestId:entry.requestId,plan:row.plan,storage,locks});
   if(!validUuid(result?.itemId)||result.requestId!==entry.requestId||
      (receipt.status==='committed'&&result.itemId!==receipt.item_id))fail('Material creation result requires reconciliation.');
   entry.itemId=result.itemId;persist(marker);
   results.push({sourceRow:row.sourceRow,itemId:entry.itemId,state:result.recovered?'recovered':'verified'});
   try{onProgress({completed:results.length,total:marker.rows.length,results:[...results]});}catch{}
  }
  storage.removeItem(key);
  return results;
 };
 // A separate batch lock serializes import tabs; existing create lock is
 // acquired inside each row, never recursively with the same key.
 return locks?.request?locks.request(key,run):run();
}
