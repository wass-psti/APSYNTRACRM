import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
 'supabase/migrations/20261125071129_cp_tl_document_creator_identification_01.sql','utf8');
const saveSource=readFileSync(
 'supabase/migrations/20261125012603_cp_tl_gm_approval_exemption.sql','utf8');

test('creator identity is resolved from the original created_by profile across all signed read paths',()=>{
 assert.match(migration,/LEFT JOIN public\.profiles creator_profile ON creator_profile\.id=r\.created_by/);
 assert.match(migration,/'createdBy',r\.created_by/);
 assert.match(migration,/'createdByName',coalesce\(NULLIF/);
 assert.match(migration,/'created_by_name',v_creator_name/);
 assert.match(migration,/private\.tl03_document_creator_name\(p_board_id,p_document_id\)/);
 assert.match(migration,/coalesce\(NULLIF\(pg_catalog\.btrim\(p\.display_name\)/);
 assert.match(migration,/NULLIF\(pg_catalog\.btrim\(p\.email\)/);
});

test('creator-name read helper preserves the existing document read capability checks',()=>{
 assert.match(migration,/private\.tl03_can_manage\(p_board_id\) IS DISTINCT FROM TRUE/);
 assert.match(migration,/private\.tl03_can_read_own_document\(p_board_id,p_document_id\) IS DISTINCT FROM TRUE/);
 assert.match(migration,/REVOKE ALL ON FUNCTION private\.tl03_document_creator_name\(uuid,uuid\)/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION private\.tl03_document_creator_name\(uuid,uuid\)\s+TO authenticated/);
 assert.match(migration,/public\.tl03_document_read\(p_board_id uuid,p_document_id uuid\)\s+RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER/);
});

test('document updates preserve the original created_by and only advance updated_by',()=>{
 const match=saveSource.match(/UPDATE public\.tradelink_documents SET\s+document_number=payload->>'documentNumber',content=payload,\s+workflow_state=p_initial_state,revision=revision\+1,\s+updated_by=actor,updated_at=pg_catalog\.clock_timestamp\(\)\s+WHERE id=d\.id/);
 assert.ok(match,'expected existing atomic TradeLink update statement');
 assert.doesNotMatch(match[0],/created_by\s*=/i);
 assert.match(match[0],/updated_by=actor/);
 assert.match(saveSource,/INSERT INTO public\.tradelink_documents\([\s\S]*?created_by,updated_by\)/);
});

test('creator migration adds no duplicate creator column, document table or training path',()=>{
 assert.doesNotMatch(migration,/ALTER TABLE\s+public\.tradelink_documents/i);
 assert.doesNotMatch(migration,/CREATE TABLE/i);
 assert.doesNotMatch(migration,/gradient descent|backpropagation|fine.?tun|training loop|weight update/i);
 assert.match(migration,/BEGIN;/);
 assert.match(migration,/COMMIT;/);
});
