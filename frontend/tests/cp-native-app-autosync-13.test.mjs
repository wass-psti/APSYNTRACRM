import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('sql/acceptance/cp-native-app-autosync-11-profile-compatibility.sql','utf8');

test('staging profile status check uses the authoritative active/disabled vocabulary',()=>{
 assert.match(source,/CHECK\(status IN \('active','disabled'\)\)/);
 assert.match(source,/'QA Two','disabled'/);
 assert.doesNotMatch(source,/'QA Two','inactive'/);
});
test('rehearsed CRM profile role vocabulary matches the existing backend constraint',()=>{
 assert.match(source,/platform_role IN \('admin_general_manager','hr','supervisor','employee'\)/);
 assert.match(source,/platform_role text NOT NULL DEFAULT 'employee'/);
});
test('status and role compatibility change only temporary fixture structures',()=>{
 assert.match(source,/CREATE TEMP TABLE cp11_staging_profiles/);
 assert.match(source,/ALTER TABLE cp11_staging_profiles/);
 assert.match(source,/ROLLBACK;/);
 assert.doesNotMatch(source,/ALTER TABLE\s+public\.profiles/i);
});
import {assessIndependentQaSessions,parseEndpoints}
 from '../../scripts/cp-native-app-autosync-13-signed-preflight.mjs';
const signed=[
 {endpoint:'http://127.0.0.1:9222',userId:'10000000-0000-4000-8000-000000000001',
  workspaceId:'a0000000-0000-4000-8000-000000000001',role:'admin_general_manager',
  active:true,authHttpStatus:200,workspaceHttpStatus:200,stagingOriginVerified:true},
 {endpoint:'http://127.0.0.1:9223',userId:'20000000-0000-4000-8000-000000000002',
  workspaceId:'a0000000-0000-4000-8000-000000000001',role:'employee',
  active:true,authHttpStatus:200,workspaceHttpStatus:200,stagingOriginVerified:true},
 {endpoint:'http://127.0.0.1:9225',userId:'30000000-0000-4000-8000-000000000003',
  workspaceId:'a0000000-0000-4000-8000-000000000001',role:'employee',
  active:true,authHttpStatus:200,workspaceHttpStatus:200,stagingOriginVerified:true}
];
test('three distinct signed staging actors qualify only for session preflight',()=>{
 const outcome=assessIndependentQaSessions(signed);
 assert.equal(outcome.status,'THREE_SIGNED_SESSIONS_VERIFIED');
 assert.equal(outcome.verified,3);
});
test('duplicate profile, cross-workspace, and missing signed response are rejected',()=>{
 for(const bad of [
  signed.map((s,i)=>i===2?{...s,userId:signed[1].userId}:s),
  signed.map((s,i)=>i===2?{...s,workspaceId:'b0000000-0000-4000-8000-000000000001'}:s),
  signed.map((s,i)=>i===2?{...s,authHttpStatus:0}:s),
  signed.map(s=>({...s,role:'employee'}))
 ])assert.equal(assessIndependentQaSessions(bad).status,'BLOCKED');
});
test('CDP endpoints must be distinct and strictly local',()=>{
 assert.deepEqual(parseEndpoints(signed.map(s=>s.endpoint)),signed.map(s=>s.endpoint));
 assert.throws(()=>parseEndpoints(['http://127.0.0.1:9222','http://127.0.0.1:9222','http://127.0.0.1:9225']));
 assert.throws(()=>parseEndpoints(['http://localhost:9222','http://127.0.0.1:9223','http://127.0.0.1:9225']));
});
