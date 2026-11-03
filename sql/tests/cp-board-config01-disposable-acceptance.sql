-- CP-BOARD-CONFIG01 disposable PostgreSQL 17 authorization and integrity checks.
\set ON_ERROR_STOP on
DO $test$
DECLARE
 v_board uuid:='30000000-0000-4000-8000-000000000001';
 v_foreign uuid:='30000000-0000-4000-8000-000000000002';
 v_owner uuid:='20000000-0000-4000-8000-000000000001';
 v_editor uuid:='20000000-0000-4000-8000-000000000002';
 v_viewer uuid:='20000000-0000-4000-8000-000000000003';
 v_domain uuid; v_primary uuid; v_custom uuid; v_result jsonb;
 v_old timestamptz; v_revision bigint;
BEGIN
 SELECT id INTO v_domain FROM public.work_board_columns
 WHERE board_id=v_board AND column_key='col_seeded';
 SELECT id INTO v_primary FROM public.work_board_columns
 WHERE board_id=v_board AND system_key='title';
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_owner::text,false);
 IF NOT public.work_board_access(v_board,'manage') THEN
  RAISE EXCEPTION 'Fixture manager role unavailable';
 END IF;

 -- Protected primary/domain columns are not physically deletable through candidate.
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'delete',v_primary,NULL,NULL,'{}'::jsonb,true,true);
  RAISE EXCEPTION 'Primary column was deleted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'delete',v_domain,NULL,NULL,'{}'::jsonb,true,true);
  RAISE EXCEPTION 'Domain column was deleted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=v_primary) THEN
  RAISE EXCEPTION 'Primary column missing after denial';
 END IF;

 SELECT updated_at INTO v_old FROM public.work_boards WHERE id=v_board;
 v_result:=public.wm_board_schema_mutate(v_board,v_old,'create',NULL,'Supervisor comment',
  'text','{}'::jsonb,true,false);
 v_custom:=(v_result->>'column_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=v_custom AND
   board_id=v_board AND column_key LIKE 'custom:%') THEN
  RAISE EXCEPTION 'Custom column not persisted correctly';
 END IF;
 -- Optimistic concurrency guard must fail closed.
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,v_old,'create',NULL,'Stale column',
   'text','{}'::jsonb,true,false);
  RAISE EXCEPTION 'Stale update was accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;

 -- Populate one value and verify no schema-type conversion or deletion destroys it.
 INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
 VALUES ('40000000-0000-4000-8000-000000000001',v_custom,'"Recorded"'::jsonb,v_owner);
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'delete',v_custom,NULL,NULL,'{}'::jsonb,true,true);
  RAISE EXCEPTION 'Populated column was deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'update',v_custom,'Supervisor comment','number','{}'::jsonb,true,false);
  RAISE EXCEPTION 'Populated column was retyped';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF (SELECT value FROM public.work_board_item_values WHERE column_id=v_custom)<>'"Recorded"'::jsonb THEN
  RAISE EXCEPTION 'Item value changed after failed type conversion';
 END IF;

 -- Separate schema (manager) and item editing (editor) privileges.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_editor::text,false);
 IF NOT public.work_board_access(v_board,'edit') OR public.work_board_access(v_board,'manage') THEN
  RAISE EXCEPTION 'Editor privilege fixture invalid';
 END IF;
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
    'create',NULL,'Unauthorized','text','{}'::jsonb,true,false);
  RAISE EXCEPTION 'Editor created schema column without manage rights';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,0,'Wrong owner',
   '[{"key":"items","label":"Items","visible":true}]'::jsonb,'{}'::jsonb);
  RAISE EXCEPTION 'Editor changed board settings';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Protected UI label changes leave the physical item primary field untouched.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_owner::text,false);
 v_result:=public.wm_board_ui_save(v_board,0,'Work item',
  '[{"key":"items","label":"Tasks","visible":true},{"key":"attendance","label":"Attendance","visible":true}]'::jsonb,
  pg_catalog.jsonb_build_object(v_domain::text,'Shift reference'));
 IF v_result->>'primary_label'<>'Work item' OR (v_result->>'revision')::bigint<>1 OR
    v_result->'column_labels'->>v_domain::text<>'Shift reference' THEN
  RAISE EXCEPTION 'Primary display or seeded column label not saved';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=v_domain AND name='Attendance Ref') THEN
  RAISE EXCEPTION 'Domain stable identifier/name mutated by display configuration';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE id=
  '40000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Primary item identifier changed';
 END IF;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,0,'Stale',
   '[{"key":"items","label":"Tasks","visible":true}]'::jsonb,'{}'::jsonb);
  RAISE EXCEPTION 'Stale settings revision accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,1,'Invalid',
   '[{"key":"issues","label":"Issues","visible":true}]'::jsonb,'{}'::jsonb);
  RAISE EXCEPTION 'Primary items view was disabled';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,1,'Invalid',
   '[{"key":"items","label":"Tasks","visible":false}]'::jsonb,'{}'::jsonb);
  RAISE EXCEPTION 'Primary items view was hidden';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,1,'Invalid',
   '[{"key":"items","label":"Tasks","visible":true}]'::jsonb,
   '{"99999999-9999-4999-8999-999999999999":"Foreign label"}'::jsonb);
  RAISE EXCEPTION 'Unknown column ID was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 -- Cross-workspace and reader checks.
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_foreign,(SELECT updated_at FROM public.work_boards WHERE id=v_foreign),
   'create',NULL,'Crossworkspace','text','{}'::jsonb,true,false);
  RAISE EXCEPTION 'Foreign board schema was modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_viewer::text,false);
 IF public.wm_board_ui_read(v_board)->>'primary_label'<>'Work item' THEN
  RAISE EXCEPTION 'Signed viewer cannot read board configuration';
 END IF;
 BEGIN
  PERFORM public.wm_board_ui_save(v_board,1,'Unauthorized',
    '[{"key":"items","label":"Tasks","visible":true}]'::jsonb,'{}'::jsonb);
  RAISE EXCEPTION 'Viewer wrote board configuration';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Manager deletes only an empty custom column after explicit confirmation.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_owner::text,false);
 DELETE FROM public.work_board_item_values WHERE column_id=v_custom;
 BEGIN
  PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'delete',v_custom,NULL,NULL,'{}'::jsonb,true,false);
  RAISE EXCEPTION 'Deletion without confirmation accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.wm_board_schema_mutate(v_board,(SELECT updated_at FROM public.work_boards WHERE id=v_board),
   'delete',v_custom,NULL,NULL,'{}'::jsonb,true,true);
 IF EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=v_custom) THEN
  RAISE EXCEPTION 'Empty custom column not deleted';
 END IF;
 IF (SELECT count(*) FROM public.work_board_events WHERE event_type IN
  ('column.created','column.deleted','board.views_updated'))<3 THEN
  RAISE EXCEPTION 'Audit events missing';
 END IF;

 -- Legacy editor-accessible write RPCs must be unreachable to signed editors.
 IF has_function_privilege('authenticated','public.wm_delete_board_column(uuid)','EXECUTE') OR
    has_function_privilege('authenticated','public.wm_add_board_column(uuid,text,text,jsonb)','EXECUTE') OR
    has_table_privilege('authenticated','public.wm_board_ui_settings','SELECT') THEN
  RAISE EXCEPTION 'Legacy bypass or direct settings privilege remains';
 END IF;
 RAISE NOTICE 'CP-BOARD-CONFIG01 disposable schema/RBAC/primary/CAS/audit PASS';
END $test$;
