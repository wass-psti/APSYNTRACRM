/**
 * CP-MS-CRM-02: read-only bridge contract. Not mounted in the CRM runtime.
 * Inputs must come from existing signed CRM readers. This is not authorization,
 * a write client, a replacement data store, or a full standalone Material.
 */
import {MATERIAL_SOURCING_BOARD_ID, MATERIAL_SOURCING_GROUP,
 MATERIAL_SOURCING_EXISTING, MATERIAL_SOURCING_ADDITIONS} from '../../material-sourcing-schema-plan.js';
import {materialAddPublicColumns} from '../../material-sourcing-add-material.js';
import {boardItemsComplete} from '../../board/presentation/grid.js';
import {normalizeProtectedSourcingRead} from '../../material-sourcing-application.js';

export const PUBLIC_FIELDS=Object.freeze({
 source:['sourceType','Source Type','source'],description:['description','Material description','text'],
 brand:['brand','Brand','text'],quantity:['quantity','Quantity','number'],
 rfq:['rfq','RFQ Ref No','text'],requiredDate:['due','Date required','date'],
 leadWeeks:['lead','Leadtime in Weeks','number']
});
export const COMMERCIAL_FIELDS=Object.freeze({
 buyingPrice:'Buying Price',currency:'Currency',shipping:'Shipping Cost',
 shipCurrency:'Shipping Cost Currency',usd:'Ex. Rate USD',eur:'Ex. Rate EUR',
 vendor:'Vendor Details',account:'Accounts',supplierPo:'Supplier PO No.',requestor:'Requestor',
 legacySelling:'Selling Price (VAT-EX)'
});
export const DERIVED_FIELDS=Object.freeze({
 php:'PHP Equivalent',shipPhp:'Shipping Cost PHP Equivalent',landed:'Landed Buying Cost',
 totalLanded:'Total Landed Buying',selling:'Selling Price (VAT-EX)',vatIn:'Total Cost (VAT-IN)'
});
export const PRESERVED_DOMAIN_COLUMNS=Object.freeze(MATERIAL_SOURCING_EXISTING.map(f=>f.name));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const unavailable=()=>({state:'unavailable',value:null});
const absent=()=>({state:'absent',value:null});
const present=(value,extra={})=>({state:'present',value,...extra});
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function unique(rows,label){
 const seen=new Set();
 for(const row of rows){assert(row&&uuid.test(row.id||'')&&!seen.has(row.id.toLowerCase()),'Invalid or duplicate '+label+' identity');seen.add(row.id.toLowerCase());}
}
function readPublic(value,kind){
 if(value===null||value===undefined)return absent();
 if(kind==='source')return ['Local','Import'].includes(value)?present(value):{state:'unsupported',value:typeof value==='string'?value:null};
 if(kind==='number')return typeof value==='number'&&Number.isFinite(value)?present(value,{precision:'legacy-json-number'}):{state:'unsupported',value:null};
 if(kind==='date')return date(value)?present(value):{state:'unsupported',value:null};
 return typeof value==='string'?present(value):{state:'unsupported',value:null};
}
function privateFields(receipt,scope,itemId){
 if(!receipt)return Object.fromEntries(Object.keys(COMMERCIAL_FIELDS).map(k=>[k,unavailable()]));
 assert(receipt.boardId===scope.boardId&&receipt.workspaceId===scope.workspaceId&&receipt.itemId===itemId,'Commercial receipt scope mismatch');
 const cells=normalizeProtectedSourcingRead(receipt.cells);
 return Object.fromEntries(Object.entries(COMMERCIAL_FIELDS).map(([key,name])=>{
  const cell=cells[name];
  return [key,cell?present(cell.value,{revision:cell.revision,...(typeof cell.value==='number'?{precision:'legacy-json-number'}:{})}):absent()];
 }));
}
/** Keep UUID, actual group, missing data, source types and revisions distinct.
 * Other groups / archive rows are surfaced as reconciliation gaps, never relabeled.
 * Commercial receipts are supplied separately, after existing signed read checks.
 */
export function reconcileBoard(detail,{workspaceId,commercialByItem=new Map()}={}){
 const board=detail?.board;
 assert(uuid.test(workspaceId||'')&&board?.workspace_id===workspaceId&&
 board.id===MATERIAL_SOURCING_BOARD_ID&&board.name==='Material Request Hub'&&board.status==='active','Material board scope mismatch');
 assert(Array.isArray(detail.groups)&&Array.isArray(detail.items)&&Array.isArray(detail.columns)&&Array.isArray(detail.values),'Incomplete board projection');
 unique(detail.groups,'group');unique(detail.items,'item');unique(detail.columns,'column');
 const groups=new Map(detail.groups.map(g=>[g.id,g]));
 assert(groups.get(MATERIAL_SOURCING_GROUP.id)?.title===MATERIAL_SOURCING_GROUP.title,'Original Main group changed');
 const columnNames=new Set();
 for(const c of detail.columns){
  const name=String(c.name||'').trim().toLowerCase();
  assert(name&&!columnNames.has(name),'Duplicate or invalid column name');columnNames.add(name);
 }
 const columns=materialAddPublicColumns(detail),allowed=new Set(Object.values(columns));
 const cells=new Map();
 for(const v of detail.values){
  if(!allowed.has(v.column_id))continue;
  const key=v.item_id+':'+v.column_id;
  assert(!cells.has(key),'Duplicate public cell');cells.set(key,v.value);
 }
 const scope={boardId:board.id,workspaceId};
 const records=[],deferred=[];
 for(const item of detail.items){
  assert(groups.has(item.group_id)&&(!item.board_id||item.board_id===board.id),'Item scope mismatch');
  const group=groups.get(item.group_id);
  if(item.archived_at||group.id!==MATERIAL_SOURCING_GROUP.id){
   deferred.push({id:item.id,groupId:group.id,archivedAt:item.archived_at??null,reason:item.archived_at?'archived':'outside-current-sourcing-group'});continue;
  }
  assert(typeof item.title==='string'&&item.title.trim(),'Invalid material title');
  const publicValues=Object.fromEntries(Object.entries(PUBLIC_FIELDS).map(([key,[alias,,kind]])=>{
   const columnId=columns[alias];
   return [key,columnId?{...readPublic(cells.get(item.id+':'+columnId),kind),columnId}:unavailable()];
  }));
  records.push({id:item.id,name:item.title,groupId:group.id,group:group.title,
   createdAt:item.created_at??null,dbRevision:item.updated_at??null,
   publicValues,commercial:privateFields(commercialByItem.get(item.id),scope,item.id),
   // No computed or guessed money from the old JSON-number contract.
   savedCosts:null,fxSnapshotId:null,
   // Explicitly distinguish unrequested related records from empty results.
   tasks:null,activity:null,starred:null});
 }
 return {scope,records,deferred,itemsComplete:boardItemsComplete(detail),originalColumns:PRESERVED_DOMAIN_COLUMNS.map(name=>{
  const c=detail.columns.find(c=>c.name===name);
  const expected=MATERIAL_SOURCING_EXISTING.find(f=>f.name===name);
  return {name,id:c?.id??null,compatible:c?.data_type===expected.type};
 }),missingPublicFields:Object.entries(PUBLIC_FIELDS).filter(([,v])=>!columns[v[0]]).map(([,v])=>v[1])};
}
/** Existing CRM status is preserved; not_started is not equivalent to Stuck. */
export function reconcileTask(task){
 assert(uuid.test(task?.id||'')&&typeof task.title==='string'&&task.title.trim()&&
 Number.isSafeInteger(task.revision)&&task.revision>=1,'Invalid task receipt');
 const map={working_on_it:'Working on it',done:'Done'};
 assert(['not_started','working_on_it','done'].includes(task.status),'Unknown CRM task status');
 return {id:task.id,title:task.title,crmStatus:task.status,status:map[task.status]??null,revision:task.revision};
}
export function existingTaskStatus(status){
 if(status==='Working on it')return 'working_on_it';
 if(status==='Done')return 'done';
 throw new Error('Task status requires a compatible CRM contract');
}
export function checkFieldCatalog(){
 const additions=new Map(MATERIAL_SOURCING_ADDITIONS.map(f=>[f.name,f]));
 return {
 public:Object.values(PUBLIC_FIELDS).every(([,name])=>name==='Quantity'||additions.get(name)?.exposure==='ordinary'),
 commercial:Object.values(COMMERCIAL_FIELDS).every(name=>additions.get(name)?.exposure==='restricted'&&!additions.get(name)?.derived),
 derived:Object.entries(DERIVED_FIELDS).every(([key,name])=>key==='selling'||additions.get(name)?.derived===true)
 };
}
