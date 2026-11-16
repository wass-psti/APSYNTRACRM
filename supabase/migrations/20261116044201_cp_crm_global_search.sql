-- CP-CRM-GLOBAL-SEARCH-01: bounded workspace search over existing board content.
-- This adds a read-only search RPC. It does not change board roles, RLS policies,
-- membership, workspace ownership, data, or any existing API contract.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE OR REPLACE FUNCTION public.wm_search_workspace_content(
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

  RETURN QUERY
  WITH visible_boards AS MATERIALIZED (
    SELECT b.id, b.name, b.status
    FROM public.work_boards b
    WHERE b.workspace_id = v_workspace
      AND b.status IN ('active', 'archived')
      AND public.work_board_access(b.id, 'view')
  ), matched_items AS (
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
      CASE
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.title, ''))) > 0
        ) THEN 'Record title'
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.notes, ''))) > 0
        ) THEN 'Notes'
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.status, ''))) > 0
        ) THEN 'Status'
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.due_date::text, ''))) > 0
        ) THEN 'Due date'
        WHEN cell_match.column_name IS NOT NULL THEN cell_match.column_name
        ELSE 'Record'
      END AS match_field,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.title, ''))) > 0
        ) THEN left(i.title, 160)
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.notes, ''))) > 0
        ) THEN substring(i.notes FROM greatest(strpos(lower(i.notes), (
          SELECT term.value FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(i.notes)) > 0 LIMIT 1
        )) - 48, 1) FOR 160)
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.status, ''))) > 0
        ) THEN left(i.status, 160)
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
          WHERE position(term.value IN lower(coalesce(i.due_date::text, ''))) > 0
        ) THEN i.due_date::text
        WHEN cell_match.column_name IS NOT NULL
          THEN substring(cell_match.value_text FROM greatest(strpos(lower(cell_match.value_text), (
            SELECT term.value FROM unnest(string_to_array(v_query, ' ')) AS term(value)
            WHERE position(term.value IN lower(cell_match.value_text)) > 0 LIMIT 1
          )) - 48, 1) FOR 160)
        ELSE left(coalesce(i.title, 'Untitled record'), 160)
      END AS match_excerpt
    FROM public.work_board_items i
    JOIN visible_boards b ON b.id = i.board_id
    LEFT JOIN public.work_board_groups g
      ON g.id = i.group_id AND g.board_id = i.board_id
    LEFT JOIN LATERAL (
      SELECT
        string_agg(cells.value_text, ' ') AS all_values,
        (array_agg(cells.column_name ORDER BY cells.position, cells.column_id)
          FILTER (WHERE cells.has_token))[1] AS column_name,
        (array_agg(cells.value_text ORDER BY cells.position, cells.column_id)
          FILTER (WHERE cells.has_token))[1] AS value_text
      FROM (
        SELECT
          c.name AS column_name,
          c.position,
          c.id AS column_id,
          coalesce(v.value #>> '{}', v.value::text, '') AS value_text,
          EXISTS (
            SELECT 1 FROM unnest(string_to_array(v_query, ' ')) AS term(value)
            WHERE position(term.value IN lower(coalesce(v.value #>> '{}', v.value::text, ''))) > 0
          ) AS has_token
        FROM public.work_board_item_values v
        JOIN public.work_board_columns c
          ON c.id = v.column_id AND c.board_id = i.board_id
        WHERE v.item_id = i.id
      ) cells
    ) cell_match ON true
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(string_to_array(v_query, ' ')) AS term(value)
      WHERE term.value <> ''
        AND position(term.value IN lower(concat_ws(' ',
          coalesce(i.title, ''),
          coalesce(i.notes, ''),
          coalesce(i.status, ''),
          coalesce(i.due_date::text, ''),
          coalesce(cell_match.all_values, '')
        ))) = 0
    )
  )
  SELECT
    m.board_id,
    m.board_name,
    m.board_status,
    m.item_id,
    m.item_title,
    m.group_title,
    m.item_status,
    m.is_archived,
    m.updated_at,
    m.match_field,
    m.match_excerpt
  FROM matched_items m
  ORDER BY
    CASE
      WHEN lower(coalesce(m.item_title, '')) = v_query THEN 0
      WHEN position(v_query IN lower(coalesce(m.item_title, ''))) = 1 THEN 1
      ELSE 2
    END,
    m.updated_at DESC,
    m.board_name,
    m.item_id
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.wm_search_workspace_content(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wm_search_workspace_content(text, integer) TO authenticated;
COMMENT ON FUNCTION public.wm_search_workspace_content(text, integer) IS
  'Read-only workspace search over active and archived board records; reuses current workspace and work_board_access view checks.';
