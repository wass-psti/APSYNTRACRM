import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WS01_SWITCHING_ENABLED} from '../workspace-ui.js';

const activate=readFileSync('sql/cp-ws01-switch-controlled-activation-CANDIDATE-NOT-APPLIED.sql','utf8');
const disable=readFileSync('sql/cp-ws01-switch-emergency-disable-CANDIDATE-NOT-APPLIED.sql','utf8');
const cutover=readFileSync('sql/cp-ws01b-session-cutover-candidate.sql','utf8');
const lifecycle=readFileSync('frontend/workspace-lifecycle-client.js','utf8');
const ui=readFileSync('frontend/workspace-ui.js','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('staged frontend selects only by signed CAS with authoritative context reread',()=>{
 assert.equal(WS01_SWITCHING_ENABLED,true);
 assert.match(lifecycle,/this\.api\.rpc\('wm_ws01_select'/);
 assert.match(lifecycle,/await this\.signed\(\)/);
 assert.match(lifecycle,/after\.workspaceId!==targetWorkspaceId/);
 assert.match(ui,/requestSignedWorkspaceSwitch\(/);
 assert.match(ui,/row\.verifiedScope==='SIGNED_MEMBER_RPC'/);
 assert.match(ui,/typeof options\.onWorkspaceSwitched==='function'/);
 assert.match(app,/onWorkspaceSwitched:\(\)=>\{/);
 assert.match(app,/location\.reload\(\)/);
});
test('staged backend activation checks session authority and grants only signed selection execute',()=>{
 for(const token of [
  'private.ws01_session_choices','private.ws01_lifecycle_flags',
  'private.ws01_prune_session_choices()','private.wm_board_config_session_active()',
  'ws01_prune_session_choices','has_function_privilege',
  'selection_enabled=TRUE','GRANT EXECUTE ON FUNCTION public.wm_ws01_select(uuid,uuid) TO authenticated',
  "has_function_privilege('anon'"
 ])assert.ok(activate.includes(token),token);
 assert.match(cutover,/FOR UPDATE/);
 assert.match(cutover,/p_expected_workspace_id/);
 assert.match(cutover,/session_id=v_session/);
 assert.doesNotMatch(activate,/GRANT (SELECT|INSERT|UPDATE|DELETE) ON/i);
 assert.doesNotMatch(activate,/GRANT EXECUTE[^;]*\bTO (?:PUBLIC|anon)\b/i);
});
test('emergency disable removes execute access and stale session choices atomically',()=>{
 assert.match(disable,/BEGIN;/);
 assert.match(disable,/selection_enabled=FALSE/);
 assert.match(disable,/REVOKE EXECUTE/);
 assert.match(disable,/DELETE FROM private\.ws01_session_choices/);
 assert.match(disable,/COMMIT;/);
});
