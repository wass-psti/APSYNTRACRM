-- Local candidate: revision-specific evidence for the existing immutable history RPC.
CREATE OR REPLACE FUNCTION public.tl03_document_revision_bundle(
 p_board_id uuid,p_document_id uuid,p_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $bundle$
DECLARE
 d public.tradelink_documents%rowtype;
 v_snapshot private.tradelink_document_revision_snapshots%rowtype;
 v_revisions jsonb;
 v_selected jsonb;
 v_target_revision bigint;
 v_approved boolean:=FALSE;
 v_primary_at timestamptz;
 v_secondary_at timestamptz;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink revision read denied'
  USING ERRCODE='42501'; END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR p_document_id IS NULL OR (p_revision IS NOT NULL AND p_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink revision history request' USING ERRCODE='22023'; END IF;

 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id
  AND workspace_id=public.current_workspace_id(auth.uid());
 IF d.id IS NULL THEN RETURN NULL; END IF;

 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'revision',s.revision,
   'workflowState',CASE WHEN coalesce(a.approved,FALSE) THEN 'approved' ELSE s.workflow_state END,
   'approved',coalesce(a.approved,FALSE),'approvalPolicy',private.tl03_revision_approval_policy(s.document_id,s.revision),'primaryAt',a.primary_at,
   'secondaryAt',a.secondary_at,'revisionAt',s.revision_at,
   'capturedAt',s.captured_at,'snapshotSource',s.snapshot_source,
   'current',s.revision=d.revision
  ) ORDER BY s.revision DESC),'[]'::jsonb) INTO v_revisions
 FROM private.tradelink_document_revision_snapshots s
 LEFT JOIN LATERAL(
  SELECT
   private.tl03_approval_evidence_complete(s.document_id,s.revision) AS approved,
   min(r.recorded_at) FILTER(WHERE r.stage='primary') AS primary_at,
   min(r.recorded_at) FILTER(WHERE r.stage='secondary') AS secondary_at
  FROM private.tradelink_document_reviews r
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE r.document_id=s.document_id AND r.document_revision=s.revision
 ) a ON TRUE
 WHERE s.document_id=d.id;

 v_target_revision:=coalesce(p_revision,d.revision);
 SELECT * INTO v_snapshot FROM private.tradelink_document_revision_snapshots
 WHERE document_id=d.id AND revision=v_target_revision;
 IF v_snapshot.document_id IS NOT NULL THEN
  SELECT
   private.tl03_approval_evidence_complete(v_snapshot.document_id,v_snapshot.revision),
   min(r.recorded_at) FILTER(WHERE r.stage='primary'),
   min(r.recorded_at) FILTER(WHERE r.stage='secondary')
  INTO v_approved,v_primary_at,v_secondary_at
  FROM private.tradelink_document_reviews r
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE r.document_id=v_snapshot.document_id AND r.document_revision=v_snapshot.revision;

  v_selected:=pg_catalog.jsonb_build_object(
   'id',v_snapshot.document_id,'board_id',v_snapshot.board_id,'workspace_id',v_snapshot.workspace_id,
   'board_item_id',v_snapshot.board_item_id,'document_type',v_snapshot.document_type,
   'document_number',v_snapshot.document_number,
   'workflow_state',CASE WHEN v_approved THEN 'approved' ELSE v_snapshot.workflow_state END,
   'revision',v_snapshot.revision,'content',v_snapshot.content,'created_by',v_snapshot.created_by,
   'updated_by',v_snapshot.updated_by,'created_at',v_snapshot.created_at,'updated_at',v_snapshot.updated_at,
   'archived_at',v_snapshot.archived_at,'snapshot_source',v_snapshot.snapshot_source,
   'revision_at',v_snapshot.revision_at,'approved',v_approved,
   'approval_policy',private.tl03_revision_approval_policy(v_snapshot.document_id,v_snapshot.revision),
   'primary_reviewed_at',v_primary_at,'secondary_reviewed_at',v_secondary_at
  );
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'documentId',d.id,'boardItemId',d.board_item_id,
  'currentRevision',d.revision,'revisions',v_revisions,'selected',v_selected
 );
END $bundle$;
