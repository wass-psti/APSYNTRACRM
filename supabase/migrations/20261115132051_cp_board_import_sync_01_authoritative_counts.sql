-- CP-BOARD-IMPORT-SYNC-01: authoritative all/active/archived board counts.
-- Counts are computed only inside the first-page branch. Because this RPC is
-- STABLE, the count query and page query share the caller statement's MVCC snapshot.
-- Continuation pages never execute the board-wide aggregate query.
-- Existing board view authorization, function owner, grants and search_path
-- are preserved by CREATE OR REPLACE with the original signature.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.wm_get_board_items_page(
  p_board_id uuid,
  p_after_position integer DEFAULT NULL::integer,
  p_after_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out_json jsonb;
  v_counts jsonb := NULL;
  v_limit integer;
BEGIN
  IF (p_after_position IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'Cursor position and id must both be supplied' USING ERRCODE = '22023';
  END IF;
  IF p_after_position < 0 THEN
    RAISE EXCEPTION 'Cursor position must be non-negative' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 500' USING ERRCODE = '22023';
  END IF;
  IF NOT public.work_board_access(p_board_id, 'view') THEN
    RAISE EXCEPTION 'Board access denied' USING ERRCODE = '42501';
  END IF;

  v_limit := p_limit;

  IF p_after_position IS NULL THEN
    WITH item_counts AS MATERIALIZED (
      SELECT i.group_id,
             count(*) AS total_count,
             count(*) FILTER (WHERE i.archived_at IS NULL) AS active_count,
             count(*) FILTER (WHERE i.archived_at IS NOT NULL) AS archived_count
      FROM public.work_board_items i
      WHERE i.board_id = p_board_id
      GROUP BY i.group_id
    ), board_counts AS MATERIALIZED (
      SELECT coalesce(sum(total_count), 0)::bigint AS total_count,
             coalesce(sum(active_count), 0)::bigint AS active_count,
             coalesce(sum(archived_count), 0)::bigint AS archived_count
      FROM item_counts
    ), group_count_payload AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'group_id', group_id,
            'total_count', total_count,
            'active_count', active_count,
            'archived_count', archived_count
          ) ORDER BY group_id
        ),
        '[]'::jsonb
      ) AS groups
      FROM item_counts
    )
    SELECT jsonb_build_object(
      'total_count', board_counts.total_count,
      'active_count', board_counts.active_count,
      'archived_count', board_counts.archived_count,
      'groups', group_count_payload.groups
    )
    INTO v_counts
    FROM board_counts
    CROSS JOIN group_count_payload;
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT i.*
    FROM public.work_board_items i
    WHERE i.board_id = p_board_id
      AND (
        p_after_position IS NULL
        OR (i.position, i.id) > (p_after_position, p_after_id)
      )
    ORDER BY i.position, i.id
    LIMIT v_limit + 1
  ), page AS MATERIALIZED (
    SELECT c.*
    FROM candidates c
    ORDER BY c.position, c.id
    LIMIT v_limit
  ), item_payload AS (
    SELECT coalesce(
      jsonb_agg(to_jsonb(p) ORDER BY p.position, p.id),
      '[]'::jsonb
    ) AS items
    FROM page p
  ), value_payload AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', v.item_id,
          'column_id', v.column_id,
          'value', v.value,
          'updated_at', v.updated_at
        ) ORDER BY v.item_id, v.column_id
      ),
      '[]'::jsonb
    ) AS values_json
    FROM page p
    JOIN public.work_board_item_values v ON v.item_id = p.id
    JOIN public.work_board_columns c
      ON c.id = v.column_id AND c.board_id = p_board_id
  ), page_state AS (
    SELECT count(*) > v_limit AS has_more
    FROM candidates
  ), tail AS (
    SELECT p.position, p.id
    FROM page p
    ORDER BY p.position DESC, p.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'items', item_payload.items,
    'values', value_payload.values_json,
    'has_more', page_state.has_more,
    'next_cursor', CASE
      WHEN page_state.has_more AND tail.id IS NOT NULL
      THEN jsonb_build_object('position', tail.position, 'id', tail.id)
      ELSE NULL
    END,
    'counts', v_counts
  )
  INTO out_json
  FROM item_payload
  CROSS JOIN value_payload
  CROSS JOIN page_state
  LEFT JOIN tail ON true;

  RETURN out_json;
END;
$function$;;
