-- Disposable only: mimic exact existing legacy public/authenticated EXECUTE grants.
\set ON_ERROR_STOP on
\set ON_ERROR_STOP on
DO $tl03e_disposable_only$
BEGIN
 IF current_database() <> 'cp_tl03e_disposable'
 THEN RAISE EXCEPTION 'TL03E_DISPOSABLE_ONLY' USING ERRCODE='42501'; END IF;
END $tl03e_disposable_only$;

DO $fixture_grants$
DECLARE v record; counted integer:=0;
BEGIN
 FOR v IN SELECT p.oid::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'tradelink_%' AND p.prosecdef
  ORDER BY p.proname LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||v.signature||' FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||v.signature||' TO authenticated';
  counted:=counted+1;
 END LOOP;
 IF counted<>11 THEN RAISE EXCEPTION 'Wrong unguarded entrypoint count: %',counted; END IF;
END $fixture_grants$;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
