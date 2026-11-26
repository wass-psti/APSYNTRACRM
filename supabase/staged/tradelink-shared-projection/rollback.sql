DO $guard$
BEGIN
 IF pg_get_functiondef('private.tl03_board_projection(uuid)'::regprocedure) IS DISTINCT FROM $expected$CREATE OR REPLACE FUNCTION private.tl03_board_projection(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 v_document jsonb;
 v_board jsonb;
 v_item jsonb;
BEGIN
 IF v_actor IS NULL OR p_document_id IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink document context required' USING ERRCODE='42501';
 END IF;
 IF private.tl03_can_view_documents(v_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink document projection denied' USING ERRCODE='42501';
 END IF;
 SELECT pg_catalog.to_jsonb(d) INTO v_document
 FROM public.tradelink_documents d
 WHERE d.id=p_document_id AND d.board_id=v_board_id
  AND d.workspace_id=public.current_workspace_id(v_actor)
  AND d.archived_at IS NULL AND d.deleted_at IS NULL;
 IF v_document IS NULL THEN RETURN NULL; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'archived_at',b.archived_at,'trashed_at',b.trashed_at
 ) INTO v_board
 FROM public.work_boards b
 WHERE b.id=v_board_id AND b.workspace_id=public.current_workspace_id(v_actor)
  AND b.name='TradeLink' AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
  AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%';
 SELECT pg_catalog.jsonb_build_object(
  'id',i.id,'title',i.title,'archived_at',i.archived_at,'updated_at',i.updated_at
 ) INTO v_item
 FROM public.work_board_items i
 WHERE i.id=(v_document->>'board_item_id')::uuid
  AND i.board_id=v_board_id AND i.archived_at IS NULL
  AND i.title=v_document->>'document_number';
 IF v_board IS NULL OR v_item IS NULL THEN RETURN NULL; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tradelink-board-projection-v1','board',v_board,'item',v_item
 );
END;
$function$
$expected$
 THEN RAISE EXCEPTION 'TradeLink projection changed; rollback requires reconciliation'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.tl03_board_projection(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 v_document jsonb;
 v_board jsonb;
 v_item jsonb;
BEGIN
 IF v_actor IS NULL OR p_document_id IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink document context required' USING ERRCODE='42501';
 END IF;
 IF private.tl03_can_manage(v_board_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.archived_at IS NULL;
 ELSIF private.tl03_can_read_own_document(v_board_id,p_document_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.created_by=v_actor;
 ELSE
  v_document:=private.tl03_document_read_assigned(v_board_id,p_document_id);
 END IF;
 IF v_document IS NULL THEN RETURN NULL; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'archived_at',b.archived_at,'trashed_at',b.trashed_at
 ) INTO v_board
 FROM public.work_boards b
 WHERE b.id=v_board_id AND b.workspace_id=public.current_workspace_id(v_actor)
  AND b.name='TradeLink' AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
  AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%';
 SELECT pg_catalog.jsonb_build_object(
  'id',i.id,'title',i.title,'archived_at',i.archived_at,'updated_at',i.updated_at
 ) INTO v_item
 FROM public.work_board_items i
 WHERE i.id=(v_document->>'board_item_id')::uuid
  AND i.board_id=v_board_id AND i.archived_at IS NULL
  AND i.title=v_document->>'document_number';
 IF v_board IS NULL OR v_item IS NULL THEN RETURN NULL; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tradelink-board-projection-v1','board',v_board,'item',v_item
 );
END;
$function$;
