import { lifecycleActions,saveLifecycle } from './order-intake-lifecycle.js';
import { ORDER_INTAKE_STATUSES } from './order-intake-native.js';
import { previewOrderFinancials } from './order-intake-projections.js';
import { compareOrderDecimals } from './order-intake-search.js';

export function validateBulkRequest(action,values={}){
 if(!['status','archive','restore','details'].includes(action))throw Error('Choose a bulk action.');
 if(action==='status'){
  if(!ORDER_INTAKE_STATUSES.includes(values.status))throw Error('Select a valid status.');
  return {status:values.status};
 }
 if(action!=='details')return {};
 const patch={};
 for(const key of ['company','industry']){
  const value=String(values[key]??'').trim();
  if(value.length>240)throw Error(key+' is too long.');
  if(value)patch[key]=value;
 }
 const expense=String(values.procurementExpenses??'').trim();
 if(expense){
  if(!/^\d{1,16}(?:\.\d{1,2})?$/.test(expense)||compareOrderDecimals(expense,'9999999999999999')>0)throw Error('Enter valid non-negative procurement expenses.');
  if(!['PHP','USD','EUR'].includes(values.currency))throw Error('Select the expense currency.');
  patch.procurementExpenses=expense;
 }
 if(!Object.keys(patch).length)throw Error('Enter at least one field to update.');
 return patch;
}
function skipReason(row,action,patch,currency){
 if(action!=='details'){
  if(action==='status'&&row.status===patch.status)return 'Already at requested status';
  return lifecycleActions(row)[action]?'':'Action not applicable to current record';
 }
 if(row.record_kind!=='native'||row.archived!==false||!Number.isSafeInteger(row.revision)||row.revision<1)return 'Native active orders only for financial and business-field edits';
 if(patch.procurementExpenses!==undefined&&row.currency!==currency)return 'Expense currency differs';
 if(Object.entries(patch).every(([k,v])=>k==='procurementExpenses'?compareOrderDecimals(row.procurement_expenses,v)===0:row[k]===v))return 'No changes requested';
 return '';
}
async function updateDetails(client,row,patch,isCurrent){
 const preview=previewOrderFinancials({amount:row.po_amount,vatRate:row.vat_rate,expenses:patch.procurementExpenses??row.procurement_expenses});
 let error;
 try{await client.update(row.id,row.revision,patch);}catch(err){error=err;}
 if(!isCurrent())throw Error('Context changed; outcome unconfirmed');
 const actual=await client.detail(row.id,{includeArchived:true}).catch(()=>null);
 if(actual?.id===row.id&&actual.workspace_id===row.workspace_id&&actual.record_kind==='native'&&actual.archived===false&&actual.revision===row.revision+1&&
  actual.company===(patch.company??row.company)&&actual.industry===(patch.industry??row.industry)&&
  compareOrderDecimals(actual.procurement_expenses,patch.procurementExpenses??row.procurement_expenses)===0&&
  actual.po_amount===row.po_amount&&actual.currency===row.currency&&actual.status===row.status&&
  actual.vat_exclusive_amount===preview.vatExclusiveAmount&&actual.vat_amount===preview.vatAmount&&actual.gross_profit===preview.grossProfit)return actual;
 throw error||Error('Bulk edit outcome could not be confirmed. Refresh before retrying.');
}
// Independent transactions, one in flight. Stop on ambiguous or rejected writes;
// never replay mutations automatically or claim the batch is atomic.
export async function runOrderBulk({client,rows,action,values,isCurrent=()=>true,onProgress=()=>{}}){
 const patch=validateBulkRequest(action,values),seen=new Set(),results=[];
 let stopped=false;
 for(const row of rows){
  if(seen.has(row.id))continue;
  seen.add(row.id);
  let result={id:row.id,po:row.po_number,state:'not attempted',reason:''};
  if(stopped||!isCurrent()){stopped=true;result.reason='Batch stopped; refresh before continuing';}
  else{
   const reason=skipReason(row,action,patch,values?.currency);
   if(reason){result.state='skipped';result.reason=reason;}
   else try{
    if(action==='details')await updateDetails(client,row,patch,isCurrent);
    else await saveLifecycle({client,row,action,target:patch.status,isCurrent});
    result.state='verified';
   }catch(error){result.state='unconfirmed';result.reason=error?.message||'Save not confirmed';stopped=true;}
  }
  results.push(result);onProgress(results.slice());
 }
 return results;
}
