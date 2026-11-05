-- CP-BOARD-COL-DELETE: disposable PostgreSQL 17 only.
-- Real candidate RPCs under synthetic signed sessions. No production data.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'postgres'
 OR to_regclass('private.wm_recoverable_deleted_columns') IS NULL
 OR to_regprocedure('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)') IS NULL
 OR to_regclass('private.wm_recoverable_column_activation') IS NULL
 OR (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id)
 OR has_table_privilege('authenticated','private.wm_recoverable_column_activation','SELECT')
 OR has_table_privilege('anon','private.wm_recoverable_column_activation','UPDATE')
 OR has_table_privilege('authenticated','private.wm_recoverable_deleted_cells','SELECT')
 OR has_function_privilege('anon','public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)','EXECUTE')
 OR has_function_privilege('anon','public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'Recovery fixture is not isolated/default deny' USING ERRCODE='42501';
 END IF;
END $pre$;
CREATE TEMP TABLE col_delete_before AS
 SELECT
 (SELECT count(*) FROM public.work_board_columns) AS columns,
 (SELECT count(*) FROM public.work_board_item_values) AS cells,
 (SELECT count(*) FROM public.work_board_events) AS events,
 (SELECT count(*) FROM private.wm_recoverable_deleted_columns) AS recovery,
 (SELECT count(*) FROM private.wm_recoverable_deleted_cells) AS archived;
BEGIN;
DO $run$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000001';
 foreign_board uuid:='30000000-0000-4000-8000-000000000002';
 owner uuid:='20000000-0000-4000-8000-000000000001';
 editor uuid:='20000000-0000-4000-8000-000000000002';
 viewer uuid:='20000000-0000-4000-8000-000000000003';
 foreign_user uuid:='20000000-0000-4000-8000-000000000004';
 c uuid;
 primary_col uuid;
 domain_col uuid;
 deletion uuid;
 board_version timestamptz;
 original_column jsonb;
 original_cells jsonb;
 original_snapshot_cells jsonb;
 deleted jsonb;
 restored jsonb;
 listed jsonb;
BEGIN
 SELECT id INTO STRICT c FROM public.work_board_columns
 WHERE board_id=b AND column_key='custom:fixture-status';
 SELECT id INTO STRICT primary_col FROM public.work_board_columns
 WHERE board_id=b AND system_key='title';
 SELECT id INTO STRICT domain_col FROM public.work_board_columns
 WHERE board_id=b AND column_key='col_seeded';
 SELECT to_jsonb(x) INTO STRICT original_column FROM public.work_board_columns x WHERE x.id=c;
 -- Reproduce the actual Contacts / Status I four-value scenario, including
 -- JSON null and SQL NULL so restore must preserve complete row semantics.
 INSERT INTO public.work_board_items(id,board_id) VALUES
  ('40000000-0000-4000-8000-000000000011',b),
  ('40000000-0000-4000-8000-000000000012',b),
  ('40000000-0000-4000-8000-000000000013',b);
 INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by) VALUES
  ('40000000-0000-4000-8000-000000000011',c,'"beta"'::jsonb,owner),
  ('40000000-0000-4000-8000-000000000012',c,'null'::jsonb,owner),
  ('40000000-0000-4000-8000-000000000013',c,NULL,owner);
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.item_id),
        jsonb_agg(to_jsonb(x)-'column_id' ORDER BY x.item_id)
 INTO STRICT original_cells,original_snapshot_cells
 FROM public.work_board_item_values x WHERE x.column_id=c;
 IF jsonb_array_length(original_cells)<>4 THEN
  RAISE EXCEPTION 'Four-row populated-column fixture failed to initialize'; END IF;
 UPDATE public.wm_board_ui_settings
 SET column_labels=column_labels||jsonb_build_object(c::text,'Business status')
 WHERE board_id=b;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',owner::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',true);
 board_version:=(SELECT updated_at FROM public.work_boards WHERE id=b);
 -- These RPCs are already granted to authenticated in the candidate; the
 -- private activation gate must independently block both writes and metadata.
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version,4,'DELETE Recorded status');
  RAISE EXCEPTION 'Default-off deletion was allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_DELETE_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(
   b,'11111111-1111-4111-8111-111111111111',board_version);
  RAISE EXCEPTION 'Default-off restoration was allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_RESTORE_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns(b);
  RAISE EXCEPTION 'Default-off recovery metadata was exposed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_RECOVERY_LIST_NOT_ACTIVATED' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>0 THEN
  RAISE EXCEPTION 'Default-off functions created recovery artifacts'; END IF;
 -- Enable only inside disposable transaction; final ROLLBACK resets flags.
 UPDATE private.wm_recoverable_column_activation
 SET delete_enabled=true,restore_enabled=true WHERE id;

 -- Count and board CAS checks fail before any snapshot or delete.
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version,0,'DELETE Recorded status');
  RAISE EXCEPTION 'Wrong value count was accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version-interval '1 second',4,'DELETE Recorded status');
  RAISE EXCEPTION 'Stale board CAS accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version,4,'DELETE recorded status');
  RAISE EXCEPTION 'Wrong confirmation accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 FOR i IN 1..2 LOOP
  BEGIN
   PERFORM public.wm_delete_board_column_recoverable(
    b,CASE WHEN i=1 THEN primary_col ELSE domain_col END,
    board_version,0,'DELETE Primary');
   RAISE EXCEPTION 'Protected column was deleted' USING ERRCODE='P9999';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 -- The API must reject archived and application-protected boards, even if
 -- the caller is the signed board owner and the column key is custom.
 INSERT INTO private.wm_board_protected_ids(board_id) VALUES (b);
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version,4,'DELETE Recorded status');
  RAISE EXCEPTION 'Protected application board deleted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM private.wm_board_protected_ids WHERE board_id=b;
 UPDATE public.work_boards SET status='archived' WHERE id=b;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   b,c,board_version,4,'DELETE Recorded status');
  RAISE EXCEPTION 'Archived board deleted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.work_boards SET status='active' WHERE id=b;
 IF (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>0
 OR NOT EXISTS(SELECT 1 FROM public.work_board_item_values WHERE column_id=c) THEN
  RAISE EXCEPTION 'Preflight denied writes changed data'; END IF;

 -- Same column restoration must work after actual FK cascade.
 deleted:=public.wm_delete_board_column_recoverable(
  b,c,board_version,4,'DELETE Recorded status');
 deletion:=(deleted->>'deletion_id')::uuid;
 IF deleted->>'action'<>'delete-recoverable'
 OR (deleted->>'value_rows')::int<>4
 OR EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=c)
 OR EXISTS(SELECT 1 FROM public.work_board_item_values WHERE column_id=c)
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells
     WHERE deletion_id=deletion)<>4
 OR (SELECT column_snapshot FROM private.wm_recoverable_deleted_columns
     WHERE deletion_id=deletion)<>original_column
 OR (SELECT jsonb_agg(to_jsonb(x)-'deletion_id' ORDER BY x.item_id)
     FROM private.wm_recoverable_deleted_cells x WHERE deletion_id=deletion)
    IS DISTINCT FROM original_snapshot_cells
 THEN
  RAISE EXCEPTION 'Private recovery snapshot or deletion lost data';
 END IF;
 IF (SELECT column_labels ? c::text FROM public.wm_board_ui_settings WHERE board_id=b)
 OR NOT EXISTS(SELECT 1 FROM public.work_board_events
   WHERE board_id=b AND event_type='column.deleted_recoverable'
   AND (payload->>'deletion_id')::uuid=deletion
   AND (payload->>'value_rows')::int=4
   AND actor_id=owner)
 THEN RAISE EXCEPTION 'Deletion UI/audit receipt absent'; END IF;
 -- Restoring onto a newly protected board is also denied with its
 -- original snapshot and all value rows unchanged.
 INSERT INTO private.wm_board_protected_ids(board_id) VALUES(b);
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(
   b,deletion,(deleted->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Protected application board restored' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM private.wm_board_protected_ids WHERE board_id=b;
 listed:=public.wm_list_recoverable_board_columns(b);
 IF jsonb_array_length(listed)<>1 OR listed->0->>'name'<>'Recorded status'
 OR (listed->0->>'restorable')::boolean IS DISTINCT FROM true
 OR listed::text LIKE '%alpha%' OR listed::text LIKE '%Business status%'
 THEN RAISE EXCEPTION 'Manager recovery list invalid or leaks cell contents'; END IF;

 -- Editor, viewer and foreign/expired sessions cannot read recovery index or restore.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',editor::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',true);
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(b,deletion,(deleted->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Editor restored manager column' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',viewer::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000003',true);
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns(b);
  RAISE EXCEPTION 'Viewer read recovery metadata' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',foreign_user::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000004',true);
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(b,deletion,(deleted->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Foreign actor restored column' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',owner::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',true);
 UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(b,deletion,(deleted->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Expired owner restored column' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
 WHERE id='70000000-0000-4000-8000-000000000001';

 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(b,deletion,board_version);
  RAISE EXCEPTION 'Stale restore revision accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;

 restored:=public.wm_restore_board_column_recoverable(
  b,deletion,(deleted->>'updated_at')::timestamptz);
 IF restored->>'action'<>'restore-recoverable'
 OR (restored->>'column_id')::uuid<>c
 OR (SELECT to_jsonb(x) FROM public.work_board_columns x WHERE x.id=c)<>original_column
 OR (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.item_id)
     FROM public.work_board_item_values x WHERE x.column_id=c)<>original_cells
 OR (SELECT column_labels->>c::text FROM public.wm_board_ui_settings
     WHERE board_id=b)<>'Business status'
 OR NOT EXISTS(SELECT 1 FROM public.work_board_events
   WHERE board_id=b AND event_type='column.restored'
   AND (payload->>'deletion_id')::uuid=deletion AND actor_id=owner)
 THEN RAISE EXCEPTION 'Column restore did not preserve originals / audit'; END IF;
 IF jsonb_array_length(public.wm_list_recoverable_board_columns(b))<>0 THEN
  RAISE EXCEPTION 'Restored column remains in pending recovery list'; END IF;
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(
    b,deletion,(restored->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Replay of completed recovery accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Missing parent row must refuse restore without partial change.
 deleted:=public.wm_delete_board_column_recoverable(
  b,c,(restored->>'updated_at')::timestamptz,4,'DELETE Recorded status');
 deletion:=(deleted->>'deletion_id')::uuid;
 DELETE FROM public.work_board_items WHERE id='40000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(
    b,deletion,(deleted->>'updated_at')::timestamptz);
  RAISE EXCEPTION 'Missing item accepted without full restore' USING ERRCODE='P9999';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_cells
   WHERE deletion_id=deletion) OR
   EXISTS(SELECT 1 FROM public.work_board_columns WHERE id=c) THEN
  RAISE EXCEPTION 'Failed restore erased snapshot or partly restored column'; END IF;
END $run$;
ROLLBACK;
DO $post$
DECLARE orig record;
BEGIN
 SELECT * INTO orig FROM pg_temp.col_delete_before;
 IF (SELECT count(*) FROM public.work_board_columns)<>orig.columns
 OR (SELECT count(*) FROM public.work_board_item_values)<>orig.cells
 OR (SELECT count(*) FROM public.work_board_events)<>orig.events
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>orig.recovery
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>orig.archived
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id) THEN
  RAISE EXCEPTION 'Disposable recovery acceptance failed to roll back'; END IF;
 RAISE NOTICE 'CP-BOARD-COL-DELETE recovery delete/CAS/RBAC/restore/audit/rollback PASS';
END $post$;
DROP TABLE pg_temp.col_delete_before;
