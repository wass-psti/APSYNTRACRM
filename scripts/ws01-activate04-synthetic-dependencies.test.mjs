import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(
  new URL('../sql/tests/cp-ws-activate04-74-caller-synthetic-dependencies.sql',import.meta.url),
  'utf8');

test('source-fidelity prerequisite fixture has exact isolated PG17 gate',()=>{
 assert.match(source,/current_database\(\)<>'workspace_disposable'/);
 assert.match(source,/current_setting\('server_version_num'\)::integer<170000/);
 assert.match(source,/SOURCE_/i);
 assert.match(source,/CREATE SCHEMA huly_rewrite/);
 assert.equal((source.match(/CREATE TABLE public\./g)||[]).length,10);
});

test('all source-required relation row types are included in fixture only',()=>{
 for(const table of [
  'order_intake_orders','employee_evaluation_employees','aps_aims_entities',
  'module_role_assignments','work_board_members','tradelink_documents',
  'module_activity_events','employee_evaluation_evaluations',
  'employee_evaluation_settings','work_board_items'
 ]) assert.ok(source.includes('CREATE TABLE public."'+table+'"'),table);
});

test('synthetic role helpers fail closed and are never represented as authorization evidence',()=>{
 assert.match(source,/CREATE FUNCTION public\.is_platform_admin\(uuid\)/);
 assert.match(source,/SELECT false/);
 assert.match(source,/CREATE FUNCTION public\.apsyntra_crm_explicit_role\(uuid,uuid\)/);
 assert.match(source,/SELECT NULL::text/);
 assert.match(source,/helper stubs MUST NOT be used/);
 assert.doesNotMatch(source,/\b(?:GRANT|REVOKE)\s+(?:EXECUTE|ALL|USAGE)\b/i);
 assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE TABLE)\b/i);
 assert.doesNotMatch(source,/CREATE OR REPLACE FUNCTION public\.current_workspace_id/i);
});
