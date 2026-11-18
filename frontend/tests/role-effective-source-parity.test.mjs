import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const migration=readdirSync('supabase/migrations').find(name=>
 name.endsWith('_cp_urm_effective_access_source_parity_20261118.sql'));
const sql=readFileSync('supabase/migrations/'+migration,'utf8');
test('signed effective access derives workspace-managed role assignments from domain authorities',()=>{
 for(const [module,table] of [
  ['material-request-hub','material_request_hub_memberships'],
  ['toolbox-issues','toolbox_issues_memberships'],
  ['fueltrans','fueltrans_memberships'],
  ['tool-traceability','tool_traceability_memberships']
 ]){
  assert.match(sql,new RegExp("WHEN '"+module+"' THEN"));
  assert.match(sql,new RegExp('LEFT JOIN public\\.'+table));
 }
 assert.match(sql,/mrh\.workspace_id = v_workspace/);
 assert.match(sql,/toolbox\.workspace_id = v_workspace/);
 assert.match(sql,/fueltrans\.workspace_id = v_workspace/);
 assert.match(sql,/traceability\.workspace_id = v_workspace/);
 assert.match(sql,/mrh\.status = 'active'/);
 assert.match(sql,/fueltrans\.status = 'active'/);
 assert.match(sql,/fueltrans\.client_code IS NULL/);
 assert.match(sql,/requested\.id NOT IN \('material-request-hub','toolbox-issues','fueltrans','tool-traceability'\)/);
 assert.match(sql,/v_explicit_role IS NOT NULL/);
 assert.match(sql,/v_is_admin := v_effective_role = 'admin'/);
 assert.doesNotMatch(sql,/v_is_admin := v_host_role = 'admin_general_manager'/);
 assert.match(sql,/public\.apsyntra_crm_module_role_rank/);
 assert.match(sql,/public\.current_workspace_id\(v_actor\)/);
 assert.doesNotMatch(sql,/GRANT |CREATE POLICY|ALTER TABLE|UPDATE public\.|DELETE FROM public\./i);
});
