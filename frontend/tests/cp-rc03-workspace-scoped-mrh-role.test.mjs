import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('sql/cp-rc03-workspace-scoped-mrh-role-management.sql','utf8');
const setup=readFileSync('sql/tests/cp-rc03-disposable-setup.sql','utf8');
const rollback=readFileSync('sql/cp-rc03-workspace-scoped-mrh-role-management-rollback.sql','utf8');
const acceptance=readFileSync('sql/tests/cp-rc03-workspace-scoped-mrh-role-acceptance.sql','utf8');
const rollbackAcceptance=readFileSync('sql/tests/cp-rc03-rollback-acceptance.sql','utf8');
const runner=readFileSync('scripts/cp-rc03-mrh-role-disposable-acceptance.sh','utf8');
const client=readFileSync('frontend/user-role-management.js','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('MRH role changes use the existing workspace-scoped domain table only',()=>{
 assert.match(migration,/p_resource_id='material-request-hub' THEN/);
 assert.match(migration,/FROM public\.material_request_hub_memberships\s+WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id FOR UPDATE/);
 assert.match(migration,/INSERT INTO public\.material_request_hub_memberships\(\s*workspace_id,user_id,role,enabled,status,assigned_by,created_at,updated_at\)/);
 assert.match(migration,/ON CONFLICT\(workspace_id,user_id\) DO UPDATE/);
 assert.match(migration,/WHERE workspace_id=p_workspace_id AND user_id=p_target_user_id/);
 assert.match(migration,/p_resource_id<>'material-request-hub' AND/);
 assert.match(migration,/IF p_scope='module' THEN/);
 assert.match(migration,/p_scope IS NULL/);
 assert.match(migration,/Legacy global MRH role rows require explicit workspace reconciliation/);
 assert.match(rollback,/Ambiguous multi-workspace application role target/);
 assert.doesNotMatch(rollback,/cp-rc03-workspace-scoped-mrh-v1/);
});

test('central bootstrap authorization, self/protected denial, CAS and audit are preserved',()=>{
 for(const rule of [
  'PERFORM public.apsyntra_role_require_scope(p_workspace_id)',
  'p_target_user_id=v_actor',
  'apsyntra_role_bootstrap_identities',
  'public.is_platform_admin(p_target_user_id)',
  "ERRCODE='PT409'",
  'pg_advisory_xact_lock',
  'apsyntra_role_change_requests',
  'apsyntra_role_change_audit'
 ])assert.ok(migration.includes(rule),rule);
 assert.match(migration,/p_role NOT IN \('ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER'\)/);
 assert.match(migration,/CASE WHEN p_enabled THEN 'active' ELSE 'disabled' END/);
 assert.match(migration,/NOTIFY pgrst, 'reload schema'/);
});

test('snapshot reports verified workspace counts and authoritative MRH membership state',()=>{
 assert.match(migration,/'activeWorkspaceCount'/);
 assert.match(migration,/'roleManagementContract','cp-rc03-workspace-scoped-mrh-v1'/);
 assert.match(migration,/WHERE a\.module_id<>'material-request-hub'/);
 assert.match(migration,/FROM public\.material_request_hub_memberships mr/);
 assert.match(migration,/mr\.workspace_id=p_workspace_id/);
 assert.match(migration,/'status',mr\.status/);
});

test('UI fails closed for unknown global role scope and permits only verified scoped MRH actions',()=>{
 assert.match(client,/workspaceScopedMrhAvailable/);
 assert.match(client,/cp-rc03-workspace-scoped-mrh-v1/);
 assert.match(client,/activeWorkspaceCount/);
 assert.match(client,/globalModuleRoleBlocked&&id!=='material-request-hub'/);
 assert.match(client,/id==='material-request-hub'&&!data\.workspaceScopedMrhAvailable/);
 assert.match(app,/workspaceCount>1/);
 assert.match(app,/workspaceScopedMrhAvailable!==true/);
 assert.match(app,/cannot be changed from a single-workspace screen/);
});

test('disposable acceptance covers two-workspace isolation, stale CAS, denials, board scope and audit',()=>{
 for(const rule of [
  'workspace_id=other_workspace',
  "module_id='material-request-hub'",
  'Stale revision',
  'time-tracker',
  'Self assignment',
  'Protected admin target',
  'Foreign workspace context',
  'Non-bootstrap actor',
  'activeWorkspaceCount',
  'apsyntra_role_change_audit'
 ])assert.ok(acceptance.includes(rule),rule);
 assert.match(setup,/11111111-1111-4111-8111-111111111111/);
 assert.match(setup,/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
 assert.match(runner,/--network none --read-only/);
 assert.match(runner,/CP_RC03_LEGACY_GLOBAL_MRH_GUARD_PASS/);
 assert.match(runner,/postgres:17\.11\.0\.004/);
 assert.doesNotMatch(runner,/--privileged|--network host|--publish/);
});
