-- CP-TT-MONITOR-01 — STAGED / UNAPPLIED production migration.
-- Restricted, read-only server-side diagnostics for APSYNTRA TimeTracker.
-- Requires previously installed timetracker_ot_require_scope(uuid) and
-- apsyntra_role_is_bootstrap(). No tables, triggers, roles or records are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.timetracker_monitor_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_workspace uuid;
 v_actor uuid := auth.uid();
 v_sample record;
BEGIN
 -- This existing gate independently checks current GoTrue auth.sessions,
 -- signed board identity, module access, workspace isolation and board access.
 v_workspace := public.timetracker_ot_require_scope(p_board_id);
 IF v_actor IS NULL OR NOT public.apsyntra_role_is_bootstrap() THEN
  RAISE EXCEPTION 'Bootstrap-only operational diagnostics'
   USING ERRCODE='42501';
 END IF;
 SELECT
  s.numbackends,
  s.xact_commit,
  s.xact_rollback,
  s.blks_hit,
  s.blks_read,
  s.deadlocks,
  s.stats_reset
 INTO v_sample
 FROM pg_catalog.pg_stat_database s
 WHERE s.datname = pg_catalog.current_database();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Aggregate database diagnostics unavailable'
   USING ERRCODE='P0002';
 END IF;
 -- Counters are cumulative since stats_reset. Never expose usernames,
 -- query SQL/text, connection addresses, tables, row counts or secrets.
 RETURN pg_catalog.jsonb_build_object(
  'mode','ACTIVE',
  'scope','BOOTSTRAP_AGGREGATE',
  'workspaceId',v_workspace::text,
  'boardId',p_board_id::text,
  'actorId',v_actor::text,
  'serverTime',pg_catalog.clock_timestamp(),
  'database',pg_catalog.jsonb_build_object(
   'connections',v_sample.numbackends,
   'transactionsCommitted',v_sample.xact_commit,
   'transactionsRolledBack',v_sample.xact_rollback,
   'cacheHits',v_sample.blks_hit,
   'diskReads',v_sample.blks_read,
   'deadlocks',v_sample.deadlocks,
   'statsReset',v_sample.stats_reset
  )
 );
END;
$$;
REVOKE ALL ON FUNCTION public.timetracker_monitor_snapshot(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_monitor_snapshot(uuid)
 TO authenticated;
COMMIT;

-- Activation is separately controlled: do not install this in production
-- until authorized and accompanied by role-specific denial tests.
