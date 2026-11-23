import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNativeApplicationAcceptance} from '../../scripts/cp-native-app-autosync-08-readiness.mjs';
const complete={
 isolated:true,workBoards:true,moduleAssignments:true,roleAudit:true,
 scopeGuard:true,roleSnapshot:true,assignmentWriter:true,catalogRpc:true,
 signedAdmin:true,signedMembers:2,moduleRoleVocabulary:true,moduleWriterReadback:true,
 separateSessionReadback:true,restorationVerified:true
};
test('partial staging schemas and simulated sessions cannot pass release acceptance',()=>{
 const result=assessNativeApplicationAcceptance({
  ...complete,workBoards:false,moduleAssignments:false,roleAudit:false,
  scopeGuard:false,roleSnapshot:false,assignmentWriter:false,catalogRpc:false,
  signedMembers:0,separateSessionReadback:false,restorationVerified:false
 });
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.productionActivationAllowed,false);
 assert.ok(result.blocked.includes('signed_role_snapshot'));
 assert.ok(result.blocked.includes('three_distinct_signed_profiles'));
});
test('a module registration alone never certifies assignment persistence',()=>{
 const outcome=assessNativeApplicationAcceptance({...complete,moduleRoleVocabulary:false,
  moduleWriterReadback:false});
 assert.deepEqual(outcome.blocked,[
  'target_module_role_vocabulary','target_module_writer_and_readback'
 ]);
});
test('even fully verified evidence only qualifies for release review, not automatic deployment',()=>{
 const result=assessNativeApplicationAcceptance(complete);
 assert.equal(result.status,'READY_FOR_RELEASE_REVIEW');
 assert.equal(result.verified,13);
 assert.equal(result.productionActivationAllowed,false);
});
test('invalid or missing evidence is refused',()=>{
 for(const input of [null,[],true,'ok'])assert.throws(()=>assessNativeApplicationAcceptance(input));
});
