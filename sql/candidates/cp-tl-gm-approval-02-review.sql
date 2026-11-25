-- Local integration candidate. Apply only after policy candidate, never to production independently.
CREATE OR REPLACE FUNCTION private.tl03_document_review_stages(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stages$
DECLARE actor uuid:=auth.uid(); actor_email text; d public.tradelink_documents%rowtype;
 primary_row private.tradelink_document_reviews%rowtype;
 secondary_row private.tradelink_document_reviews%rowtype;
BEGIN
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'TradeLink document not found' USING ERRCODE='PT404'; END IF;
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  IF private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
  SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
   FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
  IF actor_email NOT IN (
   private.tl03_review_assignee(d.document_type,d.content,'primary'),
   private.tl03_review_assignee(d.document_type,d.content,'secondary')) THEN
   RAISE EXCEPTION 'Document is not assigned to this account' USING ERRCODE='42501'; END IF;
 END IF;
 IF d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor) THEN
  RAISE EXCEPTION 'Foreign TradeLink document' USING ERRCODE='42501'; END IF;
 SELECT * INTO primary_row FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
 SELECT * INTO secondary_row FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,'revision',d.revision,
  'state',d.workflow_state,'approvalPolicy',private.tl03_revision_approval_policy(d.id,d.revision),
  'primary',CASE WHEN primary_row.review_id IS NULL THEN NULL ELSE
   pg_catalog.jsonb_build_object('actorId',primary_row.actor_id,
    'assignedEmail',primary_row.assigned_email,'recordedAt',primary_row.recorded_at) END,
  'secondary',CASE WHEN secondary_row.review_id IS NULL THEN NULL ELSE
   pg_catalog.jsonb_build_object('actorId',secondary_row.actor_id,
    'assignedEmail',secondary_row.assigned_email,'recordedAt',secondary_row.recorded_at) END);
END $stages$;

CREATE OR REPLACE FUNCTION private.tl03_record_review_stage(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_stage text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record_review$
DECLARE
 actor uuid:=auth.uid(); actor_email text; nominated text;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 event_row private.tradelink_document_reviews%rowtype;
 inserted boolean:=FALSE; review_count integer; approval_policy text; primary_at timestamptz;
 secondary_at timestamptz; modified_at timestamptz; target_state text;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_stage NOT IN ('primary','secondary') OR p_stage IS NULL
 THEN RAISE EXCEPTION 'Invalid TradeLink review stage command' USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 IF actor_email IS NULL OR actor_email='' THEN
  RAISE EXCEPTION 'Confirmed reviewer account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
  OR d.workflow_state NOT IN ('for-approval','approved')
 THEN RAISE EXCEPTION 'Stale, archived, or non-pending TradeLink document'
  USING ERRCODE='PT409'; END IF;
 approval_policy:=private.tl03_revision_approval_policy(d.id,d.revision);
 IF approval_policy='gm-sales-supervisor-exempt-v1' AND p_stage='primary' THEN
  RAISE EXCEPTION 'Sales Supervisor stage is exempt for this revision' USING ERRCODE='PT409';
 END IF;
 nominated:=private.tl03_review_assignee(d.document_type,d.content,p_stage);
 IF nominated='' OR nominated IS DISTINCT FROM actor_email
 THEN RAISE EXCEPTION 'Only the assigned reviewer account can record this stage'
  USING ERRCODE='42501'; END IF;
 IF private.tl03_review_assignee(d.document_type,d.content,'primary')=
    private.tl03_review_assignee(d.document_type,d.content,'secondary')
 THEN RAISE EXCEPTION 'Two distinct assigned reviewers are required'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.tradelink_document_reviews(
  document_id,board_id,workspace_id,document_revision,stage,
  assigned_email,actor_id)
 VALUES(d.id,p_board_id,d.workspace_id,d.revision,p_stage,nominated,actor)
 ON CONFLICT(document_id,document_revision,stage) DO NOTHING
 RETURNING * INTO event_row;
 inserted:=FOUND;
 IF NOT inserted THEN
  SELECT * INTO event_row FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage=p_stage;
  IF event_row.actor_id IS DISTINCT FROM actor OR
    event_row.assigned_email IS DISTINCT FROM nominated
  THEN RAISE EXCEPTION 'This review stage was already recorded by its assigned account'
   USING ERRCODE='PT409'; END IF;
  SELECT recorded_at INTO primary_at FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
  SELECT recorded_at INTO secondary_at FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,
   'boardItemId',d.board_item_id,'revision',d.revision,'stage',p_stage,
   'recordedAt',event_row.recorded_at,'primaryAt',primary_at,
   'secondaryAt',secondary_at,'state',d.workflow_state,'approvalPolicy',approval_policy,'idempotent',TRUE);
 END IF;
 IF d.workflow_state='approved' THEN
  RAISE EXCEPTION 'Approved TradeLink document is missing its review event'
   USING ERRCODE='PT409'; END IF;
 SELECT count(*)::integer INTO review_count
  FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision;
 SELECT recorded_at INTO primary_at FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
 SELECT recorded_at INTO secondary_at FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
 modified_at:=pg_catalog.clock_timestamp();
 target_state:=CASE
  WHEN approval_policy='gm-sales-supervisor-exempt-v1' THEN
   CASE WHEN private.tl03_approval_evidence_complete(d.id,d.revision)
    THEN 'approved' ELSE 'for-approval' END
  WHEN review_count=2 THEN 'approved' ELSE 'for-approval' END;
 UPDATE public.tradelink_documents SET
  workflow_state=target_state,updated_by=actor,updated_at=modified_at
 WHERE id=d.id;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board review projection changed'
  USING ERRCODE='PT409'; END IF;
 PERFORM public.work_board_log(p_board_id,
  CASE WHEN target_state='approved' THEN 'tradelink.document.approved' ELSE
   'tradelink.document.reviewed.'||p_stage END,
  CASE WHEN target_state='approved' AND approval_policy='gm-sales-supervisor-exempt-v1'
   THEN 'TradeLink document approved by Management; Sales Supervisor exempt'
   WHEN target_state='approved' THEN 'TradeLink document approved after both reviews' ELSE
   'TradeLink assigned reviewer validated document' END,
  'tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',d.revision,'stage',p_stage,
   'workflowState',target_state,'approvalPolicy',approval_policy,'primaryAt',primary_at,'secondaryAt',secondary_at));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',d.revision,'stage',p_stage,
  'recordedAt',event_row.recorded_at,'primaryAt',primary_at,
  'secondaryAt',secondary_at,'state',target_state,'approvalPolicy',approval_policy,'idempotent',NOT inserted);
END $record_review$;
