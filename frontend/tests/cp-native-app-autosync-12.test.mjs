import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessNativeAppMigrationPlan,REQUIRED_MIGRATIONS}
 from '../../scripts/cp-native-app-autosync-12-plan.mjs';

const manifest=JSON.parse(readFileSync('supabase/migration-source-manifest.json','utf8'));
const contents=Object.fromEntries(REQUIRED_MIGRATIONS.map(file=>[
 file,readFileSync('supabase/migrations/'+file,'utf8')
]));
const complete={
 isolated:true,migrationCount:276,authUserCount:3,signedSessionCount:3,
 baselineReconciled:true,workBoards:true,moduleAssignments:true,roleAudit:true,
 scopeGuard:true,roleSnapshot:true,assignmentWriter:true,catalogRpc:true,
 signedSessionsVerified:true,signedReadbackRestored:true,
 moduleContract:{moduleId:'example-module',roles:['Reader'],writerRpc:'app_writer',
  readbackRpc:'app_reader',serverVerified:true}
};
test('ordered role migration anchors have verified original SQL provenance',()=>{
 const result=assessNativeAppMigrationPlan({manifest,staging:complete,contents});
 assert.equal(result.migrationSequence.length,8);
 assert.ok(result.migrationSequence.every(m=>m.sourceVerified));
 assert.equal(result.noAutomaticSchemaChanges,true);
 assert.equal(result.productionActivationAllowed,false);
 assert.equal(result.state,'READY_FOR_SEPARATE_RELEASE_REVIEW');
});
test('existing staging remains blocked even when repository migration sources are verified',()=>{
 const staging={...complete,migrationCount:0,authUserCount:2,signedSessionCount:0,
  baselineReconciled:false,workBoards:false,moduleAssignments:false,
  roleAudit:false,scopeGuard:false,roleSnapshot:false,assignmentWriter:false,
  catalogRpc:false,signedSessionsVerified:false,signedReadbackRestored:false,
  moduleContract:null};
 const result=assessNativeAppMigrationPlan({manifest,staging,contents});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.missingBackend.length,7);
 assert.equal(result.missingSignedSessions,3);
 assert.equal(result.gates[0].status,'VERIFIED');
 assert.equal(result.gates[1].status,'BLOCKED');
});
test('altered migration SQL never passes source verification',()=>{
 const modified={...contents,[REQUIRED_MIGRATIONS[0]]:contents[REQUIRED_MIGRATIONS[0]]+'\n-- injected'};
 const result=assessNativeAppMigrationPlan({manifest,staging:complete,contents:modified});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.migrationSequence[0].sourceVerified,false);
});
test('new module requires an explicit server-verified role writer and readback',()=>{
 const result=assessNativeAppMigrationPlan({manifest,
  staging:{...complete,moduleContract:{moduleId:'new-module',roles:['Admin'],
    writerRpc:'',readbackRpc:'',serverVerified:false}},contents});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.gates[4].status,'BLOCKED');
});
test('unverified or missing staging evidence is rejected',()=>{
 for(const staging of [null,{}, {...complete,isolated:false},
  {...complete,signedSessionCount:-1}])
  assert.throws(()=>assessNativeAppMigrationPlan({manifest,staging,contents}));
});

test('two actual staging Auth identities cannot be treated as three signed QA participants',()=>{
 const result=assessNativeAppMigrationPlan({manifest,
  staging:{...complete,authUserCount:2},contents});
 assert.equal(result.state,'BLOCKED');
 assert.equal(result.gates[3].status,'BLOCKED');
});
