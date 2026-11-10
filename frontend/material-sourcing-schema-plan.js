/** Material Request Hub: read-only, additive Monday reference schema plan.
 * This module intentionally makes NO signed RPC, SQL or other data mutations.
 * Commercial/identity fields require a separate authoritative field-access contract.
 */
export const MATERIAL_SOURCING_BOARD_ID='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
export const MATERIAL_SOURCING_GROUP=Object.freeze({
 id:'21566a87-b287-4a61-b521-bb233956e09e',title:'Main group'
});
export const MATERIAL_SOURCING_PRIMARY_LABEL='Part number';
export const MATERIAL_SOURCING_COLUMN_LIMIT=30;

const field=(name,type,exposure='ordinary',options=null,derived=false)=>
 Object.freeze({name,type,exposure,options:options?Object.freeze([...options]):null,derived});
/** Preserve these authoritative synchronization/domain columns as-is. */
export const MATERIAL_SOURCING_EXISTING=Object.freeze([
 field('Source Record ID','text'),field('Source Revision','number'),
 field('Sync State','status'),field('Request Ref','text'),
 field('Request Date','date'),field('Quantity','number'),
 field('Approval Status','status'),field('Stock Ref','text')
]);
/** Reference order, minus the pre-existing Quantity field and Item title.
 * `restricted` is NOT a field-RBAC implementation: it blocks activation.
 * `derived` means no automatic calculation is approved or implemented.
 */
export const MATERIAL_SOURCING_ADDITIONS=Object.freeze([
 field('Selling Price (VAT-EX)','number','restricted'),
 field('Requestor','people','restricted'),
 field('Accounts','text','restricted'),
 field('Source Type','dropdown','ordinary',['Local','Import']),
 field('Material description','long_text'),
 field('Brand','text'),
 field('RFQ Ref No','text'),
 field('Date required','date'),
 field('Supplier PO No.','text','restricted'),
 field('Buying Price','number','restricted'),
 field('Currency','dropdown','restricted',['PHP','USD','EUR']),
 field('PHP Equivalent','number','restricted',null,true),
 field('Ex. Rate USD','number','restricted'),
 field('Ex. Rate EUR','number','restricted'),
 field('Shipping Cost','number','restricted'),
 field('Shipping Cost Currency','dropdown','restricted',['PHP','USD','EUR']),
 field('Shipping Cost PHP Equivalent','number','restricted',null,true),
 field('Landed Buying Cost','number','restricted',null,true),
 field('Total Landed Buying','number','restricted',null,true),
 field('Total Cost (VAT-IN)','number','restricted',null,true),
 field('Leadtime in Weeks','number'),
 field('Vendor Details','long_text','restricted')
]);
const normal=value=>String(value||'').trim().toLocaleLowerCase('en');
const fail=reason=>Object.freeze({status:'BLOCKED',reason,
 boardId:MATERIAL_SOURCING_BOARD_ID,groupName:MATERIAL_SOURCING_GROUP.title,
 noWrites:true,additions:[],restricted:[],conflicts:[]});
/** Accepts the signed, server-authoritative `api.board()` detail shape.
 * Output is a dry-run manifest, never a mutation instruction for automatic use.
 */
export function planMaterialSourcingSchema(detail){
 const board=detail?.board;
 if(board?.id!==MATERIAL_SOURCING_BOARD_ID||
    board?.name!=='Material Request Hub'||board?.status!=='active')
  return fail('Wrong or inactive material request board');
 const groups=Array.isArray(detail?.groups)?detail.groups:[];
 if(!groups.some(group=>group?.id===MATERIAL_SOURCING_GROUP.id&&
   group.title===MATERIAL_SOURCING_GROUP.title))
  return fail('The original Main group ID or title has changed');
 if(!Array.isArray(detail?.columns))return fail('Missing authoritative board columns');
 const current=detail.columns,seen=new Map(),conflicts=[];
 for(const column of current){
  const key=normal(column?.name);
  if(!key||seen.has(key))return fail('Invalid or duplicate existing column names');
  seen.set(key,column);
 }
 for(const expected of MATERIAL_SOURCING_EXISTING){
  const match=seen.get(normal(expected.name));
  if(!match||match.data_type!==expected.type)
   conflicts.push({name:expected.name,reason:'Existing domain column missing or type changed'});
 }
 const additions=[],restricted=[];
 for(const expected of MATERIAL_SOURCING_ADDITIONS){
  const match=seen.get(normal(expected.name));
  if(match){
   if(match.data_type!==expected.type)
    conflicts.push({name:expected.name,reason:'Existing type mismatch'});
   continue;
  }
  if(expected.exposure==='restricted')restricted.push(expected);
  else additions.push(expected);
 }
 if(current.length+additions.length+restricted.length>MATERIAL_SOURCING_COLUMN_LIMIT)
  return Object.freeze({status:'BLOCKED',reason:'30-column backend limit',
   boardId:board.id,groupName:MATERIAL_SOURCING_GROUP.title,noWrites:true,
   additions:[],restricted:[],conflicts});
 return Object.freeze({
  status:conflicts.length?'BLOCKED_CONFLICT':
   restricted.length?'BLOCKED_FIELD_AUTHORIZATION':'SCHEMA_MATCH',
  boardId:board.id,groupName:MATERIAL_SOURCING_GROUP.title,
  groupId:MATERIAL_SOURCING_GROUP.id,
  primaryLabel:MATERIAL_SOURCING_PRIMARY_LABEL,
  existingCount:current.length,
  projectedCount:current.length+additions.length+restricted.length,
  additions:Object.freeze(additions),restricted:Object.freeze(restricted),
  conflicts:Object.freeze(conflicts),noWrites:true
 });
}
