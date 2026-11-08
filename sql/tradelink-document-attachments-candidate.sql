-- TradeLink signed document attachment contract, SOURCE-ONLY.
-- NO PRODUCTION EXECUTION. Requires separate exact-scope SQL/Storage approval.
-- Requires pre-created, PRIVATE 'tradelink-attachments' bucket with a 20MiB
-- ceiling and the ten original TradeLink MIME types. Provision via authorized
-- Supabase Storage API/Dashboard; do not mutate Storage metadata directly.
-- Apply AFTER staged TradeLink Submit, Review, Decision and Operational SQL.
-- Reuses existing immutable append-only TradeLink event trigger and log.
BEGIN;
DO $tl_attach_preflight$
DECLARE actual text;
BEGIN
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO actual
 FROM pg_catalog.pg_constraint
 WHERE conrelid='public.tradelink_document_events'::regclass
  AND conname='tradelink_document_events_operation_check';
 IF actual IS DISTINCT FROM
  'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text, ''submitted''::text, ''completed''::text, ''reviewed''::text, ''revision-requested''::text, ''approved''::text, ''rejected''::text, ''operational-record''::text, ''reopened''::text])))'
 OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
 OR to_regprocedure('public.tl03_document_operate(uuid,uuid,bigint,text,text)') IS NULL
 OR to_regclass('private.tl03_attachments') IS NOT NULL
 OR to_regprocedure('public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)') IS NOT NULL
 OR to_regprocedure('public.tl03_attachment_finish(uuid,uuid,bigint,text)') IS NOT NULL
 OR to_regprocedure('public.tl03_attachment_remove(uuid,uuid,bigint,text)') IS NOT NULL
 OR to_regprocedure('public.tl03_attachment_list(uuid,integer)') IS NOT NULL
 OR NOT EXISTS (
  SELECT 1 FROM storage.buckets b WHERE b.id='tradelink-attachments'
   AND b.name='tradelink-attachments' AND b.public=false
   AND b.file_size_limit=20971520
   AND b.allowed_mime_types @> ARRAY[
    'application/pdf','image/png','image/jpeg','image/webp',
    'text/plain','text/csv','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   ]::text[] AND pg_catalog.cardinality(b.allowed_mime_types)=10)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policies p
   WHERE p.schemaname='storage' AND p.tablename='objects'
     AND p.policyname LIKE 'tl03 attachment %')
 OR has_function_privilege('anon','private.tl03_can_manage(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink attachment source/bucket/ACL prerequisites drift'
 USING ERRCODE='42501'; END IF;
END $tl_attach_preflight$;

-- Private, append-preserving metadata. No client table grants or writable RLS.
CREATE TABLE private.tl03_attachments(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id) ON DELETE RESTRICT,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL,
 board_item_id uuid NOT NULL REFERENCES public.work_board_items(id) ON DELETE RESTRICT,
 storage_key text NOT NULL UNIQUE CHECK (pg_catalog.char_length(storage_key) BETWEEN 1 AND 1024),
 file_name text NOT NULL CHECK (pg_catalog.char_length(file_name) BETWEEN 1 AND 160),
 mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
 checksum_sha256 text CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL CHECK (revision>=1),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','active','replaced','removed')),
 replaces_id uuid REFERENCES private.tl03_attachments(id) ON DELETE RESTRICT,
 superseded_by_id uuid REFERENCES private.tl03_attachments(id) ON DELETE RESTRICT,
 prepared_by uuid NOT NULL REFERENCES auth.users(id),
 prepared_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 finalized_at timestamptz,
 removed_by uuid REFERENCES auth.users(id),
 removed_at timestamptz,
 removal_reason text,
 CONSTRAINT tl03_attachment_board_scope CHECK (
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE INDEX tl03_attachments_by_doc
 ON private.tl03_attachments(document_id,prepared_at DESC,id);
CREATE UNIQUE INDEX tl03_attachment_one_active_name
 ON private.tl03_attachments(document_id,pg_catalog.lower(file_name))
 WHERE status='active';
ALTER TABLE private.tl03_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tl03_attachments FROM PUBLIC,anon,authenticated;

ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored','submitted',
  'completed','reviewed','revision-requested','approved','rejected',
  'operational-record','reopened','attachment-added','attachment-removed'));

-- Storage policies MUST call this private, signed-document authorization
-- predicate, never rely on bucket path, JWT metadata or Board access alone.
CREATE FUNCTION private.tl03_attachment_storage_authorized(p_key text,p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $access$
DECLARE caller uuid:=auth.uid();
BEGIN
 IF caller IS NULL OR p_action NOT IN ('insert','read')
  OR private.tl03_can_manage('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)
    IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;
 RETURN EXISTS(
  SELECT 1 FROM private.tl03_attachments a
   JOIN public.tradelink_documents d ON d.id=a.document_id
  WHERE a.storage_key=p_key
   AND a.board_id=d.board_id AND a.workspace_id=d.workspace_id
   AND a.board_item_id=d.board_item_id
   AND a.workspace_id=public.current_workspace_id(caller)
   AND d.archived_at IS NULL
   AND (
    (p_action='read' AND a.status='active') OR
    (p_action='insert' AND a.status='pending'
      AND a.prepared_by=caller
      AND a.prepared_at>pg_catalog.clock_timestamp()-INTERVAL '60 minutes'
      AND d.workflow_state IN ('draft','revision-required'))
   )
 );
END $access$;
REVOKE ALL ON FUNCTION private.tl03_attachment_storage_authorized(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_attachment_storage_authorized(text,text)
 TO authenticated;

CREATE POLICY "tl03 attachment signed upload" ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
   bucket_id='tradelink-attachments'
   AND owner_id=auth.uid()::text
   AND private.tl03_attachment_storage_authorized(name,'insert')
 );
CREATE POLICY "tl03 attachment signed read" ON storage.objects
 FOR SELECT TO authenticated USING (
   bucket_id='tradelink-attachments'
   AND private.tl03_attachment_storage_authorized(name,'read')
 );
-- No UPDATE (upsert forbidden), DELETE, public, or signed-URL grants for
-- TradeLink objects. Removed/replaced files are retained but inaccessible.

CREATE FUNCTION private.tl03_attachment_prepare(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_file_name text,p_mime_type text,p_size_bytes bigint,p_replaces_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $prepare$
DECLARE d public.tradelink_documents%rowtype;old private.tl03_attachments%rowtype;
 actor uuid:=auth.uid();extension text;expected_mime text;
 attachment_id uuid:=pg_catalog.gen_random_uuid();filename text;
 expected_version integer;storage_key text;total integer;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501'; END IF;
 filename:=pg_catalog.btrim(coalesce(p_file_name,''));
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 OR filename !~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}$'
 OR filename LIKE '%.%' IS FALSE OR p_size_bytes IS NULL
 OR p_size_bytes NOT BETWEEN 1 AND 20971520
 THEN RAISE EXCEPTION 'Invalid TradeLink attachment name, revision or size'
  USING ERRCODE='22023'; END IF;
 extension:=pg_catalog.lower(pg_catalog.split_part(
  filename,'.',pg_catalog.array_length(pg_catalog.string_to_array(filename,'.'),1)));
 expected_mime:=CASE extension WHEN 'pdf' THEN 'application/pdf'
  WHEN 'png' THEN 'image/png' WHEN 'jpg' THEN 'image/jpeg'
  WHEN 'jpeg' THEN 'image/jpeg' WHEN 'webp' THEN 'image/webp'
  WHEN 'txt' THEN 'text/plain' WHEN 'csv' THEN 'text/csv'
  WHEN 'doc' THEN 'application/msword'
  WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN 'xls' THEN 'application/vnd.ms-excel'
  WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ELSE NULL END;
 IF expected_mime IS NULL OR p_mime_type IS DISTINCT FROM expected_mime
 THEN RAISE EXCEPTION 'Unsupported or inconsistent attachment MIME type'
  USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
 OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
 OR d.workflow_state NOT IN ('draft','revision-required')
 THEN RAISE EXCEPTION 'Stale, foreign or finalized TradeLink attachment target'
  USING ERRCODE='PT409'; END IF;
 IF p_replaces_id IS NOT NULL THEN
  SELECT * INTO old FROM private.tl03_attachments
  WHERE id=p_replaces_id AND document_id=d.id FOR UPDATE;
  IF old.id IS NULL OR old.status<>'active'
   OR pg_catalog.lower(old.file_name) IS DISTINCT FROM pg_catalog.lower(filename)
  THEN RAISE EXCEPTION 'Only matching active attachment may be replaced'
   USING ERRCODE='PT409'; END IF;
 ELSIF EXISTS(SELECT 1 FROM private.tl03_attachments a
  WHERE a.document_id=d.id AND a.status='active'
  AND pg_catalog.lower(a.file_name)=pg_catalog.lower(filename))
 THEN RAISE EXCEPTION 'An active attachment with this name already exists'
  USING ERRCODE='PT409'; END IF;
 SELECT pg_catalog.count(*)::integer INTO total
 FROM private.tl03_attachments a WHERE a.document_id=d.id
 AND (a.status='active' OR
   (a.status='pending' AND a.prepared_at>pg_catalog.clock_timestamp()-INTERVAL '60 minutes'));
 -- Allow bounded replacement when the document already has 20 active files,
 -- while keeping a hard cap on pending operations and orphan exposure.
 IF total>=25 OR (total>=20 AND p_replaces_id IS NULL)
 THEN RAISE EXCEPTION 'TradeLink attachment limit reached'
  USING ERRCODE='PT409'; END IF;
 SELECT coalesce(pg_catalog.max(revision),0)::integer+1 INTO expected_version
 FROM private.tl03_attachments a
 WHERE a.document_id=d.id AND pg_catalog.lower(a.file_name)=pg_catalog.lower(filename);
 storage_key:=d.workspace_id::text||'/'||d.id::text||'/'||
  attachment_id::text||'/'||filename;
 INSERT INTO private.tl03_attachments(id,document_id,board_id,workspace_id,
  board_item_id,storage_key,file_name,mime_type,size_bytes,revision,replaces_id,prepared_by)
 VALUES(attachment_id,d.id,d.board_id,d.workspace_id,d.board_item_id,
  storage_key,filename,expected_mime,p_size_bytes,expected_version,p_replaces_id,actor);
 RETURN pg_catalog.jsonb_build_object('attachmentId',attachment_id,
  'documentId',d.id,'boardItemId',d.board_item_id,
  'expectedRevision',d.revision,'fileName',filename,'mimeType',expected_mime,
  'sizeBytes',p_size_bytes,'attachmentRevision',expected_version,
  'storageKey',storage_key);
END $prepare$;
REVOKE ALL ON FUNCTION private.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)
 TO authenticated;

CREATE FUNCTION private.tl03_attachment_finish(
 p_document_id uuid,p_attachment_id uuid,p_expected_revision bigint,p_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $finish$
DECLARE actor uuid:=auth.uid();d public.tradelink_documents%rowtype;
 a private.tl03_attachments%rowtype;old private.tl03_attachments%rowtype;
 object_owner text;object_size text;object_mime text;
 rev bigint;modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_attachment_id IS NULL
 OR p_expected_revision IS NULL OR p_expected_revision<1
 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invalid attachment finalization digest/revision'
  USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
 OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
 OR d.workflow_state NOT IN ('draft','revision-required')
 THEN RAISE EXCEPTION 'Stale, foreign or finalized attachment target'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO a FROM private.tl03_attachments
 WHERE id=p_attachment_id AND document_id=d.id FOR UPDATE;
 IF a.id IS NULL OR a.status<>'pending' OR a.prepared_by<>actor
 OR a.prepared_at<=pg_catalog.clock_timestamp()-INTERVAL '60 minutes'
 OR a.board_item_id IS DISTINCT FROM d.board_item_id
 OR a.workspace_id IS DISTINCT FROM d.workspace_id
 OR a.board_id IS DISTINCT FROM d.board_id
 THEN RAISE EXCEPTION 'Attachment is no longer pending for this signed user'
  USING ERRCODE='PT409'; END IF;
 SELECT o.owner_id,o.metadata->>'size',o.metadata->>'mimetype'
 INTO object_owner,object_size,object_mime FROM storage.objects o
 WHERE o.bucket_id='tradelink-attachments' AND o.name=a.storage_key;
 IF object_owner IS DISTINCT FROM actor::text OR object_size IS NULL
 OR object_size !~ '^[0-9]{1,12}$' OR object_size::bigint<>a.size_bytes
 OR object_mime IS DISTINCT FROM a.mime_type
 THEN RAISE EXCEPTION 'Uploaded object bytes/type/owner not verifiable'
  USING ERRCODE='PT409'; END IF;
 IF a.replaces_id IS NOT NULL THEN
  SELECT * INTO old FROM private.tl03_attachments
  WHERE id=a.replaces_id AND document_id=d.id FOR UPDATE;
  IF old.id IS NULL OR old.status<>'active'
  OR pg_catalog.lower(old.file_name)<>pg_catalog.lower(a.file_name)
  THEN RAISE EXCEPTION 'Replacement attachment state changed'
   USING ERRCODE='PT409'; END IF;
  UPDATE private.tl03_attachments SET status='replaced',
   superseded_by_id=a.id WHERE id=old.id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Replacement attachment was changed'
   USING ERRCODE='PT409'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM private.tl03_attachments x
   WHERE x.document_id=d.id AND x.status='active'
   AND pg_catalog.lower(x.file_name)=pg_catalog.lower(a.file_name))
  THEN RAISE EXCEPTION 'Another active attachment has this file name'
   USING ERRCODE='PT409'; END IF;
 END IF;
 UPDATE private.tl03_attachments SET status='active',
  checksum_sha256=p_sha256,finalized_at=pg_catalog.clock_timestamp()
 WHERE id=a.id AND status='pending';
 UPDATE public.tradelink_documents SET revision=revision+1,
  updated_by=actor,updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
 WHERE id=d.board_item_id AND board_id=d.board_id AND archived_at IS NULL
  AND title=d.document_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked Board attachment projection changed'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,d.board_id,d.workspace_id,rev,'attachment-added',actor,
  pg_catalog.jsonb_build_object('attachmentId',a.id,'fileName',a.file_name,
   'attachmentRevision',a.revision,'replacesId',a.replaces_id,
   'sizeBytes',a.size_bytes,'sha256',p_sha256));
 PERFORM public.work_board_log(d.board_id,'tradelink.attachment.added',
  'TradeLink signed file attached','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'attachmentId',a.id));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'attachmentId',a.id,
  'revision',rev,'attachmentRevision',a.revision,'state','active',
  'operation','attachment-added');
END $finish$;
REVOKE ALL ON FUNCTION private.tl03_attachment_finish(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_attachment_finish(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION private.tl03_attachment_remove(
 p_document_id uuid,p_attachment_id uuid,p_expected_revision bigint,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $remove$
DECLARE actor uuid:=auth.uid();d public.tradelink_documents%rowtype;
 a private.tl03_attachments%rowtype;reason text:=pg_catalog.btrim(coalesce(p_reason,''));
 rev bigint;modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_attachment_id IS NULL OR p_expected_revision IS NULL
 OR p_expected_revision<1 OR pg_catalog.char_length(reason) NOT BETWEEN 3 AND 1000
 OR p_reason~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid signed attachment removal command/reason'
  USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
 OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
 OR d.workflow_state NOT IN ('draft','revision-required')
 THEN RAISE EXCEPTION 'Stale or sealed TradeLink attachment target'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO a FROM private.tl03_attachments
 WHERE id=p_attachment_id AND document_id=d.id FOR UPDATE;
 IF a.id IS NULL OR a.status<>'active'
 THEN RAISE EXCEPTION 'Attachment already removed or not active'
  USING ERRCODE='PT409'; END IF;
 UPDATE private.tl03_attachments SET status='removed',removed_by=actor,
  removed_at=pg_catalog.clock_timestamp(),removal_reason=reason
 WHERE id=a.id AND status='active';
 UPDATE public.tradelink_documents SET revision=revision+1,updated_by=actor,
  updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
 WHERE id=d.board_item_id AND board_id=d.board_id AND archived_at IS NULL
  AND title=d.document_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked Board attachment projection changed'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,d.board_id,d.workspace_id,rev,'attachment-removed',actor,
  pg_catalog.jsonb_build_object('attachmentId',a.id,'fileName',a.file_name,
   'reason',reason,'attachmentRevision',a.revision));
 PERFORM public.work_board_log(d.board_id,'tradelink.attachment.removed',
  'TradeLink file access revoked','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'attachmentId',a.id));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'attachmentId',a.id,
  'revision',rev,'attachmentRevision',a.revision,'state','removed',
  'operation','attachment-removed');
END $remove$;
REVOKE ALL ON FUNCTION private.tl03_attachment_remove(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_attachment_remove(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION private.tl03_attachment_list(p_document_id uuid,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $list$
DECLARE actor uuid:=auth.uid();result jsonb;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
 THEN RAISE EXCEPTION 'Invalid attachment list scope/limit' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tradelink_documents d WHERE d.id=p_document_id
   AND d.workspace_id=public.current_workspace_id(actor) AND d.archived_at IS NULL)
 THEN RAISE EXCEPTION 'Foreign or unavailable attachment document'
  USING ERRCODE='42501'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'attachmentId',s.id,'documentId',s.document_id,'fileName',s.file_name,
  'mimeType',s.mime_type,'sizeBytes',s.size_bytes,
  'checksumSha256',s.checksum_sha256,'revision',s.revision,
  'storageKey',s.storage_key,'uploadedAt',s.finalized_at,
  'uploadedBy',s.prepared_by,'status',s.status)
 ORDER BY s.finalized_at DESC,s.id),'[]'::jsonb)
 INTO result FROM (
  SELECT a.* FROM private.tl03_attachments a
  WHERE a.document_id=p_document_id AND a.status='active'
  ORDER BY a.finalized_at DESC,a.id LIMIT p_limit
 ) s;
 RETURN result;
END $list$;
REVOKE ALL ON FUNCTION private.tl03_attachment_list(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_attachment_list(uuid,integer)
 TO authenticated;

CREATE FUNCTION public.tl03_attachment_prepare(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_file_name text,p_mime_type text,p_size_bytes bigint,p_replaces_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_attachment_prepare(p_board_id,p_document_id,p_expected_revision,
  p_file_name,p_mime_type,p_size_bytes,p_replaces_id);
$rpc$;
CREATE FUNCTION public.tl03_attachment_finish(
 p_document_id uuid,p_attachment_id uuid,p_expected_revision bigint,p_sha256 text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_attachment_finish(p_document_id,p_attachment_id,
  p_expected_revision,p_sha256);
$rpc$;
CREATE FUNCTION public.tl03_attachment_remove(
 p_document_id uuid,p_attachment_id uuid,p_expected_revision bigint,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_attachment_remove(p_document_id,p_attachment_id,p_expected_revision,p_reason);
$rpc$;
CREATE FUNCTION public.tl03_attachment_list(p_document_id uuid,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_attachment_list(p_document_id,p_limit);
$rpc$;

REVOKE ALL ON FUNCTION public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid),
 public.tl03_attachment_finish(uuid,uuid,bigint,text),
 public.tl03_attachment_remove(uuid,uuid,bigint,text),
 public.tl03_attachment_list(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid),
 public.tl03_attachment_finish(uuid,uuid,bigint,text),
 public.tl03_attachment_remove(uuid,uuid,bigint,text),
 public.tl03_attachment_list(uuid,integer) TO authenticated;
DO $tl_attach_postflight$
DECLARE f record;
BEGIN
 FOR f IN
  SELECT p.oid,p.prosecdef,p.proconfig,p.proacl::text acl,pg_catalog.pg_get_userbyid(p.proowner) owner
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname LIKE 'tl03_attachment_%'
 LOOP
  IF NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR f.acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR f.owner<>'postgres' OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'TradeLink private attachment function ACL/security drift'
   USING ERRCODE='42501'; END IF;
 END LOOP;
 IF has_table_privilege('authenticated','private.tl03_attachments','SELECT')
 OR has_table_privilege('authenticated','private.tl03_attachments','INSERT')
 OR has_table_privilege('authenticated','private.tl03_attachments','UPDATE')
 OR has_table_privilege('anon','private.tl03_attachments','SELECT')
 OR EXISTS(SELECT 1 FROM storage.objects o
   WHERE o.bucket_id='tradelink-attachments')
 THEN RAISE EXCEPTION 'TradeLink attachment table or bucket postflight drift'
  USING ERRCODE='42501'; END IF;
END $tl_attach_postflight$;
COMMIT;
