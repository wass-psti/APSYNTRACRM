-- CP-TL-REVISION-HISTORY-01
-- Preserve every complete TradeLink document revision and support exact approved-revision retrieval.
-- Existing overwritten revisions cannot be reconstructed; current rows are marked as baseline snapshots.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('private.tradelink_document_reviews') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_review_assignee(text,jsonb,text)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regclass('private.tradelink_document_revision_snapshots') IS NOT NULL
  OR to_regprocedure('public.tl03_document_revision_bundle(uuid,uuid,bigint)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-TL-REVISION-HISTORY-01 prerequisites or duplicate installation detected'
  USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE TABLE private.tradelink_document_revision_snapshots(
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id) ON DELETE RESTRICT,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL,
 board_item_id uuid NOT NULL REFERENCES public.work_board_items(id) ON DELETE RESTRICT,
 document_type text NOT NULL CHECK(document_type IN ('esi','packing','delivery','payment','quotation','po')),
 document_number text NOT NULL CHECK(char_length(document_number) BETWEEN 1 AND 120),
 workflow_state text NOT NULL CHECK(workflow_state IN (
  'draft','for-approval','submitted','under-review','revision-required',
  'approved','rejected','completed','cancelled','under-negotiation',
  'expired','on-hold','won','lost','delivered','closed')),
 revision bigint NOT NULL CHECK(revision>=1),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 revision_at timestamptz NOT NULL,
 snapshot_source text NOT NULL CHECK(snapshot_source IN ('baseline','captured')),
 captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(document_id,revision),
 CONSTRAINT tl03_revision_snapshot_scope CHECK(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE INDEX tl03_revision_snapshot_board_document
 ON private.tradelink_document_revision_snapshots(board_id,document_id,revision DESC);
ALTER TABLE private.tradelink_document_revision_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tradelink_document_revision_snapshots FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tl03_deny_revision_snapshot_change()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $immutable$
BEGIN
 RAISE EXCEPTION 'TradeLink revision snapshots are immutable' USING ERRCODE='42501';
END $immutable$;
REVOKE ALL ON FUNCTION private.tl03_deny_revision_snapshot_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_revision_snapshots_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_document_revision_snapshots
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_revision_snapshot_change();

CREATE FUNCTION private.tl03_guard_document_revision_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id
  OR NEW.board_id IS DISTINCT FROM OLD.board_id
  OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
  OR NEW.board_item_id IS DISTINCT FROM OLD.board_item_id
 THEN RAISE EXCEPTION 'TradeLink document identity cannot change' USING ERRCODE='42501'; END IF;
 IF NEW.revision<OLD.revision OR NEW.revision>OLD.revision+1 THEN
  RAISE EXCEPTION 'TradeLink revision must advance exactly one step' USING ERRCODE='PT409'; END IF;
 IF (NEW.document_type,NEW.document_number,NEW.content)
    IS DISTINCT FROM (OLD.document_type,OLD.document_number,OLD.content)
  AND NEW.revision<>OLD.revision+1
 THEN RAISE EXCEPTION 'TradeLink content changes require a new revision' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION private.tl03_guard_document_revision_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_document_revision_snapshot_guard
 BEFORE UPDATE ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_guard_document_revision_snapshot();

CREATE FUNCTION private.tl03_capture_document_revision_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $capture$
BEGIN
 IF TG_OP='UPDATE' AND NEW.revision=OLD.revision THEN RETURN NEW; END IF;
 INSERT INTO private.tradelink_document_revision_snapshots(
  document_id,board_id,workspace_id,board_item_id,document_type,document_number,
  workflow_state,revision,content,created_by,updated_by,created_at,updated_at,
  archived_at,revision_at,snapshot_source,captured_at
 ) VALUES(
  NEW.id,NEW.board_id,NEW.workspace_id,NEW.board_item_id,NEW.document_type,
  NEW.document_number,NEW.workflow_state,NEW.revision,NEW.content,
  NEW.created_by,NEW.updated_by,NEW.created_at,NEW.updated_at,NEW.archived_at,
  coalesce(NEW.updated_at,NEW.created_at),'captured',pg_catalog.clock_timestamp()
 );
 RETURN NEW;
END $capture$;
REVOKE ALL ON FUNCTION private.tl03_capture_document_revision_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_document_revision_snapshot_insert
 AFTER INSERT ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_capture_document_revision_snapshot();
CREATE TRIGGER tl03_document_revision_snapshot_update
 AFTER UPDATE OF revision ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_capture_document_revision_snapshot();

-- Existing current payloads are retained as baseline; unavailable older payloads are not reconstructed.
INSERT INTO private.tradelink_document_revision_snapshots(
 document_id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by,created_at,updated_at,
 archived_at,revision_at,snapshot_source,captured_at
)
SELECT d.id,d.board_id,d.workspace_id,d.board_item_id,d.document_type,d.document_number,
 d.workflow_state,d.revision,d.content,d.created_by,d.updated_by,d.created_at,d.updated_at,
 d.archived_at,coalesce(d.updated_at,d.created_at),'baseline',pg_catalog.clock_timestamp()
FROM public.tradelink_documents d
ON CONFLICT(document_id,revision) DO NOTHING;

CREATE FUNCTION public.tl03_document_revision_bundle(
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
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501';
 END IF;
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
   'approved',coalesce(a.approved,FALSE),'primaryAt',a.primary_at,
   'secondaryAt',a.secondary_at,'revisionAt',s.revision_at,
   'capturedAt',s.captured_at,'snapshotSource',s.snapshot_source,
   'current',s.revision=d.revision
  ) ORDER BY s.revision DESC),'[]'::jsonb) INTO v_revisions
 FROM private.tradelink_document_revision_snapshots s
 LEFT JOIN LATERAL(
  SELECT
   (count(*) FILTER(WHERE r.stage='primary')=1
    AND count(*) FILTER(WHERE r.stage='secondary')=1
    AND count(DISTINCT r.actor_id)=2
    AND coalesce(pg_catalog.bool_and(
     pg_catalog.lower(r.assigned_email)=pg_catalog.lower(u.email)
     AND r.assigned_email=private.tl03_review_assignee(s.document_type,s.content,r.stage)
    ),FALSE)) AS approved,
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
   (count(*) FILTER(WHERE r.stage='primary')=1
    AND count(*) FILTER(WHERE r.stage='secondary')=1
    AND count(DISTINCT r.actor_id)=2
    AND coalesce(pg_catalog.bool_and(
     pg_catalog.lower(r.assigned_email)=pg_catalog.lower(u.email)
     AND r.assigned_email=private.tl03_review_assignee(v_snapshot.document_type,v_snapshot.content,r.stage)
    ),FALSE)),
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
   'primary_reviewed_at',v_primary_at,'secondary_reviewed_at',v_secondary_at
  );
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'documentId',d.id,'boardItemId',d.board_item_id,
  'currentRevision',d.revision,'revisions',v_revisions,'selected',v_selected
 );
END $bundle$;
REVOKE ALL ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint) TO authenticated;

DO $postflight$
DECLARE f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR (NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots)
       AND EXISTS(SELECT 1 FROM public.tradelink_documents))
  OR EXISTS(SELECT 1 FROM public.tradelink_documents d
    WHERE NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots s
     WHERE s.document_id=d.id AND s.revision=d.revision))
 THEN RAISE EXCEPTION 'CP-TL-REVISION-HISTORY-01 postflight failed' USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
