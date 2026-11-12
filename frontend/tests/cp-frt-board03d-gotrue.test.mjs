import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executeFRT03D} from '../../scripts/cp-frt-board03d-gotrue-acceptance.mjs';
const source=readFileSync('scripts/cp-frt-board03d-gotrue-acceptance.mjs','utf8');
const workflow=readFileSync('.github/workflows/cp-frt-sec10-ci03.yml','utf8');
test('signed acceptance cannot reach any network outside explicit ephemeral GitHub environment',async()=>{
 let network=0;const fetcher=async()=>{network++;throw Error('NETWORK_MUST_NOT_BE_CALLED');};
 for(const env of [{},{CI:'true',GITHUB_ACTIONS:'true',SEC10_CI03:'EPHEMERAL_ONLY'},
  {CI:'true',GITHUB_ACTIONS:'false',SEC10_CI03:'EPHEMERAL_ONLY',FRT03D_EPHEMERAL:'YES'},
  {CI:'true',GITHUB_ACTIONS:'true',SEC10_CI03:'WRONG',FRT03D_EPHEMERAL:'YES'}])
  await assert.rejects(()=>executeFRT03D('',env,fetcher),/FRT03D_ISOLATED_ENV_REQUIRED/);
 assert.equal(network,0);
});
test('acceptance performs real GoTrue sign-in, independent fresh session and both signed CAS operations',()=>{
 assert.match(source,/new IsolatedSignedClient\(config,fetcher\)/);
 assert.match(source,/member\.signIn\(config\.memberEmail,config\.memberPassword\)/);
 assert.match(source,/member\.endSession\(\)/);
 assert.match(source,/reopened\.sessionId!==first\.sessionId/);
 assert.match(source,/frt_create_request/);
 assert.match(source,/frt_update_request_date_cas/);
 assert.match(source,/frt_assign_request_person/);
 assert.match(source,/frt_set_request_filing_status/);
 assert.match(source,/FILING01_STALE_WRITE_ACCEPTED/);
 assert.match(source,/FILING01_FOREIGN_MEMBER_WRITE_ACCEPTED/);
 assert.match(source,/frt_restricted_request_detail/);
 assert.match(source,/frt_request_assignment/);
 assert.match(source,/FOREIGN_WORKSPACE_DATE_WRITE_ACCEPTED/);
 assert.match(source,/SIGNED_STALE_PERSON_ACCEPTED/);
 assert.match(source,/QA_FIXTURE_CLEANUP_INVALID/);
});
test('workflow starts and destroys CI-only native stack and never deploys test data',()=>{
 assert.match(workflow,/supabase start --runtime native/);
 assert.match(workflow,/FRT03D_EPHEMERAL: "YES"/);
 assert.match(workflow,/supabase stack destroy --yes/);
 assert.match(workflow,/if: always\(\)/);
 assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE_KEY|https:\/\/.*supabase\.co/);
 assert.doesNotMatch(workflow,/supabase db push|supabase link|supabase migration up/);
});
