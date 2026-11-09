/** Provider/recipient lifecycle state gate: no claims of delivery based on HTTP 200.
 * Pure reducer for verified webhook outcomes and signed acceptance receipts.
 * Webhook signatures must be verified by the trusted server BEFORE calling it.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=Object.freeze(['pending','submitted','delivered','failed','accepted','expired','revoked']);
const TRANSITIONS=Object.freeze({
 pending:Object.freeze(['submitted','failed','expired','revoked']),
 submitted:Object.freeze(['delivered','failed','accepted','expired','revoked']),
 delivered:Object.freeze(['accepted','expired','revoked']),
 failed:Object.freeze(['expired','revoked']),
 accepted:Object.freeze([]),
 expired:Object.freeze([]),
 revoked:Object.freeze([])
});
export function transitionInvitationDeliveryState(current,event,{verified=false,invitationId,providerMessageId}={}){
 if(verified!==true||!UUID.test(invitationId)||
  !STATES.includes(current)||!STATES.includes(event))
  throw Error('Invitation lifecycle verification unavailable');
 if(['submitted','delivered','failed'].includes(event)&&!UUID.test(providerMessageId))
  throw Error('Provider event not bound to a verified message');
 if(current===event)return Object.freeze({state:current,changed:false});
 if(!TRANSITIONS[current].includes(event))
  throw Error('Invitation lifecycle transition denied');
 return Object.freeze({state:event,changed:true});
}
export function invitationDeliveryStatusLabel(state){
 const labels={
  pending:'Invitation created; delivery not confirmed',
  submitted:'Accepted by email provider; delivery not confirmed',
  delivered:'Delivery confirmed by email provider; invitation not yet accepted',
  failed:'Delivery failed; recipient has no confirmed email',
  accepted:'Invitation accepted by verified recipient',
  expired:'Invitation expired without acceptance',
  revoked:'Invitation revoked'
 };
 return Object.hasOwn(labels,state)?labels[state]:'Invitation status unavailable';
}
