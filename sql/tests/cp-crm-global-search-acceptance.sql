BEGIN;
\i supabase/migrations/20261116044201_cp_crm_global_search.sql
COMMIT;

DO $$
DECLARE
 n integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',false);
 BEGIN
  PERFORM * FROM public.wm_search_workspace_content('widget',40);
  RAISE EXCEPTION 'unauthenticated search should have failed';
 EXCEPTION WHEN SQLSTATE '28000' THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);

 SELECT count(*) INTO n FROM public.wm_search_workspace_content('serial-archive-77',40);
 IF n<>1 THEN RAISE EXCEPTION 'cell-value search expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('archived serial-archive-77',40);
 IF n<>1 THEN RAISE EXCEPTION 'multi-token search across title and cell values expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('widget asset-100',40);
 IF n<>1 THEN RAISE EXCEPTION 'multi-token search across title and cell values expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('widget',40);
 IF n<>1 THEN RAISE EXCEPTION 'active-board title search expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('blue widget',40);
 IF n<>1 THEN RAISE EXCEPTION 'notes search expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('working',40);
 IF n<>1 THEN RAISE EXCEPTION 'status search expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('2026-12-01',40);
 IF n<>1 THEN RAISE EXCEPTION 'due-date search expected 1 row, received %',n; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('trash secret',40);
 IF n<>0 THEN RAISE EXCEPTION 'trashed board must not be returned'; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('foreign secret',40);
 IF n<>0 THEN RAISE EXCEPTION 'foreign workspace must not be returned'; END IF;
 SELECT count(*) INTO n FROM public.wm_search_workspace_content('serial-archive-77',1);
 IF n<>1 THEN RAISE EXCEPTION 'bounded limit search expected 1 row, received %',n; END IF;

 BEGIN
  PERFORM * FROM public.wm_search_workspace_content('x',40);
  RAISE EXCEPTION 'short query should have failed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
  PERFORM * FROM public.wm_search_workspace_content('widget',51);
  RAISE EXCEPTION 'oversized result limit should have failed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;

 IF has_function_privilege('anon','public.wm_search_workspace_content(text,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'anon must not execute the search RPC';
 END IF;
 IF NOT has_function_privilege('authenticated','public.wm_search_workspace_content(text,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'authenticated role must execute the search RPC';
 END IF;
 IF NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.wm_search_workspace_content(text,integer)'::regprocedure) THEN
  RAISE EXCEPTION 'search RPC must preserve its signed workspace execution context';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_proc p WHERE p.oid='public.wm_search_workspace_content(text,integer)'::regprocedure
   AND p.proconfig @> ARRAY['search_path=""']
 ) THEN
  RAISE EXCEPTION 'search RPC must use an empty fixed search_path';
 END IF;
END $$;

SELECT board_name,item_title,match_field,match_excerpt
FROM public.wm_search_workspace_content('serial-archive-77',40);
