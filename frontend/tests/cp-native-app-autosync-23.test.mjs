import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runner = readFileSync('scripts/cp-native-app-autosync-20-isolated-owner-clone.sh','utf8');
const runtime = readFileSync('scripts/cp-native-app-autosync-23-disposable-runtime.py','utf8');
const contract = readFileSync('scripts/cp-native-app-autosync-22-runtime-preflight.mjs','utf8');

test('CP23 runtime is opt-in and preserves networkless CP20 default',()=>{
 assert.match(runner,/CP23_DISPOSABLE_RUNTIME_PROBE/);
 assert.match(runner,/network_arg="none"/);
 assert.match(runner,/docker network create --internal/);
 assert.match(runner,/--network "\$network_arg"/);
 assert.match(runner,/phase="disposable-auth-data-api"/);
});
test('temporary network must be absent before creation and removed only when created',()=>{
 assert.match(runner,/pre-existing isolated QA network; refusing overwrite/);
 assert.match(runner,/network_created=false/);
 assert.match(runner,/network_created=true/);
 assert.match(runner,/if \[\[ "\$network_created" == true \]\]; then/);
 assert.match(runner,/docker network rm "\$network"/);
});
test('runtime refuses existing service containers and verifies exact images and source DB',()=>{
 assert.match(runtime,/Existing temporary service; refusing overwrite/);
 assert.match(runtime,/supabase_auth_cp16019-disposable-local/);
 assert.match(runtime,/supabase_rest_cp16019-disposable-local/);
 assert.match(runtime,/public\.ecr\.aws\/supabase\/gotrue:v2\.197\.0/);
 assert.match(runtime,/public\.ecr\.aws\/supabase\/postgrest:v16\.4/);
 assert.match(runtime,/Unexpected source Auth database/);
 assert.match(runtime,/Unexpected source Data API database/);
});
test('CP23 genuine isolated services must share one isolated database',()=>{
 assert.match(runtime,/NETWORK not in linked\["NetworkSettings"\]\["Networks"\]/);
 assert.match(runtime,/Disposable database was not started on internal network/);
 assert.match(runtime,/const|conn = \("postgres:\/\/postgres:"/);
 assert.match(runtime,/rest_env\["PGRST_DB_URI"\] = conn/);
 assert.match(runtime,/auth_env\["GOTRUE_DB_DATABASE_URL"\] = conn/);
});
test('only Auth migration identifiers are copied and staging ledger hash is verified',()=>{
 assert.match(runtime,/--data-only/);
 assert.match(runtime,/-t", "auth\.schema_migrations"/);
 assert.match(runtime,/ledger\.count\(b"INSERT INTO auth\.schema_migrations"\) != 82/);
 assert.match(runtime,/89b5e505220d565bc38e8092af7b6c0f/);
 assert.doesNotMatch(runtime,/pg_dump.*auth\.users|pg_dump.*auth\.sessions/);
});
test('secrets are temporary and services never publish nonloopback ports',()=>{
 assert.match(runtime,/secrets\.token_urlsafe\(48\)/);
 assert.match(runtime,/TemporaryDirectory/);
 assert.match(runtime,/path\.chmod\(0o600\)/);
 assert.match(runtime,/docker\", \"exec\", DATABASE, \"wget\"/);
 assert.doesNotMatch(runtime,/\"-p\", \"127\.0\.0\.1/);
 assert.match(runtime,/GOTRUE_JWT_SECRET/);
 assert.match(runtime,/PGRST_JWT_SECRET/);
 assert.doesNotMatch(runtime,/print\(\s*(?:password|jwt|token|db_password|auth_env|rest_env)\b/i);
});
test('failed or successful service probes restore all containers in reverse order',()=>{
 assert.match(runtime,/finally:/);
 assert.match(runtime,/for name in reversed\(created\)/);
 assert.match(runtime,/docker", "rm", "-f"/);
 assert.match(runner,/trap cleanup EXIT/);
 assert.match(runtime,/NOT VERIFIED: newly registered module signed writer acceptance/);
});
test('CP23 does not introduce model training or weaken RLS/audit',()=>{
 const sources = runner + '\n' + runtime + '\n' + contract;
 assert.doesNotMatch(sources,/torch\.optim|tensorflow|optimizer\.step\(|\.backward\(|model\.fit\(|gradient_descent\s*\(|train_model\s*\(/i);
 assert.doesNotMatch(sources,/pip install|npm install|ALTER TABLE.*DISABLE ROW LEVEL SECURITY|DROP TRIGGER/);
});

test('CP23 signed QA requires three real GoTrue accounts with independent identity readback',()=>{
 assert.match(runtime,/for _ in range\(3\):/);
 assert.match(runtime,/secrets\.token_hex\(10\)/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/signup"/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/token\?grant_type=password"/);
 assert.match(runtime,/signed_http\(AUTH, 9999, "\/user"/);
 assert.match(runtime,/signed_http\(REST, 3000, "\/"/);
 assert.match(runtime,/len\(set\(identities\)\) != 3/);
 assert.match(runtime,/SELECT count\(\*\) FROM auth\.users/);
});

test('signed failures are categorized without exposing response bodies or tokens',()=>{
 assert.match(runtime,/Isolated HTTP rejected:/);
 assert.match(runtime,/auth-signup/);
 assert.match(runtime,/auth-login/);
 assert.match(runtime,/auth-user/);
 assert.match(runtime,/data-api/);
 assert.match(runtime,/result\.stderr/);
 assert.doesNotMatch(runtime,/print\(result\.(?:stdout|stderr)\)/);
 assert.doesNotMatch(runtime,/logger.*access_token|console\.log.*token/);
});

test('temporary HTTP JSON and bearer files are deleted in a finally block',()=>{
 assert.match(runtime,/request_body\.chmod\(0o600\)/);
 assert.match(runtime,/bearer_file\.chmod\(0o600\)/);
 assert.match(runtime,/finally:/);
 assert.match(runtime,/file\.unlink\(missing_ok=True\)/);
 assert.match(runtime,/docker", "exec", DATABASE, "rm", "-f"/);
});
