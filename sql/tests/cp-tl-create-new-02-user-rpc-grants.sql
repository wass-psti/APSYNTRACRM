-- Normalize the four existing signed TradeLink RPC grants in the disposable
-- fixture to the production contract before the CP-TL-CREATE-NEW-01 migration.
REVOKE ALL ON FUNCTION public.tl03_document_create(uuid,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_create(uuid,uuid,jsonb,text)
 TO authenticated;

REVOKE ALL ON FUNCTION public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)
 TO authenticated;

REVOKE ALL ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

REVOKE ALL ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint)
 TO authenticated;
