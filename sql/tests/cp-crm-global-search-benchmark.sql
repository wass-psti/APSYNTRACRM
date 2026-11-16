-- Disposable PostgreSQL 17 workload: representative production scale (32k items / 224k cells).
-- Run only after cp-crm-global-search-setup.sql and the search migration.
CREATE INDEX work_boards_workspace_status_idx ON public.work_boards(workspace_id,status);
CREATE INDEX work_board_items_board_id_idx ON public.work_board_items(board_id);
CREATE INDEX work_board_columns_board_id_position_idx ON public.work_board_columns(board_id,position,id);
CREATE UNIQUE INDEX work_board_item_values_pkey ON public.work_board_item_values(item_id,column_id);
CREATE INDEX work_board_item_values_column_idx ON public.work_board_item_values(column_id,item_id);
INSERT INTO public.work_board_columns(id,board_id,name,position,visible)
SELECT md5('bench-column-'||g)::uuid,'10000000-0000-4000-8000-000000000001',
       'Benchmark Field '||g,g,true
FROM generate_series(2,7) g;
INSERT INTO public.work_board_items(id,board_id,group_id,title,notes,status,due_date,updated_at)
SELECT md5('bench-item-'||g)::uuid,
       '10000000-0000-4000-8000-000000000001'::uuid,
       '20000000-0000-4000-8000-000000000001'::uuid,
       'Asset tool '||g,
       'Inventory component record '||g,
       CASE WHEN g%3=0 THEN 'working' WHEN g%3=1 THEN 'pending' ELSE 'done' END,
       date '2026-01-01'+(g%365),now()-(g||' seconds')::interval
FROM generate_series(1,32000) g;
INSERT INTO public.work_board_item_values(item_id,column_id,value)
SELECT md5('bench-item-'||g)::uuid,
       CASE col WHEN 1 THEN '22000000-0000-4000-8000-000000000002'::uuid
       ELSE md5('bench-column-'||col)::uuid END,
       to_jsonb(CASE col WHEN 1 THEN 'TOOL-'||g
         WHEN 2 THEN 'ASSET-'||g WHEN 3 THEN 'COMPONENT-'||(g%500)
         WHEN 4 THEN 'WAREHOUSE-'||(g%25) WHEN 5 THEN 'CATEGORY-'||(g%40)
         WHEN 6 THEN 'OWNER-'||(g%300) ELSE 'REFERENCE-'||g END)
FROM generate_series(1,32000) g CROSS JOIN generate_series(1,7) col;
ANALYZE public.work_boards;
ANALYZE public.work_board_items;
ANALYZE public.work_board_groups;
ANALYZE public.work_board_columns;
ANALYZE public.work_board_item_values;
SELECT 'items' AS metric,count(*) FROM public.work_board_items WHERE board_id='10000000-0000-4000-8000-000000000001'
UNION ALL SELECT 'cells',count(*) FROM public.work_board_item_values;
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,SUMMARY ON)
SELECT count(*) FROM public.work_board_items
WHERE lower(coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(status, ''))
 LIKE '%tool-32000%' ESCAPE E'\\';
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,SUMMARY ON)
SELECT count(*) FROM public.work_board_item_values
WHERE lower(coalesce(value #>> '{}', value::text, ''))
 LIKE '%tool-32000%' ESCAPE E'\\';
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,SUMMARY ON)
SELECT count(*) FROM public.work_board_items
WHERE lower(coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(status, ''))
 LIKE '%asset tool 120%' ESCAPE E'\\';
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,SUMMARY ON)
SELECT * FROM public.wm_search_workspace_content('TOOL-32000',40);
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,SUMMARY ON)
SELECT * FROM public.wm_search_workspace_content('tool',40);

DO $$
DECLARE
  v_started timestamptz;
  v_elapsed interval;
  v_count integer;
BEGIN
  PERFORM * FROM public.wm_search_workspace_content('TOOL-32000',40);
  v_started := clock_timestamp();
  SELECT count(*) INTO v_count FROM public.wm_search_workspace_content('TOOL-32000',40);
  v_elapsed := clock_timestamp() - v_started;
  IF v_count <> 1 THEN RAISE EXCEPTION 'selective benchmark expected one record, received %',v_count; END IF;
  IF v_elapsed > interval '800 milliseconds' THEN
    RAISE EXCEPTION 'selective search exceeded 800ms benchmark budget: %',v_elapsed;
  END IF;

  PERFORM * FROM public.wm_search_workspace_content('tool',40);
  v_started := clock_timestamp();
  SELECT count(*) INTO v_count FROM public.wm_search_workspace_content('tool',40);
  v_elapsed := clock_timestamp() - v_started;
  IF v_count <> 40 THEN RAISE EXCEPTION 'broad benchmark expected 40 bounded records, received %',v_count; END IF;
  IF v_elapsed > interval '1500 milliseconds' THEN
    RAISE EXCEPTION 'broad search exceeded 1500ms benchmark budget: %',v_elapsed;
  END IF;
  RAISE NOTICE 'Global search performance budgets passed (selective %, broad %).',
    (SELECT 'within budget'),(SELECT 'within budget');
END $$;

SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname='public' AND indexrelname LIKE '%search_%'
ORDER BY indexrelname;
