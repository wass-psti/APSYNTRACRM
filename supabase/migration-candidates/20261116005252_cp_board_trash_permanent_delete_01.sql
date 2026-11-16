-- CP-BOARD-TRASH-PERMANENT-DELETE-01
-- Enable permanent deletion only for signed managers of ordinary trashed boards.
-- Existing function signature is retained; authenticated execution is narrowly
-- granted after the function enforces session, manager, protected-board and file guards.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.work_boards') IS NULL
     OR to_regclass('public.work_board_item_files') IS NULL
     OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
     OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
     OR to_regprocedure('private.wm_board_is_protected(uuid)') IS NULL
     OR to_regprocedure('public.wm_delete_board_permanently(uuid)') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'CP-BOARD-TRASH-PERMANENT-DELETE-01 prerequisites are not installed'
      USING ERRCODE='55000';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.wm_delete_board_permanently(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  b public.work_boards%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT private.wm_board_config_session_active()
     OR NOT public.work_board_access(p_board_id, 'manage') THEN
    RAISE EXCEPTION 'Signed board manager permission required'
      USING ERRCODE='42501';
  END IF;

  SELECT * INTO b
  FROM public.work_boards
  WHERE id = p_board_id
  FOR UPDATE;

  IF b.id IS NULL
     OR b.status <> 'trashed'
     OR private.wm_board_is_protected(b.id) THEN
    RAISE EXCEPTION 'Only unprotected trashed boards can be permanently deleted'
      USING ERRCODE='42501';
  END IF;

  -- Keep Storage objects intact. The user must resolve file references through
  -- the existing signed file-deletion workflow before this board can be purged.
  IF EXISTS (
       SELECT 1 FROM public.work_board_item_files
       WHERE board_id = b.id
     )
     OR EXISTS (
       SELECT 1 FROM storage.objects
       WHERE bucket_id = 'work-board-files'
         AND left(name, length(b.id::text) + 1) = b.id::text || '/'
     ) THEN
    RAISE EXCEPTION 'Remove Board item files and pending Storage objects before permanently deleting the board'
      USING ERRCODE='55000';
  END IF;

  -- Child board records use the established ON DELETE CASCADE relationships.
  -- No user/profile/workspace records or Storage objects are deleted here.
  DELETE FROM public.work_boards WHERE id = b.id;
END
$function$;

REVOKE ALL ON FUNCTION public.wm_delete_board_permanently(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wm_delete_board_permanently(uuid)
  TO authenticated;

DO $postflight$
BEGIN
  IF NOT has_function_privilege(
       'authenticated',
       'public.wm_delete_board_permanently(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.wm_delete_board_permanently(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'public',
       'public.wm_delete_board_permanently(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'CP-BOARD-TRASH-PERMANENT-DELETE-01 execute grant contract failed'
      USING ERRCODE='42501';
  END IF;
END
$postflight$;

COMMIT;
