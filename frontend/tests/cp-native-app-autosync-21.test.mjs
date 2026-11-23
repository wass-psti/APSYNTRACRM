import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSignedWriterReadiness}
 from '../../scripts/cp-native-app-autosync-21-signed-readiness.mjs';

const source=readFileSync('scripts/cp-native-app-autosync-21-signed-readiness.mjs','utf8');
const base={
 sourceName:'cp_native20_pg_owner_qa',
 sourceDatabase:'cp_native20_owner_clone',
 activeRegistrations:[{moduleId:'registered-new'}],
 knownRoles:{'order-intake':['User']},
 auditTriggerName:'wm_application_audit_immutable',
 auditTriggerEnabled:true,
 auditFunctionText:'Application-role audit history is append-only',
 isolatedBackend:true,
 authBackendMatchesWriter:true,
 independentSignedProfiles:3,
 signedWriterAvailable:true,
 signedReaderAvailable:true,
 moduleContractVerified:true
};
test('all actual isolated acceptance prerequisites can lead to readiness',()=>{
 const result=assessSignedWriterReadiness(base);
 assert.equal(result.status,'READY_FOR_ACCEPTANCE');
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.registryStatus,'CONTRACT_REVIEW_REQUIRED');
});
test('shared source cannot be mistaken for disposable signed target',()=>{
 const result=assessSignedWriterReadiness({
  ...base,sourceName:'supabase_db_cp16019-disposable-local',
  sourceDatabase:'postgres',isolatedBackend:false
 });
 assert.equal(result.status,'BLOCKED');
 assert.ok(result.blockers.includes('No disposable, one-backend write target'));
});
test('split GoTrue and role writer databases prevent signed certification',()=>{
 const result=assessSignedWriterReadiness({...base,authBackendMatchesWriter:false});
 assert.ok(result.blockers.includes('GoTrue and role writer not connected to one database'));
});
test('three authentic profiles are mandatory',()=>{
 for(const count of [0,1,2,4]){
  assert.equal(assessSignedWriterReadiness({...base,independentSignedProfiles:count}).status,'BLOCKED');
 }
});
test('append-only audit trigger and historical writer must be verified',()=>{
 for(const change of [
  {auditTriggerName:null},{auditTriggerEnabled:false},{auditFunctionText:'different'}
 ]){
  const result=assessSignedWriterReadiness({...base,...change});
  assert.ok(result.blockers.some(item=>item.startsWith('Canonical append-only')));
 }
});
test('new module registration alone is not a sufficient domain contract',()=>{
 const result=assessSignedWriterReadiness({...base,moduleContractVerified:false});
 assert.ok(result.blockers.includes('Registered module writer/roles require explicit verification'));
 assert.equal(assessSignedWriterReadiness({
  ...base,activeRegistrations:[{moduleId:'order-intake'}]
 }).status,'BLOCKED');
});
test('actual writer and reader are independent required acceptance gates',()=>{
 assert.equal(assessSignedWriterReadiness({...base,signedWriterAvailable:false}).status,'BLOCKED');
 assert.equal(assessSignedWriterReadiness({...base,signedReaderAvailable:false}).status,'BLOCKED');
});
test('CP21 read-only checks cannot modify Auth, grants, immutable audit, or run model training',()=>{
 assert.match(source,/pg_get_functiondef/);
 assert.match(source,/pg_trigger/);
 assert.match(source,/description LIKE/);
 assert.match(source,/NOT VERIFIED/);
 assert.doesNotMatch(source,/(?:INSERT INTO|DELETE FROM|UPDATE public|ALTER ROLE|GRANT |REVOKE |supabase db push|apply_migration)/);
 assert.doesNotMatch(source,/torch\.optim|\.backward\(|optimizer\.step\(|model\.fit\(|gradient_descent\s*\(|train_model\s*\(/i);
});
