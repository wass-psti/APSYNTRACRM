import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runner=readFileSync('scripts/cp-native-app-autosync-20-isolated-owner-clone.sh','utf8');
const runtime=readFileSync('scripts/cp-native-app-autosync-23-disposable-runtime.py','utf8');
const insertProbe=readFileSync('sql/acceptance/cp-native-app-autosync-24-signup-trigger-probe.sql','utf8');

test('CP24 repairs only a verified disposable Auth schema usage gap',()=>{
 assert.match(runner,/CP24_AUTH_SCHEMA_USAGE_PROBE/);
 assert.match(runner,/GRANT USAGE ON SCHEMA auth TO supabase_auth_admin/);
 assert.match(runner,/\-d cp_native20_owner_clone/);
 assert.match(runner,/CP23_DISPOSABLE_RUNTIME_PROBE/);
 assert.match(runner,/disposable Auth table owner schema USAGE restored/);
});
test('normal owner-only clone remains network-isolated with no automatic grant',()=>{
 assert.match(runner,/network_arg="none"/);
 assert.match(runner,/if \[\[ "\$\{CP24_AUTH_SCHEMA_USAGE_PROBE:-\}" == 1 \]\]; then/);
 assert.match(runner,/docker network create --internal/);
 assert.match(runner,/trap cleanup EXIT/);
});
test('Auth minimal INSERT probe always rolls back and never targets a real user',()=>{
 assert.match(insertProbe,/current_database\(\) <> 'cp_native20_owner_clone'/);
 assert.match(insertProbe,/BEGIN;/);
 assert.match(insertProbe,/ROLLBACK;/);
 assert.match(insertProbe,/CP24_AUTH_INSERT_TRIGGER=PASS/);
 assert.match(insertProbe,/CP24_AUTH_INSERT_TRIGGER_SQLSTATE/);
 assert.match(insertProbe,/example\.invalid/);
 assert.doesNotMatch(insertProbe,/COMMIT;/);
});
test('source GoTrue asymmetric signing keys are cleared in disposable runtime',()=>{
 assert.match(runtime,/auth_env\["GOTRUE_JWT_KEYS"\] = "\[\]"/);
 assert.match(runtime,/auth_env\["GOTRUE_JWT_SECRET"\] = jwt/);
 assert.match(runtime,/rest_env\["PGRST_JWT_SECRET"\] = jwt/);
 assert.match(runtime,/secrets\.token_urlsafe\(48\)/);
});
test('same isolated backend is required for both Auth and signed Data API',()=>{
 assert.match(runtime,/Disposable database was not started on internal network/);
 assert.match(runtime,/auth_env\["GOTRUE_DB_DATABASE_URL"\] = conn/);
 assert.match(runtime,/rest_env\["PGRST_DB_URI"\] = conn/);
 assert.match(runtime,/signed_http\(REST, 3000, "\/"/);
});
test('all three GoTrue sign-ins are verified before the Data API request',()=>{
 assert.match(runtime,/for _ in range\(3\):/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/signup"/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/token\?grant_type=password"/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/user"/);
 assert.match(runtime,/len\(set\(identities\)\) != 3/);
 assert.match(runtime,/PASS: three independent actual GoTrue signup, sign-in and signed \/user checks/);
});
test('Docker stderr and stdout both inform sanitized Auth diagnostic labels',()=>{
 assert.match(runtime,/result\.stdout \+ result\.stderr/);
 assert.match(runtime,/sanitized_container_log\(AUTH\)/);
 assert.match(runtime,/sanitized_container_log\(DATABASE\)/);
 assert.match(runtime,/CP24_DENIED_DB_OBJECTS/);
 assert.match(runtime,/CP24_AUTH_SIGNUP_CLASSES/);
 assert.doesNotMatch(runtime,/print\(logs\)|print\(pg_logs\)|print\(result\.stderr\)/);
});
test('JWT metadata reporting never logs token, user ID or email',()=>{
 assert.match(runtime,/CP24_SIGNED_JWT_ALG/);
 assert.match(runtime,/CP24_SIGNED_JWT_ROLE/);
 assert.match(runtime,/CP24_SIGNED_JWT_AUD/);
 assert.doesNotMatch(runtime,/print\(token\)|print\(email\)|print\(identities\)/);
});
test('no runtime services or credentials persist after isolated QA',()=>{
 assert.match(runtime,/finally:/);
 assert.match(runtime,/for name in reversed\(created\)/);
 assert.match(runtime,/file\.unlink\(missing_ok=True\)/);
 assert.match(runner,/if \[\[ "\$network_created" == true \]\]; then/);
 assert.match(runner,/rm -rf -- "\$tmp"/);
});
test('CP24 introduces no model training or architectural bypass',()=>{
 const content=[runner,runtime,insertProbe].join('\n');
 assert.doesNotMatch(content,/torch\.optim|tensorflow|\.backward\(|optimizer\.step\(|model\.fit\(|gradient_descent\s*\(|train_model\s*\(/i);
 assert.doesNotMatch(content,/pip install|npm install|ALTER TABLE.*DISABLE ROW LEVEL SECURITY|DROP TRIGGER|supabase db push/i);
});
