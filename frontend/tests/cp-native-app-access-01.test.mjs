import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const sql=read('supabase/migrations/20261119024303_cp_native_app_access_01.sql');
const app=read('frontend/app.js');
const data=read('frontend/data.js');
const tt=read('frontend/time-tracker-native.js');
const tl=read('frontend/tradelink-domain-client.js');

const section=(source,start,next)=>{
 const at=source.indexOf(start);
 assert.ok(at>=0,start);
 const end=source.indexOf(next,at+start.length);
 return source.slice(at,end<0?source.length:end);
};

test('migration defines one signed native resolver for the four canonical application boards',()=>{
 assert.match(sql,/private\.native_application_board_context\(\s*p_module_id text\s*\)/);
 assert.match(sql,/public\.native_application_board_context\(\s*p_module_id text\s*\)/);
 for(const id of [
  '46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
  'f36da8fe-8d9d-4629-9938-12533cb3ca39',
  '7af78b3f-67bf-4600-9aa1-9006d19d486e',
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'
 ])assert.ok(sql.includes(id),id);
 const resolver=section(sql,'CREATE OR REPLACE FUNCTION private.native_application_board_context',
  'CREATE OR REPLACE FUNCTION public.native_application_board_context');
 assert.match(resolver,/auth\.uid\(\)/);
 assert.match(resolver,/public\.current_workspace_id\(v_actor\)/);
 assert.match(resolver,/public\.has_module_access\(p_module_id,v_actor\)/);
 assert.match(resolver,/public\.module_role_for\(p_module_id,v_actor\)/);
 assert.doesNotMatch(resolver,/work_board_access|wm_list_boards|work_board_members/);
 assert.match(resolver,/work_board_columns/);
 assert.match(resolver,/work_board_groups/);
 assert.doesNotMatch(resolver,/work_board_items/);
});

test('native application route initialization no longer depends on generic board discovery or view permission',()=>{
 for(const moduleId of [
  'time-tracker','fund-released-tracker','fueltrack-plus','tradelink'
 ])assert.match(app,new RegExp("nativeApplicationBoardContext\\('"+moduleId+"'\\)"));
 assert.match(data,/native_application_board_context/);
 assert.match(data,/normalizeNativeApplicationBoardContext/);
 assert.match(app,/nativeApplicationModuleForBoardRoute\(boardId,tab\)/);
 assert.match(app,/nativeContext\.detail\?\.board\?\.workspace_id!==state\.context\?\.workspace_id/);
 assert.match(app,/nativeModuleId\?Promise\.resolve\(true\):db\.allowed\(boardId,'view'\)/);
 assert.match(app,/nativeModuleId\?Promise\.resolve\(null\):boardStructureClient\.read\(boardId\)/);
});

test('TimeTracker and TradeLink reviewer clients use native assignment rather than generic board view',()=>{
 const ttAccess=section(tt,'async access(boardId,{nativeContext=null,includeDirectory=true}={}){',' /** Only a current signed');
 assert.match(ttAccess,/nativeApplicationBoardContext\(moduleId\)/);
 assert.doesNotMatch(ttAccess,/api\.board\(|api\.allowed\(/);
 const reviewer=section(tl,'async reviewerSession(){',' async boardProjection(');
 assert.match(reviewer,/nativeApplicationBoardContext\('tradelink'\)/);
 assert.doesNotMatch(reviewer,/api\.board\(|api\.allowed\(/);
 assert.match(tl,/tl03_board_projection/);
 assert.match(app,/tl03_native_activity/);
});

test('database decoupling preserves generic board permissions and application-specific role checks',()=>{
 const fuel=section(sql,'CREATE OR REPLACE FUNCTION public.fueltrack_v3_guard',
  '-- Existing receipt upload policy');
 const ttScope=section(sql,'CREATE OR REPLACE FUNCTION public.timetracker_ot_require_scope','COMMIT;');
 const tlReview=section(sql,'CREATE OR REPLACE FUNCTION private.tl03_can_review',
  '-- Return exactly one TradeLink');
 for(const source of [fuel,ttScope,tlReview])
  assert.doesNotMatch(source,/work_board_access/);
 assert.match(fuel,/module_role_for\('fueltrack-plus',v_user\)/);
 assert.match(ttScope,/module_role_for\('time-tracker',v_user\)/);
 assert.match(tlReview,/module_role_for\('tradelink',actor\)/);
 assert.match(sql,/public\.work_board_access\(uuid,text\)/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.work_board_access/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.wm_list_boards/);
 assert.doesNotMatch(sql,/INSERT INTO public\.(module_role_assignments|workspace_members|work_board_members)/);
 assert.doesNotMatch(sql,/CREATE TABLE|wm_create_board|wm_add_board/);
});

test('FuelTrack receipt storage exception is path-specific and retains request-owner or Admin scope',()=>{
 assert.match(sql,/private\.fueltrack_v3_receipt_storage_read_allowed/);
 assert.match(sql,/CREATE POLICY fueltrack_v3_receipt_read ON storage\.objects/);
 assert.match(sql,/bucket_id='work-board-files'/);
 assert.match(sql,/r\.requested_by=v_user/);
 assert.match(sql,/v_role='Admin'/);
 assert.match(sql,/x\.storage_path=p_name/);
 assert.doesNotMatch(sql,/DROP POLICY IF EXISTS wm_board_files_read/);
});

test('two-tab synthetic browser fixture serves the native resolver module imported by DomainApi',()=>{
 const browser=read('scripts/board-cache-two-tab-browser.mjs');
 assert.match(browser,/\/frontend\/native-application-access\.js/);
});

test('TradeLink reviewer access exposes one assigned document projection, not a generic item list',()=>{
 const projection=section(sql,'CREATE OR REPLACE FUNCTION private.tl03_board_projection',
  'CREATE OR REPLACE FUNCTION public.tl03_board_projection');
 assert.match(projection,/private\.tl03_document_read_assigned/);
 assert.match(projection,/private\.tl03_can_manage/);
 assert.match(projection,/i\.id=\(v_document->>'board_item_id'\)::uuid/);
 assert.match(projection,/i\.title=v_document->>'document_number'/);
 assert.doesNotMatch(projection,/jsonb_agg|work_board_items\s+ORDER BY/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.tl03_native_activity/);
});

test('migration is additive, transactional, and does not mutate assignments or create replacement boards',()=>{
 assert.match(sql,/\bBEGIN;/);
 assert.match(sql,/^COMMIT;$/m);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.native_application_board_context/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.native_application_board_context\(text\)\s+TO authenticated/);
 assert.doesNotMatch(sql,/DELETE FROM|TRUNCATE|DROP TABLE|DROP FUNCTION|CREATE PROJECT/);
});
