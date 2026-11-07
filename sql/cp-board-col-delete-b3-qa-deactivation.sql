-- CP-BOARD-COL-DELETE / Phase B3-B5: conservative manual deactivation.
-- Authorized administrator only; no background agents or timers required.
-- Always turn off both flags before removing the one-board QA scope.
-- Does NOT delete recovery snapshots or audit evidence. Roll back on drift.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '25s';
DO $b3_deactivate$
DECLARE v_updated integer;
BEGIN
 IF (SELECT count(*) FROM private.wm_recoverable_column_activation)<>1
 OR (SELECT count(*) FROM private.wm_recoverable_column_qa_scope)<>1
 OR NOT EXISTS (SELECT 1 FROM private.wm_recoverable_column_qa_scope
  WHERE id IS TRUE
  AND board_id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid)
 THEN RAISE EXCEPTION 'B3_DEACTIVATION_SCOPE_DRIFT' USING ERRCODE='42501'; END IF;
 UPDATE private.wm_recoverable_column_activation
 SET delete_enabled=FALSE,restore_enabled=FALSE,updated_at=clock_timestamp()
 WHERE id IS TRUE;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated<>1 THEN RAISE EXCEPTION 'B3_DEACTIVATION_FAILED' USING ERRCODE='42501'; END IF;
 DELETE FROM private.wm_recoverable_column_qa_scope
 WHERE id IS TRUE AND board_id='8491b933-8aa7-4b10-816c-46b6758531f3'::uuid;
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 IF v_updated<>1 THEN RAISE EXCEPTION 'B3_SCOPE_REMOVAL_FAILED' USING ERRCODE='42501'; END IF;
END $b3_deactivate$;
COMMIT;
SELECT jsonb_build_object(
 'checkpoint','CP-BOARD-COL-DELETE-B3',
 'recovery_flags_disabled',(SELECT count(*)=1 FROM private.wm_recoverable_column_activation WHERE id IS TRUE AND delete_enabled IS FALSE AND restore_enabled IS FALSE),
 'qa_scope_empty',(SELECT count(*)=0 FROM private.wm_recoverable_column_qa_scope)
) AS phase_b3_deactivation;
