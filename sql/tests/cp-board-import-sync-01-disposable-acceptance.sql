-- CP-BOARD-IMPORT-SYNC-01 authoritative count and pagination acceptance.
DO $$
DECLARE
  v_page jsonb;
  v_next jsonb;
  v_counts jsonb;
  v_groups jsonb;
BEGIN
  IF NOT has_function_privilege('authenticated',
       'public.wm_get_board_items_page(uuid,integer,uuid,integer)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'Existing authenticated execute grant was not preserved.';
  END IF;
  IF has_function_privilege('anon',
       'public.wm_get_board_items_page(uuid,integer,uuid,integer)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'Migration widened the existing function execute grant.';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p
          WHERE p.oid='public.wm_get_board_items_page(uuid,integer,uuid,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'The existing SECURITY DEFINER execution model was not preserved.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.wm_get_board_items_page(uuid,integer,uuid,integer)'::regprocedure
      AND coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=public%'
  ) THEN
    RAISE EXCEPTION 'The existing fixed public search_path was not preserved.';
  END IF;

  v_page := public.wm_get_board_items_page(
    '22222222-2222-4222-8222-222222222222', NULL, NULL, 2
  );
  IF jsonb_array_length(v_page->'items') <> 2 OR v_page->>'has_more' <> 'true' THEN
    RAISE EXCEPTION 'First page did not return the expected bounded page.';
  END IF;
  v_counts := v_page->'counts';
  IF v_counts->>'total_count' <> '4'
     OR v_counts->>'active_count' <> '3'
     OR v_counts->>'archived_count' <> '1' THEN
    RAISE EXCEPTION 'Board counts are not authoritative: %', v_counts;
  END IF;
  IF (SELECT sum((g.value->>'total_count')::bigint)
      FROM jsonb_array_elements(v_counts->'groups') AS g(value)) <> 4
     OR (SELECT sum((g.value->>'active_count')::bigint)
         FROM jsonb_array_elements(v_counts->'groups') AS g(value)) <> 3
     OR (SELECT sum((g.value->>'archived_count')::bigint)
         FROM jsonb_array_elements(v_counts->'groups') AS g(value)) <> 1 THEN
    RAISE EXCEPTION 'Group totals do not reconcile to the board total.';
  END IF;
  v_groups := v_counts->'groups';
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_groups) AS g(value)
    WHERE g.value->>'group_id'='44444444-4444-4444-8444-444444444444'
      AND g.value->>'total_count'='3' AND g.value->>'active_count'='2'
      AND g.value->>'archived_count'='1'
  ) THEN
    RAISE EXCEPTION 'First group active/archived counts are incorrect.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_groups) AS g(value)
    WHERE g.value->>'group_id'='55555555-5555-4555-8555-555555555555'
      AND g.value->>'total_count'='1' AND g.value->>'active_count'='1'
      AND g.value->>'archived_count'='0'
  ) THEN
    RAISE EXCEPTION 'Second group count is incorrect.';
  END IF;

  v_next := public.wm_get_board_items_page(
    '22222222-2222-4222-8222-222222222222',
    (v_page->'next_cursor'->>'position')::integer,
    (v_page->'next_cursor'->>'id')::uuid,
    2
  );
  IF jsonb_array_length(v_next->'items') <> 2 OR v_next->>'has_more' <> 'false' THEN
    RAISE EXCEPTION 'Second page did not complete the bounded board read.';
  END IF;
  IF v_next->'counts' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Continuation pages must not repeat the full count scan.';
  END IF;

  BEGIN
    PERFORM public.wm_get_board_items_page(
      '33333333-3333-4333-8333-333333333333', NULL, NULL, 2
    );
    RAISE EXCEPTION 'Foreign board read unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT 'CP-BOARD-IMPORT-SYNC-01 disposable acceptance: PASS' AS result;
