import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261114021000_cp_db_cpu_04_lifecycle_prelock_cas.sql',import.meta.url),'utf8');
const preflight=sql.indexOf('SELECT wb.updated_at');
const preflightCompare=sql.indexOf('v_observed_updated_at IS DISTINCT FROM p_expected_updated_at');
const rowLock=sql.indexOf('FOR UPDATE');
const lockedCompare=sql.indexOf('b.updated_at IS DISTINCT FROM p_expected_updated_at');

test('stale revisions are rejected by a non-locking preflight before FOR UPDATE',()=>{
 assert.ok(preflight>=0);
 assert.ok(preflightCompare>preflight);
 assert.ok(rowLock>preflightCompare);
 assert.ok(lockedCompare>rowLock);
 assert.match(sql,/RAISE EXCEPTION 'Board changed; refresh before editing'\s+USING ERRCODE = '40001'/);
});

test('the locked revision check remains authoritative after the preflight',()=>{
 assert.match(sql,/SELECT \*\s+INTO b\s+FROM public\.work_boards\s+WHERE id = p_board_id\s+FOR UPDATE/);
 assert.ok(lockedCompare>rowLock);
 assert.match(sql,/IF b\.id IS NULL OR private\.wm_board_is_protected\(b\.id\) THEN/);
});

test('signed session and board-manager authorization are preserved before revision checks',()=>{
 const auth=sql.indexOf('IF NOT private.wm_board_config_session_active()');
 assert.ok(auth>=0&&auth<preflight);
 assert.match(sql,/OR NOT public\.work_board_access\(p_board_id, 'manage'\)/);
 assert.match(sql,/SECURITY DEFINER\s+SET search_path TO ''/);
 assert.match(sql,/USING ERRCODE = '42501'/);
});

test('edit, trash, restore, audit, duplicate-name and receipt contracts remain present',()=>{
 for(const fragment of [
  "IF v_action = 'edit' THEN",
  "IF v_action = 'trash' THEN",
  "IF v_action = 'restore' THEN",
  'Another active or archived board already has this name',
  "'board.updated'",
  "'board.trashed'",
  "'board.restored'",
  "'reversible', true",
  "'boardId', b.id::text",
  "'updatedAt', v_at"
 ]) assert.ok(sql.includes(fragment),`missing lifecycle contract: ${fragment}`);
});

test('the optimization changes no grants, RLS policies, roles, tables, or data',()=>{
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|CREATE\s+POLICY|ALTER\s+TABLE|CREATE\s+TABLE|DELETE\s+FROM|TRUNCATE|DROP\s+)\b/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.wm_board_card_mutate/);
});
