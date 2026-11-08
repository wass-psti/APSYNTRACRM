// Recoverable deletion; permission checks are repeated by the database RPC.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET=/^[a-z0-9][a-z0-9._:-]{0,119}$/i;
export const TICKET_DELETION_ROLES=Object.freeze(['admin','call_center_specialist']);
export function validateDeleteContext(member,{workspaceId,ticketId,updatedAt,userId}={}){
 if(!UUID.test(String(workspaceId))||!UUID.test(String(userId))||!TICKET.test(String(ticketId))||!updatedAt||!Number.isFinite(Date.parse(updatedAt)))throw Error('Valid ticket identity, user, and latest version required.');
 if(!member||member.enabled!==true||member.status!=='active'||member.workspace_id!==workspaceId||member.user_id!==userId||!TICKET_DELETION_ROLES.includes(member.role))throw Error('Ticket deletion is restricted to active FuelTrans administrators and call-center specialists.');
 return Object.freeze({workspaceId,ticketId,updatedAt,userId});
}
export function validateRestoreContext(member,{workspaceId,ticketId,userId}={}){
 if(!UUID.test(String(workspaceId))||!UUID.test(String(userId))||!TICKET.test(String(ticketId)))throw Error('Valid workspace, user, and ticket identity required.');
 if(!member||member.enabled!==true||member.status!=='active'||member.workspace_id!==workspaceId||member.user_id!==userId||member.role!=='admin')throw Error('Only an active FuelTrans administrator may restore deleted tickets.');
 return Object.freeze({workspaceId,ticketId,userId});
}
export async function executeSoftDelete({member,workspaceId,ticketId,updatedAt,userId,invoke}){
 const ctx=validateDeleteContext(member,{workspaceId,ticketId,updatedAt,userId});
 if(typeof invoke!=='function')throw Error('Secure delete RPC required.');
 const result=await invoke({p_workspace_id:ctx.workspaceId,p_ticket_id:ctx.ticketId,p_expected_updated_at:ctx.updatedAt});
 if(!result||result.workspace_id!==workspaceId||result.id!==ticketId||result.deleted_by!==userId||!Number.isFinite(Date.parse(result.deleted_at)))throw Error('Server did not confirm recoverable deletion. Do not retry automatically.');
 return result;
}
export async function executeRestore({member,workspaceId,ticketId,userId,invoke}){
 validateRestoreContext(member,{workspaceId,ticketId,userId});
 if(typeof invoke!=='function')throw Error('Secure restoration RPC required.');
 const result=await invoke({p_workspace_id:workspaceId,p_ticket_id:ticketId});
 if(!result||result.workspace_id!==workspaceId||result.id!==ticketId||result.restored!==true)throw Error('Server did not confirm restoration; refresh before retrying.');
 return result;
}
