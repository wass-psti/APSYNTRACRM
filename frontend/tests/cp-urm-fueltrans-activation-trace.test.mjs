import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('applied FuelTrans role migration tracks isolated source contract without global role writes',()=>{
 const migration=readFileSync(
  'supabase/migrations/20261117160134_cp_urm_fueltrans_activate01_workspace_role_rpcs.sql',
  'utf8');
 const candidate=readFileSync(
  'sql/cp-urm-fueltrans-workspace-role-candidate.sql','utf8');
 const declarations=[
  'apsyntra_role_fueltrans_workspace_snapshot',
  'apsyntra_role_fueltrans_workspace_set'
 ];
 for(const name of declarations){
  assert.match(migration,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name));
  assert.match(candidate,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name));
 }
 assert.equal(migration.slice(migration.indexOf('BEGIN;')),
  candidate.slice(candidate.indexOf('BEGIN;')));
 assert.match(migration,/PERFORM public\.apsyntra_role_require_scope\(p_workspace_id\)/);
 assert.match(migration,/ON CONFLICT\(workspace_id,user_id\)/);
 assert.match(migration,/apsyntra_role_change_audit/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.apsyntra_role_fueltrans_workspace_set/);
 assert.doesNotMatch(migration,/INSERT INTO public\.module_role_assignments|UPDATE public\.module_role_assignments|DELETE FROM public\.module_role_assignments/);
});
