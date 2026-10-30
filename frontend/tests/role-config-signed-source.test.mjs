import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('docs/CP-RC01.1-SIGNED-ACCEPTANCE.md','utf8');
test('signed acceptance harness invokes only existing in-origin AuthClient and DomainApi',()=>{
 assert.match(source,/location\.origin !== 'https:\/\/wass-psti\.github\.io'/);
 assert.match(source,/await auth\.restore\(\)/);
 assert.match(source,/await auth\.getVerifiedUser\(\)/);
 assert.match(source,/apsyntra_role_is_bootstrap/);
 assert.match(source,/bootstrapVerified === true/);
 assert.match(source,/PASS_DENIED/);
});
test('acceptance does not export signed session credentials or modify user roles',()=>{
 assert.doesNotMatch(source,/console\.log\([^)]*(?:accessToken|access_token|refresh_token|password)/);
 assert.doesNotMatch(source,/admin_set_user_access|wm_admin_set_application_role|claim_bootstrap_admin\(\)/);
 assert.match(source,/proposal_only/);
 assert.match(source,/audit: 'NOT_RUN'/);
});
