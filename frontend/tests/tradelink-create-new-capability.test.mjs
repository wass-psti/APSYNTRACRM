import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
 new URL('../../supabase/migrations/20261119073346_tradelink_user_draft_creation.sql',import.meta.url),
 'utf8'
);
const consolidation=readFileSync(
 new URL('../../supabase/migrations/20261119073608_tradelink_document_read_policy_consolidation.sql',import.meta.url),
 'utf8'
);

test('Create New capability is limited to the existing TradeLink User role and canonical board',()=>{
 assert.match(migration,/private\.tl03_can_create_draft/);
 assert.match(migration,/public\.has_module_access\('tradelink',actor\) IS TRUE/);
 assert.match(migration,/public\.module_role_for\('tradelink',actor\) IS NOT DISTINCT FROM 'User'/);
 assert.match(migration,/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/);
 assert.match(migration,/private\.wm_board_config_session_active\(\) IS DISTINCT FROM TRUE/);
 assert.match(migration,/wm\.active IS TRUE/);
 assert.match(migration,/p\.status='active'/);
 assert.match(migration,/b\.workspace_id=public\.current_workspace_id\(actor\)/);
});

test('User can create and update only its own Draft while exact manager operations remain unchanged',()=>{
 assert.match(migration,/p_operation='create'/);
 assert.match(migration,/p_operation='update'/);
 assert.match(migration,/existing\.created_by=actor/);
 assert.match(migration,/existing\.created_by<>actor/);
 assert.match(migration,/d\.created_by=actor/);
 assert.match(migration,/d\.workflow_state='draft'/);
 assert.match(migration,/Only the creator may revise their own TradeLink Draft/);
 assert.match(migration,/e\.metadata->>'fromState'='draft'/);
 assert.match(migration,/e\.metadata->>'toState'=p_initial_state/);
 assert.match(migration,/private\.tl03_can_manage\(p_board_id\) IS DISTINCT FROM TRUE/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION private\.tl03_can_manage/);
 assert.doesNotMatch(migration,/GRANT .*work_board_access|GRANT .*work_boards|CREATE ROLE|ALTER ROLE/);
});

test('creator readback remains owner-scoped and does not replace the existing manager RLS policy',()=>{
 assert.match(migration,/CREATE POLICY tl03_docs_read_creator ON public\.tradelink_documents/);
 assert.match(migration,/board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid/);
 assert.match(migration,/created_by=\(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/\(SELECT private\.tl03_can_create_draft\(/);
 assert.match(migration,/polname='tl03_docs_read'/);
 assert.match(migration,/private\.tl03_can_manage\(board_id\)/);
 assert.match(migration,/d\.created_by=auth\.uid\(\)/);
 assert.match(migration,/'createdByActor',s\.created_by=auth\.uid\(\)/);
 assert.match(migration,/'createdByActor',r\.created_by=auth\.uid\(\)/);
});

test('no role assignment, Board permission, reviewer, approval, attachment, or unrelated application APIs are modified',()=>{
 assert.doesNotMatch(migration,/INSERT INTO public\.(?:module|workspace)_assignments/);
 assert.doesNotMatch(migration,/UPDATE public\.(?:profiles|workspace_members|work_boards)/);
 assert.doesNotMatch(migration,/GRANT .*work_board_access/);
 assert.doesNotMatch(migration,/tl03_document_(?:review|decide|operate|submit|attach)/);
 assert.doesNotMatch(migration,/fueltrack|time-tracker|fund-released-tracker/i);
 assert.match(migration,/private\.tl03_document_read_assigned\(v_board_id,p_document_id\)/);
 assert.match(migration,/COMMIT;/);
});

test('creator read policy is consolidated with the existing manager policy without widening either branch',()=>{
 assert.match(consolidation,/DROP POLICY tl03_docs_read_creator/);
 assert.match(consolidation,/DROP POLICY tl03_docs_read ON public\.tradelink_documents/);
 assert.match(consolidation,/CREATE POLICY tl03_docs_read ON public\.tradelink_documents/);
 assert.match(consolidation,/private\.tl03_can_manage\(board_id\)/);
 assert.match(consolidation,/created_by=\(SELECT auth\.uid\(\)\)/);
 assert.match(consolidation,/private\.tl03_can_create_draft\(/);
 assert.match(consolidation,/policy_count<>1/);
});
