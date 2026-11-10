-- Disposable-only activation / emergency-disable acceptance.
-- Run after default-deny preactivation, before signed lifecycle acceptance.
\set ON_ERROR_STOP on
\i sql/cp-ws01-switch-controlled-activation-CANDIDATE-NOT-APPLIED.sql
DO $activated$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
  WHERE id AND selection_enabled)
 OR NOT has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR has_table_privilege('authenticated','private.ws01_session_choices','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'Disposable activation failed or broadened access'; END IF;
 RAISE NOTICE 'WS01 isolated signed switch activation PASS';
END $activated$;
\i sql/cp-ws01-switch-emergency-disable-CANDIDATE-NOT-APPLIED.sql
DO $disabled$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags WHERE selection_enabled)
 OR has_function_privilege('authenticated','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 OR EXISTS(SELECT 1 FROM private.ws01_session_choices)
 THEN RAISE EXCEPTION 'Disposable rollback did not restore default deny'; END IF;
 RAISE NOTICE 'WS01 isolated emergency disable PASS';
END $disabled$;
