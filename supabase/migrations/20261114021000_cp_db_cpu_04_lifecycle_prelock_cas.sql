-- CP-DB-CPU-04: reject already-stale lifecycle revisions before row-lock acquisition.
-- The locked comparison remains authoritative for races between preflight and mutation.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.wm_board_card_mutate(
  p_board_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_action text,
  p_name text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_confirm_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  b public.work_boards%ROWTYPE;
  v_observed_updated_at timestamptz;
  nm text := pg_catalog.btrim(coalesce(p_name, ''));
  v_at timestamptz;
  v_action text := pg_catalog.btrim(coalesce(p_action, ''));
BEGIN
  IF NOT private.wm_board_config_session_active()
    OR NOT public.work_board_access(p_board_id, 'manage') THEN
    RAISE EXCEPTION 'Signed board manager permission required'
      USING ERRCODE = '42501';
  END IF;

  -- Fast, non-locking compare. Repeated requests carrying an obsolete
  -- revision stop here instead of queueing behind the board row lock.
  SELECT wb.updated_at
    INTO v_observed_updated_at
    FROM public.work_boards AS wb
   WHERE wb.id = p_board_id;

  IF NOT FOUND OR private.wm_board_is_protected(p_board_id) THEN
    RAISE EXCEPTION 'Application or system board lifecycle is protected'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
    OR v_observed_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Board changed; refresh before editing'
      USING ERRCODE = '40001';
  END IF;

  -- Preserve the authoritative row lock and compare again to close the
  -- time-of-check/time-of-use window before any lifecycle write.
  SELECT *
    INTO b
    FROM public.work_boards
   WHERE id = p_board_id
   FOR UPDATE;

  IF b.id IS NULL OR private.wm_board_is_protected(b.id) THEN
    RAISE EXCEPTION 'Application or system board lifecycle is protected'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
    OR b.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Board changed; refresh before editing'
      USING ERRCODE = '40001';
  END IF;

  IF v_action = 'edit' THEN
    IF b.status NOT IN ('active', 'archived')
      OR pg_catalog.char_length(nm) NOT BETWEEN 1 AND 120
      OR p_description IS NULL
      OR pg_catalog.char_length(p_description) > 1200 THEN
      RAISE EXCEPTION 'Invalid board name, description or lifecycle state'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.work_boards AS x
       WHERE x.workspace_id = b.workspace_id
         AND x.id <> b.id
         AND x.status <> 'trashed'
         AND pg_catalog.lower(x.name) = pg_catalog.lower(nm)
    ) THEN
      RAISE EXCEPTION 'Another active or archived board already has this name'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.work_boards
       SET name = nm,
           description = p_description,
           updated_by = auth.uid(),
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = b.id
     RETURNING updated_at INTO v_at;

    PERFORM public.work_board_log(
      b.id, 'board.updated', 'Board details updated',
      'board', b.id::text, pg_catalog.jsonb_build_object('name', nm)
    );

  ELSIF v_action = 'trash' THEN
    IF b.status NOT IN ('active', 'archived')
      OR p_confirm_name IS DISTINCT FROM b.name THEN
      RAISE EXCEPTION 'Confirm the exact board name before moving to trash'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.work_boards
       SET status = 'trashed',
           archived_at = NULL,
           trashed_at = pg_catalog.clock_timestamp(),
           updated_by = auth.uid(),
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = b.id
     RETURNING updated_at INTO v_at;

    PERFORM public.work_board_log(
      b.id, 'board.trashed', 'Board moved to recoverable trash',
      'board', b.id::text,
      pg_catalog.jsonb_build_object('name', b.name, 'reversible', true)
    );

  ELSIF v_action = 'restore' THEN
    IF b.status NOT IN ('trashed', 'archived') THEN
      RAISE EXCEPTION 'Only trashed or archived boards can be restored'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.work_boards
       SET status = 'active',
           archived_at = NULL,
           trashed_at = NULL,
           updated_by = auth.uid(),
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = b.id
     RETURNING updated_at INTO v_at;

    PERFORM public.work_board_log(
      b.id, 'board.restored', 'Board restored to active',
      'board', b.id::text,
      pg_catalog.jsonb_build_object('from_status', b.status)
    );

  ELSE
    RAISE EXCEPTION 'Unsupported board card action'
      USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'boardId', b.id::text,
    'action', v_action,
    'status', CASE
      WHEN v_action = 'trash' THEN 'trashed'
      WHEN v_action = 'restore' THEN 'active'
      ELSE b.status
    END,
    'updatedAt', v_at
  );
END
$function$;
