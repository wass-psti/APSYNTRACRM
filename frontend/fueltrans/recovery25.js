// Checkpoint 25. Permanent deletion removes only the ticket row from the active
// and recovery tables. Immutable audit history and private Storage are not purged.
import {MAX_BULK} from './ticket-bulk24.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[a-z0-9][a-z0-9._:-]{0,119}$/i;
export function projectRecovery25(data,workspaceId){
 if(!UUID.test(String(workspaceId))||!data||data.workspace_id!==workspaceId||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.items)||data.items.length>25)throw Error('Invalid recovery response.');
 const ids=new Set();
 for(const t of data.items){
  if(!t||!ID.test(String(t.id))||ids.has(t.id)||typeof t.station_id!=='string'||typeof t.station_name!=='string'||!t.station_id.trim()&&!t.station_name.trim()||!Number.isFinite(Date.parse(t.deleted_at))||!Number.isFinite(Date.parse(t.created_at)))throw Error('Untrusted recovered-ticket identity.');
  ids.add(t.id);
 }
 return data;
}
export function permanentSelection25(rows,ids){
 if(!Array.isArray(rows)||!Array.isArray(ids)||ids.length<1||ids.length>MAX_BULK||new Set(ids).size!==ids.length)throw Error('Select 1 to 25 unique deleted tickets from the current page.');
 const index=new Map(rows.map(t=>[t.id,t]));
 return ids.map(id=>{const t=index.get(id);if(!t||!ID.test(id)||!Number.isFinite(Date.parse(t.deleted_at)))throw Error('Deleted-ticket selection is no longer current.');return {id,deleted_at:t.deleted_at};});
}
export function assertPurgeContext(member,workspaceId,userId){
 if(!UUID.test(String(workspaceId))||!UUID.test(String(userId))||!member||member.user_id!==userId||member.workspace_id!==workspaceId||member.role!=='admin'||member.status!=='active'||member.enabled!==true)throw Error('Only an active FuelTrans administrator may permanently delete tickets.');
}
export async function permanentDelete25({rows,ids,workspaceId,userId,readMembership,invoke}){
 const selected=permanentSelection25(rows,ids);
 if(typeof readMembership!=='function'||typeof invoke!=='function')throw Error('Authenticated permanent deletion is required.');
 const confirmed=[];let failure=null;
 for(const item of selected){
  try{
   const member=await readMembership(workspaceId,userId);assertPurgeContext(member,workspaceId,userId);
   const reply=await invoke({p_workspace_id:workspaceId,p_ticket_id:item.id,p_expected_deleted_at:item.deleted_at});
   if(!reply||reply.id!==item.id||reply.workspace_id!==workspaceId||reply.purged!==true||reply.purged_by!==userId)throw Error('Deletion outcome is uncertain. Do not automatically retry.');
   confirmed.push(item.id);
  }catch(err){failure={id:item.id,message:err.message};break;}
 }
 return {confirmed,failure,unattempted:selected.slice(confirmed.length+(failure?1:0)).map(x=>x.id)};
}
