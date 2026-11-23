// FuelTrans presentation projections only. No authorization or persistence decisions.
import {titleOf, statusOf, priorityOf, friendlyTime} from './ticket-domain.js';

export const QUEUE_SHORTCUTS = Object.freeze([
 {value:'all',label:'All tickets'},
 {value:'Open',label:'Open'},
 {value:'Resolved',label:'Resolved'}
]);

export function ticketCardData(ticket){
 const payload=ticket?.payload||{};
 const status=statusOf(ticket);
 const priority=priorityOf(ticket);
 return {
  id:String(ticket?.id||''),
  number:String(ticket?.ticket_number||payload.ticketId||ticket?.id||'—'),
  title:titleOf(ticket),
  client:String(ticket?.client_code||'—'),
  station:String(payload.stationName||payload.stationId||'Not specified'),
  stationId:String(payload.stationId||'—'),
  impact:String(payload.impactLevel||'Not recorded'),
  system:String(payload.systemType||'Not recorded'),
  status,
  priority,
  priorityClass:priority.toLowerCase().replace(/[^a-z0-9]/g,'-'),
  updatedAt:friendlyTime(ticket?.updated_at),
  handover:payload.handoverFlag===true
 };
}

export function pageTicketSummary(rows){
 if(!Array.isArray(rows))throw Error('Ticket list is unavailable.');
 return {
  visible:rows.length,
  flagged:rows.filter(ticket=>ticket?.payload?.handoverFlag===true).length,
  unassigned:rows.filter(ticket=>!ticket?.assigned_l1&&!ticket?.assigned_l2&&statusOf(ticket)!=='Resolved').length,
 };
}
