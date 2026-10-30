BEGIN;
-- CP-HULY-SB07: prevent clients from fabricating transaction events.
-- The only writer becomes the already-attached document AFTER trigger.
REVOKE INSERT (board_id, workspace_id, document_id, event_type, revision, actor_id, tx_id)
  ON huly_rewrite.transaction_events FROM authenticated;
REVOKE INSERT ON huly_rewrite.transaction_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION huly_rewrite.log_document_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $event$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_TABLE_SCHEMA <> 'huly_rewrite'
     OR TG_TABLE_NAME <> 'documents'
     OR TG_OP NOT IN ('INSERT', 'UPDATE')
     OR v_actor IS NULL
     OR NEW.updated_by IS DISTINCT FROM v_actor
     OR NEW.workspace_id IS DISTINCT FROM public.current_workspace_id()
     OR NOT public.work_board_access(NEW.board_id, 'edit') THEN
    RAISE EXCEPTION 'Huly transaction event provenance denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO huly_rewrite.transaction_events
    (board_id,workspace_id,document_id,event_type,revision,actor_id,tx_id)
  VALUES
    (NEW.board_id,NEW.workspace_id,NEW.document_id,
     CASE WHEN TG_OP='INSERT' THEN 'create'
          WHEN NEW.deleted_at IS NOT NULL THEN 'remove' ELSE 'update' END,
     NEW.revision,v_actor,txid_current());
  RETURN NULL;
END;
$event$;
REVOKE ALL ON FUNCTION huly_rewrite.log_document_event() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION huly_rewrite.log_document_event()
IS 'SB07: only document AFTER trigger writes the append-only audit ledger, with authoritative actor, workspace and board checks.';
COMMIT;