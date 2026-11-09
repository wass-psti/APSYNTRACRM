-- CP-TL-PDF02: isolated, NON-DEPLOYED signed electronic PDF stage events.
-- Do not run against production without separately authorized SQL deployment.
-- Does not issue PDFs, elevate user roles, or change existing workflow flags.
-- Requires existing signed tl03_can_manage and DocumentRecord contract.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
    OR to_regclass('public.work_board_items') IS NULL
    OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
    OR to_regprocedure('private.tl03_deny_event_change()') IS NULL
    OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
    OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
    OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
    OR to_regprocedure('private.tl03_can_pdf_approve(uuid)') IS NOT NULL
    OR to_regclass('private.tradelink_pdf_approval_events') IS NOT NULL
    OR to_regprocedure('public.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)') IS NOT NULL
    OR to_regprocedure('public.tl03_pdf_approval_stages(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'TradeLink PDF stage prerequisites or existing installation drift'
  USING ERRCODE='42501'; END IF;
END $preflight$;

-- Private and append-only to ordinary signed clients. No public table grants.
CREATE TABLE private.tradelink_pdf_approval_events(
 event_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id),
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 document_revision bigint NOT NULL CHECK(document_revision>=1),
 stage text NOT NULL CHECK(stage IN ('primary','secondary')),
 document_type text NOT NULL CHECK(document_type IN
  ('esi','quotation','po','delivery','payment')),
 assigned_email text NOT NULL,
 actor_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 UNIQUE(document_id,document_revision,stage)
);
CREATE TRIGGER tl03_pdf_approval_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_pdf_approval_events
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_event_change();
ALTER TABLE private.tradelink_pdf_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tradelink_pdf_approval_events FROM PUBLIC,anon,authenticated;

-- Separate, narrow reviewer capability. A nominated user needs an active,
-- workspace-scoped signed session, TradeLink board VIEW membership and an
-- enabled TradeLink module role. This does not grant document edit/management.
CREATE FUNCTION private.tl03_can_pdf_approve(p_board_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $pdf_access$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_board_id IS DISTINCT FROM
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR NOT private.wm_board_config_session_active()
 THEN RETURN FALSE; END IF;
 RETURN pg_catalog.coalesce(public.work_board_access(p_board_id,'view'),FALSE)
  AND public.module_role_for('tradelink',actor) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.work_boards b
   WHERE b.id=p_board_id AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.workspace_id=public.current_workspace_id(actor)
    AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%');
END $pdf_access$;
REVOKE ALL ON FUNCTION private.tl03_can_pdf_approve(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_pdf_approve(uuid) TO authenticated;

-- Actor binding and order are enforced inside one row-locking transaction.
-- `recorded_at` is server generated, never supplied by the browser.
CREATE FUNCTION private.tl03_record_pdf_approval_stage(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_stage text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE
 actor uuid:=auth.uid(); verified_email text; nominated text;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 first_stage private.tradelink_pdf_approval_events%rowtype;
 event_row private.tradelink_pdf_approval_events%rowtype;
 primary_nominee text; secondary_nominee text;
BEGIN
 IF actor IS NULL OR private.tl03_can_pdf_approve(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink authorization required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR
   p_expected_revision<1 OR p_stage NOT IN ('primary','secondary') OR p_stage IS NULL
 THEN RAISE EXCEPTION 'Invalid PDF stage command' USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO verified_email
 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
 IF verified_email IS NULL OR verified_email='' THEN
  RAISE EXCEPTION 'Verified signed account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
 THEN RAISE EXCEPTION 'Stale, archived or foreign PDF approval' USING ERRCODE='PT409'; END IF;
 IF d.document_type NOT IN ('esi','quotation','po','delivery','payment')
   OR d.workflow_state NOT IN ('submitted','under-review') THEN
  RAISE EXCEPTION 'Document not eligible for signed PDF review' USING ERRCODE='PT409'; END IF;
 SELECT * INTO projection FROM public.work_board_items
 WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number THEN
  RAISE EXCEPTION 'Document Board projection drift' USING ERRCODE='PT409'; END IF;
 -- No free-text display names or browser timestamps used.
 primary_nominee:=CASE d.document_type
  WHEN 'quotation' THEN 'aacsenagan@watchdogautomation.com.ph'
  WHEN 'esi' THEN d.content->>'verifiedBy'
  WHEN 'po' THEN d.content->>'verifiedBy'
  WHEN 'delivery' THEN d.content->>'checkedBy'
  WHEN 'payment' THEN d.content->>'receivedBy' END;
 secondary_nominee:=CASE d.document_type
  WHEN 'quotation' THEN d.content->>'approvedByEmail'
  WHEN 'esi' THEN d.content->>'approvedBy'
  WHEN 'po' THEN d.content->>'approvedBy'
  WHEN 'delivery' THEN d.content->>'deliveredBy'
  WHEN 'payment' THEN d.content->>'verifiedBy' END;
 -- The quotation primary is fixed and must be persisted in signed content.
 IF d.document_type='quotation' AND
  (d.content->>'verifiedByEmail' IS DISTINCT FROM primary_nominee OR
   d.content->>'approvedByEmail' NOT IN
    ('asenagan@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph',
     'amsenagan@watchdogautomation.com.ph')) THEN
  RAISE EXCEPTION 'Quotation approval hierarchy differs from saved record'
   USING ERRCODE='42501'; END IF;
 nominated:=pg_catalog.lower(pg_catalog.btrim(coalesce(
  CASE WHEN p_stage='primary' THEN primary_nominee ELSE secondary_nominee END,'')));
 -- Backend allowlists are authoritative, not just frontend dropdowns.
 IF NOT (CASE
  WHEN d.document_type='quotation' AND p_stage='primary' THEN
    nominated='aacsenagan@watchdogautomation.com.ph'
  WHEN d.document_type='quotation' AND p_stage='secondary' THEN
    nominated IN ('asenagan@watchdogautomation.com.ph',
      'dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph')
  WHEN d.document_type='esi' AND p_stage='primary' THEN
    nominated IN ('msenagan@watchdogautomation.com.ph',
      'jtorino@watchdogautomation.com.ph','dcabanas@watchdogautomation.com.ph')
  WHEN d.document_type='esi' AND p_stage='secondary' THEN
    nominated IN ('asenagan@watchdogautomation.com.ph',
      'dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph')
  WHEN d.document_type='po' AND p_stage='primary' THEN
    nominated IN ('asenagan@watchdogautomation.com.ph',
      'aacsenagan@watchdogautomation.com.ph','cerama@watchdogautomation.com.ph',
      'ppajulas@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph')
  WHEN d.document_type='po' AND p_stage='secondary' THEN
    nominated IN ('asenagan@watchdogautomation.com.ph',
      'dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph')
  WHEN d.document_type='delivery' AND p_stage='primary' THEN
    nominated IN ('dsenagan@watchdogautomation.com.ph',
      'asenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph')
  WHEN d.document_type='delivery' AND p_stage='secondary' THEN
    nominated IN ('rogang@watchdogautomation.com.ph',
      'jnunez@watchdogautomation.com.ph','ppajulas@watchdogautomation.com.ph',
      'dcabanas@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
  WHEN d.document_type='payment' AND p_stage='primary' THEN
    nominated='msenagan@watchdogautomation.com.ph'
  WHEN d.document_type='payment' AND p_stage='secondary' THEN
    nominated='asenagan@watchdogautomation.com.ph'
  ELSE FALSE END) THEN
  RAISE EXCEPTION 'Account is not allowed in this module approval stage'
   USING ERRCODE='42501'; END IF;
 IF nominated='' OR verified_email IS DISTINCT FROM nominated THEN
  RAISE EXCEPTION 'Only the signed assigned account can record this PDF stage'
   USING ERRCODE='42501'; END IF;
 IF p_stage='secondary' THEN
  SELECT * INTO first_stage FROM private.tradelink_pdf_approval_events
  WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
  IF first_stage.event_id IS NULL OR first_stage.workspace_id<>d.workspace_id
    OR first_stage.board_id<>p_board_id THEN
   RAISE EXCEPTION 'Primary review required before secondary verification'
    USING ERRCODE='PT409'; END IF;
 END IF;
 -- Duplicate attempts fail rather than silently replacing signed evidence.
 INSERT INTO private.tradelink_pdf_approval_events
  (document_id,board_id,workspace_id,document_revision,stage,
   document_type,assigned_email,actor_id)
 VALUES(d.id,p_board_id,d.workspace_id,d.revision,p_stage,
  d.document_type,nominated,actor)
 RETURNING * INTO event_row;
 PERFORM public.work_board_log(p_board_id,'tradelink.pdf-approval.'||p_stage,
  'TradeLink signed PDF stage event recorded','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('eventId',event_row.event_id,
   'documentRevision',d.revision,'stage',p_stage));
 RETURN pg_catalog.jsonb_build_object('eventId',event_row.event_id,
  'documentId',d.id,'boardItemId',d.board_item_id,'workspaceId',d.workspace_id,
  'revision',d.revision,'stage',p_stage,'actorId',actor,
  'actorEmail',nominated,'recordedAt',event_row.recorded_at);
END $body$;
REVOKE ALL ON FUNCTION private.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION public.tl03_record_pdf_approval_stage(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_stage text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_record_pdf_approval_stage(
  p_board_id,p_document_id,p_expected_revision,p_stage);
$rpc$;
REVOKE ALL ON FUNCTION public.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_record_pdf_approval_stage(uuid,uuid,bigint,text)
 TO authenticated;

-- Signed read of the current revision only; historical stages cannot be
-- mistaken for approvals after any document edit or workflow revision.
CREATE FUNCTION private.tl03_pdf_approval_stages(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $read$
DECLARE actor uuid:=auth.uid(); d public.tradelink_documents%rowtype;
 stages jsonb;
BEGIN
 IF actor IS NULL OR private.tl03_can_pdf_approve(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink scope required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
 THEN RAISE EXCEPTION 'Foreign or missing signed document' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('eventId',e.event_id,'stage',e.stage,
   'actorId',e.actor_id,'actorEmail',e.assigned_email,
   'recordedAt',e.recorded_at,'revision',e.document_revision)
  ORDER BY e.recorded_at,e.event_id),'[]'::jsonb) INTO stages
 FROM private.tradelink_pdf_approval_events e
 WHERE e.document_id=d.id AND e.workspace_id=d.workspace_id
  AND e.board_id=p_board_id AND e.document_revision=d.revision;
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'workspaceId',d.workspace_id,'revision',d.revision,'stages',stages);
END $read$;
REVOKE ALL ON FUNCTION private.tl03_pdf_approval_stages(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_pdf_approval_stages(uuid,uuid) TO authenticated;
CREATE FUNCTION public.tl03_pdf_approval_stages(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $read_rpc$
 SELECT private.tl03_pdf_approval_stages(p_board_id,p_document_id);
$read_rpc$;
REVOKE ALL ON FUNCTION public.tl03_pdf_approval_stages(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_pdf_approval_stages(uuid,uuid) TO authenticated;

COMMIT;
