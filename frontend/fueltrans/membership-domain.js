// FuelTrans standalone membership and delegation validations; database RLS remains authoritative.
import {permitted, CLIENTS} from './ticket-domain.js';
import {mayReadAdministration,personOf} from './workflow-domain.js';
export const FUELTRANS_ROLES=Object.freeze(['admin','fueltrans','watchdog_employee','global_l1_support','local_l2_support','call_center_specialist','unioil','aramco','rephil','petron','viewer']);
export const MEMBER_STATUSES=Object.freeze(['active','inactive','suspended','pending']);
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function validUuid(value){return typeof value==='string'&&UUID.test(value);}
export function validateMembershipChange(admin,target,form,actorId){
 if(!mayReadAdministration(admin)||!target||!validUuid(target.workspace_id)||target.workspace_id!==admin.workspace_id||!validUuid(target.user_id))throw Error('Admin membership and same-workspace target required.');
 if(target.user_id===actorId)throw Error('Editing your own administrator membership is disabled here.');
 if(!target.updated_at||!Number.isFinite(Date.parse(target.updated_at)))throw Error('Membership version is missing.');
 const role=String(form.role??''),status=String(form.status??''),enabled=form.enabled===true;
 if(!FUELTRANS_ROLES.includes(role)||!MEMBER_STATUSES.includes(status))throw Error('Invalid FuelTrans role or account status.');
 const client_code=String(form.client_code??'').trim().toUpperCase();
 if(client_code&&!CLIENTS.includes(client_code))throw Error('Unknown client code.');
 const clientRole=CLIENTS.includes(role.toUpperCase());
 if(clientRole&&client_code!==role.toUpperCase())throw Error('Client-role membership must match its own client code.');
 if(!clientRole&&client_code&&role!=='viewer')throw Error('Non-client roles cannot have a client code.');
 return {role,status,enabled,client_code:client_code||null};
}
export function canDelegate(admin,ticket,level){
 const field=level==='L1'?'assigned_l1':level==='L2'?'assigned_l2':null;
 const statuses=level==='L1'?['Open','Under L1 Review']:level==='L2'?['Escalated to L2','Under L2 Review']:[];
 return Boolean(field&&mayReadAdministration(admin)&&ticket?.workspace_id===admin.workspace_id&&!ticket.archived&&statuses.includes(ticket.status)&&!ticket[field]);
}
export function validateDelegate(admin,ticket,assignee,level){
 if(!canDelegate(admin,ticket,level))throw Error('Delegation not permitted for this ticket or stage.');
 if(!permitted(assignee)||!validUuid(assignee.user_id)||assignee.workspace_id!==ticket.workspace_id)throw Error('Assignee requires an active membership in this workspace.');
 if(assignee.role!==(level==='L1'?'global_l1_support':'local_l2_support'))throw Error('Assignee has the wrong FuelTrans role for this level.');
 return assignee;
}
export function buildDelegation(ticket,admin,actor,assignee,level,{now=new Date().toISOString()}={}){
 validateDelegate(admin,ticket,assignee,level);
 if(!validUuid(actor?.id)||!Number.isFinite(Date.parse(now)))throw Error('Invalid delegation actor or timestamp.');
 const l1=level==='L1',key=l1?'assigned_l1':'assigned_l2',sourceKey=l1?'assignedL1':'assignedL2';
 const payload={...(ticket.payload||{})};
 payload[sourceKey]={id:assignee.user_id,workspaceUserId:assignee.user_id,name:assignee.display_name||assignee.email||'FuelTrans operator',email:assignee.email||null,role:assignee.role};
 payload[l1?'delegatedL1At':'delegatedL2At']=now;
 payload.activity=[...(Array.isArray(payload.activity)?payload.activity:[]),{id:crypto.randomUUID(),type:'ticket_delegated',title:`${level} assignment delegated`,actor:personOf(actor,admin),timestamp:now,message:'An administrator assigned an operator',visibility:'public'}];
 payload.updatedAt=now;
 // Do not start a response timer or invent an acceptance/claim timestamp on delegation.
 return {workspace_id:ticket.workspace_id,id:ticket.id,updated_at:now,status:ticket.status,archived:ticket.archived,assigned_l1:l1?assignee.user_id:ticket.assigned_l1,assigned_l2:l1?ticket.assigned_l2:assignee.user_id,payload};
}
