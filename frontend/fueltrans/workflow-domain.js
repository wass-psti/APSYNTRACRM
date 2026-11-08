// FuelTrans v0.5.0 portable workflow constraints. Supabase RLS is authoritative.
import {STATUS,permitted,clientForMembership} from './ticket-domain.js';
export const OPERATOR_ROLES=Object.freeze(['admin','fueltrans','global_l1_support','local_l2_support','call_center_specialist']);
export const L1_ROLES=Object.freeze(['admin','global_l1_support']);
export const L2_ROLES=Object.freeze(['admin','local_l2_support']);
export const ADMIN_ROLES=Object.freeze(['admin']);
export const FLOW=Object.freeze({Open:['Under L1 Review'], 'Under L1 Review':['Escalated to L2','Resolved'], 'Escalated to L2':['Under L2 Review'], 'Under L2 Review':['Resolved'], Resolved:[]});
export function mayReadAdministration(m){return permitted(m)&&ADMIN_ROLES.includes(m.role);}
export function canOperate(m){return permitted(m)&&OPERATOR_ROLES.includes(m.role);}
export function isL1(m){return permitted(m)&&L1_ROLES.includes(m.role);}
export function isL2(m){return permitted(m)&&L2_ROLES.includes(m.role);}
export function canTransition(m,t,next){
 if(!canOperate(m)||!STATUS.includes(next)||!t||!STATUS.includes(t.status)||t.archived||t.workspace_id!==m.workspace_id)return false;
 const allowed=FLOW[t.status]||[];if(!allowed.includes(next))return false;
 if(t.status==='Open')return false; // Claim/accept creates the L1 transition; direct status advance is prohibited.
 if(t.status==='Under L1 Review')return isL1(m)&&(m.role==='admin'||t.assigned_l1===m.user_id);
 if(t.status==='Escalated to L2')return false; // Claim/accept creates the L2 transition.
 if(t.status==='Under L2 Review')return isL2(m)&&(m.role==='admin'||t.assigned_l2===m.user_id);
 return false;
}
export function canClaim(m,t,level){
 if(!t||!permitted(m)||t.archived||t.workspace_id!==m.workspace_id)return false;
 if(level==='L1')return isL1(m)&&['Open','Under L1 Review'].includes(t.status)&&!t.assigned_l1;
 if(level==='L2')return isL2(m)&&['Escalated to L2','Under L2 Review'].includes(t.status)&&!t.assigned_l2;
 return false;
}
export function canAcceptAssigned(m,t,level,userId){
 if(!permitted(m)||!t||t.workspace_id!==m.workspace_id||t.archived||typeof userId!=='string'||!/^[a-f0-9-]{36}$/i.test(userId)||m.user_id!==userId)return false;
 if(level==='L1')return isL1(m)&&t.assigned_l1===userId&&t.status==='Open';
 if(level==='L2')return isL2(m)&&t.assigned_l2===userId&&t.status==='Escalated to L2';
 return false;
}
export function canHandover(m,t){return (isL1(m)||isL2(m))&&t&&t.workspace_id===m.workspace_id&&!t.archived&&t.status!=='Resolved'&&(m.role==='admin'||(isL1(m)&&t.assigned_l1===m.user_id)||(isL2(m)&&t.assigned_l2===m.user_id));}
export function canArchive(m,t){return mayReadAdministration(m)&&t&&t.workspace_id===m.workspace_id&&!t.archived&&t.status==='Resolved';}
export function personOf(user,m){return {id:user.id,workspaceUserId:user.id,name:m.display_name||user.email||'User',email:user.email||null,role:m.role};}
export function buildChange(t,m,user,action,{now=new Date().toISOString(),note=''}={}){
 if(!t||!t.id||!t.updated_at||!permitted(m)||!user?.id)throw Error('Invalid ticket, user, or membership.');
 if(t.workspace_id!==m.workspace_id||m.user_id!==user.id)throw Error('Ticket/workspace/actor identity mismatch.');
 const next={...t,payload:{...(t.payload||{})}};
 const p=next.payload, actor=personOf(user,m);
 let event='ticket_updated', title='Ticket updated';
 if(['claim-l1','claim-l2','accept-l1','accept-l2'].includes(action)){
  const level=action.endsWith('l1')?'L1':'L2';const accept=action.startsWith('accept-');if(accept?!canAcceptAssigned(m,t,level,user.id):!canClaim(m,t,level))throw Error('You cannot claim or accept this ticket.');
  next[level==='L1'?'assigned_l1':'assigned_l2']=user.id;
  p[level==='L1'?'assignedL1':'assignedL2']=actor; // Existing server trigger normalizes this field to a single identity object.
  p[level==='L1'?'claimedL1At':'claimedL2At']=now;
  p.firstClaimAt ||= now;
  // Original timer source starts a fresh response segment on each claim.
  p.responseStartedAt=now;p.lastResponseDurationMs=null;
  if(level==='L1'&&t.status==='Open'){next.status='Under L1 Review';p.ticketStatus=next.status;p.l1ResponseDate ||= now;}
  if(level==='L2'&&t.status==='Escalated to L2'){next.status='Under L2 Review';p.ticketStatus=next.status;}
  event='ticket_claimed';title=`${level} ticket claimed`;
 }else if(action.startsWith('status:')){
  const status=action.slice(7);if(!canTransition(m,t,status))throw Error('Ticket status transition denied.');
  next.status=status;p.ticketStatus=status;
  // Source response timer freezes on escalation/resolution and restarts at L2 claim.
  if(status==='Escalated to L2'||status==='Resolved'){
   const started=Date.parse(p.responseStartedAt||((t.status==='Under L1 Review')?(p.claimedL1At||p.l1ResponseDate):p.claimedL2At));
   const stopped=Date.parse(now);
   if(Number.isFinite(started)&&Number.isFinite(stopped))p.lastResponseDurationMs=Math.max(0,stopped-started);
   p.responseStartedAt=null;
  }
  if(status==='Escalated to L2')p.l2EscalationDate=now;
  if(status==='Resolved')p.closureDate=now;
  event='status_changed';title=`Status: ${t.status} → ${status}`;
 }else if(action==='handover'){
  if(!canHandover(m,t))throw Error('Handover not permitted.');
  p.handoverFlag=!Boolean(p.handoverFlag);p.handoverFlaggedAt=p.handoverFlag?now:null;
  event='handover_changed';title=p.handoverFlag?'Handover flagged':'Handover cleared';
 }else if(action==='note'){
  if(!canOperate(m)||t.archived)throw Error('Updates are limited to active tickets and authorized FuelTrans operators.');
  const text=String(note).trim();if(text.length<3||text.length>2000)throw Error('Update must contain 3–2,000 characters.');
  p.updates=[...(Array.isArray(p.updates)?p.updates:[]),{id:crypto.randomUUID(),message:text,author:actor,timestamp:now}];
  event='comment_added';title='Work update added';
 }else if(action==='archive'){
  if(!canArchive(m,t))throw Error('Only an administrator can archive a resolved ticket.');
  next.archived=true;p.archived=true;p.archivedAt=now;event='ticket_archived';title='Ticket archived';
 }else throw Error('Unknown ticket mutation.');
 p.updatedAt=now;next.updated_at=now;
 p.activity=[...(Array.isArray(p.activity)?p.activity:[]),{id:crypto.randomUUID(),type:event,title,actor,timestamp:now,message:action==='note'?'Operator recorded a work update':title,visibility:'public'}];
 return {workspace_id:next.workspace_id,id:next.id,updated_at:next.updated_at,status:next.status,archived:next.archived,assigned_l1:next.assigned_l1,assigned_l2:next.assigned_l2,payload:p};
}
export function scopeFor(m){const client=clientForMembership(m);return client?client:String(m?.client_code||'').toUpperCase()||null;}
export function selectHandover(rows){return rows.filter(t=>Boolean(t.payload?.handoverFlag));}
