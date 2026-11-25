-- Mirrors the existing signed TradeLink commit RPC grant in the disposable fixture.
-- This is test-only setup; it does not alter production roles or privileges.
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;
