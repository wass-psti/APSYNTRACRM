-- CP-TL-03C EMERGENCY DISABLE CANDIDATE — NOT FOR AUTOMATIC DEPLOYMENT.
-- Requires explicit operator authorization, including any mandatory production
-- permission-change approval. No tables, document records, board items, or audit
-- events are deleted. Its purpose is to disable the newly introduced domain API.
BEGIN;
DO $disable_preflight$
BEGIN
 IF to_regprocedure('private.tl03_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
 THEN
  RAISE EXCEPTION 'CP-TL-03C domain objects missing; cannot run scoped emergency disable';
 END IF;
END $disable_preflight$;

REVOKE ALL ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tl03_document_read(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tl03_documents_list(uuid,integer)
 FROM PUBLIC,anon,authenticated;
REVOKE SELECT ON TABLE public.tradelink_documents,public.tradelink_document_events
 FROM PUBLIC,anon,authenticated;
COMMIT;
