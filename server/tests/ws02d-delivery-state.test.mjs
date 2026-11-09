import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionInvitationDeliveryState,invitationDeliveryStatusLabel} from '../ws02d-delivery-state.mjs';
const invitationId='11111111-1111-4111-8111-111111111111';
const providerMessageId='22222222-2222-4222-8222-222222222222';
const authorized={verified:true,invitationId,providerMessageId};
test('an authenticated provider submission is distinct from delivered and recipient accepted',()=>{
 const submitted=transitionInvitationDeliveryState('pending','submitted',authorized);
 assert.deepEqual(submitted,{state:'submitted',changed:true});
 assert.match(invitationDeliveryStatusLabel(submitted.state),/not confirmed/);
 const delivered=transitionInvitationDeliveryState(submitted.state,'delivered',authorized);
 assert.match(invitationDeliveryStatusLabel(delivered.state),/not yet accepted/);
 const accepted=transitionInvitationDeliveryState(delivered.state,'accepted',authorized);
 assert.match(invitationDeliveryStatusLabel(accepted.state),/verified recipient/);
 assert.equal(transitionInvitationDeliveryState('accepted','accepted',authorized).changed,false);
});
test('unverified webhook, invalid provider correlation and unauthorized transitions deny',()=>{
 for(const event of ['submitted','delivered','failed','accepted']){
  assert.throws(()=>transitionInvitationDeliveryState('pending',event,{...authorized,verified:false}));
 }
 for(const event of ['submitted','delivered','failed']){
  assert.throws(()=>transitionInvitationDeliveryState('pending',event,{...authorized,providerMessageId:'bad'}));
 }
 for(const [a,b] of [['pending','delivered'],['failed','accepted'],['accepted','submitted'],
  ['revoked','delivered'],['expired','accepted'],['delivered','submitted']])
  assert.throws(()=>transitionInvitationDeliveryState(a,b,authorized));
});
test('failure, expiry and revocation are terminal or deny privilege-granting acceptance',()=>{
 assert.equal(transitionInvitationDeliveryState('submitted','failed',authorized).state,'failed');
 assert.equal(transitionInvitationDeliveryState('pending','revoked',authorized).state,'revoked');
 assert.equal(transitionInvitationDeliveryState('submitted','expired',authorized).state,'expired');
 for(const state of ['failed','expired','revoked'])
  assert.throws(()=>transitionInvitationDeliveryState(state,'accepted',authorized));
});
test('status labels never confuse provider submission with verified inbox delivery',()=>{
 assert.notEqual(invitationDeliveryStatusLabel('submitted'),invitationDeliveryStatusLabel('delivered'));
 assert.notEqual(invitationDeliveryStatusLabel('delivered'),invitationDeliveryStatusLabel('accepted'));
 assert.equal(invitationDeliveryStatusLabel('malicious state'),'Invitation status unavailable');
});
