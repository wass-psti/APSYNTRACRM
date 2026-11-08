-- TradeLink archive/restore -> linked Board updated_at, SOURCE-ONLY candidate.
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT SEPARATE OWNER APPROVAL.
-- Exact PostgreSQL function-only replacement; no data backfill, new grants,
-- new role, trigger, RLS changes or schema migration. Automatic rollback if
-- preflight or a replacement statement fails. Existing EXECUTE ACL persists.
BEGIN;
DO $board_sync_preflight$
DECLARE f pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_proc
  WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure;
 IF f.oid IS NULL OR
    pg_get_userbyid(f.proowner)<>'postgres' OR NOT f.prosecdef OR
    f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR
    md5(pg_get_functiondef(f.oid))<>'5cea3b91eeb7711f4247daa8f93f6ab2' OR
    f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' OR
    NOT has_function_privilege('authenticated',f.oid,'EXECUTE') OR
    has_function_privilege('anon',f.oid,'EXECUTE') OR
    to_regprocedure('private.tl03_can_manage(uuid)') IS NULL OR
    to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'TradeLink Board timestamp candidate: unexpected function, owner, grants or source drift'
  USING ERRCODE='42501';
 END IF;
END $board_sync_preflight$;

CREATE OR REPLACE FUNCTION private.tl03_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE actor uuid:=auth.uid(); d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype; payload jsonb;
 group_id uuid; item_id uuid; rev bigint; modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink General Manager access required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_operation IS NULL OR p_operation NOT IN ('create','update','archive','restore') THEN
  RAISE EXCEPTION 'Invalid document command' USING ERRCODE='22023'; END IF;
 IF p_operation IN ('create','update') THEN payload:=private.tl03_validate_draft(p_data);
 ELSIF p_data IS NOT NULL THEN
  RAISE EXCEPTION 'Archive/restore cannot mutate fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF p_expected_revision<>0 THEN
   RAISE EXCEPTION 'Creation requires revision zero' USING ERRCODE='40001'; END IF;
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.created_by=actor AND d.revision=1
    AND d.workflow_state='draft' AND d.archived_at IS NULL AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
        AND i.title=d.document_number AND i.archived_at IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object('documentId',d.id,'boardItemId',d.board_item_id,
     'revision',1,'state','draft','operation','create','idempotent',true);
   END IF;
   RAISE EXCEPTION 'Existing document ID conflict' USING ERRCODE='40001'; END IF;
  SELECT id INTO group_id FROM public.work_board_groups
   WHERE board_id=p_board_id ORDER BY position,id LIMIT 1;
  IF group_id IS NULL THEN
   RAISE EXCEPTION 'Existing TradeLink main group missing' USING ERRCODE='42501'; END IF;
  item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  INSERT INTO public.tradelink_documents
   (id,board_id,workspace_id,board_item_id,document_type,document_number,
    workflow_state,revision,content,created_by,updated_by)
  VALUES(p_document_id,p_board_id,public.current_workspace_id(actor),item_id,
   payload->>'documentType',payload->>'documentNumber','draft',1,payload,actor,actor);
  rev:=1;
 ELSE
  IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
   OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
   OR d.revision IS DISTINCT FROM p_expected_revision THEN
   RAISE EXCEPTION 'Document stale revision or foreign workspace' USING ERRCODE='40001'; END IF;
  IF d.workflow_state<>'draft' THEN
   RAISE EXCEPTION 'Workflow transitions require separate signed domain API' USING ERRCODE='42501'; END IF;
  SELECT * INTO projection FROM public.work_board_items
   WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
  IF projection.id IS NULL OR projection.title IS DISTINCT FROM d.document_number
   OR (projection.archived_at IS NULL) IS DISTINCT FROM (d.archived_at IS NULL) THEN
   RAISE EXCEPTION 'Board projection drift; reconcile first' USING ERRCODE='40001'; END IF;
  IF p_operation='update' THEN
   IF d.archived_at IS NOT NULL OR payload->>'documentType'<>d.document_type THEN
    RAISE EXCEPTION 'Draft type or archived state cannot be changed' USING ERRCODE='42501'; END IF;
   IF payload->>'documentNumber' IS DISTINCT FROM d.document_number THEN
    PERFORM public.wm_set_board_cell_if_current(d.board_item_id,NULL,
     pg_catalog.to_jsonb(payload->>'documentNumber'),pg_catalog.to_jsonb(d.document_number));
   END IF;
   UPDATE public.tradelink_documents
    SET document_number=payload->>'documentNumber',content=payload,
     revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
   -- Same signed transaction and locked Board item: reflect each revision,
   -- even when the document number (Board title) is unchanged.
   UPDATE public.work_board_items
    SET updated_by=actor,updated_at=modified_at
    WHERE id=d.board_item_id AND board_id=p_board_id
      AND title=payload->>'documentNumber' AND archived_at IS NULL;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Board projection changed during document update'
     USING ERRCODE='40001'; END IF;
  ELSIF p_operation='archive' THEN
   IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,true);
   UPDATE public.tradelink_documents SET archived_at=pg_catalog.clock_timestamp(),
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
  ELSE
   IF d.archived_at IS NULL THEN RAISE EXCEPTION 'Not archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,false);
   UPDATE public.tradelink_documents SET archived_at=NULL,
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
  END IF;
  IF p_operation IN ('archive','restore') THEN
   UPDATE public.work_board_items
    SET updated_by=actor,updated_at=modified_at
    WHERE id=d.board_item_id AND board_id=p_board_id
      AND title=d.document_number
      AND (archived_at IS NOT NULL)=(p_operation='archive');
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Board projection changed during document lifecycle update'
     USING ERRCODE='40001'; END IF;
  END IF;
  item_id:=d.board_item_id;
 END IF;
 INSERT INTO public.tradelink_document_events
  (document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(p_document_id,p_board_id,public.current_workspace_id(actor),rev,
  CASE p_operation WHEN 'create' THEN 'created' WHEN 'update' THEN 'updated'
   WHEN 'archive' THEN 'archived' ELSE 'restored' END,actor,
  pg_catalog.jsonb_build_object('documentType',CASE WHEN p_operation='create'
   THEN payload->>'documentType' ELSE d.document_type END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.'||p_operation,
  'TradeLink draft revision committed','tradelink-document',p_document_id::text,
  pg_catalog.jsonb_build_object('revision',rev,'operation',p_operation));
 RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,'boardItemId',item_id,
  'revision',rev,'state','draft','operation',p_operation,'idempotent',false);
END $commit$;

DO $board_sync_postflight$
DECLARE f pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_proc
  WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure;
 IF f.oid IS NULL OR pg_get_userbyid(f.proowner)<>'postgres' OR NOT f.prosecdef
   OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
   OR f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
   OR has_function_privilege('anon',f.oid,'EXECUTE')
   OR position('updated_at=modified_at' IN pg_get_functiondef(f.oid))=0
 THEN RAISE EXCEPTION 'TradeLink Board timestamp function did not retain source and privileges'
   USING ERRCODE='42501';
 END IF;
END $board_sync_postflight$;
COMMIT;
