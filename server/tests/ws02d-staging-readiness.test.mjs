import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInvitationStagingReadiness} from '../ws02d-staging-readiness.mjs';
const ready={isolated:true,verifiedUserCount:2,workspaceSchema:true,
 privateInvitationSchema:true,deliveryLedger:true,managerRoute:'trusted',
 inviteRoute:'trusted',acceptRoute:'trusted',signedSessionVerified:true,
 emailDeliveryVerified:true};
test('verified actual staging inventory blocks activation when deployed handlers are placeholders and DB is absent',()=>{
 const result=assessInvitationStagingReadiness({...ready,
  verifiedUserCount:0,workspaceSchema:false,privateInvitationSchema:false,
  deliveryLedger:false,managerRoute:'absent',inviteRoute:'dormant',
  acceptRoute:'dormant',signedSessionVerified:false,emailDeliveryVerified:false});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.verified,1);
 assert.equal(result.total,10);
 assert.equal(result.productionActivationAllowed,false);
 assert.deepEqual(result.checks.filter(c=>c.status==='BLOCKED').map(c=>c.id),[
  'two_signed_accounts','workspace_core','invitation_private_sql','delivery_ledger',
  'manager_endpoint','invite_endpoint','accept_endpoint','auth_session','email_provider'
 ]);
});
test('two users alone, deployed route names alone and synthetic SQL tests cannot certify genuine staging readiness',()=>{
 for(const change of [{verifiedUserCount:0},{inviteRoute:'dormant'},
  {acceptRoute:'dormant'},{managerRoute:'absent'},{emailDeliveryVerified:false},
  {signedSessionVerified:false},{workspaceSchema:false}]){
  assert.equal(assessInvitationStagingReadiness({...ready,...change}).state,'BLOCKED');
 }
});
test('all verified staging components pass readiness but never automatically authorize production activation',()=>{
 const result=assessInvitationStagingReadiness(ready);
 assert.equal(result.state,'STAGING_READY');
 assert.equal(result.verified,result.total);
 assert.equal(result.productionActivationAllowed,false);
});
test('missing metadata and invalid user count fail closed',()=>{
 assert.throws(()=>assessInvitationStagingReadiness(null));
 assert.equal(assessInvitationStagingReadiness({}).state,'BLOCKED');
 assert.equal(assessInvitationStagingReadiness({...ready,verifiedUserCount:'2'}).state,'BLOCKED');
 assert.equal(assessInvitationStagingReadiness({...ready,verifiedUserCount:1}).state,'BLOCKED');
});
