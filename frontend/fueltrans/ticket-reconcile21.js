// Checkpoint 21: read-only reconciliation of a ticket INSERT with an uncertain outcome.
// A lookup is NOT a retry and does not establish non-existence if a row is not visible.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENTS=new Set(['UNIOIL','ARAMCO','REPHIL','PETRON']);
const stationRE=/^[A-Za-z0-9][A-Za-z0-9 _-]{2,119}$/;
function validText(value,max){return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);}
export function captureUncertainReceipt(row,station){
 // Store only identifying metadata, never the full description, ticket payload, session, or files.
 return Object.freeze({workspaceId:row?.workspace_id,ticketId:row?.id,userId:row?.created_by,
  client:row?.client_code,stationId:row?.payload?.stationId??station?.stationId,
  systemType:row?.payload?.systemType, title:row?.payload?.name});
}
export function validateUncertainReceipt(receipt){
 if(!receipt||!UUID.test(receipt.workspaceId)||!UUID.test(receipt.ticketId)||!UUID.test(receipt.userId)||
    !CLIENTS.has(receipt.client)||!stationRE.test(receipt.stationId||'')||
    !['POS','Wet Stock','Both'].includes(receipt.systemType)||!validText(receipt.title,160))
    throw Error('Uncertain ticket receipt is invalid. Inspect Ticket Queue manually.');
 return Object.freeze({...receipt});
}
export function assessUncertainTicket(receipt,ticket){
 const expected=validateUncertainReceipt(receipt);
 if(ticket==null)return Object.freeze({status:'inconclusive',message:'No matching ticket is visible. It may still exist or be hidden by permissions. Do not resubmit.'});
 const p=ticket.payload||{};
 if(ticket.workspace_id!==expected.workspaceId||ticket.id!==expected.ticketId||ticket.created_by!==expected.userId||
    ticket.client_code!==expected.client||p.stationId!==expected.stationId||p.systemType!==expected.systemType||p.name!==expected.title)
    return Object.freeze({status:'conflict',message:'A ticket row was returned, but its immutable creation identity did not match. Do not resubmit or treat it as confirmation.'});
 return Object.freeze({status:'confirmed',ticketId:ticket.id,displayNumber:ticket.ticket_number||ticket.id,
   message:'Ticket exists with matching workspace, creator, client, station, system, and title. Do not resubmit.'});
}
export async function reconcileUncertainTicket({receipt,workspaceId,userId,readMembership,readTicket}){
 const expected=validateUncertainReceipt(receipt);
 if(workspaceId!==expected.workspaceId||userId!==expected.userId)throw Error('Ticket reconciliation identity or workspace changed.');
 if(typeof readMembership!=='function'||typeof readTicket!=='function')throw Error('Read-only reconciliation dependencies unavailable.');
 const member=await readMembership(workspaceId,userId);
 if(member?.workspace_id!==workspaceId||member?.user_id!==userId||member?.enabled!==true||member?.status!=='active')
   throw Error('Active FuelTrans membership required for ticket reconciliation.');
 // Exactly one read; never INSERT, PATCH, retry, or infer absence from a 404/RLS result.
 const found=await readTicket(workspaceId,expected.ticketId);
 return assessUncertainTicket(expected,found);
}
