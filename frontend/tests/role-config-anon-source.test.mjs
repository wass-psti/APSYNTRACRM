import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('actual unsigned verification never uses a privileged bearer or fake identity',()=>{
 const source=readFileSync('scripts/verify-role-config-anon.mjs','utf8');
 assert.match(source,/sb_publishable_/);
 assert.doesNotMatch(source,/Authorization|Bearer|service_role|sb_secret_|set_config|jwt.claim|signIn|auth\/v1\/token/);
 assert.ok(source.includes('apsyntra_role_configuration_propose'));
 assert.ok(source.includes('apsyntra_role_templates'));
});
