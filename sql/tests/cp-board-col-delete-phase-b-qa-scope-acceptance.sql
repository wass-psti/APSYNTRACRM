-- CP-BOARD-COL-DELETE / Phase B. Synthetic signed HTTP-role equivalents
-- in a disposable PostgreSQL 17 only. DOES NOT certify real GoTrue browser.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'postgres'
 OR to_regclass('private.wm_recoverable_column_qa_scope') IS NULL
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_column_qa_scope)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_columns)
 OR has_table_privilege('authenticated','private.wm_recoverable_column_qa_scope','SELECT')
 OR has_table_privilege('anon','private.wm_recoverable_column_qa_scope','INSERT')
 THEN RAISE EXCEPTION 'Phase B fixture requires isolated empty default-off scope' USING ERRCODE='42501';
 END IF;
END $pre$;

CREATE TEMP TABLE phase_b_before AS
 SELECT
 (SELECT count(*) FROM public.work_board_columns) columns,
 (SELECT count(*) FROM public.work_board_item_values) cells,
 (SELECT count(*) FROM public.work_board_items) items,
 (SELECT count(*) FROM public.work_board_events) events,
 (SELECT count(*) FROM private.wm_recoverable_deleted_columns) recovered,
 (SELECT count(*) FROM private.wm_recoverable_deleted_cells) archived,
 (SELECT name FROM public.work_boards
    WHERE id='30000000-0000-4000-8000-000000000001') board_name;
BEGIN;
-- All fixture setup and server activation are rolled back, never committed.
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
CREATE TEMP TABLE phase_b_original_cells AS
 SELECT v.* FROM public.work_board_item_values v JOIN public.work_board_columns c
 ON c.id=v.column_id AND c.column_key='custom:fixture-status';
CREATE TEMP TABLE phase_b_original_column AS
 SELECT c.* FROM public.work_board_columns c
 WHERE c.board_id='30000000-0000-4000-8000-000000000001' AND c.column_key='custom:fixture-status';
DO $four$
BEGIN
 IF (SELECT count(*) FROM pg_temp.phase_b_original_cells)<>4
 THEN RAISE EXCEPTION 'QA fixture failed to create exactly four cells'; END IF;
END $four$;
SELECT pg_catalog.set_config('cp.qa.column_id',
 (SELECT id::text FROM pg_temp.phase_b_original_column),true);
SELECT pg_catalog.set_config('cp.qa.board_revision',
 (SELECT updated_at::text FROM public.work_boards
  WHERE id='30000000-0000-4000-8000-000000000001'),true);
UPDATE private.wm_recoverable_column_activation
 SET delete_enabled=true,restore_enabled=true WHERE id;
-- Global activation must not permit even an authorized owner without QA scope.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '70000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $unscoped$
BEGIN
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(
   '30000000-0000-4000-8000-000000000001',
   current_setting('cp.qa.column_id',true)::uuid,
   current_setting('cp.qa.board_revision',true)::timestamptz,
   4,'DELETE Recorded status');
  RAISE EXCEPTION 'UNSCOPED_GLOBAL_FLAG_WRITE_ALLOWED' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_QA_SCOPE_DENIED' THEN RAISE; END IF;
 END;
END $unscoped$;
RESET ROLE;
INSERT INTO private.wm_recoverable_column_qa_scope(
 id,board_id,actor_id,expires_at) VALUES (
 true,'30000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',pg_catalog.now()+interval '30 minutes');
-- Scoped actor alone is insufficient; board must carry an explicit QA marker.
SET LOCAL ROLE authenticated;
DO $unmarked$
BEGIN
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns('30000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'UNMARKED_BOARD_ACCESS_ALLOWED' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_QA_SCOPE_DENIED' THEN RAISE; END IF;
 END;
END $unmarked$;
RESET ROLE;
UPDATE public.work_boards SET name='CP-BOARD-COL-DELETE QA Recovery Fixture'
 WHERE id='30000000-0000-4000-8000-000000000001';
-- Only one actor and one board: existing signed Viewer must not act.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '20000000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '70000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $viewer$
BEGIN
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns('30000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'VIEWER_READ_QA_RECOVERY_LIST' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer$;
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '20000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '70000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $signed$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000001';
 c uuid;
 rev timestamptz;
 removed jsonb;
 restored jsonb;
 items jsonb;
BEGIN
 c:=current_setting('cp.qa.column_id',true)::uuid;
 rev:=current_setting('cp.qa.board_revision',true)::timestamptz;
 BEGIN
  PERFORM public.wm_delete_board_column_recoverable(b,c,rev,0,'DELETE Recorded status');
  RAISE EXCEPTION 'STALE_COUNT_ACCEPTED' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 removed:=public.wm_delete_board_column_recoverable(b,c,rev,4,'DELETE Recorded status');
 IF removed->>'action'<>'delete-recoverable'
 OR (removed->>'value_rows')::int<>4
 OR NOT (removed ? 'deletion_id') THEN
  RAISE EXCEPTION 'SIGNED_QA_DELETE_RECEIPT_INVALID' USING ERRCODE='P9999';
 END IF;
 items:=public.wm_list_recoverable_board_columns(b);
 IF jsonb_array_length(items)<>1
 OR items->0->>'name'<>'Recorded status'
 OR (items->0->>'value_rows')::int<>4
 OR items::text LIKE '%alpha%'
 OR items::text LIKE '%beta%' THEN
  RAISE EXCEPTION 'SIGNED_QA_RECOVERY_INDEX_INVALID_OR_LEAK' USING ERRCODE='P9999';
 END IF;
 restored:=public.wm_restore_board_column_recoverable(b,
  (removed->>'deletion_id')::uuid,
  (removed->>'updated_at')::timestamptz);
 IF restored->>'action'<>'restore-recoverable'
 OR (restored->>'value_rows')::int<>4
 OR jsonb_array_length(public.wm_list_recoverable_board_columns(b))<>0 THEN
  RAISE EXCEPTION 'SIGNED_QA_RESTORE_INVALID' USING ERRCODE='P9999';
 END IF;
END $signed$;
RESET ROLE;
DO $preservation$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000001';
BEGIN
 IF (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.item_id)
      FROM public.work_board_item_values v
      WHERE v.column_id=(SELECT id FROM pg_temp.phase_b_original_column))
    IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.item_id)
      FROM pg_temp.phase_b_original_cells v)
 OR (SELECT to_jsonb(c) FROM public.work_board_columns c
      WHERE c.id=(SELECT id FROM pg_temp.phase_b_original_column))
    IS DISTINCT FROM
    (SELECT to_jsonb(c) FROM pg_temp.phase_b_original_column c)
 OR (SELECT count(*) FROM public.work_board_events
      WHERE board_id=b AND event_type='column.deleted_recoverable'
       AND actor_id='20000000-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.work_board_events
      WHERE board_id=b AND event_type='column.restored'
       AND actor_id='20000000-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_columns
      WHERE restored_at IS NOT NULL)<>1
 THEN RAISE EXCEPTION 'QA_RESTORATION_OR_ACTIVITY_NOT_EXACT' USING ERRCODE='P9999';
 END IF;
END $preservation$;
-- Expired scope must be denied even with global flags on.
UPDATE private.wm_recoverable_column_qa_scope
 SET issued_at=pg_catalog.now()-interval '90 minutes',
     expires_at=pg_catalog.now()-interval '60 minutes'
 WHERE id;
SET LOCAL ROLE authenticated;
DO $expired_scope$
BEGIN
 BEGIN
  PERFORM public.wm_list_recoverable_board_columns('30000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'EXPIRED_QA_SCOPE_READ_ALLOWED' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'COL_QA_SCOPE_DENIED' THEN RAISE; END IF;
 END;
END $expired_scope$;
RESET ROLE;
ROLLBACK;
DO $cleanup$
DECLARE z record;
BEGIN
 SELECT * INTO z FROM pg_temp.phase_b_before;
 IF (SELECT count(*) FROM public.work_board_columns)<>z.columns
 OR (SELECT count(*) FROM public.work_board_item_values)<>z.cells
 OR (SELECT count(*) FROM public.work_board_items)<>z.items
 OR (SELECT count(*) FROM public.work_board_events)<>z.events
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_columns)<>z.recovered
 OR (SELECT count(*) FROM private.wm_recoverable_deleted_cells)<>z.archived
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_column_qa_scope)
 OR (SELECT delete_enabled OR restore_enabled
     FROM private.wm_recoverable_column_activation WHERE id)
 OR (SELECT name FROM public.work_boards
      WHERE id='30000000-0000-4000-8000-000000000001')<>z.board_name
 THEN RAISE EXCEPTION 'PHASE_B_DISPOSABLE_ROLLBACK_INCOMPLETE' USING ERRCODE='P9999'; END IF;
 RAISE NOTICE 'PHASE_B_SIGNED_ROLE_QA_SCOPED_DELETE_RESTORE_ACTIVITY_ROLLBACK_PASS';
END $cleanup$;
DROP TABLE pg_temp.phase_b_before;
