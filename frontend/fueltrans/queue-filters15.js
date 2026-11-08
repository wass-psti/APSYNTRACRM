// Native source TicketQueueFilters.jsx selectors: server-filtered BEFORE pagination.
// For legacy source fields these selectors are exact-path; unrecorded data is never inferred.
import {buildTicketQuery, CLIENTS, PRIORITIES,clientForMembership,permitted} from './ticket-domain.js';
import {parseReportWindow} from './report-window-domain.js';
export const SYSTEM_TYPES = Object.freeze(['POS','Wet Stock','Both']);
export const SORT_ORDERS = Object.freeze(['recent','oldest']);
export function normalizeQueueFilters({client='all',priority='all',system='all',from='',to='',sort='recent'}={}) {
 if(client!=='all'&&!CLIENTS.includes(client))throw Error('Invalid client filter.');
 if(priority!=='all'&&!PRIORITIES.includes(priority))throw Error('Invalid priority filter.');
 if(system!=='all'&&!SYSTEM_TYPES.includes(system))throw Error('Invalid system filter.');
 if(!SORT_ORDERS.includes(sort))throw Error('Invalid ticket sort order.');
 const dates=parseReportWindow({from,to});
 return Object.freeze({client,priority,system,from:dates.from,to:dates.to,sort});
}
function followingDay(day){const date=new Date(`${day}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()+1);const value=date.toISOString().slice(0,10);if(value<=day)throw Error('End date exceeds supported ticket range.');return value;}
export function buildQueueFiltersQuery({workspaceId,member,status='all',search='',archived=false,page=0,limit=25,...raw}={}) {
 if(!permitted(member)||member.workspace_id!==workspaceId)throw Error('An active workspace membership is required.');
 const f=normalizeQueueFilters(raw);
 const forcedClient=clientForMembership(member);
 if(forcedClient&&f.client!=='all'&&f.client!==forcedClient)throw Error('Cross-client ticket search denied.');
 const q=new URLSearchParams(buildTicketQuery({workspaceId,archived,status,search,page,limit}));
 const effectiveClient=forcedClient||f.client;
 if(effectiveClient!=='all')q.set('client_code',`eq.${effectiveClient}`);
 if(f.priority!=='all')q.set('payload->>priorityLevel',`eq.${f.priority}`);
 if(f.system!=='all')q.set('payload->>systemType',`eq.${f.system}`);
 // Original ticket operationalDate may be an ISO timestamp or YYYY-MM-DD. Prefix ordering
 // yields inclusive calendar-day range for UTC ISO source timestamps; never use created_at.
 if(f.from)q.append('payload->>operationalDate',`gte.${f.from}`);
 if(f.to)q.append('payload->>operationalDate',`lt.${followingDay(f.to)}`);
 q.set('order',f.sort==='recent'?'updated_at.desc,id.desc':'updated_at.asc,id.asc');
 return q.toString();
}
