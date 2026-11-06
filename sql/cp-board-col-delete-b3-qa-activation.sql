-- CP-BOARD-COL-DELETE / Phase B3
-- Explicitly authorized one-time activation. Production DATA WRITE: admin only.
-- Applies only to the signed B2 QA board and its original creator/owner.
-- B1 RPCs enforce signed session, manager rights, QA board name, actor, and expiry.
-- Both global flags remain TRUE after expiry but RPC access fails closed; B5 must
-- explicitly turn the flags off and remove scope. No scheduler or background agent.
-- Never apply to Contacts or activate frontend deletion UI in this checkpoint.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '25s';
DO $b3_activate$
DECLARE
 v_board constant uuid := '8491b933-8aa7-4b10-816c-46b6758531f3';
 v_actor uuid;
 v_issued timestamptz;
 v_updated integer;
BEGIN
 IF to_regclass('private.wm_recoverable_column_qa_scope') IS NULL
 OR to_regclass('private.wm_recoverable_column_activation') IS NULL
 OR to_regprocedure('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)') IS NULL
 OR to_regprocedure('public.wm_list_recoverable_board_columns(uuid)') IS NULL
 OR to_regprocedure('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)') IS NULL
 OR md5(pg_get_functiondef('public.wm_delete_board_column_recoverable(uuid,uuid,timestamptz,integer,text)'::regprocedure))<>'c9306ac46991b67bbfc1817cf197b5b5'
 OR md5(pg_get_functiondef('public.wm_list_recoverable_board_columns(uuid)'::regprocedure))<>'51a6f2574597107396e298277111e1c6'
 OR md5(pg_get_functiondef('public.wm_restore_board_column_recoverable(uuid,uuid,timestamptz)'::regprocedure))<>'d569201323f80d9e5f8e08d7cdeffab5'
 THEN RAISE EXCEPTION 'B3_RECOVERY_CONTRACT_CHANGED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM private.wm_recoverable_column_activation
  WHERE id IS TRUE AND delete_enabled IS FALSE AND restore_enabled IS FALSE
  FOR UPDATE;
 IF NOT FOUND OR (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 THEN RAISE EXCEPTION 'B3_ACTIVATION_NOT_DEFAULT_DENY' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.wm_recoverable_column_qa_scope)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_columns)
 OR EXISTS(SELECT 1 FROM private.wm_recoverable_deleted_cells)
 THEN RAISE EXCEPTION 'B3_EXISTING_SCOPE_OR_RECOVERY_SNAPSHOT' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.work_boards WHERE name LIKE 'CP-BOARD-COL-DELETE QA %')<>1
 THEN RAISE EXCEPTION 'B3_QA_BOARD_NOT_UNIQUE' USING ERRCODE='42501'; END IF;
 SELECT b.created_by INTO v_actor FROM public.work_boards b
 WHERE b.id=v_board AND b.name='CP-BOARD-COL-DELETE QA Signed Fixture'
  AND b.status='active' FOR SHARE;
 IF v_actor IS NULL OR
  (SELECT count(*) FROM public.work_board_members m
   WHERE m.board_id=v_board AND m.user_id=v_actor AND m.role='owner')<>1
 THEN RAISE EXCEPTION 'B3_ACTOR_OWNERSHIP_NOT_VERIFIED' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.work_board_groups WHERE board_id=v_board)<>1
 OR (SELECT count(*) FROM public.work_board_columns WHERE board_id=v_board)<>1
 OR (SELECT count(*) FROM public.work_board_items
     WHERE board_id=v_board AND archived_at IS NULL)<>4
 OR (SELECT count(*) FROM public.work_board_items WHERE board_id=v_board)<>4
 OR (SELECT count(*) FROM public.work_board_columns
     WHERE board_id=v_board AND name='Recovery Status'
      AND system_key IS NULL AND data_type='text'
      AND (column_key LIKE 'custom:%' OR column_key LIKE 'custom_%'))<>1
 OR (SELECT count(*) FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE c.board_id=v_board AND c.name='Recovery Status')<>4
 THEN RAISE EXCEPTION 'B3_QA_FIXTURE_STRUCTURE_CHANGED' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM (
   VALUES ('B2 QA item 1','B2-QA-Alpha'),
          ('B2 QA item 2','B2-QA-Beta'),
          ('B2 QA item 3','B2-QA-Gamma'),
          ('B2 QA item 4','B2-QA-Delta')
  ) wanted(item_title,cell_value)
  JOIN public.work_board_items i ON i.board_id=v_board
    AND i.title=wanted.item_title AND i.created_by=v_actor AND i.archived_at IS NULL
  JOIN public.work_board_item_values v ON v.item_id=i.id
  JOIN public.work_board_columns c ON c.id=v.column_id
    AND c.board_id=v_board AND c.name='Recovery Status'
    AND c.system_key IS NULL AND c.data_type='text'
  WHERE v.value=to_jsonb(wanted.cell_value))<>4
 THEN RAISE EXCEPTION 'B3_QA_FIXTURE_VALUES_CHANGED' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.work_board_columns
      WHERE board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
       AND name='Status I')<>1
 OR (SELECT count(*) FROM public.work_board_item_values v
     JOIN public.work_board_columns c ON c.id=v.column_id
     WHERE c.board_id='b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid
      AND c.name='Status I')<>4
 THEN RAISE EXCEPTION 'B3_CONTACTS_SAFETY_CHANGED' USING ERRCODE='42501'; END IF;
 v_issued:=clock_timestamp();
 INSERT INTO private.wm_recoverable_column_qa_scope
  (id,board_id,actor_id,issued_at,expires_at)
 VALUES (TRUE,v_board,v_actor,v_issued,v_issued+interval '60 minutes');
 UPDATE private.wm_recoverable_column_activation
 SET delete_enabled=TRUE,restore_enabled=TRUE,updated_at=clock_timestamp()
 WHERE id IS TRUE AND delete_enabled IS FALSE AND restore_enabled IS FALSE;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated<>1 THEN RAISE EXCEPTION 'B3_ACTIVATION_UPDATE_UNCERTAIN' USING ERRCODE='42501'; END IF;
END $b3_activate$;
COMMIT;
-- Read-only postcommit receipt. No actor/session identifiers are returned.
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-B3',
 'state',CASE WHEN a.delete_enabled IS TRUE AND a.restore_enabled IS TRUE
  AND q.board_id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid
  AND q.expires_at>clock_timestamp()
  AND q.expires_at<=q.issued_at+interval '60 minutes'
  THEN 'B3_SCOPED_ACTIVATION_VERIFIED' ELSE 'B3_POSTCOMMIT_CHECK_FAILED' END,
 'qa_board_match',q.board_id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid,
 'creator_matches',(SELECT q.actor_id=b.created_by FROM public.work_boards b WHERE b.id=q.board_id),
 'scope_expiry',q.expires_at,
 'seconds_remaining',greatest(0,extract(epoch from q.expires_at-clock_timestamp())::integer),
 'frontend_recovery_ui_enabled',false,
 'deletion_or_restoration_executed',false
) AS phase_b3_activation
FROM private.wm_recoverable_column_activation a
JOIN private.wm_recoverable_column_qa_scope q ON q.id=a.id
WHERE a.id IS TRUE;
