import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('sql/cp-tl03-staged-domain.sql','utf8');
const board='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';

test('schema is staged only with exact existing TradeLink board and all six types',()=>{
 assert.match(sql,/STAGED\. NOT APPROVED OR EXECUTED IN PRODUCTION/);
 assert.match(sql,new RegExp(board));
 assert.match(sql,/CREATE TABLE public\.tradelink_documents\(/);
 assert.match(sql,/CREATE TABLE public\.tradelink_document_events\(/);
 for(const type of ['esi','packing','delivery','payment','quotation','po'])
  assert.match(sql,new RegExp("'"+type+"'"));
 assert.match(sql,/document_type text NOT NULL CHECK/);
 assert.match(sql,/document_number text NOT NULL CHECK/);
 assert.match(sql,/UNIQUE\(document_id,revision\)/);
 assert.match(sql,/UNIQUE REFERENCES public\.work_board_items/);
});
test('source states are persisted separately, never deduced from four board labels',()=>{
 for(const state of ['draft','submitted','under-review','revision-required','approved','rejected','completed','cancelled'])
  assert.match(sql,new RegExp("'"+state+"'"));
 assert.match(sql,/workflow_state<>'draft'/);
 assert.match(sql,/Workflow transitions require separate signed domain API/);
 assert.doesNotMatch(sql,/CASE[^\n]*WHEN\s+'For Approval'/);
});
test('transaction guarantees CAS and one board projection, not duplicate creation',()=>{
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.match(sql,/FROM public\.tradelink_documents WHERE id=p_document_id FOR UPDATE/);
 assert.match(sql,/d\.revision IS DISTINCT FROM p_expected_revision/);
 assert.match(sql,/existing document ID conflict/i);
 assert.match(sql,/idempotent',true/);
 assert.match(sql,/i\.title=d\.document_number AND i\.archived_at IS NULL/);
 assert.match(sql,/public\.wm_add_board_item\(/);
 assert.match(sql,/public\.wm_set_board_cell_if_current\(/);
 assert.match(sql,/public\.wm_set_board_item_archived\(/);
 assert.match(sql,/Board projection drift; reconcile first/);
 assert.match(sql,/revision=revision\+1/);
 assert.match(sql,/tradelink_document_events[\s\S]*tradelink\.document\.'/);
});
test('role ceiling and live session guard precede reads and writes',()=>{
 assert.match(sql,/private\.wm_board_config_session_active\(\)/);
 assert.match(sql,/public\.module_role_for\('tradelink',v_actor\)='General Manager'/);
 assert.match(sql,/public\.work_board_access\(p_board_id,'manage'\)/);
 assert.match(sql,/b\.workspace_id=public\.current_workspace_id\(v_actor\)/);
 assert.match(sql,/ALTER TABLE public\.tradelink_documents ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/ALTER TABLE public\.tradelink_document_events ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.tradelink_documents,public\.tradelink_document_events FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.tradelink_documents,public\.tradelink_document_events TO authenticated/);
 assert.match(sql,/FOR SELECT TO authenticated USING\(private\.tl03_can_manage\(board_id\)\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.tl03_document_commit/);
 assert.match(sql,/SECURITY INVOKER SET search_path=''/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.tradelink_documents TO authenticated/);
 assert.doesNotMatch(sql,/GRANT EXECUTE.*TO anon/);
});
test('payload is bounded and server-controlled identity/workflow/attachments are rejected',()=>{
 assert.match(sql,/pg_catalog\.octet_length\(p_data::text\)>131072/);
 assert.match(sql,/Unknown or server-owned document property/);
 assert.match(sql,/Invalid bounded line items/);
 assert.match(sql,/p_operation IS NULL/);
 assert.match(sql,/jsonb_typeof\(p_data->'documentNumber'\) IS DISTINCT FROM 'string'/);
 assert.match(sql,/jsonb_typeof\(it->'unit'\)<>'string'/);
 assert.match(sql,/Invalid quantity or unit price/);
 assert.match(sql,/Invalid VAT code/);
 assert.match(sql,/Invalid currency/);
 assert.match(sql,/No ordinary INSERT\/UPDATE\/DELETE table grants/);
 assert.doesNotMatch(sql,/CREATE TABLE public\.tradelink_workspace_members|storage\.buckets|auth\.users\s+SET|service_role/);
});
test('audit is append-only; list omits financial content',()=>{
 assert.match(sql,/CREATE TRIGGER tl03_events_append_only BEFORE UPDATE OR DELETE/);
 assert.match(sql,/tradelink_document_events/);
 const start=sql.indexOf('CREATE FUNCTION public.tl03_documents_list');
 assert.ok(start>0);
 const list=sql.slice(start);
 assert.match(list,/SELECT coalesce\(pg_catalog\.jsonb_agg/);
 assert.doesNotMatch(list,/'content'|'customerName'|'items'|'customerTin'/);
 assert.match(list,/p_limit NOT BETWEEN 1 AND 100/);
});

test('missing module-role assignment is strictly denied, never NULL-approved by a definer',()=>{
 assert.match(sql,/coalesce\(public\.module_role_for\('tradelink',v_actor\)='General Manager',false\)/);
 assert.match(sql,/coalesce\(public\.work_board_access\(p_board_id,'manage'\),false\)/);
 assert.match(sql,/IF actor IS NULL OR private\.tl03_can_manage\(p_board_id\) IS DISTINCT FROM TRUE THEN/);
 assert.match(sql,/IF private\.tl03_can_manage\(p_board_id\) IS DISTINCT FROM TRUE THEN/);
 assert.doesNotMatch(sql,/IF (?:actor IS NULL OR )?NOT private\.tl03_can_manage\(/);
 const fixture=readFileSync('sql/tests/cp-tl03-disposable-acceptance.sql','utf8');
 assert.match(fixture,/DO \$unassigned\$/);
 assert.match(fixture,/('ffffffff-ffff-4fff-8fff-ffffffffffff','owner'|WITHOUT a module-role assignment)/i);
 assert.match(fixture,/Missing module assignment should yield definite FALSE/);
 assert.match(fixture,/unassigned role could (read|commit)/i);
});


test('document number normalization cannot desynchronize the board Item title',()=>{
 assert.match(sql,/IS DISTINCT FROM pg_catalog\.btrim\(p_data->>'documentNumber'\)/);
 assert.match(sql,/public\.wm_add_board_item\(p_board_id,group_id,payload->>'documentNumber'\)/);
});


test('staged SQL is one complete migration with intact regex and no duplicated tail',()=>{
 const commits=sql.match(/^COMMIT;$/gm)||[];
 const begins=sql.match(/^BEGIN;$/gm)||[];
 assert.equal(begins.length,1);
 assert.equal(commits.length,1);
 assert.equal(sql.trim().endsWith('COMMIT;'),true);
 assert.match(sql,/documentNumber' !~ '\^\[A-Za-z0-9\].*\*\$'\s*OR/);
 assert.match(sql,/IS DISTINCT FROM pg_catalog\.btrim\(p_data->>'documentNumber'\) THEN/);
 assert.equal((sql.match(/CREATE FUNCTION public\.tl03_documents_list\(/g)||[]).length,1);
});


test('disposable SQL fixture uses real statement separators, not escaped newline text',()=>{
 const setup=readFileSync('sql/tests/cp-tl03-disposable-setup.sql','utf8');
 assert.doesNotMatch(setup,/\\n(?:GRANT|CREATE|ALTER|INSERT|REVOKE|DO|SELECT)/);
 assert.match(setup,/-- Synthetic assertions[^\n]*\nGRANT USAGE ON SCHEMA auth TO authenticated;\nGRANT SELECT ON public\.work_board_items,public\.work_board_events TO authenticated;\nCREATE FUNCTION public\.current_workspace_id/);
});
