-- CP-BOARD-CONFIG01 independent-review baseline — SELECT-ONLY production preflight.
-- This does not grant/revoke EXECUTE, create functions, alter RLS or touch records.
-- Re-run before approving each revised immutable SQL candidate.
WITH named(name,classification) AS (
 VALUES
 ('wm_add_board_column','legacy_direct'),
 ('wm_add_board_column_at','legacy_direct'),
 ('wm_change_board_column_type','legacy_direct'),
 ('wm_delete_board_column','legacy_direct'),
 ('wm_duplicate_board_column','legacy_direct'),
 ('wm_move_board_column','legacy_direct'),
 ('wm_update_board_column','legacy_direct'),
 ('wm_import_board_wizard_atomic','indirect_schema_writer'),
 ('wm_set_board_status_labels','indirect_destructive_config'),
 ('wm_create_board_configured','new_board_creation'),
 ('wm_duplicate_board','new_board_duplication')
),
observed AS (
 SELECT t.name,t.classification,p.oid,p.prosecdef AS security_definer,
  pg_get_function_identity_arguments(p.oid) AS signature,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
   AS authenticated_execute,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
   AS anon_execute,
  pg_get_userbyid(p.proowner) AS owner
 FROM named t LEFT JOIN pg_proc p ON p.proname=t.name
 LEFT JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
 WHERE p.oid IS NULL OR n.oid IS NOT NULL
)
SELECT jsonb_build_object(
 'gate','CP-BOARD-CONFIG01',
 'review_decision','INDEPENDENT_REVIEW_AND_PRODUCTION_PERMISSION_APPROVAL_PENDING',
 'new_settings_table_absent',to_regclass('public.wm_board_ui_settings') IS NULL,
 'new_read_rpc_absent',to_regprocedure('public.wm_board_ui_read(uuid)') IS NULL,
 'new_save_rpc_absent',to_regprocedure('public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)') IS NULL,
 'new_schema_rpc_absent',to_regprocedure(
   'public.wm_board_schema_mutate(uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean)') IS NULL,
 'columns_total',(SELECT count(*) FROM public.work_board_columns),
 'item_cell_values_total',(SELECT count(*) FROM public.work_board_item_values),
 'timetracker_columns',(SELECT count(*) FROM public.work_board_columns
   WHERE board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3'),
 'function_routes',(SELECT jsonb_agg(jsonb_build_object(
  'name',name,'classification',classification,
  'signature',signature,'security_definer',security_definer,
  'signed_execute',authenticated_execute,'anon_execute',anon_execute,
  'owner',owner) ORDER BY classification,name) FROM observed)
) AS review_snapshot;
