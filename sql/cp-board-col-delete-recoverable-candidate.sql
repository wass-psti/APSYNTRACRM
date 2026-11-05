-- CP-BOARD-COL-DELETE — OPTIONAL transactionally recoverable populated-column deletion.
-- DORMANT CANDIDATE; DO NOT EXECUTE IN PRODUCTION WITHOUT SEPARATE SCOPED APPROVAL.
-- No existing RPC definition or grants are modified. Only ordinary custom columns
-- may be deleted. Original empty-only wm_board_schema_mutate remains untouched.
-- Data snapshots remain private, RLS-protected, and inaccessible to client roles.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('private.wm_board_config_session_active()') IS NULL
 OR md5(pg_get_functiondef('private.wm_board_config_session_active()'::regprocedure))
  <> 'a2284885128169732cb646fe03adcd83'
 OR to_regprocedure('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NULL
 OR md5(pg_get_functiondef('public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)'::regprocedure))
  <> '7e5ae389363acffa093ad3291314cf2a'
 OR to_regprocedure('private.wm_board_is_protected(uuid)') IS NULL
 OR md5(pg_get_functiondef('private.wm_board_is_protected(uuid)'::regprocedure))
  <> '3e82cd9d78fa7699e5e65f985bd4afa9'
 OR to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NULL
 OR to_regclass('public.work_board_item_values') IS NULL
 OR to_regclass('public.work_board_columns') IS NULL
 OR to_regclass('public.wm_board_ui_settings') IS NULL
 OR to_regclass('private.wm_recoverable_deleted_columns') IS NOT NULL
 OR to_regclass('private.wm_recoverable_deleted_cells') IS NOT NULL
 OR to_regprocedure('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)') IS NOT NULL
 OR to_regprocedure('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)') IS NOT NULL
 OR to_regprocedure('public.wm_list_recoverable_board_columns(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'COL-DELETE prerequisites drifted or already installed'
   USING ERRCODE='42501';
 END IF;
END $preflight$;

CREATE TABLE private.wm_recoverable_deleted_columns (
 deletion_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 board_id uuid NOT NULL,
 column_id uuid NOT NULL,
 column_snapshot jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(column_snapshot)='object'),
 previous_ui_label jsonb,
 value_count integer NOT NULL CHECK(value_count>=0),
 removed_by uuid NOT NULL,
 removed_at timestamptz NOT NULL DEFAULT now(),
 restored_by uuid,
 restored_at timestamptz,
 CHECK ((restored_at IS NULL)=(restored_by IS NULL))
);
CREATE UNIQUE INDEX wm_recoverable_column_pending
 ON private.wm_recoverable_deleted_columns(board_id,column_id) WHERE restored_at IS NULL;
CREATE INDEX wm_recoverable_column_board
 ON private.wm_recoverable_deleted_columns(board_id,removed_at DESC);

CREATE TABLE private.wm_recoverable_deleted_cells (
 deletion_id uuid NOT NULL REFERENCES private.wm_recoverable_deleted_columns(deletion_id) ON DELETE RESTRICT,
 item_id uuid NOT NULL,
 value jsonb,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(deletion_id,item_id)
);
ALTER TABLE private.wm_recoverable_deleted_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wm_recoverable_deleted_cells ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wm_recoverable_deleted_columns,
 private.wm_recoverable_deleted_cells FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wm_delete_board_column_recoverable(
 p_board_id uuid,p_column_id uuid,p_expected_updated_at timestamptz,
 p_expected_value_count integer,p_confirmation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $delete$
DECLARE
 v_board public.work_boards%ROWTYPE;
 v_column public.work_board_columns%ROWTYPE;
 v_values integer;
 v_archived integer;
 v_deletion_id uuid;
 v_ui_label jsonb;
 v_updated timestamptz;
BEGIN
 IF NOT private.wm_board_config_session_active()
 OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'COL_DELETE_AUTHORIZATION_DENIED' USING ERRCODE='42501';
 END IF;
 -- Same lock order as existing schema-mutating RPC; prevent stale deletion.
 SELECT * INTO v_board FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF v_board.id IS NULL THEN
  RAISE EXCEPTION 'COL_DELETE_BOARD_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 IF v_board.status IS DISTINCT FROM 'active'
  OR private.wm_board_is_protected(p_board_id) THEN
  RAISE EXCEPTION 'COL_DELETE_PROTECTED_BOARD' USING ERRCODE='42501';
 END IF;
 IF p_expected_updated_at IS NULL
 OR v_board.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'COL_DELETE_STALE_BOARD_REVISION' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_column FROM public.work_board_columns
 WHERE id=p_column_id AND board_id=p_board_id FOR UPDATE;
 IF v_column.id IS NULL OR v_column.system_key IS NOT NULL OR
  NOT (v_column.column_key LIKE 'custom:%' OR v_column.column_key LIKE 'custom_%') THEN
  RAISE EXCEPTION 'COL_DELETE_PROTECTED_COLUMN' USING ERRCODE='42501';
 END IF;
 IF p_confirmation IS DISTINCT FROM ('DELETE '||v_column.name) THEN
  RAISE EXCEPTION 'COL_DELETE_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
 END IF;
 IF p_expected_value_count IS NULL OR p_expected_value_count<0 THEN
  RAISE EXCEPTION 'COL_DELETE_EXPECTED_COUNT_REQUIRED' USING ERRCODE='22023';
 END IF;
 -- Column FOR UPDATE lock conflicts with FK KEY SHARE for new cells. Existing
 -- cell updates are serialized by row lock before the archive snapshot.
 PERFORM 1 FROM public.work_board_item_values v
 WHERE v.column_id=v_column.id FOR UPDATE;
 SELECT count(*) INTO v_values FROM public.work_board_item_values
 WHERE column_id=v_column.id;
 IF v_values<>p_expected_value_count THEN
  RAISE EXCEPTION 'COL_DELETE_STALE_VALUE_COUNT' USING ERRCODE='40001';
 END IF;
 IF EXISTS (SELECT 1 FROM public.work_board_item_values v
  LEFT JOIN public.work_board_items i ON i.id=v.item_id
  WHERE v.column_id=v_column.id AND
   (i.id IS NULL OR i.board_id IS DISTINCT FROM p_board_id)) THEN
  RAISE EXCEPTION 'COL_DELETE_FOREIGN_ITEM_BOUNDARY' USING ERRCODE='42501';
 END IF;
 SELECT s.column_labels->(v_column.id::text) INTO v_ui_label
 FROM public.wm_board_ui_settings s WHERE s.board_id=p_board_id FOR UPDATE;
 INSERT INTO private.wm_recoverable_deleted_columns(
  board_id,column_id,column_snapshot,previous_ui_label,value_count,removed_by)
 VALUES (p_board_id,v_column.id,pg_catalog.to_jsonb(v_column),v_ui_label,
  v_values,auth.uid()) RETURNING deletion_id INTO v_deletion_id;
 INSERT INTO private.wm_recoverable_deleted_cells(
  deletion_id,item_id,value,updated_by,updated_at)
 SELECT v_deletion_id,v.item_id,v.value,v.updated_by,v.updated_at
 FROM public.work_board_item_values v WHERE v.column_id=v_column.id;
 GET DIAGNOSTICS v_archived=ROW_COUNT;
 IF v_archived<>v_values THEN
  RAISE EXCEPTION 'COL_DELETE_BACKUP_INCOMPLETE' USING ERRCODE='40001';
 END IF;
 -- Delete triggers FK ON DELETE CASCADE; all rows were backed up atomically.
 DELETE FROM public.work_board_columns WHERE id=v_column.id;
 IF EXISTS(SELECT 1 FROM public.work_board_item_values v
  WHERE v.column_id=v_column.id) THEN
  RAISE EXCEPTION 'COL_DELETE_CASCADE_INCOMPLETE' USING ERRCODE='40001';
 END IF;
 -- Remove stale UI label, but preserve other column labels and tab ordering.
 UPDATE public.wm_board_ui_settings
 SET column_labels=column_labels-(v_column.id::text),
  revision=revision+1,updated_at=pg_catalog.clock_timestamp(),
  updated_by=auth.uid()
 WHERE board_id=p_board_id AND column_labels ? v_column.id::text;
 PERFORM public.work_board_log(p_board_id,'column.deleted_recoverable',
  'Custom column removed with private recovery snapshot','column',
  v_column.id::text,pg_catalog.jsonb_build_object(
   'deletion_id',v_deletion_id,'column_name',v_column.name,
   'value_rows',v_values,'recovery_available',true));
 UPDATE public.work_boards
 SET updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
 WHERE id=p_board_id RETURNING updated_at INTO v_updated;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id,
  'column_id',v_column.id,'deletion_id',v_deletion_id,'action','delete-recoverable',
  'value_rows',v_values,'updated_at',v_updated);
END;
$delete$;
REVOKE ALL ON FUNCTION public.wm_delete_board_column_recoverable(
 uuid,uuid,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_delete_board_column_recoverable(
 uuid,uuid,timestamptz,integer,text) TO authenticated;

CREATE FUNCTION public.wm_restore_board_column_recoverable(
 p_board_id uuid,p_deletion_id uuid,p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $restore$
DECLARE
 v_board public.work_boards%ROWTYPE;
 v_snapshot private.wm_recoverable_deleted_columns%ROWTYPE;
 v_name text;
 v_cell_count integer;
 v_inserted integer;
 v_updated timestamptz;
BEGIN
 IF NOT private.wm_board_config_session_active()
 OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'COL_RESTORE_AUTHORIZATION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_board FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF v_board.id IS NULL THEN
  RAISE EXCEPTION 'COL_RESTORE_BOARD_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 IF v_board.status IS DISTINCT FROM 'active'
  OR private.wm_board_is_protected(p_board_id) THEN
  RAISE EXCEPTION 'COL_RESTORE_PROTECTED_BOARD' USING ERRCODE='42501';
 END IF;
 IF p_expected_updated_at IS NULL
 OR v_board.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'COL_RESTORE_STALE_BOARD_REVISION' USING ERRCODE='40001';
 END IF;
 SELECT * INTO v_snapshot FROM private.wm_recoverable_deleted_columns
 WHERE deletion_id=p_deletion_id AND board_id=p_board_id FOR UPDATE;
 IF NOT FOUND OR v_snapshot.restored_at IS NOT NULL THEN
  RAISE EXCEPTION 'COL_RESTORE_SNAPSHOT_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 IF v_snapshot.column_snapshot->>'id' IS DISTINCT FROM v_snapshot.column_id::text
 OR v_snapshot.column_snapshot->>'board_id' IS DISTINCT FROM p_board_id::text
 OR v_snapshot.column_snapshot->>'system_key' IS NOT NULL
 OR NOT ((v_snapshot.column_snapshot->>'column_key' LIKE 'custom:%')
   OR (v_snapshot.column_snapshot->>'column_key' LIKE 'custom_%')) THEN
  RAISE EXCEPTION 'COL_RESTORE_SNAPSHOT_INTEGRITY' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM public.work_board_columns c
  WHERE c.board_id=p_board_id AND c.id=v_snapshot.column_id) THEN
  RAISE EXCEPTION 'COL_RESTORE_COLUMN_ALREADY_EXISTS' USING ERRCODE='23505';
 END IF;
 IF (SELECT count(*) FROM public.work_board_columns WHERE board_id=p_board_id)>=30 THEN
  RAISE EXCEPTION 'COL_RESTORE_COLUMN_LIMIT' USING ERRCODE='23505';
 END IF;
 v_name:=v_snapshot.column_snapshot->>'name';
 IF EXISTS (SELECT 1 FROM public.work_board_columns c WHERE
  c.board_id=p_board_id AND pg_catalog.lower(c.name)=pg_catalog.lower(v_name)) THEN
  RAISE EXCEPTION 'COL_RESTORE_NAME_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF EXISTS (SELECT 1 FROM private.wm_recoverable_deleted_cells v
  LEFT JOIN public.work_board_items i ON i.id=v.item_id
  WHERE v.deletion_id=p_deletion_id
   AND (i.id IS NULL OR i.board_id IS DISTINCT FROM p_board_id)) THEN
  RAISE EXCEPTION 'COL_RESTORE_ITEM_DEPENDENCY_MISSING' USING ERRCODE='23503';
 END IF;
 SELECT count(*) INTO v_cell_count
 FROM private.wm_recoverable_deleted_cells WHERE deletion_id=p_deletion_id;
 IF v_cell_count<>v_snapshot.value_count THEN
  RAISE EXCEPTION 'COL_RESTORE_BACKUP_COUNT_MISMATCH' USING ERRCODE='23503';
 END IF;
 INSERT INTO public.work_board_columns
 SELECT (pg_catalog.jsonb_populate_record(
   NULL::public.work_board_columns,v_snapshot.column_snapshot)).*;
 INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
 SELECT c.item_id,v_snapshot.column_id,c.value,c.updated_by,c.updated_at
 FROM private.wm_recoverable_deleted_cells c
 WHERE c.deletion_id=p_deletion_id;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 IF v_inserted<>v_snapshot.value_count THEN
  RAISE EXCEPTION 'COL_RESTORE_INCOMPLETE' USING ERRCODE='40001';
 END IF;
 IF v_snapshot.previous_ui_label IS NOT NULL
 AND pg_catalog.jsonb_typeof(v_snapshot.previous_ui_label)='string' THEN
  UPDATE public.wm_board_ui_settings s
  SET column_labels=s.column_labels||pg_catalog.jsonb_build_object(
     v_snapshot.column_id::text,v_snapshot.previous_ui_label#>>'{}'),
      revision=revision+1,updated_by=auth.uid(),
      updated_at=pg_catalog.clock_timestamp()
  WHERE board_id=p_board_id
   AND NOT (column_labels ? v_snapshot.column_id::text);
 END IF;
 UPDATE private.wm_recoverable_deleted_columns
 SET restored_by=auth.uid(),restored_at=now()
 WHERE deletion_id=p_deletion_id;
 PERFORM public.work_board_log(p_board_id,'column.restored',
  'Custom column and archived item values restored','column',
  v_snapshot.column_id::text,pg_catalog.jsonb_build_object(
   'deletion_id',p_deletion_id,'column_name',v_name,
   'value_rows',v_cell_count));
 UPDATE public.work_boards
 SET updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
 WHERE id=p_board_id RETURNING updated_at INTO v_updated;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id,
  'column_id',v_snapshot.column_id,'deletion_id',p_deletion_id,
  'action','restore-recoverable','value_rows',v_cell_count,
  'updated_at',v_updated);
END;
$restore$;
REVOKE ALL ON FUNCTION public.wm_restore_board_column_recoverable(
 uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_restore_board_column_recoverable(
 uuid,uuid,timestamptz) TO authenticated;

-- Read-only recovery index. Never expose raw private snapshots to API roles.
CREATE FUNCTION public.wm_list_recoverable_board_columns(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $list$
BEGIN
 IF NOT private.wm_board_config_session_active()
 OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'COL_RECOVERY_LIST_AUTHORIZATION_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((
  SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('deletion_id',d.deletion_id,
    'column_id',d.column_id,'name',d.column_snapshot->>'name',
    'value_rows',d.value_count,'deleted_at',d.removed_at,
    'restorable',NOT EXISTS(
      SELECT 1 FROM private.wm_recoverable_deleted_cells v
      LEFT JOIN public.work_board_items i ON i.id=v.item_id
      WHERE v.deletion_id=d.deletion_id
       AND (i.id IS NULL OR i.board_id IS DISTINCT FROM p_board_id)
    )) ORDER BY d.removed_at DESC)
  FROM private.wm_recoverable_deleted_columns d
  WHERE d.board_id=p_board_id AND d.restored_at IS NULL), '[]'::jsonb);
END;
$list$;
REVOKE ALL ON FUNCTION public.wm_list_recoverable_board_columns(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_list_recoverable_board_columns(uuid)
 TO authenticated;
COMMIT;
