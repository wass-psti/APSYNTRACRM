-- CP-APP-LOAD-02: Clock-only attendance projection.
-- Return only the signed employee's attendance rows, without GPS or unrelated
-- module state. Existing TimeTracker scope and visibility helpers remain the
-- authoritative access boundary.
BEGIN;

DO $preflight$
BEGIN
 IF to_regnamespace('private') IS NULL
  OR to_regprocedure('public.timetracker_ot_require_scope(uuid)') IS NULL
  OR to_regprocedure('public.module_state_visible_value(text,text,text,uuid)') IS NULL
  OR to_regclass('public.module_state_entries') IS NULL THEN
  RAISE EXCEPTION 'CP-APP-LOAD-02 TimeTracker read prerequisites are unavailable'
   USING ERRCODE='55000';
 END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.timetracker_clock_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_visible_value text;
 v_state jsonb;
 v_records jsonb;
 v_clock_state jsonb;
 v_revision bigint:=0;
 v_updated_at timestamptz;
 v_row_found boolean:=false;
BEGIN
 -- Reuse the exact existing signed-session, module-role, active-workspace and
 -- canonical-board scope contract used by the other TimeTracker read RPCs.
 v_workspace:=public.timetracker_ot_require_scope(p_board_id);

 SELECT public.module_state_visible_value(
    'time-tracker',e.state_key,e.value,v_actor),
   e.revision,e.updated_at
 INTO v_visible_value,v_revision,v_updated_at
 FROM public.module_state_entries e
 WHERE e.workspace_id=v_workspace
  AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1'
  AND e.scope='shared'
  AND e.owner_key='*'
 LIMIT 1;

 v_row_found:=FOUND AND v_visible_value IS NOT NULL;
 IF v_row_found THEN
  v_state:=v_visible_value::jsonb;
  IF pg_catalog.jsonb_typeof(v_state) IS DISTINCT FROM 'object'
   OR v_state->>'version' IS DISTINCT FROM '1'
   OR pg_catalog.jsonb_typeof(v_state->'records') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'TimeTracker attendance state contract invalid'
    USING ERRCODE='22023';
  END IF;

  -- Clock uses only the signed actor's own attendance. GPS is not consumed by
  -- this screen; the write path still captures fresh GPS independently.
  SELECT coalesce(pg_catalog.jsonb_agg(
    item.value #- '{clockIn,geo}' #- '{clockOut,geo}'
  ),'[]'::jsonb)
  INTO v_records
  FROM pg_catalog.jsonb_array_elements(v_state->'records') AS item(value)
  WHERE item.value->>'ownerId'='cloud:'||v_actor::text;

  v_clock_state:=pg_catalog.jsonb_build_object(
   'version',v_state->'version','records',coalesce(v_records,'[]'::jsonb));
 ELSE
  v_revision:=0;
  v_updated_at:=NULL;
  v_clock_state:=pg_catalog.jsonb_build_object(
   'version',1,'records','[]'::jsonb);
 END IF;

 RETURN pg_catalog.jsonb_build_object(
  'contract','tt-clock-snapshot-1',
  'actorId',v_actor::text,
  'workspaceId',v_workspace::text,
  'boardId',p_board_id::text,
  'stateKey','timetracker.attendance.v1',
  'scope','shared',
  'rowFound',v_row_found,
  'revision',v_revision,
  'updatedAt',v_updated_at,
  'value',v_clock_state::text
 );
END;
$function$;

-- Keep the exposed API wrapper SECURITY INVOKER. The implementation stays in
-- the non-exposed private schema and reuses the existing signed scope helper.
CREATE OR REPLACE FUNCTION public.timetracker_clock_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path=''
AS $function$
 SELECT private.timetracker_clock_snapshot(p_board_id);
$function$;

COMMENT ON FUNCTION public.timetracker_clock_snapshot(uuid) IS
 'CP-APP-LOAD-02: signed Clock-only attendance projection; returns only the current employee attendance rows without GPS, directory, OT or backup state.';

COMMIT;
