-- CP-CRM-GLOBAL-SEARCH-02B: make two-character prefix searches indexable.
-- The previous LIKE pattern was parameterized through a materialized token CTE,
-- so PostgreSQL did not select the B-tree prefix indexes for short queries.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DROP INDEX IF EXISTS public.work_board_items_search_prefix_idx;
DROP INDEX IF EXISTS public.work_board_item_values_search_prefix_idx;

CREATE INDEX work_board_items_search_prefix_idx
  ON public.work_board_items (
    left(lower(coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(status, '')), 2)
  );
CREATE INDEX work_board_item_values_search_prefix_idx
  ON public.work_board_item_values (
    left(lower(coalesce(value #>> '{}', value::text, '')), 2)
  );

CREATE OR REPLACE FUNCTION private.wm_search_workspace_content_impl(
  p_query text,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  board_id uuid,
  board_name text,
  board_status text,
  item_id uuid,
  item_title text,
  group_title text,
  item_status text,
  is_archived boolean,
  updated_at timestamp with time zone,
  match_field text,
  match_excerpt text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_query text;
  v_limit integer;
  v_short_item_ids uuid[] := ARRAY[]::uuid[];
  v_short_cell_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A signed-in workspace session is required.' USING ERRCODE = '28000';
  END IF;

  v_query := regexp_replace(lower(btrim(coalesce(p_query, ''))), '\s+', ' ', 'g');
  IF length(v_query) < 2 OR length(v_query) > 160 THEN
    RAISE EXCEPTION 'Search text must contain 2–160 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Search result limit must be between 1 and 50.' USING ERRCODE = '22023';
  END IF;
  v_limit := p_limit;

  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL THEN
    RETURN;
  END IF;

  -- A dynamic custom plan lets PostgreSQL use the two-character prefix indexes.
  -- The generic cached plan for the multi-branch token join otherwise chose a scan.
  IF length(v_query) = 2 THEN
    EXECUTE $query$
      SELECT coalesce(array_agg(i.id), ARRAY[]::uuid[])
      FROM public.work_board_items i
      JOIN public.work_boards b ON b.id = i.board_id
      WHERE b.workspace_id = $1
        AND b.status IN ('active', 'archived')
        AND public.work_board_access(b.id, 'view')
        AND left(lower(coalesce(i.title, '') || ' ' || coalesce(i.notes, '') || ' ' || coalesce(i.status, '')), 2) = $2
    $query$ INTO v_short_item_ids USING v_workspace, v_query;

    EXECUTE $query$
      SELECT coalesce(array_agg(DISTINCT v.item_id), ARRAY[]::uuid[])
      FROM public.work_board_item_values v
      JOIN public.work_board_items i ON i.id = v.item_id
      JOIN public.work_boards b ON b.id = i.board_id
      WHERE b.workspace_id = $1
        AND b.status IN ('active', 'archived')
        AND public.work_board_access(b.id, 'view')
        AND left(lower(coalesce(v.value #>> '{}', v.value::text, '')), 2) = $2
    $query$ INTO v_short_cell_ids USING v_workspace, v_query;
  END IF;

  RETURN QUERY
  WITH tokens AS NOT MATERIALIZED (
    SELECT DISTINCT token.value,
      CASE WHEN length(token.value) < 3 THEN
        replace(replace(replace(token.value, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%'
      ELSE '%' ||
        replace(replace(replace(token.value, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%'
      END AS pattern
    FROM unnest(string_to_array(v_query, ' ')) AS token(value)
    WHERE token.value <> ''
  ), visible_boards AS MATERIALIZED (
    SELECT b.id, b.name, b.status
    FROM public.work_boards b
    WHERE b.workspace_id = v_workspace
      AND b.status IN ('active', 'archived')
      AND public.work_board_access(b.id, 'view')
  ), candidate_matches AS (
    SELECT t.value AS token, short_match.item_id
    FROM tokens t
    CROSS JOIN unnest(v_short_item_ids) AS short_match(item_id)
    WHERE length(v_query) = 2
    UNION
    SELECT t.value AS token, short_match.item_id
    FROM tokens t
    CROSS JOIN unnest(v_short_cell_ids) AS short_match(item_id)
    WHERE length(v_query) = 2
    UNION
    SELECT t.value AS token, i.id AS item_id
    FROM tokens t
    JOIN public.work_board_items i
      ON length(v_query) <> 2 AND length(t.value) < 3
      AND left(lower(coalesce(i.title, '') || ' ' || coalesce(i.notes, '') || ' ' || coalesce(i.status, '')), 2) = t.value
    JOIN visible_boards b ON b.id = i.board_id
    UNION
    SELECT t.value AS token, i.id AS item_id
    FROM tokens t
    JOIN public.work_board_items i
      ON length(t.value) >= 3
      AND lower(coalesce(i.title, '') || ' ' || coalesce(i.notes, '') || ' ' || coalesce(i.status, ''))
        LIKE t.pattern ESCAPE E'\\'
    JOIN visible_boards b ON b.id = i.board_id
    UNION
    SELECT t.value AS token, i.id AS item_id
    FROM tokens t
    JOIN public.work_board_items i
      ON position(t.value IN lower(coalesce(i.due_date::text, ''))) > 0
    JOIN visible_boards b ON b.id = i.board_id
    UNION
    SELECT t.value AS token, v.item_id
    FROM tokens t
    JOIN public.work_board_item_values v
      ON length(v_query) <> 2 AND length(t.value) < 3
      AND left(lower(coalesce(v.value #>> '{}', v.value::text, '')), 2) = t.value
    JOIN public.work_board_items i ON i.id = v.item_id
    JOIN visible_boards b ON b.id = i.board_id
    UNION
    SELECT t.value AS token, v.item_id
    FROM tokens t
    JOIN public.work_board_item_values v
      ON length(t.value) >= 3
      AND lower(coalesce(v.value #>> '{}', v.value::text, ''))
        LIKE t.pattern ESCAPE E'\\'
    JOIN public.work_board_items i ON i.id = v.item_id
    JOIN visible_boards b ON b.id = i.board_id
  ), matched_item_ids AS (
    SELECT c.item_id
    FROM candidate_matches c
    GROUP BY c.item_id
    HAVING count(*) = (SELECT count(*) FROM tokens)
  ), ranked_items AS (
    SELECT
      i.board_id,
      b.name AS board_name,
      b.status AS board_status,
      i.id AS item_id,
      coalesce(i.title, 'Untitled record') AS item_title,
      g.title AS group_title,
      i.status AS item_status,
      (i.archived_at IS NOT NULL) AS is_archived,
      i.updated_at,
      i.title AS raw_title,
      i.notes AS raw_notes,
      i.due_date::text AS raw_due_date
    FROM matched_item_ids m
    JOIN public.work_board_items i ON i.id = m.item_id
    JOIN visible_boards b ON b.id = i.board_id
    LEFT JOIN public.work_board_groups g
      ON g.id = i.group_id AND g.board_id = i.board_id
    ORDER BY
      CASE
        WHEN lower(coalesce(i.title, '')) = v_query THEN 0
        WHEN position(v_query IN lower(coalesce(i.title, ''))) = 1 THEN 1
        ELSE 2
      END,
      i.updated_at DESC,
      b.name,
      i.id
    LIMIT v_limit
  )
  SELECT
    r.board_id,
    r.board_name,
    r.board_status,
    r.item_id,
    r.item_title,
    r.group_title,
    r.item_status,
    r.is_archived,
    r.updated_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_title, ''))) > 0) THEN 'Record title'
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_notes, ''))) > 0) THEN 'Notes'
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.item_status, ''))) > 0) THEN 'Status'
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_due_date, ''))) > 0) THEN 'Due date'
      WHEN cell_match.column_name IS NOT NULL THEN cell_match.column_name
      ELSE 'Record'
    END AS match_field,
    CASE
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_title, ''))) > 0)
        THEN left(r.raw_title, 160)
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_notes, ''))) > 0)
        THEN substring(r.raw_notes FROM greatest(strpos(lower(r.raw_notes), (
          SELECT t.value FROM tokens t WHERE position(t.value IN lower(r.raw_notes)) > 0 LIMIT 1
        )) - 48, 1) FOR 160)
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.item_status, ''))) > 0)
        THEN left(r.item_status, 160)
      WHEN EXISTS (SELECT 1 FROM tokens t WHERE position(t.value IN lower(coalesce(r.raw_due_date, ''))) > 0)
        THEN r.raw_due_date
      WHEN cell_match.column_name IS NOT NULL
        THEN substring(cell_match.value_text FROM greatest(strpos(lower(cell_match.value_text), (
          SELECT t.value FROM tokens t WHERE position(t.value IN lower(cell_match.value_text)) > 0 LIMIT 1
        )) - 48, 1) FOR 160)
      ELSE left(r.item_title, 160)
    END AS match_excerpt
  FROM ranked_items r
  LEFT JOIN LATERAL (
    SELECT c.name AS column_name,
      coalesce(v.value #>> '{}', v.value::text, '') AS value_text
    FROM public.work_board_item_values v
    JOIN public.work_board_columns c
      ON c.id = v.column_id AND c.board_id = r.board_id
    WHERE v.item_id = r.item_id
      AND EXISTS (
        SELECT 1 FROM tokens t
        WHERE lower(coalesce(v.value #>> '{}', v.value::text, ''))
          LIKE t.pattern ESCAPE E'\\'
      )
    ORDER BY c.position, c.id
    LIMIT 1
  ) cell_match ON true;
END;
$function$;

