import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planNativeAppSchemaRecovery,REQUIRED_TABLES,REQUIRED_FUNCTIONS}
 from '../../scripts/cp-native-app-autosync-09-schema-plan.mjs';

const complete={
 isolated:true,tables:[...REQUIRED_TABLES],functions:[...REQUIRED_FUNCTIONS],
 migrationCount:54,signedSessionCount:3,baselineReconciled:true,
 targetModuleRoleContractVerified:true
};
test('observed invitation staging is blocked and does not imply migration safety',()=>{
 const data={...complete,
  tables:['public.profiles','public.workspaces','public.workspace_members'],
  functions:[],migrationCount:0,signedSessionCount:0,
  baselineReconciled:false,targetModuleRoleContractVerified:false};
 const result=planNativeAppSchemaRecovery(data);
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.migrationProvenance,'UNKNOWN_BASELINE');
 assert.equal(result.missingTables.length,3);
 assert.equal(result.missingFunctions.length,4);
 assert.equal(result.missingQaSessions,3);
 assert.equal(result.stagingMutationPerformed,false);
 assert.equal(result.productionActivationAllowed,false);
});
test('no role backend activation even with schema until real sessions and contract verified',()=>{
 const outcome=planNativeAppSchemaRecovery({...complete,
  signedSessionCount:2,targetModuleRoleContractVerified:false});
 assert.equal(outcome.state,'BLOCKED');
 assert.equal(outcome.missingQaSessions,1);
 assert.equal(outcome.steps.at(-1).status,'BLOCKED');
});
test('complete evidence permits only isolated acceptance, never production',()=>{
 const result=planNativeAppSchemaRecovery(complete);
 assert.equal(result.state,'READY_FOR_CONTROLLED_NONPRODUCTION_ACCEPTANCE');
 assert.equal(result.productionActivationAllowed,false);
 assert.equal(result.steps.every(x=>x.status==='VERIFIED'),true);
});
test('untrusted and malformed staging inventory is rejected',()=>{
 for(const item of [null,[],{}, {...complete,isolated:false},
   {...complete,migrationCount:-1}])assert.throws(()=>planNativeAppSchemaRecovery(item));
 const sql=readFileSync('sql/acceptance/cp-native-app-autosync-09-staging-inventory.sql','utf8');
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(?:TABLE|FUNCTION|INTO|public)/i);
 assert.match(sql,/to_regprocedure/);
});
