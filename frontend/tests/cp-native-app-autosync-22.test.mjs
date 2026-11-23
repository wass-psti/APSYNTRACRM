import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assessRuntimeIntegration}
 from '../../scripts/cp-native-app-autosync-22-runtime-preflight.mjs';

const runner=readFileSync('scripts/cp-native-app-autosync-20-isolated-owner-clone.sh','utf8');
const probe=readFileSync('scripts/cp-native-app-autosync-22-runtime-preflight.mjs','utf8');
const baseline={
 authImage:'public.ecr.aws/supabase/gotrue:v2.197.0',
 restImage:'public.ecr.aws/supabase/postgrest:v16.4',
 authDatabase:'cp_native20_owner_clone',
 restDatabase:'cp_native20_owner_clone',
 targetDatabase:'cp_native20_owner_clone',
 localMigrations:84,expectedStagingMigrations:84,
 registrations:[{moduleId:'new-registered-module'}],
 knownRoles:{'time-tracker':['Employee']},
 moduleContractVerified:true,
 authHealthVerified:true,restHealthVerified:true
};

test('matching isolated runtimes with explicit role contract are ready for signed tests only',()=>{
 const verdict=assessRuntimeIntegration(baseline);
 assert.equal(verdict.status,'RUNTIME_READY_FOR_SIGNED_TEST');
 assert.deepEqual(verdict.issues,[]);
});
test('Auth and Data API must use the same disposable database',()=>{
 for(const field of ['authDatabase','restDatabase','targetDatabase']){
  const verdict=assessRuntimeIntegration({...baseline,[field]:'existing-local-postgres'});
  assert.equal(verdict.status,'BLOCKED');
  assert.ok(verdict.issues.some(x=>x.includes('same isolated database')));
 }
});
test('migrations and current service versions must be verified',()=>{
 assert.equal(assessRuntimeIntegration({...baseline,localMigrations:82}).status,'BLOCKED');
 assert.equal(assessRuntimeIntegration({...baseline,authImage:'unknown'}).status,'BLOCKED');
 assert.equal(assessRuntimeIntegration({...baseline,restImage:'unknown'}).status,'BLOCKED');
});
test('verified healthy Auth and Data API are independently required',()=>{
 assert.equal(assessRuntimeIntegration({...baseline,authHealthVerified:false}).status,'BLOCKED');
 assert.equal(assessRuntimeIntegration({...baseline,restHealthVerified:false}).status,'BLOCKED');
});
test('new registration requires explicit verified module role contract',()=>{
 assert.equal(assessRuntimeIntegration({...baseline,registrations:[]}).status,'BLOCKED');
 assert.equal(assessRuntimeIntegration({...baseline,moduleContractVerified:false}).status,'BLOCKED');
 assert.equal(assessRuntimeIntegration({
  ...baseline,registrations:[{moduleId:'time-tracker'}]
 }).status,'BLOCKED');
});
test('owner clone error handler reports stage and class without printing secrets',()=>{
 assert.match(runner,/CP22_FAILURE_STAGE=/);
 assert.match(runner,/CP22_FAILURE_CLASS=/);
 assert.match(runner,/CP22_FAILURE_EXIT=/);
 assert.match(runner,/phase="staging-schema-export"/);
 assert.match(runner,/phase="staging-schema-restore"/);
 assert.match(runner,/phase="auth-ownership-verification"/);
 assert.match(runner,/trap 'diagnose_failure/);
 assert.match(runner,/trap cleanup EXIT/);
});
test('no-network diagnostic failure runs and cleans up',()=>{
 const run=spawnSync('bash',[
  'scripts/cp-native-app-autosync-20-isolated-owner-clone.sh',
  '--diagnostic-self-test'
 ],{encoding:'utf8'});
 assert.equal(run.status,1);
 assert.match(run.stderr,/CP22_FAILURE_STAGE=diagnostic-self-test/);
 assert.match(run.stderr,/CP22_FAILURE_CLASS=unclassified/);
 assert.match(run.stderr,/CP22_FAILURE_EXIT=1/);
 assert.equal(existsSync('/tmp/cp_native20_pg_owner_qa.lock'),false);
});
test('CP22 diagnostics, runtime inspection and original inference architecture remain training-free',()=>{
 const sources=runner+'\n'+probe;
 assert.doesNotMatch(sources,/torch\.optim|tensorflow|optimizer\.step\(|\.backward\(|model\.fit\(|gradient_descent\s*\(|train_model\s*\(/i);
 assert.doesNotMatch(sources,/pip install|npm install|supabase db push|ALTER ROLE|GRANT EXECUTE/);
 assert.match(probe,/NOT VERIFIED: actual signed role writer/);
 assert.doesNotMatch(probe,/process\.env\.SERVICE_ROLE_KEY|console\.log\(.*DATABASE_URL/);
});
