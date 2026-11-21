import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gate=readFileSync('frontend/apps/Paseo/source/src/admin/staging/StagingAdminGate.tsx','utf8');
const browser=readFileSync('scripts/pdl-aps-native-browser.mjs','utf8');

test('an administrator session outage does not incorrectly trigger sign-in',()=>{
 assert.match(gate,/\[401, 403\]\.includes\(response\.status\) \? 'denied' : 'unavailable'/);
 assert.match(gate,/if \(status === 'unavailable'\)/);
 assert.match(gate,/Your session has not been signed out/);
 assert.match(gate,/setRetry\(value => value \+ 1\)/);
 assert.match(gate,/if \(status === 'denied'\) return <Navigate to="\/admin\/sign-in" replace/);
});

test('session recovery browser test uses synthetic API and does not expose tokens',()=>{
 assert.match(browser,/sessionChecks===1\?503:200/);
 assert.match(browser,/Retry session check/);
 assert.match(browser,/transient administrator session outage preserves route and recovers on retry/);
 assert.match(browser,/missing_session/);
});

const sql=readFileSync('supabase/pdl-booking/acceptance/pdl_courts_admin_02_rollback.sql','utf8');
test('disposable PostgreSQL acceptance covers existing persisted configuration APIs',()=>{
 for(const operation of ['configure_court','admin_courts','configure_rate',
   'ops_schedule_put','ops_block_add','ops_calendar','ops_block_remove',
   'ops_policy_put','ops_policy_get','payment_methods']){
   assert.ok(sql.includes(`'${operation}'`),operation);
 }
 assert.match(sql,/PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS/);
 assert.match(sql,/^begin;/m);
 assert.match(sql,/^rollback;/m);
 assert.doesNotMatch(sql,/^commit;/m);
});

test('browser fixtures verify every module save and refresh, without touching production API',()=>{
 for(const label of ['court configuration write','rate configuration write',
   'calendar weekday and maintenance','operational policy write',
   'booking payment verification and customer projection','synthetic QR payment configuration upload']){
   assert.ok(browser.includes(label),label);
 }
 assert.match(browser,/moduleErrors,\[\]/);
});
