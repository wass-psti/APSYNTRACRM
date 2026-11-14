-- CP-DB-CPU-04: avoid one correlated active-item count per visible board.
-- Keep counts workspace-scoped and preserve the existing signed board-list contract.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.wm_list_boards(p_status text DEFAULT 'active'::text)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  status text,
  member_role text,
  item_count bigint,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH caller AS MATERIALIZED (
    SELECT auth.uid() AS uid,
           public.current_workspace_id(auth.uid()) AS workspace_id,
           public.is_platform_admin(auth.uid()) AS platform_admin
  ), visible_boards AS MATERIALIZED (
    SELECT b.id,
           b.name,
           b.description,
           b.status,
           b.updated_at,
           b.created_at,
           CASE WHEN c.platform_admin THEN 'owner' ELSE m.role END AS member_role
    FROM caller c
    JOIN public.work_boards b
      ON b.workspace_id = c.workspace_id
    LEFT JOIN public.work_board_members m
      ON m.board_id = b.id AND m.user_id = c.uid
    WHERE b.status = coalesce(nullif(p_status, ''), 'active')
      AND (c.platform_admin OR m.user_id IS NOT NULL)
  ), item_counts AS MATERIALIZED (
    SELECT i.board_id, count(*) AS item_count
    FROM visible_boards b
    JOIN public.work_board_items i
      ON i.board_id = b.id
    WHERE i.archived_at IS NULL
    GROUP BY i.board_id
  )
  SELECT b.id,
         b.name,
         b.description,
         b.status,
         b.member_role,
         coalesce(ic.item_count, 0) AS item_count,
         b.updated_at,
         b.created_at
  FROM visible_boards b
  LEFT JOIN item_counts ic ON ic.board_id = b.id
  ORDER BY b.updated_at DESC, b.created_at DESC;
$function$;
