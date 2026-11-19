BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE
 manager_policy text;
 owner_policy text;
BEGIN
 IF (SELECT relrowsecurity FROM pg_catalog.pg_class
     WHERE oid='public.tradelink_documents'::regclass) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'TradeLink document RLS is not enabled'
  USING ERRCODE='55000'; END IF;

 SELECT pg_catalog.pg_get_expr(polqual,polrelid) INTO manager_policy
 FROM pg_catalog.pg_policy
 WHERE polrelid='public.tradelink_documents'::regclass
  AND polname='tl03_docs_read';
 SELECT pg_catalog.pg_get_expr(polqual,polrelid) INTO owner_policy
 FROM pg_catalog.pg_policy
 WHERE polrelid='public.tradelink_documents'::regclass
  AND polname='tl03_docs_read_creator';

 IF manager_policy IS DISTINCT FROM 'private.tl03_can_manage(board_id)'
  OR owner_policy IS NULL
  OR position('private.tl03_can_create_draft' IN owner_policy)=0
  OR position('created_by' IN owner_policy)=0
  OR position('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88' IN owner_policy)=0
 THEN RAISE EXCEPTION 'TradeLink document read policies drifted; refusing consolidation'
  USING ERRCODE='55000'; END IF;
END;
$preflight$;

DROP POLICY tl03_docs_read_creator ON public.tradelink_documents;
DROP POLICY tl03_docs_read ON public.tradelink_documents;

-- Preserve the original manager predicate exactly and fold in the narrow
-- creator-owned TradeLink User read branch to avoid two permissive policies.
CREATE POLICY tl03_docs_read ON public.tradelink_documents
 FOR SELECT TO authenticated
 USING(
  private.tl03_can_manage(board_id)
  OR (
   board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
   AND created_by=(SELECT auth.uid())
   AND (SELECT private.tl03_can_create_draft(
    '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)) IS TRUE
  )
 );

DO $postflight$
DECLARE
 policy_expr text;
 policy_count integer;
BEGIN
 SELECT pg_catalog.pg_get_expr(polqual,polrelid) INTO policy_expr
 FROM pg_catalog.pg_policy
 WHERE polrelid='public.tradelink_documents'::regclass
  AND polname='tl03_docs_read';
 SELECT count(*) INTO policy_count
 FROM pg_catalog.pg_policy
 WHERE polrelid='public.tradelink_documents'::regclass
  AND polcmd='r' AND 'authenticated'=ANY(
   ARRAY(SELECT rolname FROM pg_catalog.pg_roles WHERE oid=ANY(polroles))
  );

 IF policy_expr IS NULL
  OR position('private.tl03_can_manage(board_id)' IN policy_expr)=0
  OR position('private.tl03_can_create_draft' IN policy_expr)=0
  OR position('created_by' IN policy_expr)=0
  OR position('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88' IN policy_expr)=0
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy
   WHERE polrelid='public.tradelink_documents'::regclass
    AND polname='tl03_docs_read_creator')
  OR policy_count<>1
 THEN RAISE EXCEPTION 'TradeLink consolidated document read policy postflight failed'
  USING ERRCODE='55000'; END IF;
END;
$postflight$;

COMMIT;
