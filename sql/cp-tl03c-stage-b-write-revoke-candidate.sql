-- CP-TL-03C / Phase 2 — Stage B WRITE-ONLY rollback candidate.
-- STAGED SOURCE ONLY. DO NOT RUN ON PRODUCTION WITHOUT SEPARATE
-- APPROVAL OF A PRODUCTION PERMISSION CHANGE.
-- Unlike the broad emergency-disable script, this returns Stage B to
-- the previously approved Stage A READ-ONLY API without deleting any data.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regprocedure('private.tl03_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR NOT EXISTS (
   SELECT 1 FROM public.work_boards b
   WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
    AND b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
    AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
  )
  OR NOT has_function_privilege('authenticated',
   'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
   'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_list(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL-03C Stage B write-only rollback preflight drift'
  USING ERRCODE='42501';
 END IF;
END $preflight$;

-- Two narrowly scoped Stage B permissions only; preserve Stage A reads.
REVOKE EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 FROM authenticated;

DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
   'private.tl03_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
   'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_list(uuid,integer)','EXECUTE')
  OR NOT has_table_privilege('authenticated',
   'public.tradelink_documents','SELECT')
  OR NOT has_table_privilege('authenticated',
   'public.tradelink_document_events','SELECT')
 THEN RAISE EXCEPTION 'CP-TL-03C Stage A grants not preserved after rollback'
  USING ERRCODE='42501';
 END IF;
END $verify$;
COMMIT;
