-- CP-TT-AUTO-CLOCKOUT-01: expose an approved overtime extension before the threshold.
-- The durable worker records overtime_cutoff_at on its 30-second evaluation.
-- This signed read presents that stored cutoff immediately after it is observed.
CREATE OR REPLACE FUNCTION public.timetracker_auto_clockout_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_record_id text;
  v_session jsonb;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  SELECT elem->>'id' INTO v_record_id
  FROM public.module_state_entries e
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records')
    AS records(elem)
  WHERE e.workspace_id=v_workspace
    AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*'
    AND elem->>'ownerId'='cloud:'||v_actor::text
    AND (elem->'clockOut' IS NULL OR elem->'clockOut'='null'::jsonb)
  LIMIT 1;

  IF v_record_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'recordId',s.record_id::text,
      'status',CASE WHEN s.overtime_cutoff_at IS NOT NULL
        THEN 'OVERTIME' ELSE s.status END,
      'thresholdAt',s.threshold_at,
      'graceStartedAt',s.grace_started_at,
      'graceDeadlineAt',s.grace_deadline_at,
      'overtimeCutoffAt',s.overtime_cutoff_at,
      'nextAt',CASE
        WHEN s.overtime_cutoff_at IS NOT NULL THEN s.overtime_cutoff_at
        WHEN s.status='MONITORING' THEN s.threshold_at
        WHEN s.status='GRACE' THEN s.grace_deadline_at
        WHEN s.status='OVERTIME' THEN s.overtime_cutoff_at
        ELSE NULL END,
      'lastEvaluatedAt',s.last_evaluated_at,
      'clockOutReason',s.clock_out_reason)
    INTO v_session
    FROM private.tt_auto_clockout_sessions s
    WHERE s.workspace_id=v_workspace AND s.board_id=p_board_id
      AND s.employee_id=v_actor AND s.record_id=v_record_id::uuid;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-auto-clockout-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'session',v_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  TO authenticated;
