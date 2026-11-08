import {buildTicketQuery} from './ticket-domain.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const QUEUE_SCOPES=Object.freeze(['all','mine','unassigned']);
/** Server-side queue filters; never filter a truncated first page in memory. */
export function buildWorkflowQuery({workspaceId,route,scope='all',userId,page=0,limit=25}) {
  if (!['l1-workspace','l2-dispatch','handover'].includes(route)) throw Error('Unknown queue.');
  if (!QUEUE_SCOPES.includes(scope)) throw Error('Unknown assignment filter.');
  if (scope !== 'all' && route === 'handover') throw Error('Assignment filter unavailable for handover.');
  if (scope === 'mine' && !UUID.test(String(userId))) throw Error('Verified user required.');
  const q=new URLSearchParams(buildTicketQuery({workspaceId,page,limit}));
  if (route==='l1-workspace') q.set('status','in.("Open","Under L1 Review")');
  if (route==='l2-dispatch') q.set('status','in.("Escalated to L2","Under L2 Review")');
  if (route==='handover') q.set('payload->>handoverFlag','eq.true');
  if (scope!=='all')q.set(route==='l1-workspace'?'assigned_l1':'assigned_l2',scope==='mine'?`eq.${userId}`:'is.null');
  return q.toString();
}
