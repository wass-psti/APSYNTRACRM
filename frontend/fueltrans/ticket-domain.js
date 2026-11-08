// Source contract: src/platform/data/ticket-store.js and ticket-cloud.js (v0.5.0).
export const STATUS = Object.freeze(['Open','Under L1 Review','Escalated to L2','Under L2 Review','Resolved']);
export const CLIENTS = Object.freeze(['UNIOIL','ARAMCO','REPHIL','PETRON']);
export const PRIORITIES = Object.freeze(['Low','Medium','High','Critical']);
export const CAN_CREATE = Object.freeze(['admin','call_center_specialist','unioil','aramco','rephil','petron']);
export const CAN_CHANGE_STATUS = Object.freeze(['admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist']);
export const pageSize = 25;
export function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function permitted(m){return m?.enabled===true && m?.status==='active' && typeof m.workspace_id==='string' && /^[0-9a-f-]{36}$/i.test(m.workspace_id);}
export function clientForMembership(m){return CLIENTS.includes(String(m?.role||'').toUpperCase())?String(m.role).toUpperCase():null;}
export function canCreate(m){return permitted(m)&&CAN_CREATE.includes(m.role);}
export function canChangeStatus(m){return permitted(m)&&CAN_CHANGE_STATUS.includes(m.role);}
export function friendlyTime(value){if(!value)return '—';const n=new Date(value);return Number.isNaN(n.getTime())?'—':n.toLocaleString();}
export function titleOf(t){return t?.payload?.name||t?.payload?.title||t?.payload?.subject||t?.payload?.issueDetails?.slice(0,70)||'Untitled ticket';}
export function statusOf(t){return t?.status||t?.payload?.ticketStatus||'Open';}
export function priorityOf(t){return t?.payload?.priorityLevel||t?.payload?.priority||'Medium';}
export function validateTicketForm(form, membership){
  if(!canCreate(membership))throw new Error('Your FuelTrans role cannot create tickets.');
  const rawClient=String(form.client||'').trim().toUpperCase();
  const requiredClient=clientForMembership(membership);
  if(requiredClient&&rawClient&&rawClient!==requiredClient)throw new Error('Client does not match the signed-in FuelTrans membership.');
  const client=requiredClient||rawClient;
  if(!CLIENTS.includes(client))throw new Error('Choose an authorized client.');
  if(clientForMembership(membership)&&client!==clientForMembership(membership))throw new Error('Client does not match the signed-in FuelTrans membership.');
  const name=String(form.title||'').trim();const details=String(form.description||'').trim();
  if(name.length<3||name.length>160)throw new Error('Ticket title must contain 3–160 characters.');
  if(details.length<5||details.length>10000)throw new Error('Issue details must contain 5–10,000 characters.');
  const priority=String(form.priority||'Medium');if(!PRIORITIES.includes(priority))throw new Error('Invalid priority.');
  const stationId=String(form.stationId||'').trim();const stationName=String(form.stationName||'').trim();
  if(stationId.length>120||stationName.length>160)throw new Error('Station field is too long.');
  const systemType=String(form.systemType||'').trim();if(systemType.length>120)throw new Error('System type is too long.');
  const impactLevel=String(form.impactLevel||'').trim();if(impactLevel.length>100)throw new Error('Impact level is too long.');
  const reportingChannel=String(form.reportingChannel||'Web Portal').trim();if(reportingChannel.length>100)throw new Error('Reporting channel is too long.');
  return {name,details,client,priority,stationId,stationName,systemType,impactLevel,reportingChannel};
}
export function createTicketRecord(valid, membership, user, {id,now,ticketId}){
  const person={id:user.id,workspaceUserId:user.id,name:membership.display_name||user.email||'User',email:user.email||null,role:membership.role};
  const activity={id:`activity-${id}`,type:'ticket_created',actor:person,title:'Ticket Created',message:`Reported via ${valid.reportingChannel}`,visibility:'public',timestamp:now,metadata:{ticketId,client:valid.client,stationId:valid.stationId}};
  const payload={id,name:valid.name,ticketId,client:valid.client,stationId:valid.stationId,stationName:valid.stationName,systemType:valid.systemType,priorityLevel:valid.priority,impactLevel:valid.impactLevel,issueDetails:valid.details,reportingChannel:valid.reportingChannel,downtimeMinutes:null,ticketStatus:'Open',operationalDate:now,reportingShift:'',assignedL1:null,assignedL2:null,claimedL1At:null,claimedL2At:null,firstClaimAt:null,responseStartedAt:null,responseOwner:null,responseLevel:null,responseHistory:[],lastResponseDurationMs:null,lastResponseStartedAt:null,lastResponseEndedAt:null,l1ResponseDate:null,l2EscalationDate:null,closureDate:null,handoverFlag:false,handoverFlaggedAt:null,reportedBy:person,createdAt:now,updatedAt:now,updates:[],assets:[],activity:[activity],archived:false,archivedAt:null};
  return {workspace_id:membership.workspace_id,id,ticket_number:ticketId,client_code:valid.client,created_by:user.id,assigned_l1:null,assigned_l2:null,status:'Open',archived:false,payload,created_at:now,updated_at:now};
}
export function buildTicketQuery({workspaceId,archived=false,status='all',search='',page=0,limit=pageSize}={}){
 if(!/^[a-f0-9-]{36}$/i.test(String(workspaceId||'')))throw new Error('Invalid workspace.');
 if(!Number.isInteger(page)||page<0||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid page.');
 if(status!=='all'&&!STATUS.includes(status))throw new Error('Invalid ticket status.');
 const q=new URLSearchParams();q.set('select','workspace_id,id,ticket_number,client_code,created_by,assigned_l1,assigned_l2,status,archived,payload,created_at,updated_at');q.set('workspace_id',`eq.${workspaceId}`);q.set('archived',`eq.${archived}`);if(status!=='all')q.set('status',`eq.${status}`);
 // Search is scoped to server-indexable fields, not just the visible first page.
 const token=String(search||'').trim();if(token.length>80)throw new Error('Search must be 80 characters or fewer.');
 if(token){const clean=token.replace(/[%*(),.\\]/g,'').trim();if(clean)q.set('or',`(ticket_number.ilike.*${clean}*,client_code.ilike.*${clean}*)`);}
 q.set('order','updated_at.desc,id.desc');q.set('limit',String(limit));q.set('offset',String(page*limit));return q.toString();
}
export function parseTotal(contentRange,fallback){const match=/\/(\d+|\*)$/.exec(contentRange||'');return match?.[1]&&match[1]!=='*'?Number(match[1]):fallback;}
export function csvQuote(s){const text=String(s??'');return /^[=+@\-\t\r]/.test(text)?`"'${text.replaceAll('"','""')}"`:`"${text.replaceAll('"','""')}"`;}
