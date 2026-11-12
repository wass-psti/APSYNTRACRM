import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const query=readFileSync(new URL('../../sql/tests/cp-board-col-signed-runtime-closeout-readonly.sql',import.meta.url),'utf8');
test('production signed-runtime evidence is strictly observational',()=>{
 const sql=query.replace(/^\s*--[^\n]*$/gm,'').replace(/'[^']*'/g,"''");
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|DO|CALL)\b/i);
 assert.match(query,/real_go_true_browser_request_proven_by_privileged_sql',false/);
 assert.match(query,/PENDING_NEW_GENUINE_SIGNED_BROWSER_ROUNDTRIP/);
 assert.match(query,/POST_ACTIVATION_DATABASE_RESTORE_PASS_BROWSER_PROVENANCE_SEPARATE/);
});
test('evidence independently requires exact QA cell values, original column, snapshots and audit parity',()=>{
 assert.match(query,/B2 QA item 1/);
 assert.match(query,/B2 QA item 4/);
 assert.match(query,/restored_expected_value_pairs/);
 assert.match(query,/postactivation_delete_snapshots/);
 assert.match(query,/postactivation_restored_snapshots/);
 assert.match(query,/QA_DELETED_RESTORATION_REQUIRED/);
 assert.match(query,/unrelated_contacts_data_preserved/);
 assert.match(query,/2026-11-12T04:50:07Z/);
});
