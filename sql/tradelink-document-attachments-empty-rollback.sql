-- TradeLink EMPTY-ONLY and SOURCE-ONLY rollback.
-- Rejects live attached/pending/removed metadata, Storage objects, audit
-- records, unrecognized policy/function drift. Never deletes file bodies.
-- Not for production execution without separately scoped authorization.
BEGIN;
DO $tl_attach_rollback_preflight$
DECLARE c text;
BEGIN
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO c
 FROM pg_catalog.pg_constraint
 WHERE conrelid='public.tradelink_document_events'::regclass
 AND conname='tradelink_document_events_operation_check';
 IF c IS DISTINCT FROM
  'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text, ''submitted''::text, ''completed''::text, ''reviewed''::text, ''revision-requested''::text, ''approved''::text, ''rejected''::text, ''operational-record''::text, ''reopened''::text, ''attachment-added''::text, ''attachment-removed''::text])))'
 OR to_regclass('private.tl03_attachments') IS NULL
 OR EXISTS(SELECT 1 FROM private.tl03_attachments)
 OR EXISTS(SELECT 1 FROM public.tradelink_document_events
  WHERE operation IN ('attachment-added','attachment-removed'))
 OR EXISTS(SELECT 1 FROM storage.objects
  WHERE bucket_id='tradelink-attachments')
 OR (SELECT count(*) FROM pg_catalog.pg_policies p
  WHERE p.schemaname='storage' AND p.tablename='objects'
  AND p.policyname LIKE 'tl03 attachment %')<>2
 OR to_regprocedure('private.tl03_attachment_storage_authorized(text,text)') IS NULL
 OR to_regprocedure('private.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)') IS NULL
 OR to_regprocedure('private.tl03_attachment_finish(uuid,uuid,bigint,text)') IS NULL
 OR to_regprocedure('private.tl03_attachment_remove(uuid,uuid,bigint,text)') IS NULL
 OR to_regprocedure('private.tl03_attachment_list(uuid,integer)') IS NULL
 OR to_regprocedure('public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)') IS NULL
 OR to_regprocedure('public.tl03_attachment_finish(uuid,uuid,bigint,text)') IS NULL
 OR to_regprocedure('public.tl03_attachment_remove(uuid,uuid,bigint,text)') IS NULL
 OR to_regprocedure('public.tl03_attachment_list(uuid,integer)') IS NULL
 THEN RAISE EXCEPTION 'Cannot roll back nonempty or drifted TradeLink Storage'
  USING ERRCODE='42501'; END IF;
END $tl_attach_rollback_preflight$;
DROP POLICY "tl03 attachment signed upload" ON storage.objects;
DROP POLICY "tl03 attachment signed read" ON storage.objects;
DROP FUNCTION public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid);
DROP FUNCTION public.tl03_attachment_finish(uuid,uuid,bigint,text);
DROP FUNCTION public.tl03_attachment_remove(uuid,uuid,bigint,text);
DROP FUNCTION public.tl03_attachment_list(uuid,integer);
DROP FUNCTION private.tl03_attachment_storage_authorized(text,text);
DROP FUNCTION private.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid);
DROP FUNCTION private.tl03_attachment_finish(uuid,uuid,bigint,text);
DROP FUNCTION private.tl03_attachment_remove(uuid,uuid,bigint,text);
DROP FUNCTION private.tl03_attachment_list(uuid,integer);
DROP TABLE private.tl03_attachments;
ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored','submitted',
  'completed','reviewed','revision-requested','approved','rejected',
  'operational-record','reopened'));
DO $tl_attach_rollback_postflight$
BEGIN
 IF to_regclass('private.tl03_attachments') IS NOT NULL
 OR to_regprocedure('public.tl03_attachment_prepare(uuid,uuid,bigint,text,text,bigint,uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policies p
   WHERE p.schemaname='storage' AND p.tablename='objects'
   AND p.policyname LIKE 'tl03 attachment %')
 OR to_regprocedure('public.tl03_document_operate(uuid,uuid,bigint,text,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='tradelink-attachments'
   AND public=false)
 THEN RAISE EXCEPTION 'TradeLink empty-only rollback postflight drift'
  USING ERRCODE='42501'; END IF;
END $tl_attach_rollback_postflight$;
COMMIT;
