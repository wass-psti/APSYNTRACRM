-- Run only within an externally managed PostgreSQL 17 disposable BEGIN/ROLLBACK.
-- Never use this synthetic write test against any real Supabase project.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'postgres'
 OR (SELECT count(*) FROM private.wm_recoverable_column_activation
     WHERE id IS TRUE AND delete_enabled AND restore_enabled)<>1
 OR (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)<>0
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>0
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>0
 THEN RAISE EXCEPTION 'OPERATIONAL_DISPOSABLE_NOT_ISOLATED' USING ERRCODE='42501'; END IF;
END $pre$;
INSERT INTO public.work_board_items(id,board_id) VALUES
 ('40000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000001');
INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
SELECT i.id,c.id,i.value,'20000000-0000-4000-8000-000000000001'::uuid
FROM (VALUES
 ('40000000-0000-4000-8000-000000000011'::uuid,'"beta"'::jsonb),
 ('40000000-0000-4000-8000-000000000012'::uuid,'null'::jsonb),
 ('40000000-0000-4000-8000-000000000013'::uuid,NULL::jsonb)
) i(id,value)
JOIN public.work_board_columns c ON c.board_id='30000000-0000-4000-8000-000000000001'
 AND c.column_key='custom:fixture-status';
CREATE TEMP TABLE operational_original_column AS
 SELECT c.* FROM public.work_board_columns c
 WHERE c.board_id='30000000-0000-4000-8000-000000000001'
  AND c.column_key='custom:fixture-status';
CREATE TEMP TABLE operational_original_cells AS
 SELECT v.* FROM public.work_board_item_values v
 WHERE v.column_id=(SELECT id FROM pg_temp.operational_original_column);
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM pg_temp.operational_original_cells)<>4
 THEN RAISE EXCEPTION 'OPERATIONAL_EXPECTED_FOUR_CELLS' USING ERRCODE='P9999'; END IF;
END $baseline$;
SELECT pg_catalog.set_config('cp.operational.column_id',
 (SELECT id::text FROM pg_temp.operational_original_column),true);
SELECT pg_catalog.set_config('cp.operational.board_revision',
 (SELECT updated_at::text FROM public.work_boards
  WHERE id='30000000-0000-4000-8000-000000000001'),true);
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '70000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $run$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000001';
 c uuid;
 rev timestamptz;
 deleted jsonb;
 recovered jsonb;
 metadata jsonb;
BEGIN
 c:=current_setting('cp.operational.column_id',true)::uuid;
 rev:=current_setting('cp.operational.board_revision',true)::timestamptz;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(b,c,rev,0,'DELETE Recorded status');
  RAISE EXCEPTION 'WRONG_COUNT_WAS_ACCEPTED' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(b,c,rev-interval '1 second',4,'DELETE Recorded status');
  RAISE EXCEPTION 'STALE_REVISION_WAS_ACCEPTED' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(b,c,rev,4,'DELETE Wrong');
  RAISE EXCEPTION 'WRONG_CONFIRMATION_WAS_ACCEPTED' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 deleted:=public.wm_delete_board_column_recoverable(b,c,rev,4,'DELETE Recorded status');
 IF deleted->>'action'<>'delete-recoverable'
 OR (deleted->>'value_rows')::int<>4
 THEN RAISE EXCEPTION 'SIGNED_OPERATIONAL_DELETE_INVALID' USING ERRCODE='P9999'; END IF;
 metadata:=public.wm_list_recoverable_board_columns(b);
 IF jsonb_array_length(metadata)<>1
 OR metadata->0->>'name'<>'Recorded status'
 OR (metadata->0->>'value_rows')::int<>4
 OR metadata::text LIKE '%beta%'
 THEN RAISE EXCEPTION 'RECOVERY_METADATA_INVALID_OR_LEAKED' USING ERRCODE='P9999'; END IF;
 BEGIN
  PERFORM public.wm_restore_board_column_recoverable(b,
   (deleted->>'deletion_id')::uuid,rev);
  RAISE EXCEPTION 'STALE_RESTORE_WAS_ACCEPTED' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 recovered:=public.wm_restore_board_column_recoverable(b,
  (deleted->>'deletion_id')::uuid,(deleted->>'updated_at')::timestamptz);
 IF recovered->>'action'<>'restore-recoverable'
 OR (recovered->>'column_id')::uuid<>c
 OR jsonb_array_length(public.wm_list_recoverable_board_columns(b))<>0
 THEN RAISE EXCEPTION 'SIGNED_OPERATIONAL_RESTORE_INVALID' USING ERRCODE='P9999'; END IF;
END $run$;
RESET ROLE;
DO $post$
BEGIN
 IF (SELECT to_jsonb(c) FROM public.work_board_columns c
    WHERE c.id=(SELECT id FROM pg_temp.operational_original_column))
   IS DISTINCT FROM
    (SELECT to_jsonb(c) FROM pg_temp.operational_original_column c)
 OR (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.item_id)
     FROM public.work_board_item_values v
     WHERE v.column_id=(SELECT id FROM pg_temp.operational_original_column))
    IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.item_id)
     FROM pg_temp.operational_original_cells v)
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_columns
    WHERE restored_at IS NOT NULL)<>1
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>4
 OR (SELECT count(*) FROM public.work_board_events
    WHERE event_type IN ('column.deleted_recoverable','column.restored'))<>2
 THEN RAISE EXCEPTION 'OPERATIONAL_RESTORATION_NOT_BYTE_EXACT' USING ERRCODE='P9999'; END IF;
 RAISE NOTICE 'OPERATIONAL_SIGNED_DELETE_RESTORE_FULL_VALUE_ROUNDTRIP_PASS';
END $post$;
