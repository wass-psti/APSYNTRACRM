-- Restore only if the current function exactly matches the forward definition.
DO $guard$
BEGIN
 IF pg_get_functiondef('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure) IS DISTINCT FROM $expected$CREATE OR REPLACE FUNCTION private.tl03_save(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb, p_initial_state text DEFAULT 'for-approval'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid(); actor_workspace uuid;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 payload jsonb; group_id uuid; item_id uuid; rev bigint;
 modified_at timestamptz; target_state text;
 primary_email text; secondary_email text;
 approval_policy text; document_creator uuid; policy_transition boolean:=false;
BEGIN
 IF actor IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink session required' USING ERRCODE='42501';
 END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL
  OR p_expected_revision<0 OR p_operation NOT IN ('create','update','revise-approved')
  OR p_operation IS NULL OR p_initial_state NOT IN ('draft','for-approval')
 THEN RAISE EXCEPTION 'Invalid TradeLink save command' USING ERRCODE='22023'; END IF;
 IF (p_operation='create' AND p_expected_revision<>0)
  OR (p_operation IN ('update','revise-approved') AND p_expected_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink expected revision' USING ERRCODE='22023'; END IF;
 payload:=private.tl03_validate_draft(p_data);
 actor_workspace:=public.current_workspace_id(actor);
 target_state:=p_initial_state;
 -- Use the real document owner for revisions; never grant an exception
 -- merely because a manager edits a different creator's record.
 IF p_operation='create' THEN document_creator:=actor;
 ELSE SELECT created_by INTO document_creator FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id AND workspace_id=actor_workspace;
 END IF;
 approval_policy:=private.tl03_gm_approval_policy(p_board_id,document_creator,payload->>'documentType',payload);
 primary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'primary');
 secondary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'secondary');
 IF approval_policy='gm-creator-approval-free-v1' THEN
  IF p_initial_state='for-approval' THEN target_state:='approved'; END IF;
 ELSE
 IF secondary_email='' OR (approval_policy<>'gm-sales-supervisor-exempt-v1'
  AND (primary_email='' OR primary_email=secondary_email))
 THEN RAISE EXCEPTION 'Two different assigned TradeLink reviewers are required'
  USING ERRCODE='22023'; END IF;
 IF (approval_policy<>'gm-sales-supervisor-exempt-v1' AND NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=primary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL))
  OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=secondary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL)
 THEN RAISE EXCEPTION 'Both assigned reviewers must be active confirmed TradeLink accounts in this workspace'
  USING ERRCODE='22023'; END IF;
 END IF;
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND (
    private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
    OR EXISTS(
     SELECT 1 FROM public.tradelink_documents existing
     WHERE existing.id=p_document_id AND existing.board_id=p_board_id
      AND existing.workspace_id=actor_workspace AND existing.created_by<>actor
    )
   )
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink document access required'
   USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink document access required'
   USING ERRCODE='42501'; END IF;
 END IF;
 IF p_operation='create' THEN
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.workspace_id=actor_workspace
    AND d.created_by=actor AND d.revision=1
    AND d.workflow_state=target_state AND d.archived_at IS NULL
    AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
       AND i.title=d.document_number AND i.archived_at IS NULL)
   THEN RETURN pg_catalog.jsonb_build_object('documentId',d.id,
     'boardItemId',d.board_item_id,'revision',1,'state',d.workflow_state,
     'operation','create','idempotent',TRUE); END IF;
   RAISE EXCEPTION 'Existing TradeLink document ID conflict' USING ERRCODE='PT409';
  END IF;
  SELECT id INTO group_id FROM public.work_board_groups
   WHERE board_id=p_board_id ORDER BY position,id LIMIT 1;
  IF group_id IS NULL THEN RAISE EXCEPTION 'TradeLink main group missing'
   USING ERRCODE='42501'; END IF;
  IF private.tl03_can_manage(p_board_id) IS TRUE THEN
   -- Preserve the existing manager path exactly.
   IF private.tl03_can_manage(p_board_id) IS TRUE THEN
   -- Preserve the existing manager path exactly.
   item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  ELSE
   -- The enclosing create branch has already verified the existing
   -- TradeLink User capability. Create the linked Board projection inside
   -- this same transaction without requiring generic Board edit membership.
   IF private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TradeLink Create New capability required'
     USING ERRCODE='42501';
   END IF;
   DECLARE
    direct_title text;
    direct_group_id uuid;
    direct_position integer;
    direct_status_col public.work_board_columns%rowtype;
    direct_initial_status text;
   BEGIN
    direct_title:=pg_catalog.btrim(coalesce(payload->>'documentNumber',''));
    direct_group_id:=group_id;
    IF pg_catalog.char_length(direct_title) NOT BETWEEN 1 AND 240 THEN
     RAISE EXCEPTION 'Item title is required';
    END IF;

    -- Match the generic Board insert's ordering lock and group validation.
    PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_board_id::text,0));
    IF NOT EXISTS(
     SELECT 1 FROM public.work_board_groups
     WHERE id=direct_group_id AND board_id=p_board_id
    ) THEN RAISE EXCEPTION 'Group does not belong to board'; END IF;

    -- Preserve the existing Board status default behavior.
    SELECT * INTO direct_status_col
    FROM public.work_board_columns
    WHERE board_id=p_board_id AND system_key='status' AND data_type='status'
    ORDER BY position,id LIMIT 1;
    IF direct_status_col.id IS NULL THEN
     direct_initial_status:='not_started';
    ELSE
     direct_initial_status:=NULLIF(direct_status_col.config->>'default_label_id','');
     IF direct_initial_status IS NULL OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE e->>'id'=direct_initial_status
       AND coalesce((e->>'active')::boolean,true)
     ) THEN
      SELECT e->>'id' INTO direct_initial_status
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE coalesce((e->>'active')::boolean,true)
      ORDER BY coalesce((e->>'position')::integer,0),e->>'id'
      LIMIT 1;
     END IF;
    END IF;

    SELECT count(*) INTO direct_position
    FROM public.work_board_items i
    WHERE i.group_id=direct_group_id AND i.archived_at IS NULL;

    INSERT INTO public.work_board_items(
     board_id,group_id,title,status,position,created_by,updated_by
    ) VALUES(
     p_board_id,direct_group_id,direct_title,direct_initial_status,
     direct_position,actor,actor
    ) RETURNING id INTO item_id;

    UPDATE public.work_boards
    SET updated_at=pg_catalog.now(),updated_by=actor
    WHERE id=p_board_id;

    PERFORM public.work_board_log(
     p_board_id,'item.created','Item added','item',item_id::text,
     pg_catalog.jsonb_build_object(
      'title',direct_title,'status',direct_initial_status,
      'position',direct_position
     )
    );
   END;
  END IF;

  ELSE
   -- The enclosing create branch has already verified the existing
   -- TradeLink User capability. Create the linked Board projection inside
   -- this same transaction without requiring generic Board edit membership.
   IF private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TradeLink Create New capability required'
     USING ERRCODE='42501';
   END IF;
   DECLARE
    direct_title text;
    direct_group_id uuid;
    direct_position integer;
    direct_status_col public.work_board_columns%rowtype;
    direct_initial_status text;
   BEGIN
    direct_title:=pg_catalog.btrim(coalesce(payload->>'documentNumber',''));
    direct_group_id:=group_id;
    IF pg_catalog.char_length(direct_title) NOT BETWEEN 1 AND 240 THEN
     RAISE EXCEPTION 'Item title is required';
    END IF;

    -- Match the generic Board insert's ordering lock and group validation.
    PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_board_id::text,0));
    IF NOT EXISTS(
     SELECT 1 FROM public.work_board_groups
     WHERE id=direct_group_id AND board_id=p_board_id
    ) THEN RAISE EXCEPTION 'Group does not belong to board'; END IF;

    -- Preserve the existing Board status default behavior.
    SELECT * INTO direct_status_col
    FROM public.work_board_columns
    WHERE board_id=p_board_id AND system_key='status' AND data_type='status'
    ORDER BY position,id LIMIT 1;
    IF direct_status_col.id IS NULL THEN
     direct_initial_status:='not_started';
    ELSE
     direct_initial_status:=NULLIF(direct_status_col.config->>'default_label_id','');
     IF direct_initial_status IS NULL OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE e->>'id'=direct_initial_status
       AND coalesce((e->>'active')::boolean,true)
     ) THEN
      SELECT e->>'id' INTO direct_initial_status
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE coalesce((e->>'active')::boolean,true)
      ORDER BY coalesce((e->>'position')::integer,0),e->>'id'
      LIMIT 1;
     END IF;
    END IF;

    SELECT count(*) INTO direct_position
    FROM public.work_board_items i
    WHERE i.group_id=direct_group_id AND i.archived_at IS NULL;

    INSERT INTO public.work_board_items(
     board_id,group_id,title,status,position,created_by,updated_by
    ) VALUES(
     p_board_id,direct_group_id,direct_title,direct_initial_status,
     direct_position,actor,actor
    ) RETURNING id INTO item_id;

    UPDATE public.work_boards
    SET updated_at=pg_catalog.now(),updated_by=actor
    WHERE id=p_board_id;

    PERFORM public.work_board_log(
     p_board_id,'item.created','Item added','item',item_id::text,
     pg_catalog.jsonb_build_object(
      'title',direct_title,'status',direct_initial_status,
      'position',direct_position
     )
    );
   END;
  END IF;
  INSERT INTO public.tradelink_documents(
   id,board_id,workspace_id,board_item_id,document_type,document_number,
   workflow_state,revision,content,created_by,updated_by)
  VALUES(p_document_id,p_board_id,actor_workspace,item_id,
   payload->>'documentType',payload->>'documentNumber',target_state,
   1,payload,actor,actor);
  rev:=1;modified_at:=pg_catalog.clock_timestamp();
  IF private.tl03_revision_approval_policy(p_document_id,rev) IS DISTINCT FROM approval_policy
   THEN RAISE EXCEPTION 'TradeLink approval policy changed during save; retry' USING ERRCODE='PT409'; END IF;
  UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
   WHERE id=item_id AND board_id=p_board_id
    AND title=payload->>'documentNumber' AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board item creation projection mismatch'
   USING ERRCODE='PT409'; END IF;
  INSERT INTO public.tradelink_document_events(
   document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
  VALUES(p_document_id,p_board_id,actor_workspace,rev,'created',actor,
   pg_catalog.jsonb_build_object('documentType',payload->>'documentType',
    'workflowState',target_state,'approvalPolicy',approval_policy));
  PERFORM public.work_board_log(p_board_id,'tradelink.document.create',
   'TradeLink document saved','tradelink-document',p_document_id::text,
   pg_catalog.jsonb_build_object('revision',rev,'workflowState',target_state));
  RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,
   'boardItemId',item_id,'revision',rev,'state',target_state,
   'operation','create','idempotent',FALSE);
 END IF;
 -- Retry only the immediately committed update from this same signed actor.
 -- The complete payload, state, audit actor/revision and Board projection must match.
 IF d.id IS NOT NULL
  AND d.board_id=p_board_id
  AND d.workspace_id=actor_workspace
  AND p_expected_revision<9223372036854775807
  AND d.revision=p_expected_revision+1
  AND d.archived_at IS NULL
  AND d.workflow_state=target_state
  AND d.document_type=payload->>'documentType'
  AND d.content=payload
  AND EXISTS(
   SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=d.id AND e.board_id=p_board_id
    AND e.workspace_id=actor_workspace AND e.revision=d.revision
    AND e.operation='updated' AND e.actor_id=actor
    AND e.metadata->>'toState'=target_state
    AND ((p_operation='revise-approved' AND e.metadata->>'fromState'='approved')
     OR (p_operation='update' AND e.metadata->>'fromState'<>'approved'))
  )
 THEN
  SELECT * INTO projection FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.board_id=p_board_id FOR UPDATE;
  IF projection.id IS NOT NULL AND projection.archived_at IS NULL
   AND projection.title=d.document_number
   AND projection.updated_at>=d.updated_at
  THEN
   RETURN pg_catalog.jsonb_build_object('documentId',d.id,
    'boardItemId',d.board_item_id,'revision',d.revision,
    'state',d.workflow_state,'operation','update','idempotent',TRUE);
  END IF;
 END IF;
 IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
  OR d.workspace_id IS DISTINCT FROM actor_workspace
  OR d.revision IS DISTINCT FROM p_expected_revision
  OR d.archived_at IS NOT NULL
  OR (p_operation='update' AND
    d.workflow_state NOT IN ('draft','for-approval','revision-required'))
  OR (p_operation='revise-approved' AND
    (d.workflow_state<>'approved' OR p_initial_state<>'for-approval'))
 THEN RAISE EXCEPTION 'TradeLink document is stale, archived, foreign, or not editable'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentType' IS DISTINCT FROM d.document_type
 THEN RAISE EXCEPTION 'TradeLink document type cannot be changed' USING ERRCODE='42501'; END IF;
 IF p_operation='revise-approved' THEN
  -- Each historical Approved snapshot is immutable, current, and supported by
  -- two distinct signed approvals. An approved label alone is insufficient.
  IF NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots s
    WHERE s.document_id=d.id AND s.revision=d.revision
      AND s.content=d.content AND s.document_number=d.document_number
      AND s.board_id=d.board_id AND s.workspace_id=d.workspace_id
      AND s.board_item_id=d.board_item_id)
   OR private.tl03_approval_evidence_complete(d.id,d.revision)
       IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Approved historical revision audit is incomplete'
    USING ERRCODE='PT409'; END IF;
  IF payload->>'documentNumber' IS DISTINCT FROM d.document_number
   OR NOT (
     (payload->>'vendorId' IS NOT DISTINCT FROM d.content->>'vendorId'
       AND payload->>'templateId' IS NOT DISTINCT FROM d.content->>'templateId')
     OR (d.content->>'vendorId' IS NULL
       AND d.content->>'templateId' IS NULL
       AND payload->>'vendorId'='watchdog-sales'
       AND payload->>'templateId'='watchdog-sales-reference-v1')
   )
   -- A non-creator revising an approval-free historical revision must use
   -- the standard signed reviewer workflow for the NEW revision. The prior
   -- snapshot and its approval evidence remain immutable.
   OR (
    NOT (private.tl03_revision_approval_policy(d.id,d.revision)='gm-creator-approval-free-v1'
      AND approval_policy='standard-dual-v1')
    AND (payload->>'verifiedByEmail' IS DISTINCT FROM d.content->>'verifiedByEmail'
      OR payload->>'approvedByEmail' IS DISTINCT FROM d.content->>'approvedByEmail')
   )
  THEN RAISE EXCEPTION 'Approved revision must preserve number, company and reviewers'
    USING ERRCODE='PT409'; END IF;
  IF payload=d.content THEN
   RAISE EXCEPTION 'An Approved revision requires an actual document change'
    USING ERRCODE='PT409';
  END IF;
 END IF;
 -- A signed GM re-save of an existing pending standard revision explicitly
 -- adopts the exemption in a NEW revision; no historical review is rewritten.
 policy_transition:=p_operation='update' AND d.workflow_state IN ('draft','for-approval','revision-required')
  AND approval_policy='gm-creator-approval-free-v1'
  AND private.tl03_revision_approval_policy(d.id,d.revision)<>approval_policy;
 IF d.content=payload AND d.workflow_state=target_state AND NOT policy_transition THEN
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,
   'boardItemId',d.board_item_id,'revision',d.revision,
   'state',d.workflow_state,'operation','update','idempotent',TRUE);
 END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection drift; reconcile before saving'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentNumber' IS DISTINCT FROM d.document_number THEN
  IF private.tl03_can_manage(p_board_id) IS TRUE THEN
  PERFORM public.wm_set_board_cell_if_current(d.board_item_id,NULL,
   pg_catalog.to_jsonb(payload->>'documentNumber'),
   pg_catalog.to_jsonb(d.document_number));
  ELSE
   -- The linked item is already locked and its board, title and archive state verified.
   IF pg_catalog.char_length(payload->>'documentNumber') NOT BETWEEN 1 AND 240
    OR pg_catalog.btrim(payload->>'documentNumber') IS DISTINCT FROM payload->>'documentNumber'
   THEN RAISE EXCEPTION 'Item name must contain 1-240 characters'; END IF;
   UPDATE public.work_board_items SET title=payload->>'documentNumber',updated_by=actor,updated_at=pg_catalog.now()
    WHERE id=d.board_item_id AND board_id=p_board_id AND title=d.document_number AND archived_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board projection changed during save' USING ERRCODE='PT409'; END IF;
   UPDATE public.work_boards SET updated_at=pg_catalog.now(),updated_by=actor WHERE id=p_board_id;
   PERFORM public.work_board_log(p_board_id,'item.cell_updated','Item name updated','item',d.board_item_id::text,
    pg_catalog.jsonb_build_object('column_id',NULL,'column_name','Item','column_key','title'));
  END IF;
 END IF;
 UPDATE public.tradelink_documents SET
  document_number=payload->>'documentNumber',content=payload,
  workflow_state=target_state,revision=revision+1,
  updated_by=actor,updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 IF private.tl03_revision_approval_policy(d.id,rev) IS DISTINCT FROM approval_policy
 THEN RAISE EXCEPTION 'TradeLink approval policy changed during revision; retry' USING ERRCODE='PT409'; END IF;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=payload->>'documentNumber' AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board projection changed during save'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,'updated',actor,
  pg_catalog.jsonb_build_object('documentType',d.document_type,
   'fromState',d.workflow_state,'toState',target_state,
   'approvalPolicy',approval_policy,
   'revisionReason',CASE WHEN p_operation='revise-approved' THEN 'approved-supersession'
    WHEN policy_transition THEN 'gm-sales-supervisor-exemption' ELSE NULL END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.update',
  'TradeLink document revision saved','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'workflowState',target_state));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',target_state,
  'operation','update','idempotent',FALSE);
END $function$
$expected$ THEN
  RAISE EXCEPTION 'TradeLink save has changed; reconcile before rollback';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.tl03_save(p_board_id uuid, p_document_id uuid, p_expected_revision bigint, p_operation text, p_data jsonb, p_initial_state text DEFAULT 'for-approval'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid(); actor_workspace uuid;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 payload jsonb; group_id uuid; item_id uuid; rev bigint;
 modified_at timestamptz; target_state text;
 primary_email text; secondary_email text;
 approval_policy text; document_creator uuid; policy_transition boolean:=false;
BEGIN
 IF actor IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink session required' USING ERRCODE='42501';
 END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL
  OR p_expected_revision<0 OR p_operation NOT IN ('create','update','revise-approved')
  OR p_operation IS NULL OR p_initial_state NOT IN ('draft','for-approval')
 THEN RAISE EXCEPTION 'Invalid TradeLink save command' USING ERRCODE='22023'; END IF;
 IF (p_operation='create' AND p_expected_revision<>0)
  OR (p_operation IN ('update','revise-approved') AND p_expected_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink expected revision' USING ERRCODE='22023'; END IF;
 payload:=private.tl03_validate_draft(p_data);
 actor_workspace:=public.current_workspace_id(actor);
 target_state:=p_initial_state;
 -- Use the real document owner for revisions; never grant an exception
 -- merely because a manager edits a different creator's record.
 IF p_operation='create' THEN document_creator:=actor;
 ELSE SELECT created_by INTO document_creator FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id AND workspace_id=actor_workspace;
 END IF;
 approval_policy:=private.tl03_gm_approval_policy(p_board_id,document_creator,payload->>'documentType',payload);
 primary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'primary');
 secondary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'secondary');
 IF approval_policy='gm-creator-approval-free-v1' THEN
  IF p_initial_state='for-approval' THEN target_state:='approved'; END IF;
 ELSE
 IF secondary_email='' OR (approval_policy<>'gm-sales-supervisor-exempt-v1'
  AND (primary_email='' OR primary_email=secondary_email))
 THEN RAISE EXCEPTION 'Two different assigned TradeLink reviewers are required'
  USING ERRCODE='22023'; END IF;
 IF (approval_policy<>'gm-sales-supervisor-exempt-v1' AND NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=primary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL))
  OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=secondary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL)
 THEN RAISE EXCEPTION 'Both assigned reviewers must be active confirmed TradeLink accounts in this workspace'
  USING ERRCODE='22023'; END IF;
 END IF;
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND (
    private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
    OR EXISTS(
     SELECT 1 FROM public.tradelink_documents existing
     WHERE existing.id=p_document_id AND existing.board_id=p_board_id
      AND existing.workspace_id=actor_workspace AND existing.created_by<>actor
    )
   )
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSIF p_operation='update' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND (
    private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(
     SELECT 1 FROM public.tradelink_documents existing
     WHERE existing.id=p_document_id AND existing.board_id=p_board_id
      AND existing.workspace_id=actor_workspace AND existing.created_by=actor
    )
   )
  THEN RAISE EXCEPTION 'TradeLink Draft creator scope required'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink manager capability required'
   USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSIF p_operation='update' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND NOT (
    private.tl03_can_create_draft(p_board_id) IS TRUE
    AND d.id IS NOT NULL AND d.board_id=p_board_id
    AND d.workspace_id=actor_workspace AND d.created_by=actor
    AND d.archived_at IS NULL
    AND (
     d.workflow_state='draft'
     OR (
      p_expected_revision<9223372036854775807
      AND d.revision=p_expected_revision+1
      AND d.workflow_state=target_state
      AND d.content=payload
      AND EXISTS(
       SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=actor_workspace AND e.revision=d.revision
        AND e.operation='updated' AND e.actor_id=actor
        AND e.metadata->>'fromState'='draft'
        AND e.metadata->>'toState'=target_state
      )
     )
    )
   )
  THEN RAISE EXCEPTION 'Only the creator may revise their own TradeLink Draft'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink manager capability required'
   USING ERRCODE='42501'; END IF;
 END IF;
 IF p_operation='create' THEN
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.workspace_id=actor_workspace
    AND d.created_by=actor AND d.revision=1
    AND d.workflow_state=target_state AND d.archived_at IS NULL
    AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
       AND i.title=d.document_number AND i.archived_at IS NULL)
   THEN RETURN pg_catalog.jsonb_build_object('documentId',d.id,
     'boardItemId',d.board_item_id,'revision',1,'state',d.workflow_state,
     'operation','create','idempotent',TRUE); END IF;
   RAISE EXCEPTION 'Existing TradeLink document ID conflict' USING ERRCODE='PT409';
  END IF;
  SELECT id INTO group_id FROM public.work_board_groups
   WHERE board_id=p_board_id ORDER BY position,id LIMIT 1;
  IF group_id IS NULL THEN RAISE EXCEPTION 'TradeLink main group missing'
   USING ERRCODE='42501'; END IF;
  IF private.tl03_can_manage(p_board_id) IS TRUE THEN
   -- Preserve the existing manager path exactly.
   IF private.tl03_can_manage(p_board_id) IS TRUE THEN
   -- Preserve the existing manager path exactly.
   item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  ELSE
   -- The enclosing create branch has already verified the existing
   -- TradeLink User capability. Create the linked Board projection inside
   -- this same transaction without requiring generic Board edit membership.
   IF private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TradeLink Create New capability required'
     USING ERRCODE='42501';
   END IF;
   DECLARE
    direct_title text;
    direct_group_id uuid;
    direct_position integer;
    direct_status_col public.work_board_columns%rowtype;
    direct_initial_status text;
   BEGIN
    direct_title:=pg_catalog.btrim(coalesce(payload->>'documentNumber',''));
    direct_group_id:=group_id;
    IF pg_catalog.char_length(direct_title) NOT BETWEEN 1 AND 240 THEN
     RAISE EXCEPTION 'Item title is required';
    END IF;

    -- Match the generic Board insert's ordering lock and group validation.
    PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_board_id::text,0));
    IF NOT EXISTS(
     SELECT 1 FROM public.work_board_groups
     WHERE id=direct_group_id AND board_id=p_board_id
    ) THEN RAISE EXCEPTION 'Group does not belong to board'; END IF;

    -- Preserve the existing Board status default behavior.
    SELECT * INTO direct_status_col
    FROM public.work_board_columns
    WHERE board_id=p_board_id AND system_key='status' AND data_type='status'
    ORDER BY position,id LIMIT 1;
    IF direct_status_col.id IS NULL THEN
     direct_initial_status:='not_started';
    ELSE
     direct_initial_status:=NULLIF(direct_status_col.config->>'default_label_id','');
     IF direct_initial_status IS NULL OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE e->>'id'=direct_initial_status
       AND coalesce((e->>'active')::boolean,true)
     ) THEN
      SELECT e->>'id' INTO direct_initial_status
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE coalesce((e->>'active')::boolean,true)
      ORDER BY coalesce((e->>'position')::integer,0),e->>'id'
      LIMIT 1;
     END IF;
    END IF;

    SELECT count(*) INTO direct_position
    FROM public.work_board_items i
    WHERE i.group_id=direct_group_id AND i.archived_at IS NULL;

    INSERT INTO public.work_board_items(
     board_id,group_id,title,status,position,created_by,updated_by
    ) VALUES(
     p_board_id,direct_group_id,direct_title,direct_initial_status,
     direct_position,actor,actor
    ) RETURNING id INTO item_id;

    UPDATE public.work_boards
    SET updated_at=pg_catalog.now(),updated_by=actor
    WHERE id=p_board_id;

    PERFORM public.work_board_log(
     p_board_id,'item.created','Item added','item',item_id::text,
     pg_catalog.jsonb_build_object(
      'title',direct_title,'status',direct_initial_status,
      'position',direct_position
     )
    );
   END;
  END IF;

  ELSE
   -- The enclosing create branch has already verified the existing
   -- TradeLink User capability. Create the linked Board projection inside
   -- this same transaction without requiring generic Board edit membership.
   IF private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TradeLink Create New capability required'
     USING ERRCODE='42501';
   END IF;
   DECLARE
    direct_title text;
    direct_group_id uuid;
    direct_position integer;
    direct_status_col public.work_board_columns%rowtype;
    direct_initial_status text;
   BEGIN
    direct_title:=pg_catalog.btrim(coalesce(payload->>'documentNumber',''));
    direct_group_id:=group_id;
    IF pg_catalog.char_length(direct_title) NOT BETWEEN 1 AND 240 THEN
     RAISE EXCEPTION 'Item title is required';
    END IF;

    -- Match the generic Board insert's ordering lock and group validation.
    PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_board_id::text,0));
    IF NOT EXISTS(
     SELECT 1 FROM public.work_board_groups
     WHERE id=direct_group_id AND board_id=p_board_id
    ) THEN RAISE EXCEPTION 'Group does not belong to board'; END IF;

    -- Preserve the existing Board status default behavior.
    SELECT * INTO direct_status_col
    FROM public.work_board_columns
    WHERE board_id=p_board_id AND system_key='status' AND data_type='status'
    ORDER BY position,id LIMIT 1;
    IF direct_status_col.id IS NULL THEN
     direct_initial_status:='not_started';
    ELSE
     direct_initial_status:=NULLIF(direct_status_col.config->>'default_label_id','');
     IF direct_initial_status IS NULL OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE e->>'id'=direct_initial_status
       AND coalesce((e->>'active')::boolean,true)
     ) THEN
      SELECT e->>'id' INTO direct_initial_status
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE coalesce((e->>'active')::boolean,true)
      ORDER BY coalesce((e->>'position')::integer,0),e->>'id'
      LIMIT 1;
     END IF;
    END IF;

    SELECT count(*) INTO direct_position
    FROM public.work_board_items i
    WHERE i.group_id=direct_group_id AND i.archived_at IS NULL;

    INSERT INTO public.work_board_items(
     board_id,group_id,title,status,position,created_by,updated_by
    ) VALUES(
     p_board_id,direct_group_id,direct_title,direct_initial_status,
     direct_position,actor,actor
    ) RETURNING id INTO item_id;

    UPDATE public.work_boards
    SET updated_at=pg_catalog.now(),updated_by=actor
    WHERE id=p_board_id;

    PERFORM public.work_board_log(
     p_board_id,'item.created','Item added','item',item_id::text,
     pg_catalog.jsonb_build_object(
      'title',direct_title,'status',direct_initial_status,
      'position',direct_position
     )
    );
   END;
  END IF;
  INSERT INTO public.tradelink_documents(
   id,board_id,workspace_id,board_item_id,document_type,document_number,
   workflow_state,revision,content,created_by,updated_by)
  VALUES(p_document_id,p_board_id,actor_workspace,item_id,
   payload->>'documentType',payload->>'documentNumber',target_state,
   1,payload,actor,actor);
  rev:=1;modified_at:=pg_catalog.clock_timestamp();
  IF private.tl03_revision_approval_policy(p_document_id,rev) IS DISTINCT FROM approval_policy
   THEN RAISE EXCEPTION 'TradeLink approval policy changed during save; retry' USING ERRCODE='PT409'; END IF;
  UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
   WHERE id=item_id AND board_id=p_board_id
    AND title=payload->>'documentNumber' AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board item creation projection mismatch'
   USING ERRCODE='PT409'; END IF;
  INSERT INTO public.tradelink_document_events(
   document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
  VALUES(p_document_id,p_board_id,actor_workspace,rev,'created',actor,
   pg_catalog.jsonb_build_object('documentType',payload->>'documentType',
    'workflowState',target_state,'approvalPolicy',approval_policy));
  PERFORM public.work_board_log(p_board_id,'tradelink.document.create',
   'TradeLink document saved','tradelink-document',p_document_id::text,
   pg_catalog.jsonb_build_object('revision',rev,'workflowState',target_state));
  RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,
   'boardItemId',item_id,'revision',rev,'state',target_state,
   'operation','create','idempotent',FALSE);
 END IF;
 -- Retry only the immediately committed update from this same signed actor.
 -- The complete payload, state, audit actor/revision and Board projection must match.
 IF d.id IS NOT NULL
  AND d.board_id=p_board_id
  AND d.workspace_id=actor_workspace
  AND p_expected_revision<9223372036854775807
  AND d.revision=p_expected_revision+1
  AND d.archived_at IS NULL
  AND d.workflow_state=target_state
  AND d.document_type=payload->>'documentType'
  AND d.content=payload
  AND EXISTS(
   SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=d.id AND e.board_id=p_board_id
    AND e.workspace_id=actor_workspace AND e.revision=d.revision
    AND e.operation='updated' AND e.actor_id=actor
    AND e.metadata->>'toState'=target_state
    AND ((p_operation='revise-approved' AND e.metadata->>'fromState'='approved')
     OR (p_operation='update' AND e.metadata->>'fromState'<>'approved'))
  )
 THEN
  SELECT * INTO projection FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.board_id=p_board_id FOR UPDATE;
  IF projection.id IS NOT NULL AND projection.archived_at IS NULL
   AND projection.title=d.document_number
   AND projection.updated_at>=d.updated_at
  THEN
   RETURN pg_catalog.jsonb_build_object('documentId',d.id,
    'boardItemId',d.board_item_id,'revision',d.revision,
    'state',d.workflow_state,'operation','update','idempotent',TRUE);
  END IF;
 END IF;
 IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
  OR d.workspace_id IS DISTINCT FROM actor_workspace
  OR d.revision IS DISTINCT FROM p_expected_revision
  OR d.archived_at IS NOT NULL
  OR (p_operation='update' AND
    d.workflow_state NOT IN ('draft','for-approval','revision-required'))
  OR (p_operation='revise-approved' AND
    (d.workflow_state<>'approved' OR p_initial_state<>'for-approval'))
 THEN RAISE EXCEPTION 'TradeLink document is stale, archived, foreign, or not editable'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentType' IS DISTINCT FROM d.document_type
 THEN RAISE EXCEPTION 'TradeLink document type cannot be changed' USING ERRCODE='42501'; END IF;
 IF p_operation='revise-approved' THEN
  -- Each historical Approved snapshot is immutable, current, and supported by
  -- two distinct signed approvals. An approved label alone is insufficient.
  IF NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots s
    WHERE s.document_id=d.id AND s.revision=d.revision
      AND s.content=d.content AND s.document_number=d.document_number
      AND s.board_id=d.board_id AND s.workspace_id=d.workspace_id
      AND s.board_item_id=d.board_item_id)
   OR private.tl03_approval_evidence_complete(d.id,d.revision)
       IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Approved historical revision audit is incomplete'
    USING ERRCODE='PT409'; END IF;
  IF payload->>'documentNumber' IS DISTINCT FROM d.document_number
   OR NOT (
     (payload->>'vendorId' IS NOT DISTINCT FROM d.content->>'vendorId'
       AND payload->>'templateId' IS NOT DISTINCT FROM d.content->>'templateId')
     OR (d.content->>'vendorId' IS NULL
       AND d.content->>'templateId' IS NULL
       AND payload->>'vendorId'='watchdog-sales'
       AND payload->>'templateId'='watchdog-sales-reference-v1')
   )
   OR payload->>'verifiedByEmail' IS DISTINCT FROM d.content->>'verifiedByEmail'
   OR payload->>'approvedByEmail' IS DISTINCT FROM d.content->>'approvedByEmail'
  THEN RAISE EXCEPTION 'Approved revision must preserve number, company and reviewers'
    USING ERRCODE='PT409'; END IF;
  IF payload=d.content THEN
   RAISE EXCEPTION 'An Approved revision requires an actual document change'
    USING ERRCODE='PT409';
  END IF;
 END IF;
 -- A signed GM re-save of an existing pending standard revision explicitly
 -- adopts the exemption in a NEW revision; no historical review is rewritten.
 policy_transition:=p_operation='update' AND d.workflow_state IN ('draft','for-approval','revision-required')
  AND approval_policy='gm-creator-approval-free-v1'
  AND private.tl03_revision_approval_policy(d.id,d.revision)<>approval_policy;
 IF d.content=payload AND d.workflow_state=target_state AND NOT policy_transition THEN
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,
   'boardItemId',d.board_item_id,'revision',d.revision,
   'state',d.workflow_state,'operation','update','idempotent',TRUE);
 END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection drift; reconcile before saving'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentNumber' IS DISTINCT FROM d.document_number THEN
  PERFORM public.wm_set_board_cell_if_current(d.board_item_id,NULL,
   pg_catalog.to_jsonb(payload->>'documentNumber'),
   pg_catalog.to_jsonb(d.document_number));
 END IF;
 UPDATE public.tradelink_documents SET
  document_number=payload->>'documentNumber',content=payload,
  workflow_state=target_state,revision=revision+1,
  updated_by=actor,updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 IF private.tl03_revision_approval_policy(d.id,rev) IS DISTINCT FROM approval_policy
 THEN RAISE EXCEPTION 'TradeLink approval policy changed during revision; retry' USING ERRCODE='PT409'; END IF;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=payload->>'documentNumber' AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board projection changed during save'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,'updated',actor,
  pg_catalog.jsonb_build_object('documentType',d.document_type,
   'fromState',d.workflow_state,'toState',target_state,
   'approvalPolicy',approval_policy,
   'revisionReason',CASE WHEN p_operation='revise-approved' THEN 'approved-supersession'
    WHEN policy_transition THEN 'gm-sales-supervisor-exemption' ELSE NULL END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.update',
  'TradeLink document revision saved','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'workflowState',target_state));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',target_state,
  'operation','update','idempotent',FALSE);
END $function$;
