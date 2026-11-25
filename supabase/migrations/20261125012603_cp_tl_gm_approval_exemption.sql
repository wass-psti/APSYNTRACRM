-- CP-TL-GM-APPROVAL-03: coordinated revision-specific Sales Supervisor exemption.
-- Do not apply until the compatible frontend is live and production change is approved.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
DECLARE f record; oid_value oid;
BEGIN
 IF to_regclass('private.tradelink_revision_approval_exemptions') IS NOT NULL THEN
  RAISE EXCEPTION 'GM exemption already installed' USING ERRCODE='55000';
 END IF;
 FOR f IN SELECT * FROM (VALUES
  ('private.tl03_assigned_documents(uuid,integer)','9f16c245111342552d02e2da2ce816fa'),
  ('private.tl03_document_review_stages(uuid,uuid)','4dd71a884bc0716a9f360b5ac7d7cb0a'),
  ('private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)','ea4237a69ca7e50e422c72569b43afb2'),
  ('private.tl03_record_review_stage(uuid,uuid,bigint,text)','0a4b3b8e27f111e409321d80838b2c82'),
  ('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)','5a1190ec35ad5df8365aa2788663227d'),
  ('public.tl03_document_revision_bundle(uuid,uuid,bigint)','8594a1d1b299ca0deaa74e177492fb4a')
 ) AS expected(signature,definition_md5) LOOP
  oid_value:=to_regprocedure(f.signature);
  IF oid_value IS NULL OR md5(pg_get_functiondef(oid_value)) IS DISTINCT FROM f.definition_md5
   OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=oid_value AND p.prosecdef
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}') THEN
   RAISE EXCEPTION 'TradeLink baseline drift: %',f.signature USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF md5(pg_get_functiondef('public.tl03_document_read(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '3b5a3c1fd26990beaa5228cc98dd1fad'
  OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.tl03_document_read(uuid,uuid)'::regprocedure
    AND NOT prosecdef AND pg_get_userbyid(proowner)='postgres'
    AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
 THEN RAISE EXCEPTION 'TradeLink creator-read baseline drift' USING ERRCODE='55000'; END IF;
END $preflight$;

-- Local integration candidate only. Does not replace any active RPC.
-- Capture only newly inserted immutable revisions; never backfill existing records.
CREATE FUNCTION private.tl03_gm_approval_policy(
 p_board_id uuid,p_creator uuid,p_document_type text,p_content jsonb
) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $policy$
 SELECT CASE WHEN p_creator=auth.uid()
  AND p_board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND p_document_type IN ('quotation','po')
  AND private.tl03_review_assignee(p_document_type,p_content,'primary')=
   'aacsenagan@watchdogautomation.com.ph'
  AND private.tl03_review_assignee(p_document_type,p_content,'secondary')<>''
  AND private.tl03_review_assignee(p_document_type,p_content,'secondary')<>
   'aacsenagan@watchdogautomation.com.ph'
  AND EXISTS(
   SELECT 1 FROM auth.users u
   JOIN public.profiles p ON p.id=u.id
   JOIN public.work_boards b ON b.id=p_board_id
   JOIN public.workspace_members wm ON wm.workspace_id=b.workspace_id
     AND wm.user_id=u.id AND wm.active
   WHERE u.id=p_creator AND lower(btrim(u.email))='asenagan@watchdogautomation.com.ph'
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.module_role_for('tradelink',u.id)='General Manager'
    AND public.current_workspace_id(u.id)=b.workspace_id
  ) THEN 'gm-sales-supervisor-exempt-v1' ELSE 'standard-dual-v1' END
$policy$;
REVOKE ALL ON FUNCTION private.tl03_gm_approval_policy(uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;

-- Sparse revision policy: absence retains legacy dual-review semantics.
CREATE TABLE private.tradelink_revision_approval_exemptions(
 document_id uuid NOT NULL,
 revision bigint NOT NULL,
 policy text NOT NULL CHECK(policy='gm-sales-supervisor-exempt-v1'),
 recorded_by uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(document_id,revision),
 FOREIGN KEY(document_id,revision)
  REFERENCES private.tradelink_document_revision_snapshots(document_id,revision)
);
ALTER TABLE private.tradelink_revision_approval_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tradelink_revision_approval_exemptions FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_revision_approval_exemptions_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_revision_approval_exemptions
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_revision_snapshot_change();

CREATE FUNCTION private.tl03_capture_revision_approval_exemption()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $capture$
BEGIN
 IF NEW.updated_by=auth.uid() AND
    private.tl03_gm_approval_policy(NEW.board_id,NEW.created_by,NEW.document_type,NEW.content)
      ='gm-sales-supervisor-exempt-v1' THEN
  INSERT INTO private.tradelink_revision_approval_exemptions(document_id,revision,policy,recorded_by)
  VALUES(NEW.document_id,NEW.revision,'gm-sales-supervisor-exempt-v1',NEW.updated_by);
 END IF;
 RETURN NEW;
END $capture$;
REVOKE ALL ON FUNCTION private.tl03_capture_revision_approval_exemption() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_capture_revision_approval_exemption
 AFTER INSERT ON private.tradelink_document_revision_snapshots
 FOR EACH ROW EXECUTE FUNCTION private.tl03_capture_revision_approval_exemption();

CREATE FUNCTION private.tl03_revision_approval_policy(p_document_id uuid,p_revision bigint)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $lookup$
 SELECT coalesce((SELECT e.policy FROM private.tradelink_revision_approval_exemptions e
  WHERE e.document_id=p_document_id AND e.revision=p_revision),'standard-dual-v1')
$lookup$;
REVOKE ALL ON FUNCTION private.tl03_revision_approval_policy(uuid,bigint)
 FROM PUBLIC,anon,authenticated;

-- Review evidence is bound to the immutable snapshot and explicit stored policy.
-- A missing policy never implies exemption; historic records use standard dual.
CREATE FUNCTION private.tl03_approval_evidence_complete(
 p_document_id uuid,p_revision bigint
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $evidence$
 SELECT coalesce((
  SELECT CASE
    WHEN private.tl03_revision_approval_policy(p_document_id,p_revision)='gm-sales-supervisor-exempt-v1' THEN
      s.document_type IN ('quotation','po')
      AND private.tl03_review_assignee(s.document_type,s.content,'primary')=
       'aacsenagan@watchdogautomation.com.ph'
      AND count(*) FILTER(WHERE r.stage='primary')=0
      AND count(*) FILTER(WHERE r.stage='secondary')=1
      AND count(DISTINCT r.actor_id)=1
    WHEN private.tl03_revision_approval_policy(p_document_id,p_revision)='standard-dual-v1' THEN
      count(*) FILTER(WHERE r.stage='primary')=1
      AND count(*) FILTER(WHERE r.stage='secondary')=1
      AND count(DISTINCT r.actor_id)=2
    ELSE false END
   AND coalesce(bool_and(lower(r.assigned_email)=lower(u.email)
    AND r.assigned_email=private.tl03_review_assignee(s.document_type,s.content,r.stage)),false)
  FROM private.tradelink_document_revision_snapshots s
  JOIN private.tradelink_document_reviews r ON r.document_id=s.document_id
   AND r.document_revision=s.revision
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE s.document_id=p_document_id AND s.revision=p_revision
  GROUP BY s.document_type,s.content
 ),false)
$evidence$;
REVOKE ALL ON FUNCTION private.tl03_approval_evidence_complete(uuid,bigint)
 FROM PUBLIC,anon,authenticated;

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

-- Candidate derived from the deployed function; preserves the existing create, retry, board and revision paths.
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
 IF primary_email='' OR secondary_email='' OR primary_email=secondary_email
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
      AND d.workflow_state=p_initial_state
      AND d.content=payload
      AND EXISTS(
       SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=actor_workspace AND e.revision=d.revision
        AND e.operation='updated' AND e.actor_id=actor
        AND e.metadata->>'fromState'='draft'
        AND e.metadata->>'toState'=p_initial_state
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
    AND d.workflow_state=p_initial_state AND d.archived_at IS NULL
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
   payload->>'documentType',payload->>'documentNumber',p_initial_state,
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
    'workflowState',p_initial_state,'approvalPolicy',approval_policy));
  PERFORM public.work_board_log(p_board_id,'tradelink.document.create',
   'TradeLink document saved','tradelink-document',p_document_id::text,
   pg_catalog.jsonb_build_object('revision',rev,'workflowState',p_initial_state));
  RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,
   'boardItemId',item_id,'revision',rev,'state',p_initial_state,
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
  AND d.workflow_state=p_initial_state
  AND d.document_type=payload->>'documentType'
  AND d.content=payload
  AND EXISTS(
   SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=d.id AND e.board_id=p_board_id
    AND e.workspace_id=actor_workspace AND e.revision=d.revision
    AND e.operation='updated' AND e.actor_id=actor
    AND e.metadata->>'toState'=p_initial_state
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
  AND approval_policy='gm-sales-supervisor-exempt-v1'
  AND private.tl03_revision_approval_policy(d.id,d.revision)='standard-dual-v1';
 IF d.content=payload AND d.workflow_state=p_initial_state AND NOT policy_transition THEN
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
  workflow_state=p_initial_state,revision=revision+1,
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
   'fromState',d.workflow_state,'toState',p_initial_state,
   'approvalPolicy',approval_policy,
   'revisionReason',CASE WHEN p_operation='revise-approved' THEN 'approved-supersession'
    WHEN policy_transition THEN 'gm-sales-supervisor-exemption' ELSE NULL END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.update',
  'TradeLink document revision saved','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'workflowState',p_initial_state));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',p_initial_state,
  'operation','update','idempotent',FALSE);
END $function$;

-- Preserve existing listing visibility; report the recorded approval policy.
CREATE OR REPLACE FUNCTION private.tl03_documents_page(p_board_id uuid, p_search text, p_document_type text, p_workflow_state text, p_archive_mode text, p_visibility_mode text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_actor_email text;
 v_can_manage boolean;
 v_can_create boolean;
 v_can_review boolean;
 result jsonb;
BEGIN
 IF v_actor IS NULL
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document session required' USING ERRCODE='42501'; END IF;

 v_workspace:=public.current_workspace_id(v_actor);
 v_can_manage:=coalesce(private.tl03_can_manage(p_board_id),false);
 v_can_create:=coalesce(private.tl03_can_create_draft(p_board_id),false);
 v_can_review:=coalesce(private.tl03_can_review(p_board_id),false);
 IF v_workspace IS NULL OR NOT (v_can_manage OR v_can_create OR v_can_review) THEN
  RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501'; END IF;

 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR p_search IS NULL OR pg_catalog.char_length(p_search)>120
  OR p_document_type IS NULL OR p_document_type NOT IN
   ('all','esi','packing','delivery','payment','quotation','po')
  OR p_workflow_state IS NULL OR p_workflow_state NOT IN
   ('all','draft','for-approval','submitted','under-review','revision-required',
    'approved','rejected','completed','cancelled','under-negotiation',
    'expired','on-hold','won','lost','delivered','closed')
  OR p_archive_mode IS NULL OR p_archive_mode NOT IN ('all','active','archived')
  OR p_visibility_mode IS NULL OR p_visibility_mode NOT IN ('all','visible','hidden')
  OR ((p_before_at IS NULL)<>(p_before_id IS NULL))
 THEN RAISE EXCEPTION 'Invalid bounded TradeLink search parameters' USING ERRCODE='22023'; END IF;

 IF v_can_review THEN
  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_actor_email
  FROM auth.users u WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL;
 END IF;

 WITH eligible AS MATERIALIZED (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.content,
   d.revision,d.workflow_state,d.archived_at,d.hidden_at,d.created_at,d.updated_at,
   d.created_by,
   private.tl03_review_assignee(d.document_type,d.content,'primary') primary_email,
   private.tl03_review_assignee(d.document_type,d.content,'secondary') secondary_email
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.workspace_id=v_workspace
   AND d.deleted_at IS NULL
   AND (v_can_manage OR d.hidden_at IS NULL)
   AND (p_visibility_mode='all'
    OR (p_visibility_mode='visible' AND d.hidden_at IS NULL)
    OR (p_visibility_mode='hidden' AND d.hidden_at IS NOT NULL))
   AND (
    v_can_manage
    OR (v_can_create AND d.created_by=v_actor)
    OR (v_can_review AND d.archived_at IS NULL AND v_actor_email IS NOT NULL
     AND v_actor_email IN (
      private.tl03_review_assignee(d.document_type,d.content,'primary'),
      private.tl03_review_assignee(d.document_type,d.content,'secondary')
     ))
   )
   AND (p_search='' OR pg_catalog.strpos(
    pg_catalog.lower(d.document_number),pg_catalog.lower(p_search))>0)
   AND (p_document_type='all' OR d.document_type=p_document_type)
   AND (p_workflow_state='all' OR d.workflow_state=p_workflow_state)
   AND (p_archive_mode='all'
    OR (p_archive_mode='active' AND d.archived_at IS NULL)
    OR (p_archive_mode='archived' AND d.archived_at IS NOT NULL))
   AND (p_before_at IS NULL OR (d.created_at,d.id)<(p_before_at,p_before_id))
  ORDER BY d.created_at DESC,d.id DESC LIMIT (p_limit+1)
 ), ranked AS (
  SELECT e.*,pg_catalog.row_number() OVER(ORDER BY e.created_at DESC,e.id DESC) rn
  FROM eligible e
 )
 SELECT pg_catalog.jsonb_build_object(
  'rows',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'documentId',r.id,'boardItemId',r.board_item_id,
   'documentType',r.document_type,'documentNumber',r.document_number,
   'clientName',r.content->>'customerName',
   'revision',r.revision,'workflowState',r.workflow_state,
   'approvalPolicy',private.tl03_revision_approval_policy(r.id,r.revision),
   'archived',r.archived_at IS NOT NULL,'hidden',r.hidden_at IS NOT NULL,
   'createdAt',r.created_at,'updatedAt',r.updated_at,
   'createdByActor',r.created_by=v_actor,
   'assignedStage',CASE
    WHEN v_can_review AND v_actor_email=r.primary_email THEN 'primary'
    WHEN v_can_review AND v_actor_email=r.secondary_email THEN 'secondary'
    ELSE NULL END,
   'primaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN primary_review.recorded_at ELSE NULL END,
   'secondaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN secondary_review.recorded_at ELSE NULL END
  ) ORDER BY r.created_at DESC,r.id DESC)
   FILTER(WHERE r.rn<=p_limit),'[]'::jsonb),
  'hasMore',pg_catalog.count(*)>p_limit,
  'nextCursor',CASE WHEN pg_catalog.count(*)>p_limit THEN
   (SELECT pg_catalog.jsonb_build_object(
     'createdAt',last.created_at,'documentId',last.id)
    FROM ranked last WHERE last.rn=p_limit)
   ELSE NULL END
 ) INTO result
 FROM ranked r
 LEFT JOIN private.tradelink_document_reviews primary_review
  ON primary_review.document_id=r.id
  AND primary_review.document_revision=r.revision AND primary_review.stage='primary'
 LEFT JOIN private.tradelink_document_reviews secondary_review
  ON secondary_review.document_id=r.id
  AND secondary_review.document_revision=r.revision AND secondary_review.stage='secondary';
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION private.tl03_assigned_documents(p_board_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); actor_email text; result jsonb;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid assigned document limit' USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 WITH assigned AS (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.revision,
   d.workflow_state,d.archived_at,d.created_at,d.updated_at,d.content,
   private.tl03_review_assignee(d.document_type,d.content,'primary') primary_email,
   private.tl03_review_assignee(d.document_type,d.content,'secondary') secondary_email,
   primary_review.recorded_at primary_at,secondary_review.recorded_at secondary_at
  FROM public.tradelink_documents d
  LEFT JOIN private.tradelink_document_reviews primary_review
   ON primary_review.document_id=d.id AND primary_review.document_revision=d.revision
    AND primary_review.stage='primary'
  LEFT JOIN private.tradelink_document_reviews secondary_review
   ON secondary_review.document_id=d.id AND secondary_review.document_revision=d.revision
    AND secondary_review.stage='secondary'
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(actor)
   AND d.archived_at IS NULL AND d.deleted_at IS NULL
   AND actor_email IN (
    private.tl03_review_assignee(d.document_type,d.content,'primary'),
    private.tl03_review_assignee(d.document_type,d.content,'secondary'))
  ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit
 )
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',a.id,'boardItemId',a.board_item_id,
  'documentType',a.document_type,'documentNumber',a.document_number,
  'revision',a.revision,'workflowState',a.workflow_state,
  'approvalPolicy',private.tl03_revision_approval_policy(a.id,a.revision),
  'archived',a.archived_at IS NOT NULL,'updatedAt',a.updated_at,'createdAt',a.created_at,
  'clientName',a.content->>'customerName',
  'primaryEmail',a.primary_email,'secondaryEmail',a.secondary_email,
  'primaryAt',a.primary_at,'secondaryAt',a.secondary_at,
  'assignedStage',CASE WHEN actor_email=a.primary_email THEN 'primary'
   WHEN actor_email=a.secondary_email THEN 'secondary' ELSE NULL END
 ) ORDER BY a.updated_at DESC,a.id DESC),'[]'::jsonb) INTO result FROM assigned a;
 RETURN result;
END $function$;

-- Regression restoration: bulk-actions replaced the already approved owner-read
-- branch in migration 20261119073346. Preserve existing RLS and deletion filter.
CREATE OR REPLACE FUNCTION public.tl03_document_read(p_board_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $read$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.to_jsonb(d) INTO result FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.id=p_document_id AND d.deleted_at IS NULL;
 RETURN result;
END $read$;

DO $postflight$
DECLARE f record; oid_value oid;
BEGIN
 IF EXISTS (SELECT 1 FROM private.tradelink_revision_approval_exemptions)
  OR has_table_privilege('authenticated','private.tradelink_revision_approval_exemptions','SELECT')
  OR has_table_privilege('anon','private.tradelink_revision_approval_exemptions','SELECT')
  OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.tradelink_revision_approval_exemptions'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'GM exemption postflight failed' USING ERRCODE='55000'; END IF;
 FOR f IN SELECT * FROM (VALUES
  ('private.tl03_assigned_documents(uuid,integer)','9f16c245111342552d02e2da2ce816fa'),
  ('private.tl03_document_review_stages(uuid,uuid)','4dd71a884bc0716a9f360b5ac7d7cb0a'),
  ('private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)','ea4237a69ca7e50e422c72569b43afb2'),
  ('private.tl03_record_review_stage(uuid,uuid,bigint,text)','0a4b3b8e27f111e409321d80838b2c82'),
  ('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)','5a1190ec35ad5df8365aa2788663227d'),
  ('public.tl03_document_revision_bundle(uuid,uuid,bigint)','8594a1d1b299ca0deaa74e177492fb4a')
 ) AS expected(signature,definition_md5) LOOP
  oid_value:=to_regprocedure(f.signature);
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=oid_value AND p.prosecdef
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}') THEN
   RAISE EXCEPTION 'TradeLink execution contract drift: %',f.signature USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.tl03_document_read(uuid,uuid)'::regprocedure
    AND NOT prosecdef AND pg_get_userbyid(proowner)='postgres'
    AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
 THEN RAISE EXCEPTION 'TradeLink creator-read execution contract drift' USING ERRCODE='55000'; END IF;
END $postflight$;
COMMIT;
