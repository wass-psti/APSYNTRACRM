import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoleConfigurationClient} from '../role-configuration-client.js';
const app=readFileSync('frontend/app.js','utf8');
const candidate=readFileSync('sql/cp-urm04-crm-admin-parity-CANDIDATE.sql','utf8');

test('CRM Admin and designated bootstrap identity are independent verified checks',async()=>{
 const calls=[];
 const c=new RoleConfigurationClient({rpc:async name=>{calls.push(name);
  return name==='apsyntra_role_is_admin';}});
 assert.equal(await c.adminVerified(),true);
 assert.equal(await c.bootstrapVerified(),false);
 assert.deepEqual(calls,['apsyntra_role_is_admin','apsyntra_role_is_bootstrap']);
});
test('CRM role management uses Admin tier; bootstrap-only diagnostics retain identity check',()=>{
 assert.match(app,/state\.adminVerified===true\?'<div class="side-section sidebar-nav-section">Administration/);
 assert.match(app,/roleConfig\.adminVerified\(\)/);
 assert.match(app,/renderUserRoleManagement\(\{verified:state\.adminVerified/);
 assert.match(app,/renderRoleConfiguration\(\{verified:state\.adminVerified/);
 assert.match(app,/state\.roleVerified=bootstrapVerified/);
 assert.match(app,/showEngineeringDiagnostics\(location\.search,state\.roleVerified===true\)/);
 assert.match(app,/if\(state\.adminVerified!==true\|\|!\(await roleConfig\.adminVerified\(\)\)\)/);
});
test('scope policy obtains effective Admin only from active authenticated membership',()=>{
 assert.match(candidate,/auth\.uid\(\)/);
 assert.match(candidate,/wm\.active IS TRUE/);
 assert.match(candidate,/wm\.workspace_id=public\.current_workspace_id\(p\.id\)/);
 assert.match(candidate,/public\.apsyntra_crm_effective_role\(p\.id,wm\.workspace_id\)='admin'/);
 assert.match(candidate,/IS DISTINCT FROM public\.current_workspace_id\(v_actor\)/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION public\.apsyntra_role_is_admin\(\) FROM PUBLIC,anon,authenticated/);
 assert.match(candidate,/GRANT EXECUTE ON FUNCTION public\.apsyntra_role_is_admin\(\) TO authenticated/);
 assert.doesNotMatch(candidate,/UPDATE public\.profiles|UPDATE public\.apsyntra_crm_platform_roles|GRANT (ALL|SELECT) ON TABLE|CREATE POLICY/);
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION public\.(apsyntra_role_is_bootstrap|is_platform_admin)/);
});
